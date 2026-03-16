import { NextRequest, NextResponse } from 'next/server';
import { getDb, TrackedItem } from '@/lib/db';
import {
  extractItemId,
  extractProductId,
  isProductPageUrl,
  resolveProductToItems,
  fetchItem,
} from '@/lib/meli';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const db = getDb();
  const { id } = await params;
  const items = db
    .prepare('SELECT * FROM tracked_items WHERE project_id = ? ORDER BY created_at DESC')
    .all(parseInt(id, 10)) as TrackedItem[];
  return NextResponse.json(items);
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const body = await req.json();
  const { url } = body as { url: string };
  const { id } = await params;
  const projectId = parseInt(id, 10);

  if (!url || typeof url !== 'string') {
    return NextResponse.json({ error: 'URL inválida' }, { status: 400 });
  }

  const db = getDb();
  const addedItems: TrackedItem[] = [];
  const warnings: string[] = [];

  if (isProductPageUrl(url)) {
    const productId = extractProductId(url);
    if (!productId) {
      return NextResponse.json({ error: 'Não foi possível extrair o ID do produto.' }, { status: 400 });
    }

    const { itemIds, error } = await resolveProductToItems(productId);

    if (itemIds.length === 0) {
      const unresolved = saveUnresolvedItem(db, productId, url, projectId, error || '');
      addedItems.push(unresolved);
      warnings.push(error || 'Produto não resolvido.');
    } else {
      for (const itemId of itemIds) {
        const item = await upsertTrackedItem(db, itemId, url, projectId);
        if (item) addedItems.push(item);
      }
    }
  } else {
    const itemId = extractItemId(url);
    if (!itemId) {
      return NextResponse.json({
        error: 'URL não reconhecida. Use um link do tipo: https://produto.mercadolivre.com.br/MLB-... ou https://www.mercadolivre.com.br/.../p/MLB...',
      }, { status: 400 });
    }
    const item = await upsertTrackedItem(db, itemId, url, projectId);
    if (item) addedItems.push(item);
  }

  return NextResponse.json({ items: addedItems, warnings }, { status: 201 });
}

async function upsertTrackedItem(
  db: ReturnType<typeof getDb>,
  itemId: string,
  url: string,
  projectId: number
): Promise<TrackedItem | null> {
  const existing = db.prepare('SELECT * FROM tracked_items WHERE id = ?').get(itemId) as TrackedItem | undefined;
  if (existing) return existing;

  const meliItem = await fetchItem(itemId);

  db.prepare(`
    INSERT OR IGNORE INTO tracked_items (id, project_id, url, title, thumbnail, status, unresolved, created_at)
    VALUES (?, ?, ?, ?, ?, ?, 0, datetime('now'))
  `).run(
    itemId,
    projectId,
    url,
    meliItem?.title ?? null,
    meliItem?.thumbnail ?? null,
    meliItem?.status ?? 'active'
  );

  return db.prepare('SELECT * FROM tracked_items WHERE id = ?').get(itemId) as TrackedItem;
}

function saveUnresolvedItem(
  db: ReturnType<typeof getDb>,
  productId: string,
  url: string,
  projectId: number,
  message: string
): TrackedItem {
  db.prepare(`
    INSERT OR IGNORE INTO tracked_items (id, project_id, url, title, status, unresolved, unresolved_message, created_at)
    VALUES (?, ?, ?, ?, 'active', 1, ?, datetime('now'))
  `).run(productId, projectId, url, `Produto ${productId} (não resolvido)`, message);

  return db.prepare('SELECT * FROM tracked_items WHERE id = ?').get(productId) as TrackedItem;
}
