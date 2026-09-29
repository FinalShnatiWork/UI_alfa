package com.brokerui.broker.netting;

import com.brokerui.broker.BrokerOrder;
import com.brokerui.broker.BrokerOrderRepository;
import com.brokerui.broker.ContractSpecs;
import com.brokerui.broker.OrderExecutionService;
import com.brokerui.broker.Position;
import com.brokerui.broker.PositionRepository;
import com.brokerui.broker.TradingAccountRepository;
import com.brokerui.market.MarketPriceService;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.concurrent.ThreadLocalRandom;
import java.util.concurrent.atomic.AtomicBoolean;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Lazy;
import org.springframework.core.env.Environment;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/**
 * "The computer" (plan section 3): simulated client accounts that keep resting buy/sell quotes
 * around the mid on a few symbols and occasionally send market orders, so real users always have
 * somebody to net against in the demo.
 *
 * Safety rules: its orders are type LIQUIDITY (the scheduler never fills them against the market;
 * only netting can), computer never trades with computer (engine rule), never-filled quotes are
 * deleted when they expire (no table bloat), and {@code enabled=false} withdraws every quote on the
 * next tick. Its P/L is simulated-client P/L, never broker P/L.
 */
@Component
public class HouseLiquiditySimulator {
  private static final org.slf4j.Logger log = org.slf4j.LoggerFactory.getLogger(HouseLiquiditySimulator.class);
  public static final String TAG_PREFIX = "hls:";

  private final NettingService netting;
  private final BrokerOrderRepository orderRepo;
  private final TradingAccountRepository accountRepo;
  private final PositionRepository positionRepo;
  private final MarketPriceService priceService;
  private final OrderExecutionService orderExecutionService;
  private final Environment env;

  private final AtomicBoolean enabled;
  @Value("${broker.netting.sim.symbols:BTCUSD,EURUSD,XAUUSD}")
  private String[] symbols;
  @Value("${broker.netting.sim.orders-per-side:3}")
  private int ordersPerSide;
  @Value("${broker.netting.sim.quote-offset-min-bps:-2}")
  private double offsetMinBps;
  @Value("${broker.netting.sim.quote-offset-max-bps:2}")
  private double offsetMaxBps;
  @Value("${broker.netting.sim.ttl-seconds:30}")
  private long ttlSeconds;
  @Value("${broker.netting.sim.market-rate-per-min:6}")
  private double marketRatePerMin;
  @Value("${broker.netting.sim.tick-ms:3000}")
  private long tickMs;
  @Value("${broker.netting.sim.position-ttl-minutes:10}")
  private long positionTtlMinutes;

  public HouseLiquiditySimulator(NettingService netting, BrokerOrderRepository orderRepo,
      TradingAccountRepository accountRepo, PositionRepository positionRepo, MarketPriceService priceService,
      @Lazy OrderExecutionService orderExecutionService, Environment env,
      @Value("${broker.netting.sim.enabled:true}") boolean enabledAtStart) {
    this.netting = netting;
    this.orderRepo = orderRepo;
    this.accountRepo = accountRepo;
    this.positionRepo = positionRepo;
    this.priceService = priceService;
    this.orderExecutionService = orderExecutionService;
    this.env = env;
    this.enabled = new AtomicBoolean(enabledAtStart);
  }

  public boolean isEnabled() { return enabled.get(); }

  public void setEnabled(boolean on) {
    enabled.set(on);
    if (!on) withdrawAll(TAG_PREFIX);
  }

  public List<String> symbols() { return List.of(symbols); }

  @Scheduled(fixedDelayString = "${broker.netting.sim.tick-ms:3000}", initialDelay = 5000)
  public void tick() {
    if (!enabled.get()) {
      // Kill switch: a quote placed by a tick that was already running when the simulator was
      // switched off is withdrawn here, on the next tick.
      if (!openQuotesAnySymbol(TAG_PREFIX).isEmpty()) withdrawAll(TAG_PREFIX);
      return;
    }
    List<Long> sims = accountRepo.findSimulatedIds();
    if (sims.isEmpty()) return;
    for (String raw : symbols) {
      String symbol = raw.trim().toUpperCase(Locale.ROOT);
      try {
        quoteSymbol(symbol, sims);
      } catch (Exception e) {
        log.warn("[HLS] {}: {}", symbol, e.getMessage());
      }
    }
    try {
      expireOldPositions(sims);
    } catch (Exception e) {
      log.warn("[HLS] position housekeeping: {}", e.getMessage());
    }
  }

  private void quoteSymbol(String symbol, List<Long> sims) {
    double live = priceService.getLivePrice(symbol);
    if (!(live > 0)) return;
    BigDecimal mid = BigDecimal.valueOf(live);
    Instant cutoff = Instant.now().minus(Duration.ofSeconds(ttlSeconds));
    int buys = 0, sells = 0;
    for (BrokerOrder o : openQuotes(symbol, TAG_PREFIX)) {
      if (o.getCreatedAt() != null && o.getCreatedAt().isBefore(cutoff)) {
        netting.cancelLiquidity(o.getId());
      } else if ("BUY".equals(o.getSide())) {
        buys++;
      } else {
        sells++;
      }
    }
    ThreadLocalRandom rnd = ThreadLocalRandom.current();
    for (int i = buys; i < ordersPerSide; i++) quote(symbol, "BUY", mid, sims.get(rnd.nextInt(sims.size())));
    for (int i = sells; i < ordersPerSide; i++) quote(symbol, "SELL", mid, sims.get(rnd.nextInt(sims.size())));

    // The computer only TAKES liquidity from a real client who is waiting for a counterparty.
    // It never sends orders to the external market on its own (that only produced random,
    // meaningless simulated P/L and open positions when no real client was trading).
    double perTick = marketRatePerMin / (60000.0 / Math.max(500, tickMs));
    if (enabled.get() && rnd.nextDouble() < perTick) {
      BrokerOrder target = crossableClientOrder(symbol, mid, sims);
      if (target != null) {
        String side = "BUY".equals(target.getSide()) ? "SELL" : "BUY";
        BigDecimal qty = randomQty(symbol).min(target.remainingQty());
        if (qty.signum() > 0) {
          netting.placeSimMarket(sims.get(rnd.nextInt(sims.size())), symbol, side, qty, TAG_PREFIX + "market");
        }
      }
    }
  }

  /** Oldest real-client LIMIT on this symbol that accepts the mid (so a computer market order crosses it fully). */
  private BrokerOrder crossableClientOrder(String symbol, BigDecimal mid, List<Long> simAccountIds) {
    BrokerOrder best = null;
    for (BrokerOrder o : orderRepo.findBySymbolCodeAndStatusInAndOrderTypeIn(symbol, NettingService.OPEN_STATUSES, List.of("LIMIT"))) {
      if (o.getLimitPrice() == null || simAccountIds.contains(o.getTradingAccount().getId())) continue;
      boolean acceptsMid = "BUY".equals(o.getSide()) ? o.getLimitPrice().compareTo(mid) >= 0 : o.getLimitPrice().compareTo(mid) <= 0;
      if (!acceptsMid) continue;
      if (best == null || (o.getCreatedAt() != null && best.getCreatedAt() != null && o.getCreatedAt().isBefore(best.getCreatedAt()))) best = o;
    }
    return best;
  }

  private void quote(String symbol, String side, BigDecimal mid, Long accountId) {
    if (!enabled.get()) return; // switched off while this tick was running
    double bps = ThreadLocalRandom.current().nextDouble(offsetMinBps, offsetMaxBps);
    BigDecimal limit = mid.multiply(BigDecimal.ONE.add(BigDecimal.valueOf(bps / 10000.0))).setScale(8, RoundingMode.HALF_UP);
    netting.placeLiquidity(accountId, symbol, side, randomQty(symbol), limit, TAG_PREFIX + "quote");
  }

  /** Sizes that look like real retail orders for each asset class. Overridable: broker.netting.sim.qty.SYMBOL=min,max */
  public BigDecimal randomQty(String symbol) {
    double[] range = qtyRange(symbol);
    double v = ThreadLocalRandom.current().nextDouble(range[0], range[1]);
    int scale = range[1] <= 1 ? 3 : 2;
    BigDecimal q = BigDecimal.valueOf(v).setScale(scale, RoundingMode.HALF_UP);
    return q.signum() > 0 ? q : BigDecimal.valueOf(range[0]);
  }

  private double[] qtyRange(String symbol) {
    String override = env.getProperty("broker.netting.sim.qty." + symbol);
    if (override != null && override.contains(",")) {
      String[] p = override.split(",");
      return new double[] { Double.parseDouble(p[0].trim()), Double.parseDouble(p[1].trim()) };
    }
    BigDecimal cs = ContractSpecs.getContractSize(symbol);
    if (cs.compareTo(BigDecimal.ONE) == 0) return new double[] { 0.01, 0.2 };      // BTC / ETH
    if (cs.compareTo(BigDecimal.valueOf(100000)) == 0) return new double[] { 0.1, 2 }; // FX lots
    return new double[] { 0.05, 1 };                                               // metals etc.
  }

  public List<BrokerOrder> openQuotes(String symbol, String tagPrefix) {
    List<BrokerOrder> out = new ArrayList<>();
    for (BrokerOrder o : orderRepo.findBySymbolCodeAndStatusInAndOrderTypeIn(symbol, NettingService.OPEN_STATUSES, List.of(NettingService.LIQUIDITY))) {
      if (tagPrefix == null || (o.getClientTag() != null && o.getClientTag().startsWith(tagPrefix))) out.add(o);
    }
    return out;
  }

  private List<BrokerOrder> openQuotesAnySymbol(String tagPrefix) {
    List<BrokerOrder> out = new ArrayList<>();
    for (BrokerOrder o : orderRepo.findByStatusInAndOrderType(NettingService.OPEN_STATUSES, NettingService.LIQUIDITY)) {
      if (tagPrefix == null || (o.getClientTag() != null && o.getClientTag().startsWith(tagPrefix))) out.add(o);
    }
    return out;
  }

  /** Cancels every open LIQUIDITY order whose tag starts with {@code tagPrefix} (null = all). */
  public int withdrawAll(String tagPrefix) {
    int n = 0;
    for (BrokerOrder o : orderRepo.findByStatusInAndOrderType(NettingService.OPEN_STATUSES, NettingService.LIQUIDITY)) {
      if (tagPrefix == null || (o.getClientTag() != null && o.getClientTag().startsWith(tagPrefix))) {
        if (netting.cancelLiquidity(o.getId())) n++;
      }
    }
    return n;
  }

  /** Simulated clients close their positions after a while, like real clients would. */
  private void expireOldPositions(List<Long> sims) {
    Instant cutoff = Instant.now().minus(Duration.ofMinutes(Math.max(1, positionTtlMinutes)));
    for (Long accountId : sims) {
      for (Position p : positionRepo.findByTradingAccountIdOrderByUpdatedAtDesc(accountId)) {
        if (p.getOpenedAt() == null || p.getOpenedAt().isAfter(cutoff)) continue;
        double live = priceService.getLivePrice(p.getSymbolCode());
        if (!(live > 0)) continue;
        orderExecutionService.closePositionDueToSlTp(p.getId(), BigDecimal.valueOf(live), "SIM_TTL");
      }
    }
  }
}
