import { ExternalLink, Loader2, Locate, Search, TriangleAlert, X } from 'lucide-react'
import * as maplibregl from 'maplibre-gl'
import type { GeoJSONSource, LngLatBoundsLike, Map as MLMap, MapGeoJSONFeature } from 'maplibre-gl'
import type { Feature } from 'geojson'
import 'maplibre-gl/dist/maplibre-gl.css'
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url'
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Link } from 'react-router'
import catalogWater from '../../data/map/catalogWater.json'
import type { Dam } from '../../data/types'
import { buildStyle, layerIds, OVERVIEW_TIERS, TIERS } from '../../lib/map/style'
import {
  AREA_TIERS,
  BASEMAP_WATER_OFFSET,
  DAM_POINT_OFFSET,
  DETAIL_FROM_OFFSET,
  DETAIL_PREFETCH_OFFSET,
  FADE,
  IBERIA_BOUNDS,
  LABEL_ZOOM_OFFSET,
  MAX_BOUNDS,
  PORTUGAL_BOUNDS,
  RIVER_OFFSET,
  TIER_ZOOM_OFFSET,
  type Tier,
} from '../../lib/map/waterConfig'
import { cx } from '../ui'

maplibregl.setWorkerUrl(workerUrl)

export type MapView = 'pt' | 'iberia'
type CatalogWater = Record<string, { waterId: string; name: string; areaKm2: number; tier: number; bbox: number[]; label: [number, number]; distanceKm: number }>
const CATALOG = catalogWater as unknown as CatalogWater

interface ChunkInfo { key: string; bbox: [number, number, number, number]; count: number }
interface WaterIndex { source: { extractedAt: string; attribution: string; license: string; url: string; notes: string }; counts: { total: number }; chunks: ChunkInfo[] }
/** [id, nome, nomes alternativos, bbox, escalão, área km², ficha] */
type SearchEntry = [string, string, string, [number, number, number, number], Tier, number, string]

export interface WaterInfo {
  id: string
  name: string
  alt: string
  areaKm2: number
  tier: Tier
  countries: string
  catalog: string
  fromBasemap?: boolean
}

const tierLabel = (t: number) => AREA_TIERS.find((x) => x.tier === t)?.label ?? ''
const fmtArea = (km2: number) =>
  km2 >= 1 ? `${km2.toLocaleString('pt-PT', { maximumFractionDigits: 1 })} km²` : km2 * 100 < 1 ? '< 1 ha' : `${Math.round(km2 * 100).toLocaleString('pt-PT')} ha`
const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
const overlaps = (a: number[], b: number[]) => a[0] <= b[2] && a[2] >= b[0] && a[1] <= b[3] && a[3] >= b[1]
const FILL_LAYERS = [...OVERVIEW_TIERS.map((t) => layerIds.fill('ov', t)), ...TIERS.map((t) => layerIds.fill('dt', t))]

/**
 * Mapa real, plano e interativo da Península Ibérica com as albufeiras à escala.
 * MapLibre GL JS (Mercator, norte para cima, sem rotação nem inclinação).
 */
export default function IberiaMap({
  dams,
  selectedDamId,
  focus,
  onSelectDam,
  view,
  onView,
  className,
  children,
}: {
  dams: Dam[]
  selectedDamId?: string
  /** Pedido explícito de enquadramento (ex.: "Ver no mapa" num cartão). Muda `n` para repetir. */
  focus?: { damId: string; n: number }
  onSelectDam: (id: string | null) => void
  view: MapView
  onView: (v: MapView) => void
  className?: string
  children?: ReactNode
}) {
  const box = useRef<HTMLDivElement>(null)
  const mapRef = useRef<MLMap | null>(null)
  const fitZoom = useRef(5)
  const loadedChunks = useRef(new Map<string, unknown[]>())
  const pending = useRef(new Set<string>())
  const index = useRef<WaterIndex | null>(null)
  const onSelectRef = useRef(onSelectDam)
  useEffect(() => {
    onSelectRef.current = onSelectDam
  })
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [fatal, setFatal] = useState<string | null>(null)
  const [baseFailed, setBaseFailed] = useState(false)
  const [waterError, setWaterError] = useState(false)
  const [detailLoading, setDetailLoading] = useState(false)
  const [picked, setPicked] = useState<WaterInfo | null>(null)
  const [meta, setMeta] = useState<WaterIndex['source'] | null>(null)

  const damsGeo = useMemo(
    () => ({
      type: 'FeatureCollection' as const,
      // Só as fichas sem contorno nos dados têm ponto (localização aproximada); as restantes são o próprio polígono.
      features: dams.filter((d) => !CATALOG[d.id]).map((d) => ({
        type: 'Feature' as const,
        properties: { id: d.id, name: d.name, selected: d.id === selectedDamId, contour: !!CATALOG[d.id] },
        geometry: { type: 'Point' as const, coordinates: [d.approx.lon, d.approx.lat] },
      })),
    }),
    [dams, selectedDamId],
  )
  const damsGeoRef = useRef(damsGeo)

  // ---------- criação do mapa ----------
  useEffect(() => {
    const el = box.current
    if (!el) return
    let map: MLMap
    try {
      map = new maplibregl.Map({
        container: el,
        style: buildStyle(window.location.origin),
        bounds: IBERIA_BOUNDS as LngLatBoundsLike,
        fitBoundsOptions: { padding: 16 },
        maxBounds: MAX_BOUNDS as LngLatBoundsLike,
        minZoom: 3,
        maxZoom: 16,
        maxPitch: 0,
        pitchWithRotate: false,
        dragRotate: false,
        touchPitch: false,
        renderWorldCopies: false,
        attributionControl: false,
        cooperativeGestures: false,
      })
    } catch {
      // Falha do sistema externo (WebGL): comunicada na próxima volta do ciclo de eventos.
      const t = window.setTimeout(() => {
        setFatal('Este dispositivo ou navegador não consegue mostrar o mapa (WebGL indisponível).')
        setStatus('error')
      })
      return () => window.clearTimeout(t)
    }
    mapRef.current = map
    // Enquanto o utilizador não mexer no mapa, mantém o enquadramento da Península (o contentor pode mudar de tamanho).
    let interacted = false
    const markInteraction = (e: { originalEvent?: unknown }) => {
      if (e.originalEvent) interacted = true
    }
    map.on('dragstart', markInteraction)
    map.on('zoomstart', markInteraction)
    map.touchZoomRotate.disableRotation()
    map.keyboard.disableRotation()
    map.addControl(new maplibregl.NavigationControl({ showCompass: false, visualizePitch: false }), 'top-right')
    map.addControl(new maplibregl.ScaleControl({ unit: 'metric', maxWidth: 110 }), 'bottom-left')
    map.addControl(new maplibregl.AttributionControl({ compact: true }), 'bottom-right')

    const timeout = window.setTimeout(() => {
      if (!map.loaded()) setFatal('A cartografia está a demorar a carregar. Verifique a ligação à internet.')
    }, 20000)

    map.on('error', (e) => {
      const src = (e as unknown as { sourceId?: string }).sourceId
      if (src === 'omt') setBaseFailed(true)
    })

    map.on('load', async () => {
      window.clearTimeout(timeout)
      applyZoomPolicy(map, fitZoom)
      if (!interacted) map.fitBounds(IBERIA_BOUNDS as LngLatBoundsLike, { padding: 16, duration: 0 })
      ;(map.getSource('dams') as GeoJSONSource).setData(damsGeoRef.current)
      try {
        const [idx, ov] = await Promise.all([
          fetch('/map/water/index.json').then((r) => (r.ok ? r.json() : Promise.reject(r.status))),
          fetch('/map/water/overview.geojson').then((r) => (r.ok ? r.json() : Promise.reject(r.status))),
        ])
        index.current = idx
        setMeta(idx.source)
        ;(map.getSource('water-overview') as GeoJSONSource).setData(ov)
        setStatus('ready')
        loadVisibleChunks()
      } catch {
        setWaterError(true)
        setStatus('ready')
      }
    })

    const loadVisibleChunks = async () => {
      const idx = index.current
      if (!idx || map.getZoom() < fitZoom.current + DETAIL_PREFETCH_OFFSET) return
      const b = map.getBounds()
      const vb = [b.getWest(), b.getSouth(), b.getEast(), b.getNorth()]
      const need = idx.chunks.filter((c) => overlaps(c.bbox, vb) && !loadedChunks.current.has(c.key) && !pending.current.has(c.key))
      if (!need.length) return
      need.forEach((c) => pending.current.add(c.key))
      setDetailLoading(true)
      const results = await Promise.allSettled(need.map((c) => fetch(`/map/water/${c.key}.geojson`).then((r) => (r.ok ? r.json() : Promise.reject(r.status)))))
      results.forEach((r, i) => {
        pending.current.delete(need[i].key)
        if (r.status === 'fulfilled') loadedChunks.current.set(need[i].key, r.value.features)
      })
      if (results.some((r) => r.status === 'rejected')) setWaterError(true)
      const src = map.getSource('water-detail') as GeoJSONSource | undefined
      src?.setData({ type: 'FeatureCollection', features: [...loadedChunks.current.values()].flat() as Feature[] })
      setDetailLoading(pending.current.size > 0)
    }
    map.on('moveend', loadVisibleChunks)

    // Estado observável (testes e diagnóstico): zoom, enquadramento e albufeiras desenhadas.
    map.on('idle', () => {
      const wrap = el.parentElement
      if (!wrap) return
      const z = map.getZoom()
      const active = (l: string) => {
        const ly = map.getLayer(l)
        return !!ly && z >= (ly.minzoom ?? 0) && z < (ly.maxzoom ?? 24) && map.getLayoutProperty(l, 'visibility') !== 'none'
      }
      const drawn = map.queryRenderedFeatures({ layers: FILL_LAYERS.filter(active) })
      const visible = new Map<string, { n: string; a: number }>()
      for (const f of drawn) {
        visible.set(String(f.properties.id), { n: String(f.properties.short || ''), a: Number(f.properties.area_km2) })
      }
      wrap.dataset.zoom = z.toFixed(2)
      wrap.dataset.fitZoom = fitZoom.current.toFixed(2)
      wrap.dataset.waterCount = String(visible.size)
      wrap.dataset.minArea = String(Math.min(...[...visible.values()].map((v) => v.a), 9999))
      wrap.dataset.waterNames = [...visible.values()].filter((v) => v.n).sort((a, b) => b.a - a.a).slice(0, 60).map((v) => v.n).join('|')
      wrap.dataset.labels = map.queryRenderedFeatures({ layers: [...TIERS.map((t) => layerIds.label('dt', t)), ...OVERVIEW_TIERS.map((t) => layerIds.label('ov', t))].filter(active) }).map((f) => String(f.properties.short)).join('|')
      wrap.dataset.chunks = String(loadedChunks.current.size)
      wrap.dataset.activeTiers = TIERS.filter((t) => active(layerIds.fill('dt', t)) || (t <= 2 && active(layerIds.fill('ov', t)))).join(',')
      // Pontos interiores (rótulos) visíveis no ecrã: permitem aos testes tocar num polígono real.
      const probes = map.queryRenderedFeatures({ layers: [...TIERS.map((t) => layerIds.label('dt', t)), ...OVERVIEW_TIERS.map((t) => layerIds.label('ov', t))].filter(active) })
        .slice(0, 12)
        .map((f) => {
          const c = (f.geometry as unknown as { coordinates: [number, number] }).coordinates
          const px = map.project(c)
          return { name: String(f.properties.short), catalog: String(f.properties.catalog || ''), x: Math.round(px.x), y: Math.round(px.y) }
        })
      wrap.dataset.probes = JSON.stringify(probes)
    })

    // Cursor e seleção pelos polígonos (área de toque alargada, desenho à escala).
    const hit = (pt: maplibregl.Point, pad: number): MapGeoJSONFeature[] =>
      map.queryRenderedFeatures([[pt.x - pad, pt.y - pad], [pt.x + pad, pt.y + pad]], { layers: FILL_LAYERS.filter((l) => map.getLayer(l)) })
    map.on('mousemove', (e) => {
      map.getCanvas().style.cursor = hit(e.point, 3).length || map.queryRenderedFeatures(e.point, { layers: ['omt-water'] }).length ? 'pointer' : ''
    })
    map.on('click', (e) => {
      const pad = (e.originalEvent as PointerEvent).pointerType === 'touch' ? 14 : 5
      const feats = hit(e.point, pad).sort((a, b) => Number(a.properties.area_km2) - Number(b.properties.area_km2))
      const f = feats[0]
      if (f) {
        const p = f.properties as Record<string, string | number>
        const info: WaterInfo = { id: String(p.id), name: String(p.name || ''), alt: String(p.alt || ''), areaKm2: Number(p.area_km2), tier: Number(p.tier) as Tier, countries: String(p.countries), catalog: String(p.catalog || '') }
        setPicked(info)
        highlight(map, info.id)
        onSelectRef.current(info.catalog || null)
        return
      }
      const base = map.queryRenderedFeatures([[e.point.x - pad, e.point.y - pad], [e.point.x + pad, e.point.y + pad]], { layers: ['omt-water'] })[0]
      if (base) {
        setPicked({ id: '', name: '', alt: '', areaKm2: NaN, tier: 5, countries: '', catalog: '', fromBasemap: true })
        highlight(map, '')
        onSelectRef.current(null)
        return
      }
      setPicked(null)
      highlight(map, '')
    })

    // Redimensionamento: recalcula o enquadramento da Península e os limiares relativos.
    const ro = new ResizeObserver(() => {
      map.resize()
      applyZoomPolicy(map, fitZoom)
      if (!interacted && map.isStyleLoaded()) map.fitBounds(IBERIA_BOUNDS as LngLatBoundsLike, { padding: 16, duration: 0 })
    })
    ro.observe(el)
    return () => {
      ro.disconnect()
      window.clearTimeout(timeout)
      map.remove()
      mapRef.current = null
    }
  }, [])

  // Base Natural Earth como recurso: localidades e fronteiras a todas as escalas.
  useEffect(() => {
    const map = mapRef.current
    if (!map || !baseFailed) return
    const apply = () => {
      map.setLayoutProperty('ne-place', 'visibility', 'visible')
      map.setPaintProperty('ne-border', 'line-opacity', 1)
      for (const l of ['omt-place', 'omt-border', 'omt-region', 'omt-road-major', 'omt-road-minor', 'omt-wood', 'omt-ocean', 'omt-water', 'omt-river', 'omt-stream']) if (map.getLayer(l)) map.setLayoutProperty(l, 'visibility', 'none')
      // Sem mapa base detalhado, os contornos da CatchAtlas são a única água: mantêm-se a todas as escalas.
      for (const t of TIERS) map.setPaintProperty(layerIds.fill('dt', t), 'fill-opacity', tierOpacity(fitZoom.current, t, false))
    }
    if (map.isStyleLoaded()) apply()
    else map.once('load', apply)
  }, [baseFailed])

  // Barragens do catálogo (resultados atuais dos filtros).
  useEffect(() => {
    damsGeoRef.current = damsGeo
    const src = mapRef.current?.getSource('dams') as GeoJSONSource | undefined
    src?.setData(damsGeo)
  }, [damsGeo])

  // Destaque sincronizado com a ficha selecionada na lista (sem mover o mapa).
  useEffect(() => {
    const map = mapRef.current
    if (!map || status !== 'ready') return
    const w = selectedDamId ? CATALOG[selectedDamId] : undefined
    highlight(map, w?.waterId ?? '')
  }, [selectedDamId, status])

  // Enquadramento pedido explicitamente (cartão da lista ou pesquisa).
  useEffect(() => {
    const map = mapRef.current
    if (!map || !focus || status !== 'ready') return
    const w = CATALOG[focus.damId]
    if (w) frameWater(map, w.bbox, w.tier as Tier, fitZoom.current)
    else {
      const d = dams.find((x) => x.id === focus.damId)
      if (d) map.easeTo({ center: [d.approx.lon, d.approx.lat], zoom: Math.max(map.getZoom(), fitZoom.current + DAM_POINT_OFFSET + 0.6), duration: 700 })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- só reage a novos pedidos de enquadramento
  }, [focus?.n, status])

  // Botões Portugal / Península.
  const frameView = (v: MapView) => {
    onView(v)
    mapRef.current?.fitBounds((v === 'pt' ? PORTUGAL_BOUNDS : IBERIA_BOUNDS) as LngLatBoundsLike, { padding: 16, duration: 700 })
  }

  const pickFromSearch = (e: SearchEntry) => {
    const map = mapRef.current
    if (!map) return
    const [id, name, alt, bbox, tier, area, catalog] = e
    setPicked({ id, name, alt, areaKm2: area, tier, countries: '', catalog })
    highlight(map, id)
    onSelectRef.current(catalog || null)
    frameWater(map, bbox, tier, fitZoom.current)
  }

  const noContour = selectedDamId && !CATALOG[selectedDamId] ? dams.find((d) => d.id === selectedDamId) : null
  // Com uma ficha selecionada, o cartão da ficha substitui o painel da massa de água.
  const shownPicked = picked && !selectedDamId ? picked : null

  return (
    <div className={cx('relative overflow-hidden rounded-[var(--radius-card)] bg-[#cfe2ea] shadow-card', className)} data-map-status={status}>
      <div ref={box} style={{ position: 'absolute', inset: 0 }} role="region" aria-label="Mapa das albufeiras de Portugal e Espanha" />

      <MapSearch onPick={pickFromSearch} />

      <div className="absolute bottom-9 left-2 z-10 flex flex-col items-start gap-2 sm:left-auto sm:right-2 sm:items-end">
        {children}
        <div className="flex gap-1.5">
          <button type="button" onClick={() => frameView('iberia')} aria-label="Repor vista da Península" title="Repor vista da Península" className="press grid h-10 w-10 place-items-center rounded-full bg-white text-ink shadow-card hover:bg-mist">
            <Locate className="h-[18px] w-[18px]" />
          </button>
          <div className="flex rounded-full bg-white p-1 shadow-card" role="group" aria-label="Zona do mapa">
            {(['pt', 'iberia'] as const).map((v) => (
              <button key={v} type="button" onClick={() => frameView(v)} aria-pressed={view === v} className={cx('press h-8 rounded-full px-3 text-[12.5px] font-bold', view === v ? 'bg-ink text-white' : 'text-ink hover:bg-mist')}>
                {v === 'pt' ? 'Portugal' : 'Península'}
              </button>
            ))}
          </div>
        </div>
      </div>

      {status === 'loading' && !fatal && (
        <div className="absolute inset-0 grid place-items-center bg-[#cfe2ea]/70" aria-live="polite">
          <span className="flex items-center gap-2 rounded-full bg-white px-4 py-2 text-[13px] font-bold text-ink shadow-card">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> A carregar o mapa…
          </span>
        </div>
      )}
      {fatal && (
        <div className="absolute inset-0 grid place-items-center bg-[#eef3f4] p-6 text-center" role="alert">
          <div>
            <TriangleAlert className="mx-auto h-6 w-6 text-amber-800" aria-hidden />
            <p className="mt-2 text-[14px] font-bold text-ink">{fatal}</p>
            <p className="mt-1 text-[12.5px] text-muted">A lista de barragens continua disponível.</p>
          </div>
        </div>
      )}
      <div className="pointer-events-none absolute inset-x-2 top-[60px] z-10 flex flex-col items-center gap-1.5">
        {baseFailed && (
          <p className="pointer-events-auto rounded-xl bg-amber-50 px-3 py-1.5 text-center text-[12px] font-semibold text-amber-800 shadow-card" role="status">
            Mapa base detalhado indisponível · a mostrar a base simplificada (Natural Earth)
          </p>
        )}
        {waterError && (
          <p className="pointer-events-auto rounded-xl bg-amber-50 px-3 py-1.5 text-center text-[12px] font-semibold text-amber-800 shadow-card" role="alert">
            Não foi possível carregar parte das albufeiras. Mova o mapa para tentar de novo.
          </p>
        )}
        {detailLoading && (
          <p className="flex items-center gap-1.5 rounded-full bg-white/90 px-3 py-1 text-[11.5px] font-bold text-muted shadow-card" aria-live="polite">
            <Loader2 className="h-3 w-3 animate-spin" aria-hidden /> A carregar contornos…
          </p>
        )}
      </div>

      {(shownPicked && !shownPicked.catalog) || noContour ? (
        <div className="absolute inset-x-2 bottom-24 z-20 rounded-2xl bg-white p-3.5 shadow-lift sm:left-auto sm:right-2 sm:w-[300px]" role="dialog" aria-label="Massa de água selecionada">
          <button type="button" onClick={() => { setPicked(null); if (mapRef.current) highlight(mapRef.current, '') }} className="absolute right-2 top-2 grid h-8 w-8 place-items-center rounded-full text-muted hover:bg-mist" aria-label="Fechar">
            <X className="h-4 w-4" />
          </button>
          {noContour ? (
            <>
              <p className="pr-8 text-[15px] font-extrabold text-ink">{noContour.name}</p>
              <p className="mt-1 text-[12.5px] leading-relaxed text-muted">Contorno da albufeira não disponível nos dados cartográficos. O ponto indica a localização aproximada da barragem.</p>
              <Link to={`/barragens/${noContour.id}`} className="mt-2 inline-block text-[13px] font-bold text-teal-700 hover:underline">Abrir ficha da barragem</Link>
            </>
          ) : shownPicked?.fromBasemap ? (
            <>
              <p className="pr-8 text-[15px] font-extrabold text-ink">Massa de água</p>
              <p className="mt-1 text-[12.5px] leading-relaxed text-muted">Do mapa base do OpenStreetMap, sem nome nos dados usados aqui. Ficha ainda não disponível.</p>
            </>
          ) : shownPicked ? (
            <>
              <p className="pr-8 text-[15px] font-extrabold text-ink">{shownPicked.name || 'Albufeira sem nome nos dados'}</p>
              {shownPicked.alt && <p className="text-[12px] text-muted">{shownPicked.alt}</p>}
              <p className="mt-1 text-[12.5px] text-text">
                {Number.isFinite(shownPicked.areaKm2) && <>Área do contorno: {fmtArea(shownPicked.areaKm2)} · {tierLabel(shownPicked.tier)}</>}
              </p>
              <p className="mt-1.5 text-[12.5px] font-bold text-amber-800">Ficha ainda não disponível</p>
            </>
          ) : null}
        </div>
      ) : null}

      {meta && (
        <p className="pointer-events-none absolute bottom-1.5 left-1/2 z-[1] hidden -translate-x-1/2 whitespace-nowrap rounded-full bg-white/80 px-2.5 py-0.5 text-[10.5px] text-muted md:block">
          Contornos de referência OSM ({meta.extractedAt.split('-').reverse().join('/')}) · não indicam o nível atual da água
        </p>
      )}
      {meta && (
        <a href={meta.url} target="_blank" rel="noopener noreferrer" className="sr-only">
          Fonte dos contornos: {meta.attribution}, {meta.license} <ExternalLink aria-hidden />
        </a>
      )}
    </div>
  )
}

/** Opacidade de um escalão em função do zoom (fade de entrada; sem fade de saída quando não há mapa base). */
function tierOpacity(fit: number, t: Tier, overview: boolean): maplibregl.ExpressionSpecification | number {
  const start = fit + TIER_ZOOM_OFFSET[t]
  const detailFrom = fit + DETAIL_FROM_OFFSET
  if (overview) return ['interpolate', ['linear'], ['zoom'], start, 0, start + FADE, 1, detailFrom + 0.2, 1, detailFrom + 0.6, 0]
  return ['interpolate', ['linear'], ['zoom'], start, 0, start + FADE, 1]
}

/** Aplica os limiares relativos ao enquadramento atual da Península. */
function applyZoomPolicy(map: MLMap, fitRef: { current: number }) {
  if (!map.isStyleLoaded()) return
  const cam = map.cameraForBounds(IBERIA_BOUNDS as LngLatBoundsLike, { padding: 16 })
  const fit = cam?.zoom ?? 5
  if (Math.abs(fit - fitRef.current) < 0.02 && map.getLayer(layerIds.fill('dt', 1)) && fitRef.current !== 5) return
  fitRef.current = fit
  const detailFrom = fit + DETAIL_FROM_OFFSET
  for (const t of OVERVIEW_TIERS) {
    const start = fit + TIER_ZOOM_OFFSET[t]
    map.setLayerZoomRange(layerIds.fill('ov', t), Math.max(0, start), detailFrom + 0.6)
    map.setPaintProperty(layerIds.fill('ov', t), 'fill-opacity', tierOpacity(fit, t, true))
    map.setLayerZoomRange(layerIds.label('ov', t), Math.max(0, fit + LABEL_ZOOM_OFFSET[t]), detailFrom)
  }
  for (const t of TIERS) {
    const start = t <= 2 ? detailFrom : fit + TIER_ZOOM_OFFSET[t]
    map.setLayerZoomRange(layerIds.fill('dt', t), Math.max(0, start), 24)
    map.setPaintProperty(layerIds.fill('dt', t), 'fill-opacity', t <= 2 ? 1 : tierOpacity(fit, t, false))
    map.setLayerZoomRange(layerIds.label('dt', t), Math.max(0, t <= 2 ? detailFrom : fit + LABEL_ZOOM_OFFSET[t]), 24)
  }
  const bw = fit + BASEMAP_WATER_OFFSET
  map.setLayerZoomRange('omt-water', bw, 24)
  map.setPaintProperty('omt-water', 'fill-opacity', ['interpolate', ['linear'], ['zoom'], bw, 0, bw + FADE, 1])
  map.setLayerZoomRange('ne-river', Math.max(0, fit + RIVER_OFFSET.major - 0.6), fit + RIVER_OFFSET.minor + 0.5)
  // Rios por importância (scalerank do Natural Earth): os principais primeiro, os restantes depois.
  const r0 = fit + RIVER_OFFSET.major
  map.setPaintProperty('ne-river', 'line-opacity', [
    'interpolate', ['linear'], ['zoom'],
    r0 - 0.6, 0,
    r0, ['case', ['<=', ['get', 'rank'], 6], 1, 0],
    r0 + 1, ['case', ['<=', ['get', 'rank'], 8], 1, 0],
    r0 + 2, 1,
  ])
  map.setLayerZoomRange('omt-river', fit + RIVER_OFFSET.minor, 24)
  map.setLayerZoomRange('omt-stream', fit + RIVER_OFFSET.streams, 24)
  map.setLayerZoomRange('dams', fit + DAM_POINT_OFFSET, 24)
  // Fronteiras: Natural Earth nas escalas pequenas; OSM (mais detalhada) a partir da escala regional.
  map.setPaintProperty('ne-border', 'line-opacity', ['interpolate', ['linear'], ['zoom'], fit + 2.6, 1, fit + 3.2, 0])
  map.setLayerZoomRange('omt-border', fit + 2.6, 24)
}

function highlight(map: MLMap, id: string) {
  if (!map.getLayer('water-sel-ov')) return
  const f: maplibregl.FilterSpecification = ['all', ['==', ['get', 'kind'], 'area'], ['==', ['get', 'id'], id]]
  for (const l of ['water-sel-ov', 'water-sel-dt', 'water-sel-line', 'water-sel-line-ov']) map.setFilter(l, f)
}

/** Enquadra os limites reais da albufeira e garante zoom suficiente para ela estar visível. */
function frameWater(map: MLMap, bbox: number[], tier: Tier, fit: number) {
  const b: LngLatBoundsLike = [bbox[0], bbox[1], bbox[2], bbox[3]]
  const cam = map.cameraForBounds(b, { padding: 60, maxZoom: 14 })
  if (!cam) return
  const minVisible = fit + (tier <= 2 ? DETAIL_FROM_OFFSET : TIER_ZOOM_OFFSET[tier]) + FADE + 0.3
  map.easeTo({ center: cam.center, zoom: Math.min(15, Math.max(cam.zoom ?? 8, minVisible)), duration: 800 })
}

/** Pesquisa de massas de água pelo nome (inclui albufeiras sem ficha); índice carregado só ao usar. */
function MapSearch({ onPick }: { onPick: (e: SearchEntry) => void }) {
  const [q, setQ] = useState('')
  const [data, setData] = useState<SearchEntry[] | null>(null)
  const [open, setOpen] = useState(false)
  const load = () => {
    if (data) return
    fetch('/map/water/search.json').then((r) => r.json()).then(setData).catch(() => setData([]))
  }
  const results = useMemo(() => {
    const n = norm(q.trim())
    if (!data || n.length < 2) return []
    return data.filter((e) => norm(`${e[1]} ${e[2]}`).includes(n)).slice(0, 8)
  }, [q, data])
  return (
    <div className="absolute left-2 right-14 top-2 z-20 sm:right-auto sm:w-[300px]" data-no-swipe>
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-subtle" aria-hidden />
        <input
          type="search"
          value={q}
          onFocus={() => { load(); setOpen(true) }}
          onChange={(e) => { setQ(e.target.value); setOpen(true) }}
          onKeyDown={(e) => { if (e.key === 'Escape') setOpen(false); if (e.key === 'Enter' && results[0]) { onPick(results[0]); setOpen(false) } }}
          placeholder="Procurar albufeira no mapa"
          aria-label="Procurar albufeira no mapa"
          className="h-10 w-full rounded-full border border-line bg-white pl-9 pr-3 text-[13.5px] shadow-card outline-none placeholder:text-subtle focus:border-teal focus:ring-4 focus:ring-teal/15"
        />
      </div>
      {open && results.length > 0 && (
        <ul className="mt-1.5 max-h-[260px] overflow-y-auto rounded-2xl bg-white py-1 shadow-lift" role="listbox" aria-label="Resultados">
          {results.map((e) => (
            <li key={e[0]}>
              <button type="button" role="option" aria-selected={false} onClick={() => { onPick(e); setOpen(false); setQ(e[1]) }} className="flex w-full items-center justify-between gap-2 px-3.5 py-2 text-left hover:bg-mist">
                <span className="min-w-0">
                  <span className="block truncate text-[13.5px] font-bold text-ink">{e[1]}</span>
                  <span className="block text-[11.5px] text-muted">{fmtArea(e[5])} · {tierLabel(e[4])}</span>
                </span>
                {e[6] ? <span className="shrink-0 rounded-full bg-teal-50 px-2 py-0.5 text-[10.5px] font-bold text-teal-700">Ficha</span> : null}
              </button>
            </li>
          ))}
        </ul>
      )}
      {open && data && q.trim().length >= 2 && results.length === 0 && (
        <p className="mt-1.5 rounded-2xl bg-white px-3.5 py-2 text-[12.5px] text-muted shadow-lift">Sem albufeiras com esse nome nos dados (Portugal e Espanha, ≥ 5 ha).</p>
      )}
    </div>
  )
}
