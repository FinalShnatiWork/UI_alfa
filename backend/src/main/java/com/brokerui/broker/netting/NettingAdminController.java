package com.brokerui.broker.netting;

import com.brokerui.broker.BrokerOrder;
import com.brokerui.broker.BrokerOrderRepository;
import com.brokerui.broker.ContractSpecs;
import com.brokerui.broker.TradingAccount;
import com.brokerui.broker.TradingAccountRepository;
import com.brokerui.broker.TradingFees;
import com.brokerui.market.MarketPriceService;
import jakarta.persistence.EntityManager;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Duration;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.CrossOrigin;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * Netting admin + test API. Everything under /api/admin is restricted to localhost by
 * {@code LocalhostOnlyFilter}. Endpoints under /test and the sim inject/market endpoints are
 * additionally gated by {@code broker.netting.test-endpoints.enabled}.
 */
@RestController
@CrossOrigin
@RequestMapping("/api/admin/netting")
public class NettingAdminController {

  private final NettingService netting;
  private final HouseLiquiditySimulator hls;
  private final NettingProperties props;
  private final NettingEventLog eventLog;
  private final InternalMatchRepository matchRepo;
  private final BrokerOrderRepository orderRepo;
  private final TradingAccountRepository accountRepo;
  private final MarketPriceService priceService;
  private final EntityManager em;

  public NettingAdminController(NettingService netting, HouseLiquiditySimulator hls, NettingProperties props,
      NettingEventLog eventLog, InternalMatchRepository matchRepo, BrokerOrderRepository orderRepo,
      TradingAccountRepository accountRepo, MarketPriceService priceService, EntityManager em) {
    this.netting = netting;
    this.hls = hls;
    this.props = props;
    this.eventLog = eventLog;
    this.matchRepo = matchRepo;
    this.orderRepo = orderRepo;
    this.accountRepo = accountRepo;
    this.priceService = priceService;
    this.em = em;
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Read-only views
  // ───────────────────────────────────────────────────────────────────────────

  @GetMapping("/summary")
  @Transactional(readOnly = true)
  public Map<String, Object> summary() {
    Map<String, Object> out = new LinkedHashMap<>();
    // Real clients only (simulated accounts excluded), netting-era opening orders only.
    Object[] real = (Object[]) em.createNativeQuery(
        "SELECT COUNT(*), COALESCE(SUM(o.filled_qty),0), COALESCE(SUM(o.internal_qty),0), COALESCE(SUM(o.external_qty),0), "
            + "COALESCE(SUM(o.commission),0), COALESCE(SUM(CASE WHEN o.external_qty > 0 THEN 1 ELSE 0 END),0), "
            + "COALESCE(SUM(CASE WHEN o.routing='INTERNAL' THEN 1 ELSE 0 END),0), COALESCE(SUM(CASE WHEN o.routing='EXTERNAL' THEN 1 ELSE 0 END),0), "
            + "COALESCE(SUM(CASE WHEN o.routing='SPLIT' THEN 1 ELSE 0 END),0) "
            + "FROM broker_order o JOIN trading_account t ON t.id = o.trading_account_id "
            + "WHERE o.routing IN ('INTERNAL','EXTERNAL','SPLIT') AND t.is_simulated = FALSE").getSingleResult();
    BigDecimal filled = dec(real[1]);
    BigDecimal internal = dec(real[2]);
    out.put("orders", num(real[0]));
    out.put("ordersInternal", num(real[6]));
    out.put("ordersExternal", num(real[7]));
    out.put("ordersSplit", num(real[8]));
    out.put("filledQty", filled);
    out.put("internalQty", internal);
    out.put("externalQty", dec(real[3]));
    out.put("internalRateByQty", filled.signum() > 0 ? internal.divide(filled, 4, java.math.RoundingMode.HALF_UP) : BigDecimal.ZERO);

    Object[] m = (Object[]) em.createNativeQuery(
        "SELECT COUNT(*), COALESCE(SUM(external_fee_saved),0), "
            + "COALESCE(SUM(CASE WHEN buyer_simulated THEN 0 ELSE buyer_improvement END),0) + COALESCE(SUM(CASE WHEN seller_simulated THEN 0 ELSE seller_improvement END),0), "
            + "COALESCE(SUM(CASE WHEN buyer_simulated OR seller_simulated THEN 1 ELSE 0 END),0) "
            + "FROM internal_match").getSingleResult();
    BigDecimal feesSaved = dec(m[1]);
    ScheduleMoney schedule = scheduleMoney();
    BigDecimal externalFeesPaid = schedule.nettingExternal;
    BigDecimal realCommission = dec(real[4]);
    out.put("matches", num(m[0]));
    out.put("matchesWithComputer", num(m[3]));
    out.put("clientPriceImprovement", dec(m[2]));
    out.put("externalFeesSaved", feesSaved);
    out.put("externalFeesPaid", externalFeesPaid);
    out.put("commissionRealClients", realCommission);
    out.put("brokerRevenue", realCommission.add(feesSaved).subtract(externalFeesPaid));
    out.put("brokerRevenueFormula", "commission from real clients (netting-era opening fills) + external fees saved - external fees paid");

    Object[] sim = (Object[]) em.createNativeQuery(
        "SELECT COALESCE(SUM(o.commission),0), COALESCE(SUM(CASE WHEN o.realized_pnl IS NOT NULL THEN o.realized_pnl ELSE 0 END),0) "
            + "FROM broker_order o JOIN trading_account t ON t.id = o.trading_account_id WHERE t.is_simulated = TRUE").getSingleResult();
    Object simUnrealized = em.createNativeQuery(
        "SELECT COALESCE(SUM(p.unrealized_pnl),0) FROM position p JOIN trading_account t ON t.id = p.trading_account_id WHERE t.is_simulated = TRUE").getSingleResult();
    out.put("simulatedCommissionDemoMoney", dec(sim[0]));
    // All-time commission from real clients (LEGACY included). Computer commission is demo money.
    BigDecimal allRealCommission = dec(em.createNativeQuery(
        "SELECT COALESCE(SUM(o.commission),0) FROM broker_order o JOIN trading_account t ON t.id = o.trading_account_id "
            + "WHERE t.is_simulated = FALSE").getSingleResult());
    out.put("commissionCollectedRealClients", allRealCommission);
    out.put("scheduleCommission", schedule.commission);
    out.put("legacyFilledOrders", schedule.legacyFilled);
    out.put("legacyExternalFees", schedule.legacyExternal);
    out.put("allTimeExternalFeesPaid", schedule.exchange);
    out.put("internalFeesAvoided", schedule.internalAvoided);
    out.put("brokerCashResult", schedule.commission.subtract(schedule.exchange));
    out.put("brokerCashResultFormula",
        "crypto 0.20% / forex $7 per lot, minus venue cost on what went outside (legacy counts as fully external)");
    out.put("simulatedRealizedPnl", dec(sim[1]));
    out.put("simulatedUnrealizedPnl", dec(simUnrealized));

    Map<String, Object> venue = venueBook();
    out.put("venueHoldings", venue.get("rows"));
    out.put("venueValueUsd", venue.get("valueUsd"));
    out.put("venueLegacyValueUsd", venue.get("legacyValueUsd"));
    out.put("houseNetExposure", netExposure());
    out.put("legacyOrders", num(em.createNativeQuery("SELECT COUNT(*) FROM broker_order WHERE routing = 'LEGACY'").getSingleResult()));
    out.put("simulatorEnabled", hls.isEnabled());
    out.put("limitWaitMs", props.getLimitWaitMs());
    out.put("nnOffline", props.isNnOffline());
    out.put("nnShadow", nnShadowStats());
    return out;
  }

  /**
   * Applies the live schedule to stored fills: client 0.20% of each fill, venue 0.10% of the
   * quantity that went outside. Legacy fills had no book, so the whole order counts as external.
   * Does not rewrite order rows or the saved-fee amounts already stored on internal matches.
   */
  @SuppressWarnings("unchecked")
  private ScheduleMoney scheduleMoney() {
    List<Object[]> rows = em.createNativeQuery(
        "SELECT o.symbol_code, o.routing, o.quantity, o.filled_qty, o.external_qty, o.internal_qty, "
            + "COALESCE(o.entry_price, o.open_price, o.limit_price, 0) "
            + "FROM broker_order o JOIN trading_account t ON t.id = o.trading_account_id "
            + "WHERE t.is_simulated = FALSE AND UPPER(COALESCE(o.status,'')) IN ('FILLED','PARTIALLY_FILLED')")
        .getResultList();
    BigDecimal commission = BigDecimal.ZERO;
    BigDecimal legacyExternal = BigDecimal.ZERO;
    BigDecimal nettingExternal = BigDecimal.ZERO;
    BigDecimal internalAvoided = BigDecimal.ZERO;
    long legacyFilled = 0;
    for (Object[] row : rows) {
      String symbol = row[0] == null ? "" : row[0].toString();
      String routing = row[1] == null ? "" : row[1].toString();
      BigDecimal quantity = dec(row[2]);
      BigDecimal filledQty = dec(row[3]);
      BigDecimal externalQty = dec(row[4]);
      BigDecimal internalQty = dec(row[5]);
      BigDecimal price = dec(row[6]);
      BigDecimal qty = filledQty.signum() > 0 ? filledQty : quantity;
      if (price.signum() <= 0 || qty.signum() <= 0) continue;
      commission = commission.add(TradingFees.calculateCommission(symbol, qty, price));
      if (externalQty.signum() > 0) {
        nettingExternal = nettingExternal.add(TradingFees.exchangeFee(symbol, externalQty, price));
      } else if ("LEGACY".equals(routing)) {
        legacyFilled++;
        legacyExternal = legacyExternal.add(TradingFees.exchangeFee(symbol, qty, price));
      }
      if (internalQty.signum() > 0) {
        // One venue fee per side. The match row stores both sides together; here each order is one side.
        internalAvoided = internalAvoided.add(TradingFees.exchangeFee(symbol, internalQty, price));
      }
    }
    return new ScheduleMoney(commission, legacyExternal.add(nettingExternal), legacyExternal, nettingExternal, internalAvoided, legacyFilled);
  }

  private record ScheduleMoney(
      BigDecimal commission,
      BigDecimal exchange,
      BigDecimal legacyExternal,
      BigDecimal nettingExternal,
      BigDecimal internalAvoided,
      long legacyFilled) {}

  private Map<String, Object> nnShadowStats() {
    Object[] r = (Object[]) em.createNativeQuery(
        "SELECT COALESCE(SUM(CASE WHEN nn_shadow_correct THEN 1 ELSE 0 END),0), COALESCE(SUM(CASE WHEN nn_shadow_correct IS NOT NULL THEN 1 ELSE 0 END),0) "
            + "FROM broker_order WHERE routing IN ('INTERNAL','EXTERNAL','SPLIT')").getSingleResult();
    long correct = num(r[0]);
    long total = num(r[1]);
    Map<String, Object> o = new LinkedHashMap<>();
    o.put("scored", total);
    o.put("correct", correct);
    o.put("accuracy", total > 0 ? (double) correct / total : null);
    return o;
  }

  /**
   * What still sits in the broker's name at the venue: buys that left minus sells that left.
   * An internal transfer does not reduce it. Legacy fills had no book, so the whole order counts as external.
   * Real clients only. Dollar value uses the live price; a USD-base pair (USDJPY) is worth its contract size in dollars.
   */
  @SuppressWarnings("unchecked")
  private Map<String, Object> venueBook() {
    List<Object[]> rows = em.createNativeQuery(
        "SELECT o.symbol_code, o.side, o.routing, o.quantity, o.filled_qty, o.external_qty "
            + "FROM broker_order o JOIN trading_account t ON t.id = o.trading_account_id "
            + "WHERE t.is_simulated = FALSE AND UPPER(COALESCE(o.status,'')) IN ('FILLED','PARTIALLY_FILLED')")
        .getResultList();
    Map<String, BigDecimal> net = new LinkedHashMap<>();
    Map<String, BigDecimal> legacy = new LinkedHashMap<>();
    for (Object[] row : rows) {
      String symbol = row[0] == null ? "" : row[0].toString();
      String side = row[1] == null ? "" : row[1].toString();
      String routing = row[2] == null ? "" : row[2].toString();
      if (symbol.isBlank() || (!"BUY".equals(side) && !"SELL".equals(side))) continue;
      BigDecimal quantity = dec(row[3]);
      BigDecimal filledQty = dec(row[4]);
      BigDecimal externalQty = dec(row[5]);
      BigDecimal outside;
      boolean old;
      if (externalQty.signum() > 0) {
        outside = externalQty;
        old = false;
      } else if ("LEGACY".equals(routing)) {
        outside = filledQty.signum() > 0 ? filledQty : quantity;
        old = true;
      } else {
        continue;
      }
      if (outside.signum() <= 0) continue;
      BigDecimal signed = "SELL".equals(side) ? outside.negate() : outside;
      net.merge(symbol, signed, BigDecimal::add);
      if (old) legacy.merge(symbol, signed, BigDecimal::add);
    }

    List<Map<String, Object>> holdings = new ArrayList<>();
    BigDecimal total = BigDecimal.ZERO;
    BigDecimal legacyTotal = BigDecimal.ZERO;
    for (Map.Entry<String, BigDecimal> e : net.entrySet()) {
      BigDecimal qty = e.getValue();
      if (qty.abs().compareTo(new BigDecimal("0.0000001")) < 0) continue;
      BigDecimal oldQty = legacy.getOrDefault(e.getKey(), BigDecimal.ZERO);
      BigDecimal price = BigDecimal.valueOf(priceService.getLivePrice(e.getKey()));
      BigDecimal value = venueValueUsd(e.getKey(), qty, price);
      BigDecimal oldValue = venueValueUsd(e.getKey(), oldQty, price);
      Map<String, Object> line = new LinkedHashMap<>();
      line.put("symbol", e.getKey());
      line.put("quantity", qty.setScale(8, RoundingMode.HALF_UP));
      line.put("legacyQuantity", oldQty.setScale(8, RoundingMode.HALF_UP));
      line.put("valueUsd", value);
      holdings.add(line);
      if (value != null) total = total.add(value);
      if (oldValue != null) legacyTotal = legacyTotal.add(oldValue);
    }
    holdings.sort((a, b) -> {
      BigDecimal av = a.get("valueUsd") instanceof BigDecimal v ? v.abs() : BigDecimal.ZERO;
      BigDecimal bv = b.get("valueUsd") instanceof BigDecimal v ? v.abs() : BigDecimal.ZERO;
      int byValue = bv.compareTo(av);
      if (byValue != 0) return byValue;
      return String.valueOf(a.get("symbol")).compareTo(String.valueOf(b.get("symbol")));
    });
    Map<String, Object> out = new LinkedHashMap<>();
    out.put("rows", holdings);
    out.put("valueUsd", total.setScale(2, RoundingMode.HALF_UP));
    out.put("legacyValueUsd", legacyTotal.setScale(2, RoundingMode.HALF_UP));
    return out;
  }

  /** Dollar size of a venue residual. USD-base forex is the contract itself (100,000 USD per lot). */
  private static BigDecimal venueValueUsd(String symbol, BigDecimal qty, BigDecimal price) {
    if (qty.signum() == 0) return BigDecimal.ZERO.setScale(2, RoundingMode.HALF_UP);
    String sym = symbol.toUpperCase(Locale.ROOT);
    BigDecimal contract = ContractSpecs.getContractSize(sym);
    BigDecimal raw;
    if (sym.startsWith("USD") && contract.compareTo(BigDecimal.valueOf(100000)) == 0) {
      raw = qty.multiply(contract);
    } else if (price == null || price.signum() <= 0) {
      return null;
    } else {
      raw = qty.multiply(contract).multiply(price);
    }
    return raw.setScale(2, RoundingMode.HALF_UP);
  }

  /** Per symbol: Σ BUY internal qty − Σ SELL internal qty. Must be 0 — the house never keeps a side. */
  private Map<String, BigDecimal> netExposure() {
    Map<String, BigDecimal> out = new LinkedHashMap<>();
    @SuppressWarnings("unchecked")
    List<Object[]> rows = em.createNativeQuery(
        "SELECT symbol_code, COALESCE(SUM(CASE WHEN side='BUY' THEN internal_qty ELSE -internal_qty END),0) "
            + "FROM broker_order WHERE internal_qty > 0 GROUP BY symbol_code ORDER BY symbol_code").getResultList();
    for (Object[] r : rows) out.put((String) r[0], dec(r[1]));
    return out;
  }

  @GetMapping("/matches")
  @Transactional(readOnly = true)
  public List<InternalMatch> matches(@RequestParam(defaultValue = "0") long since, @RequestParam(defaultValue = "200") int limit) {
    List<InternalMatch> all = since > 0 ? matchRepo.findByIdGreaterThanOrderByIdAsc(since) : reverse(matchRepo.findTop200ByOrderByIdDesc());
    return all.size() > limit ? all.subList(0, Math.max(0, limit)) : all;
  }

  private static <T> List<T> reverse(List<T> in) {
    List<T> out = new ArrayList<>(in);
    java.util.Collections.reverse(out);
    return out;
  }

  @GetMapping("/events")
  public Map<String, Object> events(@RequestParam(defaultValue = "0") long since, @RequestParam(defaultValue = "500") int limit) {
    return Map.of("lastSeq", eventLog.lastSeq(), "events", eventLog.since(since, Math.min(Math.max(limit, 1), 1000)));
  }

  @GetMapping("/book")
  @Transactional(readOnly = true)
  public Map<String, Object> book(@RequestParam String symbol) {
    String sym = symbol.trim().toUpperCase(Locale.ROOT);
    Map<String, Object> out = new LinkedHashMap<>();
    Quote q = netting.currentQuote(sym);
    MarketPriceService.TestOverride ov = priceService.getTestOverride(sym);
    out.put("symbol", sym);
    out.put("bid", q == null ? null : q.bid());
    out.put("mid", q == null ? null : q.mid());
    out.put("ask", q == null ? null : q.ask());
    out.put("frozen", ov != null);
    out.put("crossed", ov != null && ov.crossed());
    List<Map<String, Object>> buys = new ArrayList<>();
    List<Map<String, Object>> sells = new ArrayList<>();
    List<BrokerOrder> open = orderRepo.findBySymbolCodeAndStatusInAndOrderTypeIn(sym, NettingService.OPEN_STATUSES,
        List.of("LIMIT", NettingService.LIQUIDITY, "MARKET", "STOP"));
    for (BrokerOrder o : open) {
      TradingAccount ta = o.getTradingAccount();
      Map<String, Object> row = new LinkedHashMap<>();
      row.put("orderId", o.getId());
      row.put("accountId", ta.getId());
      row.put("owner", ta.getUser().getEmail());
      row.put("simulated", ta.isSimulated());
      row.put("type", o.getOrderType());
      row.put("status", o.getStatus());
      row.put("quantity", o.getQuantity());
      row.put("remaining", o.remainingQty());
      row.put("limit", o.getLimitPrice());
      row.put("stop", o.getStopPrice());
      row.put("bpsFromMid", q == null || o.getLimitPrice() == null ? null
          : o.getLimitPrice().subtract(q.mid()).divide(q.mid(), 10, java.math.RoundingMode.HALF_UP).multiply(BigDecimal.valueOf(10000)).setScale(2, java.math.RoundingMode.HALF_UP));
      row.put("netDeadline", o.getNetDeadline());
      row.put("createdAt", o.getCreatedAt());
      row.put("clientTag", o.getClientTag());
      ("BUY".equals(o.getSide()) ? buys : sells).add(row);
    }
    buys.sort((a, b) -> cmpDesc(a.get("limit"), b.get("limit")));
    sells.sort((a, b) -> cmpDesc(b.get("limit"), a.get("limit")));
    out.put("buys", buys);
    out.put("sells", sells);
    return out;
  }

  private static int cmpDesc(Object a, Object b) {
    if (a == null && b == null) return 0;
    if (a == null) return 1;
    if (b == null) return -1;
    return ((BigDecimal) b).compareTo((BigDecimal) a);
  }

  /** I1–I7 from the plan, straight from the database. Every "violations" must be 0. */
  @GetMapping("/invariants")
  @Transactional(readOnly = true)
  public Map<String, Object> invariants() {
    Map<String, Object> out = new LinkedHashMap<>();
    long i1 = num(em.createNativeQuery("SELECT COUNT(*) FROM internal_match WHERE NOT (bid < mid AND mid < ask)").getSingleResult());
    long i2 = num(em.createNativeQuery(
        "SELECT COUNT(*) FROM internal_match m JOIN broker_order b ON b.id = m.buy_order_id JOIN broker_order s ON s.id = m.sell_order_id "
            + "WHERE (b.limit_price IS NOT NULL AND b.order_type IN ('LIMIT','LIQUIDITY') AND b.limit_price < m.mid) "
            + "OR (s.limit_price IS NOT NULL AND s.order_type IN ('LIMIT','LIQUIDITY') AND s.limit_price > m.mid)").getSingleResult());
    Map<String, BigDecimal> exposure = netExposure();
    long i3 = exposure.values().stream().filter(v -> v.signum() != 0).count();
    long i4 = num(em.createNativeQuery(
        "SELECT COUNT(*) FROM internal_match WHERE buy_account_id = sell_account_id OR (buyer_simulated AND seller_simulated)").getSingleResult());
    long i5 = num(em.createNativeQuery(
        "SELECT COUNT(*) FROM broker_order WHERE internal_qty + external_qty <> filled_qty OR filled_qty > quantity OR filled_qty < 0").getSingleResult());
    long i6 = num(em.createNativeQuery(
        "SELECT COUNT(*) FROM broker_order WHERE routing IN ('INTERNAL','EXTERNAL','SPLIT') AND filled_qty > 0 AND commission <= 0").getSingleResult());
    Object[] i7row = (Object[]) em.createNativeQuery(
        "SELECT (SELECT COALESCE(SUM(quantity),0) FROM internal_match), "
            + "(SELECT COALESCE(SUM(internal_qty),0) FROM broker_order WHERE side='BUY'), "
            + "(SELECT COALESCE(SUM(internal_qty),0) FROM broker_order WHERE side='SELL')").getSingleResult();
    BigDecimal m = dec(i7row[0]), b = dec(i7row[1]), s = dec(i7row[2]);
    boolean i7ok = m.compareTo(b) == 0 && m.compareTo(s) == 0;
    out.put("I1_price_sanity", inv(i1, "internal matches with bid<mid<ask violated"));
    out.put("I2_nbbo_both_sides", inv(i2, "matches where a resting/limit side did not accept the mid"));
    out.put("I3_house_net_exposure_zero", inv(i3, "symbols where netted BUY qty != netted SELL qty: " + exposure));
    out.put("I4_no_self_or_sim_sim", inv(i4, "self-matches or computer-vs-computer matches"));
    out.put("I5_quantity_accounting", inv(i5, "orders where internal+external != filled or filled > quantity"));
    out.put("I6_commission_charged", inv(i6, "netting-era filled orders without commission"));
    out.put("I7_every_internal_unit_has_a_real_counterparty", inv(i7ok ? 0 : 1,
        "match qty " + m.toPlainString() + " / BUY internal " + b.toPlainString() + " / SELL internal " + s.toPlainString()));
    boolean all = i1 == 0 && i2 == 0 && i3 == 0 && i4 == 0 && i5 == 0 && i6 == 0 && i7ok;
    out.put("allPass", all);
    return out;
  }

  private static Map<String, Object> inv(long violations, String meaning) {
    Map<String, Object> m = new LinkedHashMap<>();
    m.put("pass", violations == 0);
    m.put("violations", violations);
    m.put("meaning", meaning);
    return m;
  }

  @GetMapping("/sim/status")
  @Transactional(readOnly = true)
  public Map<String, Object> simStatus() {
    Map<String, Object> out = new LinkedHashMap<>();
    out.put("enabled", hls.isEnabled());
    out.put("symbols", hls.symbols());
    List<Map<String, Object>> accounts = new ArrayList<>();
    for (Long id : accountRepo.findSimulatedIds()) {
      TradingAccount ta = accountRepo.findById(id).orElseThrow();
      Map<String, Object> a = new LinkedHashMap<>();
      a.put("accountId", id);
      a.put("email", ta.getUser().getEmail());
      a.put("displayName", ta.getUser().getDisplayName());
      a.put("balance", ta.getBalance());
      a.put("equity", ta.getEquity());
      a.put("commissionPaidTotal", ta.getCommissionPaidTotal());
      a.put("openPositions", num(em.createNativeQuery("SELECT COUNT(*) FROM position WHERE trading_account_id = ?1").setParameter(1, id).getSingleResult()));
      a.put("unrealizedPnl", dec(em.createNativeQuery("SELECT COALESCE(SUM(unrealized_pnl),0) FROM position WHERE trading_account_id = ?1").setParameter(1, id).getSingleResult()));
      a.put("openQuotes", num(em.createNativeQuery("SELECT COUNT(*) FROM broker_order WHERE trading_account_id = ?1 AND order_type='LIQUIDITY' AND status IN ('NEW','PARTIALLY_FILLED','PENDING_NET')").setParameter(1, id).getSingleResult()));
      accounts.add(a);
    }
    out.put("accounts", accounts);
    return out;
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Simulator control
  // ───────────────────────────────────────────────────────────────────────────

  @PostMapping("/sim/enabled")
  public Map<String, Object> simEnabled(@RequestBody Map<String, Object> body) {
    hls.setEnabled(bool(body.get("on")));
    return Map.of("ok", true, "enabled", hls.isEnabled());
  }

  /** Removes open LIQUIDITY orders (all, or one symbol). */
  @PostMapping("/sim/clear")
  public Map<String, Object> simClear(@RequestBody(required = false) Map<String, Object> body) {
    String sym = body == null || body.get("symbol") == null ? null : body.get("symbol").toString().trim().toUpperCase(Locale.ROOT);
    int n = 0;
    if (sym == null) {
      n = hls.withdrawAll(null);
    } else {
      for (BrokerOrder o : hls.openQuotes(sym, null)) if (netting.cancelLiquidity(o.getId())) n++;
    }
    return Map.of("ok", true, "cancelled", n);
  }

  /** Places one computer quote at mid × (1 + offsetBps/10000). account = 1 or 2 (which sim account). */
  @PostMapping("/sim/inject")
  public ResponseEntity<?> simInject(@RequestBody Map<String, Object> body) {
    if (!props.isTestEndpointsEnabled()) return forbidden();
    try {
      String sym = str(body, "symbol").toUpperCase(Locale.ROOT);
      String side = str(body, "side").toUpperCase(Locale.ROOT);
      BigDecimal qty = new BigDecimal(str(body, "qty"));
      double bps = body.get("offsetBps") == null ? 0 : Double.parseDouble(body.get("offsetBps").toString());
      Long accountId = simAccount(body.get("account"));
      Quote q = netting.currentQuote(sym);
      if (q == null) return ResponseEntity.status(HttpStatus.BAD_GATEWAY).body(Map.of("ok", false, "error", "price_unavailable"));
      BigDecimal limit = body.get("limit") != null ? new BigDecimal(body.get("limit").toString())
          : q.mid().multiply(BigDecimal.ONE.add(BigDecimal.valueOf(bps / 10000.0))).setScale(8, java.math.RoundingMode.HALF_UP);
      String tag = body.get("tag") == null ? "test:inject" : body.get("tag").toString();
      NettingService.Result r = netting.placeLiquidity(accountId, sym, side, qty, limit, tag);
      return ResponseEntity.ok(resultMap(r, Map.of("limit", limit, "accountId", accountId)));
    } catch (Exception e) {
      return ResponseEntity.badRequest().body(Map.of("ok", false, "error", String.valueOf(e.getMessage())));
    }
  }

  /** The computer sends a MARKET order (used for "computer vs computer is blocked"). */
  @PostMapping("/sim/market")
  public ResponseEntity<?> simMarket(@RequestBody Map<String, Object> body) {
    if (!props.isTestEndpointsEnabled()) return forbidden();
    try {
      String sym = str(body, "symbol").toUpperCase(Locale.ROOT);
      String side = str(body, "side").toUpperCase(Locale.ROOT);
      BigDecimal qty = new BigDecimal(str(body, "qty"));
      Long accountId = simAccount(body.get("account"));
      String tag = body.get("tag") == null ? "test:market" : body.get("tag").toString();
      NettingService.Result r = netting.placeSimMarket(accountId, sym, side, qty, tag);
      return ResponseEntity.ok(resultMap(r, Map.of("accountId", accountId)));
    } catch (Exception e) {
      return ResponseEntity.badRequest().body(Map.of("ok", false, "error", String.valueOf(e.getMessage())));
    }
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Test controls (demo only)
  // ───────────────────────────────────────────────────────────────────────────

  @GetMapping("/test/status")
  public Map<String, Object> testStatus() {
    Map<String, Object> out = new LinkedHashMap<>();
    out.put("testEndpointsEnabled", props.isTestEndpointsEnabled());
    out.put("overrides", priceService.activeTestOverrides());
    out.put("nnOffline", props.isNnOffline());
    out.put("limitWaitMs", props.getLimitWaitMs());
    out.put("simulatorEnabled", hls.isEnabled());
    return out;
  }

  /** Freeze a symbol's price (mid given, or the current live price) for up to freeze-ttl-minutes. */
  @PostMapping("/test/freeze-quote")
  public ResponseEntity<?> freeze(@RequestBody Map<String, Object> body) {
    if (!props.isTestEndpointsEnabled()) return forbidden();
    String sym = str(body, "symbol").toUpperCase(Locale.ROOT);
    double mid = body.get("mid") != null ? Double.parseDouble(body.get("mid").toString()) : liveUnfrozen(sym);
    if (!(mid > 0)) return ResponseEntity.status(HttpStatus.BAD_GATEWAY).body(Map.of("ok", false, "error", "price_unavailable"));
    priceService.setTestOverride(sym, mid, false, Duration.ofMinutes(props.getFreezeTtlMinutes()).toMillis());
    return ResponseEntity.ok(Map.of("ok", true, "symbol", sym, "mid", mid, "ttlMinutes", props.getFreezeTtlMinutes()));
  }

  @PostMapping("/test/unfreeze-quote")
  public ResponseEntity<?> unfreeze(@RequestBody(required = false) Map<String, Object> body) {
    if (!props.isTestEndpointsEnabled()) return forbidden();
    if (body == null || body.get("symbol") == null) priceService.clearAllTestOverrides();
    else priceService.clearTestOverride(body.get("symbol").toString());
    return ResponseEntity.ok(Map.of("ok", true));
  }

  /** Crossed market (bid above ask) on a frozen mid — netting must refuse to cross. */
  @PostMapping("/test/crossed-quote")
  public ResponseEntity<?> crossed(@RequestBody Map<String, Object> body) {
    if (!props.isTestEndpointsEnabled()) return forbidden();
    String sym = str(body, "symbol").toUpperCase(Locale.ROOT);
    boolean on = body.get("on") == null || bool(body.get("on"));
    MarketPriceService.TestOverride cur = priceService.getTestOverride(sym);
    double mid = cur != null ? cur.mid() : liveUnfrozen(sym);
    if (!(mid > 0)) return ResponseEntity.status(HttpStatus.BAD_GATEWAY).body(Map.of("ok", false, "error", "price_unavailable"));
    priceService.setTestOverride(sym, mid, on, Duration.ofMinutes(props.getFreezeTtlMinutes()).toMillis());
    return ResponseEntity.ok(Map.of("ok", true, "symbol", sym, "mid", mid, "crossed", on));
  }

  @PostMapping("/test/nn-offline")
  public ResponseEntity<?> nnOffline(@RequestBody Map<String, Object> body) {
    if (!props.isTestEndpointsEnabled()) return forbidden();
    props.setNnOffline(bool(body.get("on")));
    return ResponseEntity.ok(Map.of("ok", true, "nnOffline", props.isNnOffline()));
  }

  @PostMapping("/test/limit-wait-ms")
  public ResponseEntity<?> limitWait(@RequestBody Map<String, Object> body) {
    if (!props.isTestEndpointsEnabled()) return forbidden();
    props.setLimitWaitMs(Long.parseLong(body.get("ms").toString()));
    return ResponseEntity.ok(Map.of("ok", true, "limitWaitMs", props.getLimitWaitMs()));
  }

  // ───────────────────────────────────────────────────────────────────────────

  private double liveUnfrozen(String sym) {
    MarketPriceService.TestOverride cur = priceService.getTestOverride(sym);
    if (cur != null) return cur.mid();
    return priceService.getLivePrice(sym);
  }

  private Long simAccount(Object which) {
    List<Long> sims = accountRepo.findSimulatedIds();
    if (sims.isEmpty()) throw new IllegalStateException("no simulated accounts (V32 migration missing?)");
    int idx = 0;
    if (which != null) idx = Math.max(0, Math.min(sims.size() - 1, Integer.parseInt(which.toString()) - 1));
    return sims.get(idx);
  }

  private static Map<String, Object> resultMap(NettingService.Result r, Map<String, Object> extra) {
    Map<String, Object> m = new LinkedHashMap<>();
    m.put("ok", true);
    m.put("orderId", r.orderId());
    m.put("status", r.status());
    m.put("routing", r.routing());
    m.put("filledQty", r.filledQty());
    m.put("internalQty", r.internalQty());
    m.put("externalQty", r.externalQty());
    m.put("avgPrice", r.avgPrice());
    m.put("matches", r.matches());
    m.putAll(extra);
    return m;
  }

  private static ResponseEntity<?> forbidden() {
    return ResponseEntity.status(HttpStatus.FORBIDDEN).body(Map.of("ok", false, "error", "test_endpoints_disabled"));
  }

  private static String str(Map<String, Object> body, String key) {
    Object v = body.get(key);
    if (v == null || v.toString().isBlank()) throw new IllegalArgumentException(key + " is required");
    return v.toString().trim();
  }

  private static boolean bool(Object v) {
    return v != null && (Boolean.TRUE.equals(v) || "true".equalsIgnoreCase(v.toString()) || "1".equals(v.toString()));
  }

  private static BigDecimal dec(Object o) {
    if (o == null) return BigDecimal.ZERO;
    if (o instanceof BigDecimal b) return b;
    return new BigDecimal(o.toString());
  }

  private static long num(Object o) {
    return o == null ? 0 : ((Number) o).longValue();
  }
}
