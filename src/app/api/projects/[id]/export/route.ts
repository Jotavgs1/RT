import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const { searchParams } = new URL(req.url);
  const from = searchParams.get('from') || '';
  const to = searchParams.get('to') || '';
  const mode = searchParams.get('mode') || 'daily';
  const projectId = parseInt(params.id, 10);

  const db = getDb();
  let csv = '';

  if (mode === 'item') {
    const rows = db
      .prepare(`
        SELECT dim.date, ti.id as item_id, ti.title, dim.units_sold_est, dim.avg_price, dim.revenue_est, dim.reliability
        FROM daily_item_metrics dim
        JOIN tracked_items ti ON dim.item_id = ti.id
        WHERE ti.project_id = ? AND dim.date >= ? AND dim.date <= ?
        ORDER BY dim.date ASC, dim.units_sold_est DESC
      `)
      .all(projectId, from, to) as Record<string, unknown>[];

    csv = 'Data,Item ID,Título,Unidades Vendidas (Est.),Preço Médio (R$),Faturamento (R$),Confiabilidade\n';
    for (const r of rows) {
      csv += `${r.date},${r.item_id},"${String(r.title ?? '').replace(/"/g, '""')}",${r.units_sold_est},${Number(r.avg_price).toFixed(2)},${Number(r.revenue_est).toFixed(2)},${r.reliability}\n`;
    }
  } else {
    const rows = db
      .prepare(`
        SELECT * FROM daily_metrics WHERE project_id = ? AND date >= ? AND date <= ? ORDER BY date ASC
      `)
      .all(projectId, from, to) as Record<string, unknown>[];

    csv = 'Data,Unidades Vendidas (Est.),Publicações,Faturamento (R$),Ticket Médio (R$)\n';
    for (const r of rows) {
      csv += `${r.date},${r.units_sold_est_total},${r.items_sold_count},${Number(r.revenue_est_total).toFixed(2)},${Number(r.avg_ticket_est).toFixed(2)}\n`;
    }
  }

  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="rt-export-${from}-${to}.csv"`,
    },
  });
}
