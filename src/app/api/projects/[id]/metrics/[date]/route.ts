import { NextRequest, NextResponse } from 'next/server';
import { getDb, DailyMetric, DailyItemMetric, TrackedItem } from '@/lib/db';

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string; date: string } }
) {
  const db = getDb();
  const projectId = parseInt(params.id, 10);
  const date = params.date;

  const daily = db
    .prepare('SELECT * FROM daily_metrics WHERE project_id = ? AND date = ?')
    .get(projectId, date) as DailyMetric | undefined;

  const itemMetrics = db
    .prepare(`
      SELECT dim.*, ti.title, ti.thumbnail, ti.url
      FROM daily_item_metrics dim
      JOIN tracked_items ti ON dim.item_id = ti.id
      WHERE ti.project_id = ? AND dim.date = ?
      ORDER BY dim.units_sold_est DESC
    `)
    .all(projectId, date) as (DailyItemMetric & Pick<TrackedItem, 'title' | 'thumbnail' | 'url'>)[];

  return NextResponse.json({ daily: daily || null, items: itemMetrics });
}
