import { NextRequest, NextResponse } from 'next/server';
import { getDb, DailyMetric } from '@/lib/db';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { searchParams } = new URL(req.url);
  const from = searchParams.get('from') || new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
  const to = searchParams.get('to') || new Date().toISOString().slice(0, 10);
  const { id } = await params;
  const projectId = parseInt(id, 10);

  const db = getDb();
  const metrics = db
    .prepare(
      'SELECT * FROM daily_metrics WHERE project_id = ? AND date >= ? AND date <= ? ORDER BY date ASC'
    )
    .all(projectId, from, to) as DailyMetric[];

  return NextResponse.json(metrics);
}
