import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const db = getDb();
  const { id: idStr } = await params;
  const id = parseInt(idStr, 10);
  db.prepare('DELETE FROM daily_item_metrics WHERE item_id IN (SELECT id FROM tracked_items WHERE project_id = ?)').run(id);
  db.prepare('DELETE FROM item_snapshots WHERE item_id IN (SELECT id FROM tracked_items WHERE project_id = ?)').run(id);
  db.prepare('DELETE FROM daily_metrics WHERE project_id = ?').run(id);
  db.prepare('DELETE FROM tracked_items WHERE project_id = ?').run(id);
  db.prepare('DELETE FROM projects WHERE id = ?').run(id);
  return NextResponse.json({ ok: true });
}
