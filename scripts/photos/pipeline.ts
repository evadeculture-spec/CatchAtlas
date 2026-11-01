/**
 * Pipeline de fotografias reais das albufeiras (Wikimedia Commons).
 *
 *   npm run photos -- discover [--dam id] [--limit N] [--dry-run]
 *   npm run photos -- derive   [--dam id] [--dry-run]
 *   npm run photos -- publish  [--dry-run]
 *   npm run photos -- audit
 *
 * inventariar → pesquisar → recolher candidatos → (curadoria humana em photos/curation.json)
 * → derivados → publicar aprovados → auditar cobertura.
 *
 * Regras: nada é publicado sem identidade confirmada, direitos aprovados e publicação
 * marcados na curadoria. A curadoria manual nunca é sobrescrita por um novo import.
 */
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { DAMS } from '../../src/data/dams'
import type { Dam } from '../../src/data/types'
import type { DamPhotoLink, PhotoAsset, PhotoCatalog, PhotoObservation, PhotoRole, PhotoVariant } from '../../src/data/photos/types'
import { findDuplicateConflicts, isPublishable } from '../../src/lib/photos/rules'

const ROOT = join(dirname(new URL(import.meta.url).pathname), '..', '..')
const P = {
  candidates: join(ROOT, 'photos', 'candidates.json'),
  curation: join(ROOT, 'photos', 'curation.json'),
  runs: join(ROOT, 'photos', 'runs'),
  cache: join(ROOT, 'photos', '.cache'),
  originals: join(ROOT, 'photos', '.originals'),
  publicDir: join(ROOT, 'public', 'photos'),
  catalog: join(ROOT, 'src', 'data', 'photos', 'catalog.json'),
  coverage: join(ROOT, 'photos', 'coverage.json'),
}
const API = 'https://commons.wikimedia.org/w/api.php'
const ALLOWED_FILE_HOSTS = ['upload.wikimedia.org', 'live.staticflickr.com', 'farm1.staticflickr.com', 'farm2.staticflickr.com', 'farm3.staticflickr.com', 'farm4.staticflickr.com', 'farm5.staticflickr.com', 'farm6.staticflickr.com', 'farm8.staticflickr.com', 'farm9.staticflickr.com', 'farm66.staticflickr.com']
const USER_AGENT = 'CatchAtlasPhotoPipeline/1.0 (https://github.com/evadeculture-spec/CatchAtlas)'
const MAX_BYTES = 60 * 1024 * 1024
const WIDTHS = [640, 1280, 1920]

// ---------- tipos de trabalho ----------

export type SourceId = 'commons' | 'openverse' | 'flickr'

export interface Candidate {
  key: string // `${damId}:${source}:${externalId}`
  source: SourceId
  damId: string
  externalId: string
  assetId: string
  title: string
  sourcePageUrl: string
  originalFileUrl: string
  mime: string
  width: number
  height: number
  sha1: string
  author: string
  authorUrl: string | null
  licenseName: string
  licenseUrl: string | null
  attributionRequired: boolean
  capturedAt: string | null
  location: { lat: number; lon: number } | null
  categories: string[]
  /** Setor/margem só quando a fonte o indica explicitamente; caso contrário null. */
  sector: string | null
  collectedAt: string
  /** Adequação como capa (orientação, foco na água/margem vs. paredão, vista aérea). */
  suitability: { score: number; notes: string[] }
  /** Sugestões automáticas (nunca publicam por si). */
  auto: {
    identity: 'candidato' | 'revisao' | 'rejeitado'
    identityScore: number
    identityEvidence: string[]
    rights: 'compativel' | 'incompativel' | 'desconhecido'
    rightsReason: string
  }
}

interface Decision {
  identity: PhotoAsset['identity']
  identityBasis: string
  identityReviewer: string
  rights: PhotoAsset['rights']
  rightsBasis: string
  publication: PhotoAsset['publication']
  role: PhotoRole
  order?: number
  focal?: DamPhotoLink['focal']
  alt: string
  /** Setor/margem, apenas quando confirmado pela fonte. */
  sector?: string | null
  exportAllowed?: boolean
  observations?: Omit<PhotoObservation, 'id' | 'assetId' | 'assetChecksum'>[]
}

// ---------- utilidades ----------

const args = process.argv.slice(2)
const cmd = args[0]
const flag = (name: string) => args.includes(`--${name}`)
const opt = (name: string) => {
  const i = args.indexOf(`--${name}`)
  return i >= 0 ? args[i + 1] : undefined
}
const DRY = flag('dry-run')

const readJSON = <T,>(p: string, fallback: T): T => (existsSync(p) ? (JSON.parse(readFileSync(p, 'utf8')) as T) : fallback)
const writeJSON = (p: string, v: unknown) => {
  mkdirSync(dirname(p), { recursive: true })
  writeFileSync(p, JSON.stringify(v, null, 2) + '\n')
}
const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
const stripHtml = (s: string) => s.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim()
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
const log = (...m: unknown[]) => console.log('[photos]', ...m)

function haversineKm(a: { lat: number; lon: number }, b: { lat: number; lon: number }) {
  const R = 6371
  const dLat = ((b.lat - a.lat) * Math.PI) / 180
  const dLon = ((b.lon - a.lon) * Math.PI) / 180
  const x = Math.sin(dLat / 2) ** 2 + Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLon / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(x))
}

// ---------- licenças ----------

/** Compatível com uso comercial e derivados (redimensionar/recortar), com atribuição. */
export function evaluateLicense(shortName: string, usageTerms = ''): { rights: Candidate['auto']['rights']; reason: string } {
  const l = norm(`${shortName} ${usageTerms}`)
  if (!l.trim()) return { rights: 'desconhecido', reason: 'Licença não indicada nos metadados' }
  if (/\bnc\b|non-?commercial|\bnd\b|no-?deriv|fair use|all rights reserved/.test(l)) return { rights: 'incompativel', reason: `Licença restritiva: ${shortName}` }
  if (/^gfdl(?!.*cc)/.test(l.trim())) return { rights: 'incompativel', reason: 'GFDL sem licença CC alternativa (exige texto integral)' }
  if (/cc0|public domain|dominio publico|^pd\b|\bpd-/.test(l)) return { rights: 'compativel', reason: `${shortName}: sem restrições de uso` }
  if (/cc by(-sa)? \d|cc-by(-sa)?-\d|cc by(-sa)?$/.test(l)) return { rights: 'compativel', reason: `${shortName}: uso comercial e derivados com atribuição${/sa/.test(l) ? ' e partilha nos mesmos termos' : ''}` }
  return { rights: 'desconhecido', reason: `Licença não reconhecida automaticamente: ${shortName}` }
}

// ---------- identidade ----------

const KIND_WORDS = ['albufeira', 'barragem', 'embalse', 'pantano', 'presa', 'reservoir', 'dam', 'lake', 'lago', 'represa', 'panta', 'embassament']

/** Pontuação automática de correspondência ao local (sugestão; a confirmação é humana). */
export function scoreIdentity(dam: Pick<Dam, 'id' | 'name' | 'approx' | 'river' | 'place'>, c: { title: string; categories: string[]; location: { lat: number; lon: number } | null }, otherDamNames: string[]) {
  const evidence: string[] = []
  let score = 0
  const text = norm(`${c.title} ${c.categories.join(' ')}`)
  const name = norm(dam.name)
  const nameRe = new RegExp(`\\b${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`)
  if (nameRe.test(text)) {
    score += 2
    evidence.push(`Nome "${dam.name}" no título ou categorias`)
    if (KIND_WORDS.some((k) => text.includes(`${k} de ${name}`) || text.includes(`${k} do ${name}`) || text.includes(`${k} da ${name}`) || text.includes(`${name} ${k}`))) {
      score += 2
      evidence.push('Nome associado a "albufeira/barragem/embalse"')
    }
  }
  if (c.location) {
    const km = haversineKm(dam.approx, c.location)
    evidence.push(`Coordenadas da fotografia a ${km.toFixed(1)} km da posição aproximada do registo`)
    if (km <= 8) score += 2
    else if (km <= 20) score += 1
    else score -= 2
  }
  const conflicts = otherDamNames.filter((n) => n !== name && n.length > 3 && new RegExp(`\\b${n}\\b`).test(text))
  if (conflicts.length) {
    score -= 3
    evidence.push(`Possível homónimo ou outra albufeira: ${conflicts.join(', ')}`)
  }
  const identity: Candidate['auto']['identity'] = score >= 4 && !conflicts.length ? 'candidato' : score <= 0 ? 'rejeitado' : 'revisao'
  return { identity, score, evidence }
}

// ---------- descoberta ----------

const P_PROGRESS = join(ROOT, 'photos', 'progress.json')
const P_PENDING = join(ROOT, 'photos', 'pending.json')

/** GET JSON genérico com cache em disco, retries e backoff (respeita Retry-After). */
async function getJSON(url: string, headers: Record<string, string> = {}) {
  const cacheFile = join(P.cache, createHash('sha1').update(url.replace(/api_key=[^&]+/, 'api_key=*')).digest('hex') + '.json')
  if (existsSync(cacheFile) && !flag('no-cache')) return JSON.parse(readFileSync(cacheFile, 'utf8'))
  for (let attempt = 0; attempt < 5; attempt++) {
    const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT, ...headers }, redirect: 'error' })
    if (res.ok) {
      const json = await res.json()
      mkdirSync(P.cache, { recursive: true })
      writeFileSync(cacheFile, JSON.stringify(json))
      await sleep(300)
      return json
    }
    if (res.status === 429 || res.status >= 500) {
      const wait = Number(res.headers.get('retry-after')) * 1000 || 1000 * 2 ** attempt
      await sleep(wait)
      continue
    }
    throw new Error(`HTTP ${res.status}`)
  }
  throw new Error('Fonte indisponível após várias tentativas')
}

function queriesFor(dam: Dam) {
  const kind = dam.country === 'PT' ? ['Albufeira', 'Barragem'] : ['Embalse', 'Pantano']
  return [...kind.map((k) => `${k} de ${dam.name}`), `${dam.name} ${dam.river.replace(/^(Rio|Ribeira|Arroyo) /, '')}`]
}

/** Avalia a adequação como capa: horizontal, água/margem, sem paredão, aérea, ecrã ou texto. */
export function coverSuitability(c: { title: string; categories: string[]; width: number; height: number }) {
  const notes: string[] = []
  let score = 0
  const t = norm(`${c.title} ${c.categories.join(' ')}`)
  const ratio = c.width / Math.max(1, c.height)
  if (ratio >= 1.3) { score += 2; notes.push('Horizontal') } else if (ratio < 1) { score -= 2; notes.push('Vertical (fraca para cabeçalho)') }
  if (c.width >= 1600) { score += 1; notes.push('Resolução adequada') } else if (c.width < 1000) { score -= 2; notes.push('Resolução baixa') }
  if (/margem|orilla|ribera|shore|bank|praia|playa|enseada|cala|arvore|arbol|tree|rocha|roca/.test(t)) { score += 2; notes.push('Indica margem ou elementos naturais') }
  if (/albufeira|embalse|pantano|reservoir|lago|lake/.test(t)) { score += 1; notes.push('Mostra a albufeira') }
  if (/\b(presa|paredao|paredon|muro|dam wall|central|hidroelectrica|hidroeletrica|turbina|comporta|aliviadero|descarregador)\b/.test(t)) { score -= 2; notes.push('Centrada em infraestrutura') }
  if (/aerea|aereo|aerial|drone|satelite|satellite|ortofoto|vista aerea/.test(t)) { score -= 2; notes.push('Vista aérea') }
  if (/screenshot|captura|ecra|pantalla|mapa|map|logo|cartaz|placa|sign/.test(t)) { score -= 4; notes.push('Ecrã, mapa ou texto') }
  return { score, notes }
}

interface Raw {
  source: SourceId
  externalId: string
  title: string
  sourcePageUrl: string
  originalFileUrl: string
  mime: string
  width: number
  height: number
  sha1: string
  author: string
  authorUrl: string | null
  licenseName: string
  licenseUrl: string | null
  usageTerms?: string
  capturedAt: string | null
  location: { lat: number; lon: number } | null
  categories: string[]
  description?: string
}

function fromRaw(dam: Dam, r: Raw, others: string[]): Candidate {
  const lic = evaluateLicense(r.licenseName, r.usageTerms ?? '')
  const id = scoreIdentity(dam, { title: `${r.title} ${r.description ?? ''}`, categories: r.categories, location: r.location }, others)
  return {
    key: `${dam.id}:${r.source}:${r.externalId}`,
    source: r.source,
    damId: dam.id,
    externalId: r.externalId,
    assetId: `${r.source === 'commons' ? 'wmc' : r.source === 'flickr' ? 'flk' : 'ov'}-${r.externalId}`.replace(/[^a-z0-9-]/gi, '').toLowerCase(),
    title: r.title,
    sourcePageUrl: r.sourcePageUrl,
    originalFileUrl: r.originalFileUrl,
    mime: r.mime,
    width: r.width,
    height: r.height,
    sha1: r.sha1,
    author: r.author || 'Autor não indicado',
    authorUrl: r.authorUrl,
    licenseName: r.licenseName,
    licenseUrl: r.licenseUrl,
    attributionRequired: !/cc0|public domain|pdm/i.test(r.licenseName),
    capturedAt: r.capturedAt,
    location: r.location,
    categories: r.categories,
    sector: null,
    collectedAt: new Date().toISOString(),
    suitability: coverSuitability(r),
    auto: { identity: id.identity, identityScore: id.score, identityEvidence: id.evidence, rights: lic.rights, rightsReason: lic.reason },
  }
}

// --- Wikimedia Commons (sem chave) ---
async function commonsQuery(params: Record<string, string>) {
  const url = `${API}?${new URLSearchParams({ format: 'json', formatversion: '2', origin: '*', action: 'query', prop: 'imageinfo|coordinates|categories', iiprop: 'url|size|sha1|mime|extmetadata', iiextmetadatalanguage: 'pt', cllimit: '50', clshow: '!hidden', ...params })}`
  const json = await getJSON(url)
  return (json?.query?.pages ?? []) as Record<string, unknown>[]
}

function commonsRaw(page: Record<string, unknown>): Raw | null {
  const ii = (page.imageinfo as Record<string, unknown>[] | undefined)?.[0]
  if (!ii) return null
  const mime = String(ii.mime ?? '')
  if (!/^image\/(jpeg|png|webp|tiff)$/.test(mime)) return null
  const meta = (ii.extmetadata ?? {}) as Record<string, { value?: string }>
  const v = (k: string) => (meta[k]?.value ? stripHtml(String(meta[k].value)) : '')
  const coords = (page.coordinates as { lat: number; lon: number }[] | undefined)?.[0]
  const captured = v('DateTimeOriginal')
  return {
    source: 'commons',
    externalId: String(page.pageid),
    title: String(page.title ?? ''),
    sourcePageUrl: String(ii.descriptionurl ?? ''),
    originalFileUrl: String(ii.url ?? ''),
    mime,
    width: Number(ii.width),
    height: Number(ii.height),
    sha1: String(ii.sha1 ?? ''),
    author: v('Artist'),
    authorUrl: null,
    licenseName: v('LicenseShortName'),
    licenseUrl: v('LicenseUrl') || null,
    usageTerms: v('UsageTerms'),
    // Apenas DateTimeOriginal (captação), nunca a data de upload.
    capturedAt: /^\d{4}(-\d{2}(-\d{2})?)?/.test(captured) ? captured.slice(0, 10) : null,
    location: coords ? { lat: coords.lat, lon: coords.lon } : null,
    categories: ((page.categories as { title: string }[] | undefined) ?? []).map((c) => c.title.replace(/^Category:/, '')),
    description: v('ImageDescription'),
  }
}

async function searchCommons(dam: Dam): Promise<Raw[]> {
  const pages = new Map<string, Record<string, unknown>>()
  for (const q of queriesFor(dam)) for (const p of await commonsQuery({ generator: 'search', gsrsearch: `${q} filetype:bitmap`, gsrnamespace: '6', gsrlimit: '10' })) pages.set(String(p.pageid), p)
  for (const p of await commonsQuery({ generator: 'geosearch', ggscoord: `${dam.approx.lat}|${dam.approx.lon}`, ggsradius: '10000', ggsnamespace: '6', ggslimit: '20' })) pages.set(String(p.pageid), p)
  return [...pages.values()].map(commonsRaw).filter((r): r is Raw => !!r)
}

// --- Openverse (sem chave; licenças com uso comercial e modificação) ---
async function searchOpenverse(dam: Dam): Promise<Raw[]> {
  const out: Raw[] = []
  for (const q of queriesFor(dam).slice(0, 2)) {
    const url = `https://api.openverse.org/v1/images/?${new URLSearchParams({ q, license_type: 'commercial,modification', page_size: '20', mature: 'false' })}`
    const json = await getJSON(url)
    for (const r of (json?.results ?? []) as Record<string, unknown>[]) {
      const host = (() => { try { return new URL(String(r.url)).hostname } catch { return '' } })()
      if (!ALLOWED_FILE_HOSTS.includes(host)) continue
      out.push({
        source: 'openverse',
        externalId: String(r.id),
        title: String(r.title ?? ''),
        sourcePageUrl: String(r.foreign_landing_url ?? ''),
        originalFileUrl: String(r.url ?? ''),
        mime: 'image/jpeg',
        width: Number(r.width ?? 0),
        height: Number(r.height ?? 0),
        sha1: '',
        author: String(r.creator ?? ''),
        authorUrl: r.creator_url ? String(r.creator_url) : null,
        licenseName: `CC ${String(r.license ?? '').toUpperCase()} ${String(r.license_version ?? '')}`.replace('CC CC0', 'CC0').replace('CC PDM', 'Public domain').trim(),
        licenseUrl: r.license_url ? String(r.license_url) : null,
        capturedAt: null,
        location: null,
        categories: ((r.tags as { name: string }[] | undefined) ?? []).map((t) => t.name),
      })
    }
  }
  return out
}

// --- Flickr (exige FLICKR_API_KEY; só licenças com uso comercial e derivados) ---
const FLICKR_LICENSES: Record<string, { name: string; url: string }> = {
  '4': { name: 'CC BY 2.0', url: 'https://creativecommons.org/licenses/by/2.0/' },
  '5': { name: 'CC BY-SA 2.0', url: 'https://creativecommons.org/licenses/by-sa/2.0/' },
  '7': { name: 'Public domain (no known copyright restrictions)', url: 'https://www.flickr.com/commons/usage/' },
  '9': { name: 'CC0', url: 'https://creativecommons.org/publicdomain/zero/1.0/' },
  '10': { name: 'Public domain mark', url: 'https://creativecommons.org/publicdomain/mark/1.0/' },
}
async function searchFlickr(dam: Dam): Promise<Raw[]> {
  const key = process.env.FLICKR_API_KEY
  if (!key) throw new Error('FLICKR_API_KEY não definida (fonte ignorada)')
  const out: Raw[] = []
  const base = { method: 'flickr.photos.search', api_key: key, format: 'json', nojsoncallback: '1', license: Object.keys(FLICKR_LICENSES).join(','), content_types: '0', media: 'photos', extras: 'license,owner_name,geo,date_taken,url_o,o_dims,url_l,description,tags', per_page: '30' }
  const reqs = [
    { ...base, text: queriesFor(dam)[0] },
    { ...base, lat: String(dam.approx.lat), lon: String(dam.approx.lon), radius: '8', radius_units: 'km', text: dam.country === 'PT' ? 'albufeira' : 'embalse' },
  ]
  for (const params of reqs) {
    const json = await getJSON(`https://api.flickr.com/services/rest/?${new URLSearchParams(params)}`)
    for (const p of (json?.photos?.photo ?? []) as Record<string, string>[]) {
      const lic = FLICKR_LICENSES[p.license]
      const fileUrl = p.url_o || p.url_l
      if (!lic || !fileUrl) continue
      out.push({
        source: 'flickr',
        externalId: p.id,
        title: p.title,
        sourcePageUrl: `https://www.flickr.com/photos/${p.owner}/${p.id}`,
        originalFileUrl: fileUrl,
        mime: 'image/jpeg',
        width: Number(p.width_o || p.width_l || 0),
        height: Number(p.height_o || p.height_l || 0),
        sha1: '',
        author: p.ownername,
        authorUrl: `https://www.flickr.com/people/${p.owner}`,
        licenseName: lic.name,
        licenseUrl: lic.url,
        capturedAt: p.datetaken && p.datetakenunknown !== '1' ? p.datetaken.slice(0, 10) : null,
        location: Number(p.latitude) ? { lat: Number(p.latitude), lon: Number(p.longitude) } : null,
        categories: (p.tags ?? '').split(' ').filter(Boolean),
        description: typeof p.description === 'object' ? '' : String(p.description ?? ''),
      })
    }
  }
  return out
}

const SOURCES: Record<SourceId, (dam: Dam) => Promise<Raw[]>> = { commons: searchCommons, openverse: searchOpenverse, flickr: searchFlickr }

interface Progress {
  updatedAt: string
  /** damId → fonte → 'ok' | mensagem de erro */
  status: Record<string, Partial<Record<SourceId, string>>>
}

async function discover() {
  const sources = (opt('sources') ?? 'commons,openverse,flickr').split(',') as SourceId[]
  const run = { kind: 'discover', startedAt: new Date().toISOString(), dryRun: DRY, sources, dams: 0, skipped: 0, found: 0, added: 0, errors: [] as string[] }
  const store = readJSON<{ candidates: Candidate[] }>(P.candidates, { candidates: [] })
  const progress = readJSON<Progress>(P_PROGRESS, { updatedAt: '', status: {} })
  const known = new Set(store.candidates.map((c) => c.key))
  const only = opt('dam')
  const limit = Number(opt('limit') ?? Infinity)
  const maxPerDam = Number(opt('max-per-dam') ?? 15)
  const resume = flag('resume')
  const targets = DAMS.filter((d) => !only || d.id === only).slice(0, limit)
  const names = DAMS.map((d) => norm(d.name))
  for (const dam of targets) {
    run.dams++
    const st = (progress.status[dam.id] ??= {})
    const todo = sources.filter((s) => !(resume && st[s] === 'ok'))
    if (!todo.length) { run.skipped++; continue }
    const raws: Raw[] = []
    for (const s of todo) {
      try {
        raws.push(...(await SOURCES[s](dam)))
        st[s] = 'ok'
      } catch (e) {
        const c = (e as Error & { cause?: { code?: string; message?: string } }).cause
        const cause = c?.code ?? c?.message
        st[s] = `${(e as Error).message}${cause ? ` (${cause})` : ''}`
        run.errors.push(`${dam.id}/${s}: ${st[s]}`)
      }
    }
    const cands = raws
      .map((r) => fromRaw(dam, r, names))
      .filter((c) => c.auto.identity !== 'rejeitado' && c.auto.rights !== 'incompativel')
      .sort((a, b) => b.auto.identityScore + b.suitability.score - (a.auto.identityScore + a.suitability.score))
      .slice(0, maxPerDam)
    run.found += cands.length
    for (const c of cands) if (!known.has(c.key)) { store.candidates.push(c); known.add(c.key); run.added++ }
    log(`${dam.name}: ${cands.length} candidatos${Object.values(st).some((v) => v !== 'ok') ? ' (com fontes em falha)' : ''}`)
    progress.updatedAt = new Date().toISOString()
    if (!DRY) { writeJSON(P.candidates, store); writeJSON(P_PROGRESS, progress) } // grava a cada barragem: permite retomar
  }
  writePending(store.candidates, progress)
  writeRun({ ...run, finishedAt: new Date().toISOString() })
}

/** Lista de barragens sem fotografia publicada, com o motivo. */
function writePending(candidates: Candidate[], progress: Progress) {
  const catalog = readJSON<PhotoCatalog>(P.catalog, { generatedAt: null, assets: [], links: [], observations: [], adjacentPairs: [] })
  const curation = readJSON<{ decisions: Record<string, Decision> }>(P.curation, { decisions: {} })
  const covered = new Set(catalog.links.filter((l) => l.role === 'capa').map((l) => l.damId))
  const pending = DAMS.filter((d) => !covered.has(d.id)).map((d) => {
    const cands = candidates.filter((c) => c.damId === d.id)
    const st = progress.status[d.id] ?? {}
    const failures = Object.entries(st).filter(([, v]) => v !== 'ok').map(([k, v]) => `${k}: ${v}`)
    let reason: string
    if (!Object.keys(st).length) reason = 'Ainda não processada'
    else if (cands.length === 0 && failures.length === Object.keys(st).length) reason = `Fontes inacessíveis — ${failures.join('; ')}`
    else if (cands.length === 0) reason = `Sem candidatos com licença compatível e local plausível${failures.length ? ` (falhas: ${failures.join('; ')})` : ''}`
    else if (cands.every((c) => !curation.decisions[c.key])) reason = `${cands.length} candidatos à espera de revisão humana`
    else reason = 'Candidatos revistos sem capa aprovada'
    return { damId: d.id, name: d.name, country: d.country, reason }
  })
  writeJSON(P_PENDING, { updatedAt: new Date().toISOString(), total: DAMS.length, pending })
}

// ---------- derivados ----------

/** Descarrega só de anfitriões permitidos (Commons, Flickr), sem seguir redirecionamentos, com limite de tamanho. */
async function safeDownload(url: string): Promise<Buffer> {
  const u = new URL(url)
  if (u.protocol !== 'https:' || !ALLOWED_FILE_HOSTS.includes(u.hostname)) throw new Error(`Origem não permitida: ${u.hostname}`)
  const res = await fetch(u, { headers: { 'User-Agent': USER_AGENT }, redirect: 'manual' })
  if (res.status >= 300 && res.status < 400) throw new Error('Redirecionamento recusado')
  if (!res.ok) throw new Error(`Download falhou: ${res.status}`)
  const len = Number(res.headers.get('content-length') ?? 0)
  if (len > MAX_BYTES) throw new Error('Ficheiro demasiado grande')
  const buf = Buffer.from(await res.arrayBuffer())
  if (buf.length > MAX_BYTES) throw new Error('Ficheiro demasiado grande')
  return buf
}

async function derive() {
  const sharp = (await import('sharp')).default
  const { candidates } = readJSON<{ candidates: Candidate[] }>(P.candidates, { candidates: [] })
  const curation = readJSON<{ decisions: Record<string, Decision> }>(P.curation, { decisions: {} })
  const run = { kind: 'derive', startedAt: new Date().toISOString(), dryRun: DRY, processed: 0, skipped: 0, errors: [] as string[] }
  for (const c of candidates) {
    const d = curation.decisions[c.key]
    if (!d || d.identity !== 'confirmado' || d.rights !== 'aprovado' || (opt('dam') && c.damId !== opt('dam'))) { run.skipped++; continue }
    const outDir = join(P.publicDir, c.damId)
    if (WIDTHS.every((w) => w > c.width || existsSync(join(outDir, `${c.assetId}-${w}.webp`)))) { run.skipped++; continue }
    try {
      const origPath = join(P.originals, `${c.assetId}`)
      let buf: Buffer
      if (existsSync(origPath)) buf = readFileSync(origPath)
      else {
        buf = await safeDownload(c.originalFileUrl)
        mkdirSync(P.originals, { recursive: true })
        writeFileSync(origPath, buf)
      }
      const sha1 = createHash('sha1').update(buf).digest('hex')
      if (c.sha1 && sha1 !== c.sha1) throw new Error('Checksum diferente do indicado pela fonte')
      c.sha1 = sha1 // fontes sem checksum (Flickr, Openverse): fica o do ficheiro descarregado
      const meta = await sharp(buf).metadata()
      if (!meta.format || !['jpeg', 'png', 'webp', 'tiff'].includes(meta.format)) throw new Error(`Formato real não suportado: ${meta.format}`)
      if (!DRY) {
        mkdirSync(outDir, { recursive: true })
        for (const w of WIDTHS.filter((x) => x <= (meta.width ?? 0)).concat((meta.width ?? 0) < WIDTHS[0] ? [meta.width ?? 0] : [])) {
          // rotate() aplica a orientação EXIF; sharp não copia metadados (EXIF/GPS removidos).
          const base = sharp(buf).rotate().resize({ width: w, withoutEnlargement: true })
          await base.clone().webp({ quality: 78 }).toFile(join(outDir, `${c.assetId}-${w}.webp`))
          await base.clone().jpeg({ quality: 80, mozjpeg: true }).toFile(join(outDir, `${c.assetId}-${w}.jpg`))
        }
      }
      run.processed++
      log(`Derivados: ${c.title}`)
    } catch (e) {
      run.errors.push(`${c.key}: ${(e as Error).message}`)
    }
  }
  if (!DRY) writeJSON(P.candidates, { candidates })
  writeRun({ ...run, finishedAt: new Date().toISOString() })
}

// ---------- publicação ----------

function variantsFor(c: Candidate): PhotoVariant[] {
  const out: PhotoVariant[] = []
  for (const w of [...WIDTHS, c.width]) {
    for (const [ext, format] of [['webp', 'webp'], ['jpg', 'jpeg']] as const) {
      const file = join(P.publicDir, c.damId, `${c.assetId}-${w}.${ext}`)
      if (existsSync(file) && !out.some((v) => v.width === w && v.format === format)) {
        out.push({ width: w, height: Math.round((c.height / c.width) * w), format, src: `/photos/${c.damId}/${c.assetId}-${w}.${ext}` })
      }
    }
  }
  return out
}

async function publish() {
  const { candidates } = readJSON<{ candidates: Candidate[] }>(P.candidates, { candidates: [] })
  const curation = readJSON<{ decisions: Record<string, Decision> }>(P.curation, { decisions: {} })
  const previous = readJSON<PhotoCatalog>(P.catalog, { generatedAt: null, assets: [], links: [], observations: [], adjacentPairs: [] })
  const catalog: PhotoCatalog = { generatedAt: new Date().toISOString(), assets: [], links: [], observations: [], adjacentPairs: previous.adjacentPairs }
  for (const c of candidates) {
    const d = curation.decisions[c.key]
    if (!d || !c.sha1) continue
    const asset: PhotoAsset = {
      id: c.assetId,
      provider: c.source === 'commons' ? 'wikimedia-commons' : c.source,
      externalId: c.externalId,
      title: c.title,
      sourcePageUrl: c.sourcePageUrl,
      originalFileUrl: c.originalFileUrl,
      author: c.author,
      authorUrl: c.authorUrl,
      license: { name: c.licenseName, url: c.licenseUrl, requiresAttribution: c.attributionRequired, shareAlike: /sa/i.test(c.licenseName), commercialUse: true, derivatives: true },
      attribution: `${c.author}, ${c.licenseName}, via ${c.source === 'commons' ? 'Wikimedia Commons' : c.source === 'flickr' ? 'Flickr' : 'Openverse'}`,
      changes: 'Redimensionada e convertida para WebP/JPEG; metadados EXIF/GPS removidos; sem outras alterações.',
      width: c.width,
      height: c.height,
      capturedAt: c.capturedAt,
      collectedAt: c.collectedAt,
      checksumSha1: c.sha1,
      location: c.location,
      locationEvidence: c.auto.identityEvidence,
      identity: d.identity,
      identityBasis: d.identityBasis,
      identityMethod: d.identityReviewer ? 'humana' : 'automatica',
      identityReviewer: d.identityReviewer || null,
      rights: d.rights,
      rightsBasis: d.rightsBasis,
      publication: d.publication,
      exportAllowed: d.exportAllowed ?? true,
      variants: variantsFor(c),
      alt: d.alt,
    }
    if (!isPublishable(asset)) continue
    if (!catalog.assets.some((a) => a.id === asset.id)) catalog.assets.push(asset)
    catalog.links.push({ assetId: asset.id, damId: c.damId, role: d.role, order: d.order ?? 0, basis: d.identityBasis, sector: d.sector ?? c.sector ?? null, focal: d.focal ?? { mobile: { x: 0.5, y: 0.55 }, desktop: { x: 0.5, y: 0.5 } } })
    for (const [i, o] of (d.observations ?? []).entries()) catalog.observations.push({ ...o, id: `${asset.id}-o${i}`, assetId: asset.id, assetChecksum: asset.checksumSha1 })
  }
  const conflicts = findDuplicateConflicts(catalog)
  if (conflicts.length) {
    log('Publicação interrompida: a mesma imagem está ligada a albufeiras incompatíveis', conflicts)
    process.exitCode = 1
    return
  }
  if (!DRY) writeJSON(P.catalog, catalog)
  log(`Publicados: ${catalog.assets.length} fotografias, ${catalog.links.length} ligações`)
  writeRun({ kind: 'publish', dryRun: DRY, assets: catalog.assets.length, links: catalog.links.length, finishedAt: new Date().toISOString() })
}

// ---------- auditoria ----------

function audit() {
  const catalog = readJSON<PhotoCatalog>(P.catalog, { generatedAt: null, assets: [], links: [], observations: [], adjacentPairs: [] })
  const { candidates } = readJSON<{ candidates: Candidate[] }>(P.candidates, { candidates: [] })
  const curation = readJSON<{ decisions: Record<string, Decision> }>(P.curation, { decisions: {} })
  const covers = new Set(catalog.links.filter((l) => l.role === 'capa').map((l) => l.damId))
  const withCandidates = new Set(candidates.map((c) => c.damId))
  const pendingIdentity = candidates.filter((c) => !curation.decisions[c.key] || curation.decisions[c.key].identity !== 'confirmado').length
  const pendingRights = candidates.filter((c) => !curation.decisions[c.key] || curation.decisions[c.key].rights === 'por-verificar').length
  const report = {
    auditedAt: new Date().toISOString(),
    totalDams: DAMS.length,
    byCountry: { PT: DAMS.filter((d) => d.country === 'PT').length, ES: DAMS.filter((d) => d.country === 'ES').length },
    approvedCovers: covers.size,
    damsWithCandidates: withCandidates.size,
    candidates: candidates.length,
    candidatesPendingIdentity: pendingIdentity,
    candidatesPendingRights: pendingRights,
    damsWithoutPhoto: DAMS.filter((d) => !covers.has(d.id)).map((d) => d.id),
    duplicateConflicts: findDuplicateConflicts(catalog),
  }
  writeJSON(P.coverage, report)
  log(`Barragens: ${report.totalDams} · capas aprovadas: ${report.approvedCovers} · com candidatos: ${report.damsWithCandidates} · sem fotografia: ${report.damsWithoutPhoto.length}`)
}

function writeRun(r: Record<string, unknown>) {
  const file = join(P.runs, `${new Date().toISOString().replace(/[:.]/g, '-')}-${r.kind}.json`)
  writeJSON(file, r)
}

function pending() {
  writePending(readJSON<{ candidates: Candidate[] }>(P.candidates, { candidates: [] }).candidates, readJSON<Progress>(P_PROGRESS, { updatedAt: '', status: {} }))
  log('pending.json atualizado')
}

const commands: Record<string, () => unknown> = { discover, derive, publish, audit, pending }
if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith('pipeline.ts')) {
  if (!commands[cmd]) {
    console.log('Uso: npm run photos -- <discover|derive|publish|audit> [--dam id] [--limit N] [--dry-run]')
    process.exitCode = 1
  } else {
    Promise.resolve(commands[cmd]()).catch((e) => {
      console.error('[photos] erro:', (e as Error).message)
      process.exitCode = 1
    })
  }
}
