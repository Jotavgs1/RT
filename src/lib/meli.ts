import axios from 'axios';

const MELI_API = 'https://api.mercadolibre.com';

function getToken(): string {
  return process.env.MELI_ACCESS_TOKEN || '';
}

function authHeaders() {
  const token = getToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export interface MeliItem {
  id: string;
  title: string;
  price: number;
  currency_id: string;
  available_quantity: number;
  sold_quantity: number | string;
  thumbnail: string;
  status: string;
  permalink: string;
}

export interface MeliProduct {
  id: string;
  name: string;
  children_ids?: string[];
  buy_box_winner?: { item_id: string };
}

export function extractItemId(url: string): string | null {
  const m1 = url.match(/MLB[-_]?(\d+)/i);
  if (m1) return `MLB${m1[1]}`;
  return null;
}

export function extractProductId(url: string): string | null {
  const m = url.match(/\/p\/(MLB\w+)/i);
  if (m) return m[1];
  return null;
}

export function isProductPageUrl(url: string): boolean {
  return /\/p\/MLB/i.test(url);
}

export async function fetchItem(itemId: string): Promise<MeliItem | null> {
  try {
    const resp = await axios.get(`${MELI_API}/items/${itemId}`, {
      headers: authHeaders(),
      timeout: 10000,
    });
    return resp.data;
  } catch (err) {
    console.error(`Error fetching item ${itemId}:`, err);
    return null;
  }
}

export async function resolveProductToItems(productId: string): Promise<{
  itemIds: string[];
  error?: string;
}> {
  try {
    const resp = await axios.get(`${MELI_API}/products/${productId}`, {
      headers: authHeaders(),
      timeout: 10000,
    });
    const product: MeliProduct = resp.data;
    const items: string[] = [];

    if (product.buy_box_winner?.item_id) {
      items.push(product.buy_box_winner.item_id);
    }
    if (product.children_ids && product.children_ids.length > 0) {
      items.push(...product.children_ids.slice(0, 10));
    }

    if (items.length === 0) {
      return {
        itemIds: [],
        error:
          'Não foi possível resolver o produto para anúncios monitoráveis via API pública. ' +
          'Tente adicionar o link de um anúncio específico (produto.mercadolivre.com.br/MLB-...).',
      };
    }
    return { itemIds: [...new Set(items)] };
  } catch (err: unknown) {
    const msg =
      err && typeof err === 'object' && 'message' in err
        ? String((err as { message: unknown }).message)
        : String(err);
    return {
      itemIds: [],
      error: `Erro ao resolver produto: ${msg}. Tente adicionar o link direto do anúncio.`,
    };
  }
}

export function parseSoldQty(raw: unknown): {
  value: number;
  rawStr: string;
  isBand: boolean;
} {
  if (typeof raw === 'number') {
    return { value: raw, rawStr: String(raw), isBand: false };
  }
  if (typeof raw === 'string') {
    const m = raw.match(/\+?(\d+)/);
    if (m) {
      return { value: parseInt(m[1], 10), rawStr: raw, isBand: true };
    }
  }
  return { value: 0, rawStr: String(raw ?? ''), isBand: true };
}
