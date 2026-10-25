import { Fish, Info, MapPin, Route, Sunrise, Sunset, Trophy, Waves, Droplets, Gauge } from 'lucide-react'
import { useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router'
import { CatchRow, SpeciesDot } from '../components/bits'
import { HourlyChart } from '../components/charts'
import { ConditionsGrid, EventCard, FavButton } from '../components/cards'
import { DamArt } from '../components/DamArt'
import { ButtonLink, Card, cx, EmptyState, PageHeader, Tag } from '../components/ui'
import { DEMO_USER_ID } from '../data/anglers'
import { modalityName, regionName, speciesById } from '../data/catalog'
import { damById } from '../data/dams'
import { EVENTS } from '../data/events'
import { addDaysISO } from '../lib/dates'
import { capFirst, formatDate, formatKg, relativeDay } from '../lib/format'
import { simulateConditions } from '../lib/weather'
import { useApp } from '../state/AppState'
import NotFound from './NotFound'

const TABS = [
  { id: 'geral', label: 'Visão geral' },
  { id: 'condicoes', label: 'Condições' },
  { id: 'capturas', label: 'Capturas' },
  { id: 'provas', label: 'Provas' },
] as const
type TabId = (typeof TABS)[number]['id']

export default function DamDetail() {
  const { id = '' } = useParams()
  const dam = damById[id]
  const [params, setParams] = useSearchParams()
  const tab = (TABS.find((t) => t.id === params.get('tab'))?.id ?? 'geral') as TabId
  const { state, allCatches } = useApp()
  const navigate = useNavigate()
  const [dayIdx, setDayIdx] = useState(0)
  if (!dam) return <NotFound />

  const days = Array.from({ length: 5 }, (_, i) => addDaysISO(state.anchor, i))
  const cond = simulateConditions(dam, days[dayIdx])
  const today = simulateConditions(dam, state.anchor)
  const catches = allCatches
    .filter((c) => c.damId === dam.id && (c.visibility === 'publica' || c.anglerId === DEMO_USER_ID))
    .sort((a, b) => b.weightG - a.weightG)
  const events = EVENTS.filter((e) => e.damId === dam.id).sort((a, b) => a.dayOffset - b.dayOffset)
  const bestBySpecies = dam.species
    .map((s) => ({ s, best: catches.filter((c) => c.speciesId === s)[0] }))
    .filter((x) => x.best)

  const setTab = (t: TabId) => {
    const next = new URLSearchParams(params)
    if (t === 'geral') next.delete('tab')
    else next.set('tab', t)
    setParams(next, { replace: true, preventScrollReset: true })
  }

  return (
    <div className="relative">
      <PageHeader back="/explorar" transparent actions={<FavButton dam={dam} />} />
      <div className="relative h-[52dvh] max-h-[520px] min-h-[340px] overflow-hidden bg-ink lg:mx-8 lg:mt-6 lg:h-[440px] lg:min-h-0 lg:rounded-[28px]">
        <DamArt art={dam.art} />
        <div className="absolute inset-0 bg-gradient-to-t from-ink via-ink/25 to-ink/30" />
        <div className="absolute inset-x-0 bottom-0 mx-auto max-w-6xl px-4 pb-6 text-white lg:px-8">
          <div className="flex flex-wrap gap-1.5">
            <Tag tone="glass">Imagem ilustrativa</Tag>
            <Tag tone="glass">Dados de demonstração</Tag>
          </div>
          <h1 className="font-display mt-3 text-[46px] font-semibold leading-none sm:text-[60px]">{dam.name}</h1>
          <p className="mt-2 flex items-center gap-1.5 text-[14px] font-semibold text-white/80">
            <MapPin className="h-4 w-4" aria-hidden />
            {dam.place} · {regionName(dam.region)}
          </p>
          <div className="tnum mt-4 flex flex-wrap gap-x-5 gap-y-1 text-[13.5px] font-semibold text-white/90">
            <span className="flex items-center gap-1.5"><Waves className="h-4 w-4 text-teal" aria-hidden />{dam.river}</span>
            <span className="flex items-center gap-1.5"><Droplets className="h-4 w-4 text-teal" aria-hidden />Água {today.water} °C (sim.)</span>
            <span className="flex items-center gap-1.5"><Fish className="h-4 w-4 text-teal" aria-hidden />{catches.length} capturas registadas</span>
          </div>
        </div>
      </div>

      <div className="sticky top-0 z-20 border-b border-line bg-canvas/90 backdrop-blur-xl lg:mx-8 lg:mt-2 lg:rounded-full lg:border-0">
        <div role="tablist" aria-label="Secções da barragem" className="no-scrollbar mx-auto flex max-w-6xl gap-1 overflow-x-auto px-3 lg:px-4">
          {TABS.map((t) => (
            <button
              key={t.id}
              role="tab"
              aria-selected={tab === t.id}
              onClick={() => setTab(t.id)}
              className={cx(
                'relative h-13 shrink-0 px-3.5 text-[14px] font-bold transition-colors',
                tab === t.id ? 'text-ink' : 'text-muted hover:text-ink',
              )}
            >
              {t.label}
              {t.id === 'capturas' && <span className="ml-1 text-subtle">{catches.length}</span>}
              {t.id === 'provas' && <span className="ml-1 text-subtle">{events.length}</span>}
              <span className={cx('absolute inset-x-3 bottom-0 h-[3px] rounded-full bg-teal transition-opacity', tab === t.id ? 'opacity-100' : 'opacity-0')} />
            </button>
          ))}
        </div>
      </div>

      <div className="mx-auto max-w-6xl px-4 pt-5 lg:px-8" role="tabpanel">
        {tab === 'geral' && (
          <div className="page-in grid gap-4 lg:grid-cols-[1.4fr_1fr] [&>*]:min-w-0">
            <div className="space-y-4">
              <Card className="p-5">
                <p className="text-[15.5px] leading-relaxed text-text">{dam.summary}</p>
                <dl className="mt-5 grid grid-cols-3 gap-3 border-t border-line pt-4">
                  {dam.traits.map((t) => (
                    <div key={t.label}>
                      <dt className="text-[11.5px] font-bold uppercase tracking-wider text-subtle">{t.label}</dt>
                      <dd className="mt-1 text-[13.5px] font-bold leading-snug text-ink">{t.value}</dd>
                    </div>
                  ))}
                </dl>
                <p className="mt-4 text-[12px] text-muted">Características descritivas de demonstração, não verificadas.</p>
              </Card>
              <Card className="p-5">
                <div className="flex items-center justify-between">
                  <h2 className="text-[15px] font-extrabold text-ink">Espécies de exemplo</h2>
                  <Tag tone="amber">Não verificadas</Tag>
                </div>
                <ul className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {dam.species.map((s) => {
                    const best = bestBySpecies.find((b) => b.s === s)?.best
                    return (
                      <li key={s} className="rounded-2xl bg-mist/70 px-3.5 py-3">
                        <p className="flex items-center gap-2 text-[14px] font-extrabold text-ink">
                          <SpeciesDot id={s} />
                          {speciesById[s].name}
                        </p>
                        <p className="tnum mt-0.5 text-[12px] text-muted">{best ? `Maior registo: ${formatKg(best.weightG)}` : 'Sem registos'}</p>
                      </li>
                    )
                  })}
                </ul>
                <h3 className="mt-5 text-[13px] font-bold text-ink">Modalidades de exemplo</h3>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {dam.modalities.map((m) => (
                    <Tag key={m}>{modalityName(m)}</Tag>
                  ))}
                </div>
              </Card>
            </div>
            <div className="space-y-4">
              <div className="rounded-[var(--radius-card)] bg-ink p-5 text-white shadow-card">
                <div className="flex items-center justify-between">
                  <h2 className="text-[15px] font-extrabold">Hoje, simulado</h2>
                  <button onClick={() => setTab('condicoes')} className="text-[13px] font-bold text-teal hover:underline">
                    Ver detalhe
                  </button>
                </div>
                <div className="mt-3.5">
                  <ConditionsGrid c={today} dark />
                </div>
              </div>
              <div className="flex gap-3 rounded-[var(--radius-card)] border border-line bg-white p-4">
                <Info className="mt-0.5 h-5 w-5 shrink-0 text-teal-700" aria-hidden />
                <p className="text-[13px] leading-relaxed text-muted">
                  <b className="text-ink">Antes de pescar:</b> confirme licença, épocas, espécies permitidas, zonas de acesso e navegação junto das entidades competentes. Esta demonstração não contém regras de pesca.
                </p>
              </div>
            </div>
          </div>
        )}

        {tab === 'condicoes' && (
          <div className="page-in grid gap-4 lg:grid-cols-[1.4fr_1fr] [&>*]:min-w-0">
            <Card className="p-5">
              <div className="no-scrollbar -mx-1 flex gap-2 overflow-x-auto px-1 pb-1" role="radiogroup" aria-label="Dia">
                {days.map((d, i) => {
                  const c = simulateConditions(dam, d)
                  return (
                    <button
                      key={d}
                      role="radio"
                      aria-checked={dayIdx === i}
                      onClick={() => setDayIdx(i)}
                      className={cx('press min-w-[72px] flex-1 rounded-2xl px-3 py-2.5 text-left', dayIdx === i ? 'bg-ink text-white' : 'bg-mist/70 text-ink hover:bg-mist')}
                    >
                      <span className="block whitespace-nowrap text-[12px] font-bold opacity-75">{i < 2 ? relativeDay(d, state.anchor) : capFirst(formatDate(d, { weekday: 'short', day: 'numeric' }))}</span>
                      <span className="tnum block text-[16px] font-extrabold">{c.airMax}°</span>
                    </button>
                  )
                })}
              </div>
              <div className="mt-5">
                <ConditionsGrid c={cond} />
              </div>
              <div className="mt-6">
                <HourlyChart key={cond.date} data={cond.hourly} />
              </div>
            </Card>
            <div className="space-y-4">
              <Card className="p-5">
                <h2 className="text-[15px] font-extrabold text-ink">Luz e ar</h2>
                <ul className="tnum mt-3 space-y-3 text-[14px]">
                  <li className="flex items-center justify-between"><span className="flex items-center gap-2 text-muted"><Sunrise className="h-4 w-4" aria-hidden />Nascer do sol</span><b className="text-ink">{cond.sunrise}</b></li>
                  <li className="flex items-center justify-between"><span className="flex items-center gap-2 text-muted"><Sunset className="h-4 w-4" aria-hidden />Pôr do sol</span><b className="text-ink">{cond.sunset}</b></li>
                  <li className="flex items-center justify-between"><span className="flex items-center gap-2 text-muted"><Gauge className="h-4 w-4" aria-hidden />Rajadas</span><b className="text-ink">{cond.gust} km/h</b></li>
                  <li className="flex items-center justify-between"><span className="flex items-center gap-2 text-muted"><Droplets className="h-4 w-4" aria-hidden />Humidade</span><b className="text-ink">{cond.humidity} %</b></li>
                </ul>
              </Card>
              <p className="rounded-2xl bg-amber-50 p-4 text-[12.5px] leading-relaxed text-amber-800">
                <b>Condições simuladas.</b> Gerados a partir da época do ano para demonstrar a experiência. No produto real, estes valores viriam de fontes meteorológicas e hidrológicas oficiais.
              </p>
            </div>
          </div>
        )}

        {tab === 'capturas' && (
          <div className="page-in grid gap-4 lg:grid-cols-[1.4fr_1fr] [&>*]:min-w-0">
            {catches.length ? (
              <Card className="p-2">
                {catches.map((c) => (
                  <CatchRow key={c.id} c={c} onClick={() => navigate(`/capturas/${c.id}`)} />
                ))}
              </Card>
            ) : (
              <EmptyState icon={Fish} title="Ainda sem capturas aqui" text="Seja o primeiro a registar uma captura nesta barragem." action={<ButtonLink to={`/capturas/nova?barragem=${dam.id}`} size="sm">Registar captura</ButtonLink>} />
            )}
            <p className="text-[12.5px] text-muted lg:pt-2">Capturas públicas de perfis fictícios e as tuas. Ordenadas por peso.</p>
          </div>
        )}

        {tab === 'provas' && (
          <div className="page-in grid gap-3 lg:grid-cols-2">
            {events.length ? (
              events.map((e) => <EventCard key={e.id} ev={e} />)
            ) : (
              <EmptyState icon={Trophy} title="Sem provas nesta barragem" text="Veja o calendário completo de provas de demonstração." action={<ButtonLink to="/provas" size="sm" variant="dark">Ver provas</ButtonLink>} />
            )}
            {events.some((e) => e.dayOffset >= 0) && (
              <p className="text-[12.5px] text-muted lg:col-span-2">
                Eventos fictícios. Próxima data: {formatDate(addDaysISO(state.anchor, events.find((e) => e.dayOffset >= 0)!.dayOffset))}.
              </p>
            )}
          </div>
        )}
      </div>

      <div className="pointer-events-none sticky bottom-[calc(var(--nav-h)+env(safe-area-inset-bottom)+14px)] z-30 mt-8 flex justify-center px-4 lg:bottom-6">
        <ButtonLink to={`/jornada/nova?barragem=${dam.id}`} size="lg" variant="dark" icon={Route} className="pointer-events-auto shadow-lift">
          Preparar jornada aqui
        </ButtonLink>
      </div>
    </div>
  )
}
