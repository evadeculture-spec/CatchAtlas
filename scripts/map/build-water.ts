/**
 * Prepara os dados do mapa real (npm run map:build).
 *
 * Fontes (versões fixadas):
 *  - Albufeiras de Portugal e Espanha: OpenStreetMap (© contribuidores do OSM, ODbL), extraídas
 *    por bquelhas/barragens (natural=water+water=reservoir e landuse=reservoir, ≥ 5 ha,
 *    simplificação Douglas-Peucker de 20 m), commit SRC_COMMIT, extração de 2026-11-02.
 *  - Base de recurso (terra, fronteiras, rios, localidades): Natural Earth 1:10m (domínio público).
 *
 * Saídas em public/map/ (servidas estaticamente, carregadas por necessidade):
 *  - water/overview.geojson: escalões 1–2, simplificados para a vista geral.
 *  - water/c_<x>_<y>.geojson: blocos de 1° com todos os contornos em detalhe (por ponto de rótulo:
 *    cada albufeira fica INTEIRA num único bloco, sem cortes nem duplicação).
 *  - water/index.json: metadados, fonte, licença e lista de blocos com a extensão real.
 *  - water/search.json: nomes, extensão e escalão para a pesquisa no mapa.
 *  - base.geojson: base Natural Earth recortada à região.
 *  - src/data/map/catalogWater.json: correspondências verificadas ficha ↔ albufeira.
 */
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import geodesic from 'geographiclib-geodesic'
import { clipPolygon, clipPolyline } from 'lineclip'
import polylabel from 'polylabel'
import { DAMS } from '../../src/data/dams'
import { AREA_TIERS, OVERVIEW_MAX_TIER, tierForArea } from '../../src/lib/map/waterConfig'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const CACHE = join(ROOT, '.cache', 'map-src')
const OUT = join(ROOT, 'public', 'map')
const SRC_COMMIT = '2ddc0bdc44caf73af506a55118f1afa87c3a4d1e'
const OSM_BASE = `https://raw.githubusercontent.com/bquelhas/barragens/${SRC_COMMIT}/data`
const NE_BASE = 'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson'
const LICENSE_TEXT = `Contornos das albufeiras (public/map/water/*)\n\nBase de dados derivada do OpenStreetMap: © contribuidores do OpenStreetMap.\nDisponibilizada nos termos da Open Database License (ODbL) 1.0:\nhttps://opendatacommons.org/licenses/odbl/1-0/\n\nFonte: extração de albufeiras de Portugal e Espanha feita por bquelhas/barragens\n(https://github.com/bquelhas/barragens, commit 2ddc0bdc44caf73af506a55118f1afa87c3a4d1e,\nextração de 2026-11-02; código MIT). Alterações da CatchAtlas: remoção de duplicados\ntransfronteiriços, área geodésica WGS84, escalões por área, ponto interior para rótulo,\nsimplificação adicional na visão geral e divisão em blocos. Gerado por scripts/map/build-water.ts.\n\nOs contornos são de referência e não representam o nível atual da água.\n`
const CLIP: [number, number, number, number] = [-20, 26, 14, 52]
/** Rios e localidades da base de recurso: só a Península e arredores. */
const IBERIA_CLIP: [number, number, number, number] = [-10.5, 35, 4.5, 44.5]

type Pos = [number, number]
type Ring = Pos[]
type Poly = Ring[]
interface GJFeature { type: 'Feature'; properties: Record<string, unknown>; geometry: { type: string; coordinates: unknown } }

async function cached(name: string, url: string): Promise<{ features: GJFeature[] }> {
  mkdirSync(CACHE, { recursive: true })
  const p = join(CACHE, name)
  if (!existsSync(p)) {
    const r = await fetch(url)
    if (!r.ok) throw new Error(`${url}: HTTP ${r.status}`)
    writeFileSync(p, Buffer.from(await r.arrayBuffer()))
  }
  return JSON.parse(readFileSync(p, 'utf8'))
}

// ---------- geometria ----------
const WGS84 = geodesic.Geodesic.WGS84
function ringAreaM2(r: Ring) {
  const pa = new geodesic.PolygonArea.PolygonArea(WGS84, false)
  for (const [x, y] of r.slice(0, -1)) pa.AddPoint(y, x)
  return Math.abs(pa.Compute(false, true).area)
}
const polyAreaM2 = (p: Poly) => ringAreaM2(p[0]) - p.slice(1).reduce((s, r) => s + ringAreaM2(r), 0)
const polysOf = (g: GJFeature['geometry']): Poly[] => (g.type === 'Polygon' ? [g.coordinates as Poly] : g.type === 'MultiPolygon' ? (g.coordinates as Poly[]) : [])

function bboxOf(polys: Poly[]): [number, number, number, number] {
  let a = Infinity, b = Infinity, c = -Infinity, d = -Infinity
  for (const p of polys) for (const [x, y] of p[0]) { if (x < a) a = x; if (y < b) b = y; if (x > c) c = x; if (y > d) d = y }
  return [a, b, c, d]
}

/** Douglas-Peucker em metros (projeção equirretangular local), preservando o fecho do anel. */
function simplifyRing(r: Ring, tolM: number): Ring {
  if (r.length <= 4) return r
  const lat0 = (r[0][1] * Math.PI) / 180
  const kx = 111320 * Math.cos(lat0), ky = 110540
  const keep = new Uint8Array(r.length)
  keep[0] = keep[r.length - 1] = 1
  const stack: [number, number][] = [[0, r.length - 1]]
  const t2 = tolM * tolM
  while (stack.length) {
    const [i, j] = stack.pop()!
    const ax = r[i][0] * kx, ay = r[i][1] * ky, bx = r[j][0] * kx, by = r[j][1] * ky
    const dx = bx - ax, dy = by - ay, L = dx * dx + dy * dy
    let best = -1, bi = -1
    for (let k = i + 1; k < j; k++) {
      const px = r[k][0] * kx, py = r[k][1] * ky
      let t = L ? ((px - ax) * dx + (py - ay) * dy) / L : 0
      t = Math.max(0, Math.min(1, t))
      const ex = ax + t * dx - px, ey = ay + t * dy - py, d2 = ex * ex + ey * ey
      if (d2 > best) { best = d2; bi = k }
    }
    if (best > t2) { keep[bi] = 1; stack.push([i, bi], [bi, j]) }
  }
  const out = r.filter((_, k) => keep[k])
  return out.length >= 4 ? out : r
}
const round = (v: number, d: number) => Math.round(v * 10 ** d) / 10 ** d
const roundPoly = (p: Poly, d: number): Poly => p.map((r) => r.map(([x, y]) => [round(x, d), round(y, d)] as Pos))

function pointInRing([x, y]: Pos, r: Ring) {
  let inside = false
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    const [xi, yi] = r[i], [xj, yj] = r[j]
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside
  }
  return inside
}
const pointInPoly = (pt: Pos, p: Poly) => pointInRing(pt, p[0]) && !p.slice(1).some((h) => pointInRing(pt, h))
function distKm(a: Pos, b: Pos) {
  const r = WGS84.Inverse(a[1], a[0], b[1], b[0])
  return (r.s12 ?? 0) / 1000
}
/** Distância aproximada (km) de um ponto ao contorno exterior (0 se estiver dentro). */
function distToPolysKm(pt: Pos, polys: Poly[]) {
  if (polys.some((p) => pointInPoly(pt, p))) return 0
  let best = Infinity
  for (const p of polys) for (const v of p[0]) best = Math.min(best, distKm(pt, v))
  return best
}

// ---------- nomes ----------
const STOP = new Set(['albufeira', 'barragem', 'embalse', 'pantano', 'panta', 'embassament', 'encoro', 'presa', 'represa', 'de', 'do', 'da', 'dos', 'das', 'del', 'la', 'el', 'los', 'las', 'o', 'a', 'e', 'y', 'i', 'les'])
const tokens = (s: string) =>
  new Set(
    s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\(.*?\)/g, ' ').split(/[^a-z0-9]+/).filter((t) => t && !STOP.has(t)),
  )
const subset = (a: Set<string>, b: Set<string>) => a.size > 0 && [...a].every((t) => b.has(t))
/** Nome curto para rótulo: retira apenas o termo genérico inicial (Albufeira de…, Embalse de…). */
function shortName(n: string | null) {
  if (!n) return ''
  const s = n.split(/\s*\/\s*/)[0].replace(/^(albufeira|barragem|embalse|pantano|pant[aà]|embassament|encoro|presa)\s+(d[aeo]s?\s+|del\s+|de\s+la\s+|de\s+los\s+|de\s+les\s+|de\s+l')?/i, '')
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : n
}

async function main() {
  // ---------- albufeiras (OSM) ----------
  const pt = await cached(`reservoirs_pt_${SRC_COMMIT.slice(0, 7)}.geojson`, `${OSM_BASE}/reservoirs_pt.geojson`)
  const es = await cached(`reservoirs_es_${SRC_COMMIT.slice(0, 7)}.geojson`, `${OSM_BASE}/reservoirs_es.geojson`)
  interface W {
    id: string; osm: string; name: string | null; names: string[]; countries: Set<string>; polys: Poly[]
    area: number; tier: number; bbox: [number, number, number, number]; label: Pos; usage: string | null
  }
  const byId = new Map<string, W>()
  for (const f of [...pt.features, ...es.features]) {
    const p = f.properties as Record<string, string | null>
    const osm = p.reservoir_id as string
    const prev = byId.get(osm)
    if (prev) { prev.countries.add(p.country as string); continue } // transfronteiriça: uma só geometria
    const polys = polysOf(f.geometry)
    if (!polys.length) continue
    const names = [...new Set([p.name, p.name_pt, p.name_es].filter(Boolean) as string[])]
    byId.set(osm, {
      id: `osm-${osm.replace('/', '-')}`, osm, name: (p.name_pt as string) || (p.name as string) || (p.name_es as string) || null, names,
      countries: new Set([p.country as string]), polys, area: 0, tier: 5, bbox: bboxOf(polys), label: [0, 0], usage: (p.usage as string) || null,
    })
  }
  const waters = [...byId.values()]
  for (const w of waters) {
    // Área arredondada ao m² × 1000 (3 casas em km²): o mesmo valor guardado é o usado na classificação.
    w.area = round(w.polys.reduce((s, p) => s + polyAreaM2(p), 0) / 1e6, 3)
    w.tier = tierForArea(w.area)
    // Ponto interior para o rótulo: polo de inacessibilidade do maior polígono.
    const main = w.polys.reduce((a, b) => (polyAreaM2(a) >= polyAreaM2(b) ? a : b))
    const pl = polylabel(main, 0.0005) as unknown as number[]
    w.label = [round(pl[0], 5), round(pl[1], 5)]
  }
  waters.sort((a, b) => b.area - a.area)

  // ---------- correspondência com o catálogo ----------
  const catalog: Record<string, { waterId: string; name: string; areaKm2: number; tier: number; bbox: number[]; label: Pos; method: string; distanceKm: number }> = {}
  const report: string[] = []
  const used = new Map<string, string>()
  for (const d of DAMS) {
    const dt = tokens(d.name)
    const pt0: Pos = [d.approx.lon, d.approx.lat]
    const cands = waters
      .filter((w) => w.names.some((n) => { const nt = tokens(n); return subset(dt, nt) || subset(nt, dt) }))
      .map((w) => ({ w, dist: distToPolysKm(pt0, w.polys) }))
      .filter((c) => c.dist <= 15)
      .sort((a, b) => a.dist - b.dist || b.w.area - a.w.area)
    const c = cands[0]
    if (!c) { report.push(`SEM CONTORNO  ${d.id} (${d.name}): nenhuma albufeira OSM com nome compatível a ≤ 15 km do ponto aproximado`); continue }
    if (used.has(c.w.id)) { report.push(`CONFLITO      ${d.id} (${d.name}) → ${c.w.name} já ligada a ${used.get(c.w.id)}: não ligada`); continue }
    used.set(c.w.id, d.id)
    catalog[d.id] = { waterId: c.w.id, name: c.w.name ?? d.name, areaKm2: round(c.w.area, 2), tier: c.w.tier, bbox: c.w.bbox.map((v) => round(v, 4)), label: c.w.label, method: 'nome compatível + ponto da ficha a ≤ 15 km do contorno', distanceKm: round(c.dist, 1) }
    report.push(`LIGADA        ${d.id} (${d.name}) → ${c.w.name} [${c.w.osm}] ${c.w.area.toFixed(1)} km², a ${c.dist.toFixed(1)} km`)
  }
  const catOf = new Map(Object.entries(catalog).map(([k, v]) => [v.waterId, k]))

  // ---------- saída: visão geral + blocos ----------
  const dir = join(OUT, 'water')
  rmSync(dir, { recursive: true, force: true })
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, 'LICENSE.txt'), LICENSE_TEXT)
  const props = (w: W) => ({
    id: w.id, osm: w.osm, name: w.name ?? '', short: shortName(w.name), alt: w.names.filter((n) => n !== w.name).join(' | '), countries: [...w.countries].sort().join(','),
    type: 'albufeira', area_km2: round(w.area, 3), tier: w.tier, catalog: catOf.get(w.id) ?? '',
  })
  const labelFeature = (w: W) => ({ type: 'Feature', properties: { ...props(w), kind: 'label' }, geometry: { type: 'Point', coordinates: w.label } })
  const polyFeature = (w: W, polys: Poly[]) => ({
    type: 'Feature', properties: { ...props(w), kind: 'area' },
    geometry: polys.length === 1 ? { type: 'Polygon', coordinates: polys[0] } : { type: 'MultiPolygon', coordinates: polys },
  })

  // Visão geral: simplificação a 120 m (forma reconhecível; o MapLibre simplifica mais por zoom).
  const overview = waters.filter((w) => w.tier <= OVERVIEW_MAX_TIER)
  const ovPolys = (w: W) =>
    w.polys
      .map((p) => [simplifyRing(p[0], 120), ...p.slice(1).filter((h) => ringAreaM2(h) > 50000).map((h) => simplifyRing(h, 120))])
      .map((p) => roundPoly(p, 4))
  writeFileSync(join(dir, 'overview.geojson'), JSON.stringify({ type: 'FeatureCollection', features: [...overview.map((w) => polyFeature(w, ovPolys(w))), ...overview.map(labelFeature)] }))

  const chunks = new Map<string, W[]>()
  for (const w of waters) {
    const key = `c_${Math.floor(w.label[0])}_${Math.floor(w.label[1])}`
    chunks.set(key, [...(chunks.get(key) ?? []), w])
  }
  const chunkIndex = []
  for (const [key, ws] of chunks) {
    const fc = { type: 'FeatureCollection', features: [...ws.map((w) => polyFeature(w, w.polys.map((p) => roundPoly(p, 5)))), ...ws.map(labelFeature)] }
    const json = JSON.stringify(fc)
    writeFileSync(join(dir, `${key}.geojson`), json)
    const bb = ws.reduce((b, w) => [Math.min(b[0], w.bbox[0]), Math.min(b[1], w.bbox[1]), Math.max(b[2], w.bbox[2]), Math.max(b[3], w.bbox[3])], [Infinity, Infinity, -Infinity, -Infinity])
    chunkIndex.push({ key, bbox: bb.map((v) => round(v, 4)), count: ws.length, bytes: json.length })
  }
  const meta = {
    generatedAt: new Date().toISOString().slice(0, 10),
    source: {
      name: 'OpenStreetMap — albufeiras (natural=water + water=reservoir; landuse=reservoir), extração de bquelhas/barragens',
      url: `https://github.com/bquelhas/barragens/tree/${SRC_COMMIT}/data`,
      extractedAt: '2026-11-02', attribution: '© contribuidores do OpenStreetMap', license: 'ODbL 1.0', licenseUrl: 'https://opendatacommons.org/licenses/odbl/1-0/',
      notes: 'Inclui apenas Portugal e Espanha e massas de água ≥ 5 ha marcadas como albufeira no OSM. Contornos simplificados a 20 m na fonte. Contorno de referência: não é o nível atual da água.',
    },
    area: 'Área geodésica no elipsoide WGS84 (GeographicLib), calculada sobre o contorno completo.',
    tiers: AREA_TIERS,
    counts: { total: waters.length, byTier: AREA_TIERS.map((t) => waters.filter((w) => w.tier === t.tier).length), named: waters.filter((w) => w.name).length, overview: overview.length },
    chunks: chunkIndex,
  }
  writeFileSync(join(dir, 'index.json'), JSON.stringify(meta))
  writeFileSync(
    join(dir, 'search.json'),
    JSON.stringify(waters.filter((w) => w.name).map((w) => [w.id, w.name, w.names.filter((n) => n !== w.name).join(' | '), w.bbox.map((v) => round(v, 4)), w.tier, round(w.area, 3), catOf.get(w.id) ?? ''])),
  )
  mkdirSync(join(ROOT, 'src', 'data', 'map'), { recursive: true })
  writeFileSync(join(ROOT, 'src', 'data', 'map', 'catalogWater.json'), JSON.stringify(catalog, null, 1))
  writeFileSync(join(ROOT, 'photos', 'MAPA-CORRESPONDENCIAS.txt'), `Correspondências ficha ↔ albufeira OSM (gerado por npm run map:build)\n\n${report.join('\n')}\n`)

  // ---------- base Natural Earth (recurso, sempre disponível) ----------
  const countries = await cached('ne_10m_admin_0_countries.geojson', `${NE_BASE}/ne_10m_admin_0_countries.geojson`)
  const borders = await cached('ne_10m_admin_0_boundary_lines_land.geojson', `${NE_BASE}/ne_10m_admin_0_boundary_lines_land.geojson`)
  const rivers1 = await cached('ne_10m_rivers_lake_centerlines.geojson', `${NE_BASE}/ne_10m_rivers_lake_centerlines.geojson`)
  const rivers2 = await cached('ne_10m_rivers_europe.geojson', `${NE_BASE}/ne_10m_rivers_europe.geojson`)
  const places = await cached('ne_10m_populated_places_simple.geojson', `${NE_BASE}/ne_10m_populated_places_simple.geojson`)
  const base: unknown[] = []
  const inClip = ([x, y]: Pos) => x >= CLIP[0] && x <= CLIP[2] && y >= CLIP[1] && y <= CLIP[3]
  for (const f of countries.features) {
    const p = f.properties as Record<string, string | number>
    for (const poly of polysOf(f.geometry)) {
      const bb = bboxOf([poly])
      if (bb[2] < CLIP[0] || bb[0] > CLIP[2] || bb[3] < CLIP[1] || bb[1] > CLIP[3]) continue
      const tol = ['PT', 'ES'].includes(String(p.ISO_A2)) ? 150 : 600
      const outer = clipPolygon(simplifyRing(poly[0], tol), CLIP) as Pos[]
      if (outer.length < 4) continue
      if (outer[0][0] !== outer[outer.length - 1][0] || outer[0][1] !== outer[outer.length - 1][1]) outer.push(outer[0])
      base.push({ type: 'Feature', properties: { layer: 'land', iso: p.ISO_A2 }, geometry: { type: 'Polygon', coordinates: [outer.map(([x, y]) => [round(x, 4), round(y, 4)])] } })
    }
    const lx = Number(p.LABEL_X), ly = Number(p.LABEL_Y)
    if (inClip([lx, ly]) && ['PT', 'ES', 'FR', 'MA', 'AD', 'DZ'].includes(String(p.ISO_A2)))
      base.push({ type: 'Feature', properties: { layer: 'country', name: p.NAME_PT || p.NAME, rank: Number(p.LABELRANK) }, geometry: { type: 'Point', coordinates: [round(lx, 3), round(ly, 3)] } })
  }
  const lines = (f: GJFeature): Pos[][] => (f.geometry.type === 'LineString' ? [f.geometry.coordinates as Pos[]] : f.geometry.type === 'MultiLineString' ? (f.geometry.coordinates as Pos[][]) : [])
  for (const f of borders.features)
    for (const l of lines(f))
      for (const part of clipPolyline(l, CLIP) as Pos[][])
        base.push({ type: 'Feature', properties: { layer: 'border' }, geometry: { type: 'LineString', coordinates: part.map(([x, y]) => [round(x, 4), round(y, 4)]) } })
  for (const f of [...rivers1.features, ...rivers2.features]) {
    const p = f.properties as Record<string, number | string>
    for (const l of lines(f))
      for (const part of clipPolyline(l, IBERIA_CLIP) as Pos[][])
        if (part.length > 1) base.push({ type: 'Feature', properties: { layer: 'river', rank: Number(p.scalerank ?? 9), name: p.name ?? '' }, geometry: { type: 'LineString', coordinates: part.map(([x, y]) => [round(x, 4), round(y, 4)]) } })
  }
  for (const f of places.features) {
    const p = f.properties as Record<string, number | string>
    const c = f.geometry.coordinates as Pos
    if (!inClip(c) || Number(p.scalerank) > 8) continue
    const inIberia = c[0] >= IBERIA_CLIP[0] && c[0] <= IBERIA_CLIP[2] && c[1] >= IBERIA_CLIP[1] && c[1] <= IBERIA_CLIP[3]
    if (!inIberia && Number(p.scalerank) > 4) continue
    base.push({ type: 'Feature', properties: { layer: 'place', name: p.name, rank: Number(p.scalerank), capital: Number(p.adm0cap) === 1 ? 1 : 0 }, geometry: { type: 'Point', coordinates: [round(c[0], 4), round(c[1], 4)] } })
  }
  writeFileSync(join(OUT, 'base.geojson'), JSON.stringify({ type: 'FeatureCollection', features: base }))

  const size = (p: string) => `${(readFileSync(p).length / 1024).toFixed(0)} KB`
  console.log(`albufeiras: ${waters.length} | por escalão: ${meta.counts.byTier.join(' / ')} | com nome: ${meta.counts.named}`)
  console.log(`visão geral: ${overview.length} (${size(join(dir, 'overview.geojson'))}) | blocos: ${chunkIndex.length} (maior ${(Math.max(...chunkIndex.map((c) => c.bytes)) / 1024).toFixed(0)} KB)`)
  console.log(`pesquisa: ${size(join(dir, 'search.json'))} | base NE: ${size(join(OUT, 'base.geojson'))}`)
  console.log(`catálogo: ${Object.keys(catalog).length}/${DAMS.length} fichas ligadas a um contorno`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
