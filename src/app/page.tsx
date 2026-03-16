'use client';

import { useEffect, useState, useCallback } from 'react';
import { ALTERNATIVE_API_SOURCES } from '@/lib/constants';

interface Project { id: number; name: string; created_at: string }
interface DailyMetric { date: string; units_sold_est_total: number; items_sold_count: number; revenue_est_total: number; avg_ticket_est: number }
interface DailyItemMetric { item_id: string; date: string; units_sold_est: number; revenue_est: number; avg_price: number; reliability: string; title: string; thumbnail: string; url: string }
interface DayDetail { daily: DailyMetric | null; items: DailyItemMetric[] }
interface TrackedItem { id: string; project_id: number; url: string; title: string | null; thumbnail: string | null; status: string; unresolved: number; unresolved_message: string | null; blocked: number; last_error_code: number | null; last_error_message: string | null; source_used: string | null }

function formatBRL(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function calendarColor(units: number): string {
  if (units === 0) return 'bg-gray-100 text-gray-400';
  if (units < 10) return 'bg-blue-100 text-blue-700';
  if (units < 50) return 'bg-blue-400 text-white';
  return 'bg-blue-700 text-white';
}

function getDaysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

function getFirstDayOfWeek(year: number, month: number): number {
  return new Date(year, month, 1).getDay();
}

export default function HomePage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [newProjectName, setNewProjectName] = useState('');
  const [showNewProject, setShowNewProject] = useState(false);

  const today = new Date();
  const [viewYear, setViewYear] = useState(today.getFullYear());
  const [viewMonth, setViewMonth] = useState(today.getMonth());
  const [selectedDate, setSelectedDate] = useState<string | null>(today.toISOString().slice(0, 10));
  const [rangeFrom, setRangeFrom] = useState(() => {
    const d = new Date(); d.setDate(1); return d.toISOString().slice(0, 10);
  });
  const [rangeTo, setRangeTo] = useState(() => today.toISOString().slice(0, 10));

  const [monthlyMetrics, setMonthlyMetrics] = useState<Record<string, DailyMetric>>({});
  const [dayDetail, setDayDetail] = useState<DayDetail | null>(null);
  const [trackedItems, setTrackedItems] = useState<TrackedItem[]>([]);

  const [collecting, setCollecting] = useState(false);
  const [collectMsg, setCollectMsg] = useState('');
  const [newItemUrl, setNewItemUrl] = useState('');
  const [addingItem, setAddingItem] = useState(false);
  const [addItemMsg, setAddItemMsg] = useState('');
  const [showAddItem, setShowAddItem] = useState(false);
  const [showItems, setShowItems] = useState(false);
  const [configOpen, setConfigOpen] = useState(false);
  const [configData, setConfigData] = useState({ access_token: '', client_id: '', client_secret: '', collect_interval: '60' });
  const [configMsg, setConfigMsg] = useState('');

  useEffect(() => {
    fetch('/api/projects').then(r => r.json()).then((ps: Project[]) => {
      setProjects(ps);
      if (ps.length > 0) setSelectedProject(ps[0]);
    });
  }, []);

  const loadMonthly = useCallback(async () => {
    if (!selectedProject) return;
    const from = `${viewYear}-${String(viewMonth + 1).padStart(2, '0')}-01`;
    const lastDay = getDaysInMonth(viewYear, viewMonth);
    const to = `${viewYear}-${String(viewMonth + 1).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
    const r = await fetch(`/api/projects/${selectedProject.id}/metrics?from=${from}&to=${to}`);
    const data: DailyMetric[] = await r.json();
    const map: Record<string, DailyMetric> = {};
    for (const m of data) map[m.date] = m;
    setMonthlyMetrics(map);
  }, [selectedProject, viewYear, viewMonth]);

  useEffect(() => { loadMonthly(); }, [loadMonthly]);

  const loadDay = useCallback(async (date: string) => {
    if (!selectedProject) return;
    const r = await fetch(`/api/projects/${selectedProject.id}/metrics/${date}`);
    const data: DayDetail = await r.json();
    setDayDetail(data);
  }, [selectedProject]);

  useEffect(() => {
    if (selectedDate) loadDay(selectedDate);
  }, [selectedDate, loadDay]);

  const loadItems = useCallback(async () => {
    if (!selectedProject) return;
    const r = await fetch(`/api/projects/${selectedProject.id}/items`);
    const data: TrackedItem[] = await r.json();
    setTrackedItems(data);
  }, [selectedProject]);

  useEffect(() => { if (showItems) loadItems(); }, [showItems, loadItems]);

  const createProject = async () => {
    if (!newProjectName.trim()) return;
    const r = await fetch('/api/projects', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: newProjectName }) });
    const p: Project = await r.json();
    setProjects(prev => [p, ...prev]);
    setSelectedProject(p);
    setNewProjectName('');
    setShowNewProject(false);
  };

  const collect = async () => {
    if (!selectedProject) return;
    setCollecting(true);
    setCollectMsg('');
    try {
      const r = await fetch(`/api/projects/${selectedProject.id}/collect`, { method: 'POST' });
      const data = await r.json();
      const items: Array<{ status: string; sourceUsed: string }> = data.items ?? [];
      const blocked = items.filter(i => i.status === 'blocked').length;
      const altRoutes = items.filter(i => i.status === 'ok' && (ALTERNATIVE_API_SOURCES as readonly string[]).includes(i.sourceUsed)).length;
      const failedMsg = data.failed > 0 ? ` | ❌ ${data.failed} falhou(aram)` : '';
      const blockedMsg = blocked > 0 ? ` | 🚫 ${blocked} bloqueado(s)` : '';
      const altMsg = altRoutes > 0 ? ` | 🔀 ${altRoutes} via rota alternativa` : '';
      setCollectMsg(`✅ ${data.collected} item(s) coletado(s)${altMsg}${blockedMsg}${failedMsg}`);
      await loadMonthly();
      if (selectedDate) await loadDay(selectedDate);
    } catch {
      setCollectMsg('❌ Erro ao coletar.');
    } finally {
      setCollecting(false);
    }
  };

  const addItem = async () => {
    if (!selectedProject || !newItemUrl.trim()) return;
    setAddingItem(true);
    setAddItemMsg('');
    try {
      const r = await fetch(`/api/projects/${selectedProject.id}/items`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: newItemUrl.trim() }),
      });
      const data = await r.json();
      if (!r.ok) { setAddItemMsg(`❌ ${data.error}`); return; }
      const added = data.items?.length ?? 0;
      setAddItemMsg(`✅ ${added} anúncio(s) adicionado(s)!${data.warnings?.length ? ` ⚠️ ${data.warnings[0]}` : ''}`);
      setNewItemUrl('');
      await loadItems();
    } catch {
      setAddItemMsg('❌ Erro ao adicionar.');
    } finally {
      setAddingItem(false);
    }
  };

  const deleteItem = async (itemId: string) => {
    if (!selectedProject) return;
    if (!confirm(`Remover ${itemId}?`)) return;
    await fetch(`/api/projects/${selectedProject.id}/items/${itemId}`, { method: 'DELETE' });
    await loadItems();
  };

  const exportCsv = async (mode: 'daily' | 'item') => {
    if (!selectedProject) return;
    window.location.href = `/api/projects/${selectedProject.id}/export?from=${rangeFrom}&to=${rangeTo}&mode=${mode}`;
  };

  const saveConfig = async () => {
    const r = await fetch('/api/config', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(configData) });
    const data = await r.json();
    setConfigMsg(data.message || '✅ Salvo!');
  };

  const daysInMonth = getDaysInMonth(viewYear, viewMonth);
  const firstDow = getFirstDayOfWeek(viewYear, viewMonth);
  const weekDays = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
  const monthNames = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];

  const prevMonth = () => { if (viewMonth === 0) { setViewMonth(11); setViewYear(y => y - 1); } else { setViewMonth(m => m - 1); } };
  const nextMonth = () => { if (viewMonth === 11) { setViewMonth(0); setViewYear(y => y + 1); } else { setViewMonth(m => m + 1); } };

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-yellow-400 shadow-sm">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-2xl font-bold text-gray-900">RT</span>
            <span className="text-sm text-gray-700">Rastreador de Vendas · Mercado Livre</span>
          </div>
          <button onClick={() => setConfigOpen(true)} className="text-sm bg-white border border-gray-300 px-3 py-1 rounded-lg hover:bg-gray-50">
            ⚙️ Configurações
          </button>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-6 space-y-6">
        <div className="bg-white rounded-xl shadow-sm p-4 flex flex-wrap gap-3 items-center">
          <span className="font-semibold text-gray-700">Projeto:</span>
          <select
            className="border rounded-lg px-3 py-1.5 text-sm"
            value={selectedProject?.id ?? ''}
            onChange={e => {
              const p = projects.find(x => x.id === parseInt(e.target.value));
              if (p) setSelectedProject(p);
            }}
          >
            {projects.length === 0 && <option value="">Nenhum projeto</option>}
            {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <button onClick={() => setShowNewProject(!showNewProject)} className="text-sm bg-yellow-400 hover:bg-yellow-500 px-3 py-1.5 rounded-lg font-medium">
            + Novo Projeto
          </button>
          {selectedProject && (
            <button onClick={() => { setShowItems(!showItems); loadItems(); }} className="text-sm bg-gray-100 hover:bg-gray-200 px-3 py-1.5 rounded-lg">
              📋 Anúncios ({trackedItems.length})
            </button>
          )}
        </div>

        {showNewProject && (
          <div className="bg-white rounded-xl shadow-sm p-4 flex gap-2">
            <input
              className="border rounded-lg px-3 py-1.5 text-sm flex-1"
              placeholder="Nome do projeto (ex: Concorrente A)"
              value={newProjectName}
              onChange={e => setNewProjectName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && createProject()}
            />
            <button onClick={createProject} className="bg-yellow-400 hover:bg-yellow-500 px-4 py-1.5 rounded-lg text-sm font-medium">Criar</button>
            <button onClick={() => setShowNewProject(false)} className="text-gray-400 hover:text-gray-600 px-2">✕</button>
          </div>
        )}

        {showItems && selectedProject && (
          <div className="bg-white rounded-xl shadow-sm p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold">Anúncios Monitorados</h3>
              <button onClick={() => setShowAddItem(!showAddItem)} className="text-sm bg-yellow-400 hover:bg-yellow-500 px-3 py-1.5 rounded-lg">+ Adicionar Link</button>
            </div>
            {showAddItem && (
              <div className="space-y-2">
                <input
                  className="border rounded-lg px-3 py-1.5 text-sm w-full"
                  placeholder="Cole aqui o link do anúncio ou página do produto do Mercado Livre"
                  value={newItemUrl}
                  onChange={e => setNewItemUrl(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && addItem()}
                />
                <div className="flex gap-2">
                  <button onClick={addItem} disabled={addingItem} className="bg-yellow-400 hover:bg-yellow-500 disabled:opacity-50 px-4 py-1.5 rounded-lg text-sm font-medium">
                    {addingItem ? 'Adicionando...' : 'Adicionar'}
                  </button>
                </div>
                {addItemMsg && <p className="text-sm text-gray-600">{addItemMsg}</p>}
                <p className="text-xs text-gray-400">
                  Formatos aceitos:<br/>
                  • https://produto.mercadolivre.com.br/MLB-XXXXXXXX-...<br/>
                  • https://www.mercadolivre.com.br/.../p/MLBxxxxxxx
                </p>
              </div>
            )}
            {trackedItems.length === 0 ? (
              <p className="text-sm text-gray-400">Nenhum anúncio adicionado ainda.</p>
            ) : (
              <div className="divide-y">
                {trackedItems.map(item => (
                  <div key={item.id} className="py-2 flex items-center gap-3">
                    {item.thumbnail && <img src={item.thumbnail} alt={item.title || item.id} className="w-10 h-10 object-contain rounded" />}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{item.title || item.id}</p>
                      <p className="text-xs text-gray-400">{item.id} · {item.status}</p>
                      {item.unresolved === 1 && <p className="text-xs text-orange-500">⚠️ Não resolvido: {item.unresolved_message}</p>}
                      {item.blocked === 1 && item.source_used === 'fallback' && (
                        <p className="text-xs text-orange-500">
                          ⚠️ Bloqueado pela API – todas as rotas API falharam; dados parciais via scraping (último recurso).
                        </p>
                      )}
                      {item.blocked === 1 && item.source_used !== 'fallback' && (
                        <p className="text-xs text-red-500">
                          🚫 Bloqueado – sem dados disponíveis (403 em todas as rotas API e scraping).
                          {item.last_error_message ? ` ${item.last_error_message}` : ''}
                        </p>
                      )}
                      {item.blocked === 0 && item.source_used && item.source_used !== 'api' && (
                        <p className="text-xs text-blue-500">
                          🔀 Dados obtidos via rota alternativa ({item.source_used})
                        </p>
                      )}
                    </div>
                    <button onClick={() => deleteItem(item.id)} className="text-red-400 hover:text-red-600 text-sm px-2">🗑</button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {selectedProject ? (
          <>
            <div className="bg-white rounded-xl shadow-sm p-4 flex flex-wrap gap-3 items-center">
              <div className="flex items-center gap-2 text-sm">
                <label className="text-gray-600">De:</label>
                <input type="date" value={rangeFrom} onChange={e => setRangeFrom(e.target.value)} className="border rounded px-2 py-1 text-sm" />
                <label className="text-gray-600">Até:</label>
                <input type="date" value={rangeTo} onChange={e => setRangeTo(e.target.value)} className="border rounded px-2 py-1 text-sm" />
              </div>
              <button onClick={collect} disabled={collecting} className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white px-4 py-1.5 rounded-lg text-sm font-medium">
                {collecting ? '⏳ Coletando...' : '🔄 Coletar Agora'}
              </button>
              <div className="flex gap-1">
                <button onClick={() => exportCsv('daily')} className="bg-green-600 hover:bg-green-700 text-white px-3 py-1.5 rounded-lg text-sm font-medium">
                  📥 CSV por Dia
                </button>
                <button onClick={() => exportCsv('item')} className="bg-green-600 hover:bg-green-700 text-white px-3 py-1.5 rounded-lg text-sm font-medium">
                  📥 CSV por Anúncio
                </button>
              </div>
              {collectMsg && <span className="text-sm text-gray-600">{collectMsg}</span>}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="lg:col-span-2 bg-white rounded-xl shadow-sm p-4">
                <div className="flex items-center justify-between mb-4">
                  <button onClick={prevMonth} className="p-1 hover:bg-gray-100 rounded">◀</button>
                  <h2 className="font-semibold text-lg">{monthNames[viewMonth]} {viewYear}</h2>
                  <button onClick={nextMonth} className="p-1 hover:bg-gray-100 rounded">▶</button>
                </div>
                <div className="flex gap-3 text-xs mb-3 flex-wrap">
                  <span className="flex items-center gap-1"><span className="w-3 h-3 bg-gray-100 rounded inline-block border" />0 vendas</span>
                  <span className="flex items-center gap-1"><span className="w-3 h-3 bg-blue-100 rounded inline-block" />&lt;10</span>
                  <span className="flex items-center gap-1"><span className="w-3 h-3 bg-blue-400 rounded inline-block" />10–50</span>
                  <span className="flex items-center gap-1"><span className="w-3 h-3 bg-blue-700 rounded inline-block" />&gt;50</span>
                </div>
                <div className="grid grid-cols-7 gap-1">
                  {weekDays.map(d => <div key={d} className="text-center text-xs font-semibold text-gray-500 py-1">{d}</div>)}
                  {Array.from({ length: firstDow }).map((_, i) => <div key={`e${i}`} />)}
                  {Array.from({ length: daysInMonth }).map((_, i) => {
                    const day = i + 1;
                    const dateStr = `${viewYear}-${String(viewMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                    const m = monthlyMetrics[dateStr];
                    const units = m?.units_sold_est_total ?? 0;
                    const isSelected = dateStr === selectedDate;
                    const isToday = dateStr === today.toISOString().slice(0, 10);
                    return (
                      <button
                        key={day}
                        onClick={() => setSelectedDate(dateStr)}
                        className={`
                          rounded-lg p-1 text-center cursor-pointer transition-all
                          ${calendarColor(units)}
                          ${isSelected ? 'ring-2 ring-yellow-400 ring-offset-1' : ''}
                          ${isToday ? 'font-bold' : ''}
                          hover:opacity-80
                        `}
                      >
                        <div className="text-sm">{day}</div>
                        {units > 0 && <div className="text-xs leading-tight">{Math.round(units)}</div>}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="space-y-4">
                <h3 className="font-semibold text-gray-700">
                  {selectedDate ? `📅 ${new Date(selectedDate + 'T12:00:00Z').toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })}` : 'Selecione um dia'}
                </h3>
                {dayDetail?.daily ? (
                  <div className="grid grid-cols-2 gap-3">
                    <div className="bg-white rounded-xl shadow-sm p-3 text-center">
                      <div className="text-2xl font-bold text-blue-700">{Math.round(dayDetail.daily.units_sold_est_total)}</div>
                      <div className="text-xs text-gray-500 mt-1">Unidades Vendidas</div>
                      <div className="text-xs text-gray-400">(estimado)</div>
                    </div>
                    <div className="bg-white rounded-xl shadow-sm p-3 text-center">
                      <div className="text-2xl font-bold text-blue-700">{dayDetail.daily.items_sold_count}</div>
                      <div className="text-xs text-gray-500 mt-1">Publicações</div>
                      <div className="text-xs text-gray-400">que venderam</div>
                    </div>
                    <div className="bg-white rounded-xl shadow-sm p-3 text-center">
                      <div className="text-lg font-bold text-green-700">{formatBRL(dayDetail.daily.revenue_est_total)}</div>
                      <div className="text-xs text-gray-500 mt-1">Faturamento</div>
                      <div className="text-xs text-gray-400">(estimado)</div>
                    </div>
                    <div className="bg-white rounded-xl shadow-sm p-3 text-center">
                      <div className="text-lg font-bold text-green-700">{formatBRL(dayDetail.daily.avg_ticket_est)}</div>
                      <div className="text-xs text-gray-500 mt-1">Ticket Médio</div>
                      <div className="text-xs text-gray-400">(estimado)</div>
                    </div>
                  </div>
                ) : (
                  <div className="bg-white rounded-xl shadow-sm p-6 text-center text-gray-400 text-sm">
                    {selectedDate ? 'Sem dados para este dia. Clique em "Coletar Agora" para buscar dados.' : 'Clique em um dia no calendário.'}
                  </div>
                )}
              </div>
            </div>

            {dayDetail && dayDetail.items.length > 0 && (
              <div className="bg-white rounded-xl shadow-sm p-4">
                <h3 className="font-semibold mb-3">Anúncios · {selectedDate}</h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-gray-500 border-b">
                        <th className="pb-2 pr-4">Anúncio</th>
                        <th className="pb-2 pr-4 text-right">Unidades (Est.)</th>
                        <th className="pb-2 pr-4 text-right">Preço Médio</th>
                        <th className="pb-2 pr-4 text-right">Faturamento (Est.)</th>
                        <th className="pb-2 text-center">Confiabilidade</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {dayDetail.items.map(item => (
                        <tr key={item.item_id} className="hover:bg-gray-50">
                          <td className="py-2 pr-4">
                            <div className="flex items-center gap-2">
                              {item.thumbnail && <img src={item.thumbnail} alt={item.title || item.item_id} className="w-10 h-10 object-contain rounded border" />}
                              <div>
                                <a href={item.url} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline font-medium line-clamp-2 max-w-xs">
                                  {item.title || item.item_id}
                                </a>
                                <p className="text-xs text-gray-400">{item.item_id}</p>
                              </div>
                            </div>
                          </td>
                          <td className="py-2 pr-4 text-right font-semibold">{Math.round(item.units_sold_est)}</td>
                          <td className="py-2 pr-4 text-right">{formatBRL(item.avg_price)}</td>
                          <td className="py-2 pr-4 text-right font-semibold text-green-700">{formatBRL(item.revenue_est)}</td>
                          <td className="py-2 text-center">
                            <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${
                              item.reliability === 'Alta' ? 'bg-green-100 text-green-700' :
                              item.reliability === 'Média' ? 'bg-yellow-100 text-yellow-700' :
                              'bg-red-100 text-red-700'
                            }`}>
                              {item.reliability}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </>
        ) : (
          <div className="bg-white rounded-xl shadow-sm p-12 text-center">
            <p className="text-2xl mb-3">📊</p>
            <p className="text-gray-600 mb-2">Crie um projeto para começar a monitorar anúncios do Mercado Livre.</p>
            <button onClick={() => setShowNewProject(true)} className="bg-yellow-400 hover:bg-yellow-500 px-4 py-2 rounded-lg font-medium mt-2">
              + Criar Projeto
            </button>
          </div>
        )}

        <div className="text-center text-xs text-gray-400 pb-4">
          ⚠️ Todos os dados de vendas são <strong>estimativas</strong> baseadas em variações públicas de estoque e quantidade vendida. Não representam dados reais do vendedor.
        </div>
      </main>

      {configOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-md space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold">⚙️ Configurações</h2>
              <button onClick={() => setConfigOpen(false)} className="text-gray-400 hover:text-gray-600">✕</button>
            </div>
            <div className="space-y-3 text-sm">
              <div>
                <label className="block text-gray-600 mb-1">Access Token (MELI)</label>
                <input
                  type="password"
                  className="border rounded-lg w-full px-3 py-2"
                  placeholder="APP_USR-..."
                  value={configData.access_token}
                  onChange={e => setConfigData(d => ({ ...d, access_token: e.target.value }))}
                />
              </div>
              <div>
                <label className="block text-gray-600 mb-1">Client ID</label>
                <input
                  type="text"
                  className="border rounded-lg w-full px-3 py-2"
                  value={configData.client_id}
                  onChange={e => setConfigData(d => ({ ...d, client_id: e.target.value }))}
                />
              </div>
              <div>
                <label className="block text-gray-600 mb-1">Client Secret</label>
                <input
                  type="password"
                  className="border rounded-lg w-full px-3 py-2"
                  value={configData.client_secret}
                  onChange={e => setConfigData(d => ({ ...d, client_secret: e.target.value }))}
                />
              </div>
              <div>
                <label className="block text-gray-600 mb-1">Coletar a cada (minutos)</label>
                <input
                  type="number"
                  className="border rounded-lg w-full px-3 py-2"
                  value={configData.collect_interval}
                  onChange={e => setConfigData(d => ({ ...d, collect_interval: e.target.value }))}
                  min="15"
                />
              </div>
              <p className="text-xs text-gray-400">As configurações são salvas em <code>.env.local</code> na pasta do projeto. Reinicie o servidor após salvar.</p>
            </div>
            <div className="flex gap-2">
              <button onClick={saveConfig} className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700">Salvar</button>
              <button onClick={() => setConfigOpen(false)} className="border px-4 py-2 rounded-lg text-sm hover:bg-gray-50">Fechar</button>
            </div>
            {configMsg && <p className="text-sm text-blue-600">{configMsg}</p>}
          </div>
        </div>
      )}
    </div>
  );
}
