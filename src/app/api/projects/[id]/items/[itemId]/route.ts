import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string; itemId: string } }
) {
  const db = getDb();
  db.prepare('DELETE FROM daily_item_metrics WHERE item_id = ?').run(params.itemId);
  db.prepare('DELETE FROM item_snapshots WHERE item_id = ?').run(params.itemId);
  db.prepare('DELETE FROM tracked_items WHERE id = ? AND project_id = ?').run(
    params.itemId,
    parseInt(params.id, 10)
  );
  return NextResponse.json({ ok: true });
}
