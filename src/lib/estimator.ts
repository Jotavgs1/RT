import { getDb, ItemSnapshot, DailyItemMetric } from './db';

export function computeDailyMetricsForItem(itemId: string, date: string): DailyItemMetric {
  const db = getDb();

  const startOfDay = `${date} 00:00:00`;
  const endOfDay = `${date} 23:59:59`;
  const prevDate = getPrevDate(date);
  const startOfPrev = `${prevDate} 00:00:00`;

  const snapshots = db
    .prepare(
      `SELECT * FROM item_snapshots
       WHERE item_id = ? AND captured_at >= ? AND captured_at <= ?
       ORDER BY captured_at ASC`
    )
    .all(itemId, startOfPrev, endOfDay) as ItemSnapshot[];

  if (snapshots.length < 2) {
    const latest = snapshots[0];
    return {
      item_id: itemId,
      date,
      units_sold_est: 0,
      revenue_est: 0,
      avg_price: latest?.price ?? 0,
      reliability: 'Baixa',
    };
  }

  const prevSnapshots = snapshots.filter((s) => s.captured_at < startOfDay);
  const daySnapshots = snapshots.filter(
    (s) => s.captured_at >= startOfDay && s.captured_at <= endOfDay
  );

  const baseline = prevSnapshots.length > 0 ? prevSnapshots[prevSnapshots.length - 1] : snapshots[0];
  const comparisons = daySnapshots.length > 0 ? daySnapshots : snapshots.slice(1);

  let unitsSold = 0;
  let reliability: 'Alta' | 'Média' | 'Baixa' = 'Baixa';
  let priceSum = 0;
  let priceCount = 0;

  const hasSoldQty =
    baseline.sold_qty !== null &&
    comparisons.some((s) => s.sold_qty !== null);

  if (hasSoldQty) {
    let prevSold = baseline.sold_qty ?? 0;
    let isPrecise = !isBandValue(baseline.sold_qty_raw);
    for (const snap of comparisons) {
      if (snap.sold_qty !== null) {
        const delta = snap.sold_qty - prevSold;
        if (delta > 0) unitsSold += delta;
        if (isBandValue(snap.sold_qty_raw)) isPrecise = false;
        prevSold = snap.sold_qty;
      }
    }
    reliability = isPrecise ? 'Alta' : 'Média';
  } else {
    let prevAvail = baseline.available_qty;
    for (const snap of comparisons) {
      if (snap.available_qty !== null && prevAvail !== null) {
        const delta = prevAvail - snap.available_qty;
        if (delta > 0) unitsSold += delta;
        prevAvail = snap.available_qty;
      }
    }
    reliability = 'Baixa';
  }

  const allSnaps = [baseline, ...comparisons];
  for (const s of allSnaps) {
    if (s.price !== null) {
      priceSum += s.price;
      priceCount++;
    }
  }
  const avgPrice = priceCount > 0 ? priceSum / priceCount : 0;
  const revenueEst = unitsSold * avgPrice;

  return {
    item_id: itemId,
    date,
    units_sold_est: unitsSold,
    revenue_est: revenueEst,
    avg_price: avgPrice,
    reliability,
  };
}

function isBandValue(raw: string | null): boolean {
  if (raw === null) return false;
  return raw.includes('+') || isNaN(Number(raw));
}

function getPrevDate(date: string): string {
  const d = new Date(date + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

export function recomputeDailyMetrics(projectId: number, date: string): void {
  const db = getDb();
  const items = db
    .prepare('SELECT id FROM tracked_items WHERE project_id = ? AND unresolved = 0')
    .all(projectId) as { id: string }[];

  let totalUnits = 0;
  let totalRevenue = 0;
  let itemsSoldCount = 0;

  const upsertItem = db.prepare(`
    INSERT OR REPLACE INTO daily_item_metrics
      (item_id, date, units_sold_est, revenue_est, avg_price, reliability)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  const upsertDay = db.prepare(`
    INSERT OR REPLACE INTO daily_metrics
      (project_id, date, units_sold_est_total, items_sold_count, revenue_est_total, avg_ticket_est)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  db.transaction(() => {
    for (const item of items) {
      const m = computeDailyMetricsForItem(item.id, date);
      upsertItem.run(item.id, date, m.units_sold_est, m.revenue_est, m.avg_price, m.reliability);
      totalUnits += m.units_sold_est;
      totalRevenue += m.revenue_est;
      if (m.units_sold_est > 0) itemsSoldCount++;
    }
    const avgTicket = totalUnits > 0 ? totalRevenue / totalUnits : 0;
    upsertDay.run(projectId, date, totalUnits, itemsSoldCount, totalRevenue, avgTicket);
  })();
}
