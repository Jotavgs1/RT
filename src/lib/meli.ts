import axios from 'axios';

const MELI_API = 'https://api.mercadolibre.com';
const REQUEST_TIMEOUT_MS = 10000;

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

export type ItemFetchResult =
  | { ok: true; data: MeliItem }
  | { ok: false; errorCode: number | null; errorMessage: string };

export function classifyAxiosError(err: unknown): { code: number | null; message: string } {
  if (err && typeof err === 'object' && 'isAxiosError' in err) {
    const axiosErr = err as { response?: { status: number }; code?: string; message?: string };
    if (axiosErr.response) {
      return { code: axiosErr.response.status, message: `HTTP ${axiosErr.response.status}` };
    }
    if (axiosErr.code === 'ECONNABORTED' || axiosErr.code === 'ETIMEDOUT') {
      return { code: null, message: 'Timeout' };
    }
    return { code: null, message: axiosErr.message ?? 'Network error' };
  }
  const msg = err instanceof Error ? err.message : String(err);
  return { code: null, message: msg };
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

export async function fetchItem(itemId: string): Promise<ItemFetchResult> {
  try {
    const resp = await axios.get(`${MELI_API}/items/${itemId}`, {
      headers: authHeaders(),
      timeout: REQUEST_TIMEOUT_MS,
    });
    return { ok: true, data: resp.data };
  } catch (err: unknown) {
    const { code, message } = classifyAxiosError(err);
    console.error(`Error fetching item ${itemId}: HTTP ${code ?? 'unknown'} – ${message}`);
    return { ok: false, errorCode: code, errorMessage: message };
  }
}

/**
 * Fallback: tenta obter dados do anúncio via scraping da página pública do ML.
 * Retorna dados parciais (title, price) quando possível, ou null em caso de falha.
 */
export async function fetchItemFallback(
  itemId: string,
  permalink?: string | null
): Promise<Partial<MeliItem> | null> {
  const digits = itemId.replace(/^MLB/i, '');
  const url = permalink || `https://produto.mercadolivre.com.br/MLB-${digits}`;
  try {
    const resp = await axios.get<string>(url, {
      timeout: REQUEST_TIMEOUT_MS,
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
          '(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'pt-BR,pt;q=0.9,en;q=0.8',
      },
      maxRedirects: 5,
    });
    const html: string = resp.data;

    // 1) Tenta JSON-LD estruturado (mais confiável)
    const jsonLdRe =
      /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
    let match: RegExpExecArray | null;
    while ((match = jsonLdRe.exec(html)) !== null) {
      try {
        const ld: unknown = JSON.parse(match[1]);
        const node = Array.isArray(ld)
          ? (ld as Record<string, unknown>[]).find(n => n['@type'] === 'Product')
          : (ld as Record<string, unknown>);
        if (node && (node['name'] || node['offers'])) {
          const offersRaw = node['offers'];
          const offer =
            offersRaw && !Array.isArray(offersRaw)
              ? (offersRaw as Record<string, unknown>)
              : Array.isArray(offersRaw)
              ? (offersRaw as Record<string, unknown>[])[0]
              : undefined;
          return {
            id: itemId,
            title: node['name'] != null ? String(node['name']) : undefined,
            price:
              offer?.['price'] != null ? parseFloat(String(offer['price'])) : undefined,
            permalink: url,
          };
        }
      } catch {
        // ignora JSON-LD malformado
      }
    }

    // 2) Tenta título via <h1> e preço via meta itemprop
    const h1Match =
      html.match(/<h1[^>]*class="[^"]*ui-pdp-title[^"]*"[^>]*>([\s\S]*?)<\/h1>/i) ||
      html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
    const title = h1Match ? h1Match[1].replace(/<[^>]+>/g, '').trim() : undefined;
    const metaPriceMatch = html.match(
      /<meta[^>]+itemprop=["']price["'][^>]+content=["']([^"']+)["']/i
    );
    const price = metaPriceMatch ? parseFloat(metaPriceMatch[1]) : undefined;

    if (title || price) {
      return { id: itemId, title, price, permalink: url };
    }

    return null;
  } catch {
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
      timeout: REQUEST_TIMEOUT_MS,
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
