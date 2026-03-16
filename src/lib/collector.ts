import { getDb, TrackedItem } from './db';
import { fetchItem, parseSoldQty } from './meli';
import { recomputeDailyMetrics } from './estimator';

export async function collectItem(itemId: string): Promise<{ ok: boolean; error?: string }> {
  const item = await fetchItem(itemId);
  if (!item) return { ok: false, error: `Erro ao buscar item ${itemId}` };

  const db = getDb();
  const { value: soldQty, rawStr: soldQtyRaw } = parseSoldQty(item.sold_quantity);

  db.prepare(`
    INSERT INTO item_snapshots (item_id, captured_at, available_qty, sold_qty, sold_qty_raw, price, status)
    VALUES (?, datetime('now'), ?, ?, ?, ?, ?)
  `).run(
    itemId,
    item.available_quantity ?? null,
    soldQty,
    soldQtyRaw,
    item.price ?? null,
    item.status ?? null
  );

  db.prepare(`
    UPDATE tracked_items SET title = ?, thumbnail = ?, status = ? WHERE id = ?
  `).run(item.title, item.thumbnail, item.status, itemId);

  return { ok: true };
}

export async function collectProject(projectId: number): Promise<{
  success: number;
  errors: string[];
}> {
  const db = getDb();
  const items = db
    .prepare('SELECT * FROM tracked_items WHERE project_id = ? AND status != ? AND unresolved = 0')
    .all(projectId, 'closed') as TrackedItem[];

  const errors: string[] = [];
  let success = 0;
  for (const item of items) {
    const result = await collectItem(item.id);
    if (result.ok) success++;
    else if (result.error) errors.push(result.error);
  }

  const today = new Date().toISOString().slice(0, 10);
  recomputeDailyMetrics(projectId, today);

  return { success, errors };
}

export async function collectAll(): Promise<{
  projectsProcessed: number;
  totalSuccess: number;
  errors: string[];
}> {
  const db = getDb();
  const projects = db.prepare('SELECT id FROM projects').all() as { id: number }[];
  let totalSuccess = 0;
  const allErrors: string[] = [];

  for (const p of projects) {
    const result = await collectProject(p.id);
    totalSuccess += result.success;
    allErrors.push(...result.errors);
  }

  return {
    projectsProcessed: projects.length,
    totalSuccess,
    errors: allErrors,
  };
}
