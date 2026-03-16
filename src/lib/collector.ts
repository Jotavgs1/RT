import { getDb, TrackedItem } from './db';
import { fetchItemWithRetry, fetchItemFallback, resolveItemViaAlternativeRoutes, parseSoldQty, AlternativeSource } from './meli';
import { recomputeDailyMetrics } from './estimator';
import { ALTERNATIVE_API_SOURCES } from './constants';

export type ItemCollectStatus = 'ok' | 'blocked' | 'removed' | 'auth_error' | 'failed';

export type CollectSource = 'api' | AlternativeSource | 'fallback' | 'none';

export { ALTERNATIVE_API_SOURCES };

export interface CollectItemResult {
  itemId: string;
  status: ItemCollectStatus;
  reason?: string;
  sourceUsed: CollectSource;
  attempts?: number;
  lastHttpStatus?: number | null;
}

export interface CollectProjectResult {
  collected: number;
  skipped: number;
  failed: number;
  items: CollectItemResult[];
}

/** Persists a transient/permanent error for an item (no data snapshot) */
function updateItemError(itemId: string, errorCode: number | null, errorMessage: string): void {
  getDb()
    .prepare(
      'UPDATE tracked_items SET last_error_code = ?, last_error_message = ?, source_used = NULL WHERE id = ?'
    )
    .run(errorCode ?? null, errorMessage, itemId);
}

export async function collectItem(itemId: string): Promise<CollectItemResult> {
  // Step 1: Try primary endpoint with retry (backoff for 429/5xx/timeout)
  const fetchResult = await fetchItemWithRetry(itemId, 3);

  if (fetchResult.ok) {
    const item = fetchResult.data;
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
      UPDATE tracked_items
      SET title = ?, thumbnail = ?, status = ?, blocked = 0,
          last_error_code = NULL, last_error_message = NULL,
          source_used = 'api'
      WHERE id = ?
    `).run(item.title, item.thumbnail, item.status, itemId);

    return { itemId, status: 'ok', sourceUsed: 'api', attempts: fetchResult.attempts };
  }

  // API call failed — classify by HTTP status
  const { errorCode, errorMessage } = fetchResult;

  if (errorCode === 401) {
    updateItemError(itemId, 401, 'Token inválido ou expirado (401)');
    return {
      itemId,
      status: 'auth_error',
      reason: 'Token inválido ou expirado (401)',
      sourceUsed: 'none',
      attempts: fetchResult.attempts,
      lastHttpStatus: 401,
    };
  }

  if (errorCode === 404 || errorCode === 410) {
    const reason =
      errorCode === 410 ? 'Item removido permanentemente (410)' : 'Item não encontrado (404)';
    getDb()
      .prepare(
        "UPDATE tracked_items SET status = 'closed', last_error_code = ?, last_error_message = ?, source_used = NULL WHERE id = ?"
      )
      .run(errorCode, reason, itemId);
    return {
      itemId,
      status: 'removed',
      reason,
      sourceUsed: 'none',
      attempts: fetchResult.attempts,
      lastHttpStatus: errorCode,
    };
  }

  if (errorCode === 403) {
    const db = getDb();
    // Step 2: Try alternative API routes before falling back to scraping
    const altResult = await resolveItemViaAlternativeRoutes(itemId);

    if (altResult.ok) {
      const item = altResult.data;
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
        UPDATE tracked_items
        SET title = COALESCE(?, title), thumbnail = COALESCE(?, thumbnail),
            blocked = 0, last_error_code = NULL, last_error_message = NULL,
            source_used = ?
        WHERE id = ?
      `).run(item.title ?? null, item.thumbnail ?? null, altResult.source, itemId);

      return {
        itemId,
        status: 'ok',
        sourceUsed: altResult.source,
        attempts: fetchResult.attempts,
        lastHttpStatus: 403,
      };
    }

    // Step 3: All API routes failed — try scraping as last resort only
    const tracked = db
      .prepare('SELECT * FROM tracked_items WHERE id = ?')
      .get(itemId) as TrackedItem | undefined;

    const fallbackData = await fetchItemFallback(itemId, tracked?.url ?? null);

    if (fallbackData && (fallbackData.title || fallbackData.price != null)) {
      db.prepare(`
        INSERT INTO item_snapshots (item_id, captured_at, available_qty, sold_qty, sold_qty_raw, price, status)
        VALUES (?, datetime('now'), NULL, NULL, NULL, ?, 'blocked')
      `).run(itemId, fallbackData.price ?? null);

      db.prepare(`
        UPDATE tracked_items
        SET title = COALESCE(?, title),
            blocked = 1,
            last_error_code = 403,
            last_error_message = 'Acesso negado pela API (403) – todas as rotas API falharam; dados parciais via scraping',
            source_used = 'fallback'
        WHERE id = ?
      `).run(fallbackData.title ?? null, itemId);

      return {
        itemId,
        status: 'blocked',
        reason: 'Acesso negado (403) – todas as rotas API falharam; snapshot parcial via scraping (último recurso)',
        sourceUsed: 'fallback',
        attempts: fetchResult.attempts,
        lastHttpStatus: 403,
      };
    }

    // Everything failed
    db.prepare(
      'UPDATE tracked_items SET blocked = 1, last_error_code = 403, last_error_message = ?, source_used = NULL WHERE id = ?'
    ).run('Acesso negado pela API (403) – sem dados disponíveis', itemId);

    return {
      itemId,
      status: 'blocked',
      reason: 'Acesso negado (403) – todas as rotas falharam',
      sourceUsed: 'none',
      attempts: fetchResult.attempts,
      lastHttpStatus: 403,
    };
  }

  // 5xx / timeout / network error — transient failure (retries already exhausted)
  updateItemError(itemId, errorCode, errorMessage);

  return {
    itemId,
    status: 'failed',
    reason: errorMessage,
    sourceUsed: 'none',
    attempts: fetchResult.attempts,
    lastHttpStatus: errorCode,
  };
}

export async function collectProject(projectId: number): Promise<CollectProjectResult> {
  const db = getDb();
  const items = db
    .prepare('SELECT * FROM tracked_items WHERE project_id = ? AND status != ? AND unresolved = 0')
    .all(projectId, 'closed') as TrackedItem[];

  const results: CollectItemResult[] = [];
  let collected = 0;
  let skipped = 0;
  let failed = 0;

  for (const item of items) {
    const result = await collectItem(item.id);
    results.push(result);
    if (result.status === 'ok') collected++;
    else if (result.status === 'removed') skipped++;
    else failed++;
  }

  const today = new Date().toISOString().slice(0, 10);
  recomputeDailyMetrics(projectId, today);

  return { collected, skipped, failed, items: results };
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
    totalSuccess += result.collected;
    allErrors.push(
      ...result.items
        .filter(i => i.status !== 'ok' && i.status !== 'removed')
        .map(i => `${i.itemId}: ${i.reason ?? i.status}`)
    );
  }

  return {
    projectsProcessed: projects.length,
    totalSuccess,
    errors: allErrors,
  };
}
