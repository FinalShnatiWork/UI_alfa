package com.brokerui.broker.netting;

import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Deque;
import java.util.List;
import org.springframework.stereotype.Component;

/**
 * In-memory ring buffer (last 1000) of engine decisions, served by /api/admin/netting/events.
 * Events are published only after the transaction that produced them commits.
 */
@Component
public class NettingEventLog {
  private static final int CAPACITY = 1000;

  public record Event(long seq, long ts, String symbol, Long orderId, Long restingOrderId,
      String code, String detail, Long matchId) {}

  private final Deque<Event> events = new ArrayDeque<>();
  private long seq = 0;

  public synchronized void add(String symbol, Long orderId, Long restingOrderId, String code, String detail, Long matchId) {
    events.addLast(new Event(++seq, System.currentTimeMillis(), symbol, orderId, restingOrderId, code, detail, matchId));
    while (events.size() > CAPACITY) events.removeFirst();
  }

  public synchronized List<Event> since(long afterSeq, int limit) {
    List<Event> out = new ArrayList<>();
    for (Event e : events) {
      if (e.seq() > afterSeq) {
        out.add(e);
        if (out.size() >= limit) break;
      }
    }
    return out;
  }

  public synchronized long lastSeq() { return seq; }
}
