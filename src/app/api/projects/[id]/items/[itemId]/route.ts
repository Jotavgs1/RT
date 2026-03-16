import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; itemId: string }> }
) {
  const db = getDb();
  const { id, itemId } = await params;
  db.prepare('DELETE FROM daily_item_metrics WHERE item_id = ?').run(itemId);
  db.prepare('DELETE FROM item_snapshots WHERE item_id = ?').run(itemId);
  db.prepare('DELETE FROM tracked_items WHERE id = ? AND project_id = ?').run(
    itemId,
    parseInt(id, 10)
  );
  return NextResponse.json({ ok: true });
}
