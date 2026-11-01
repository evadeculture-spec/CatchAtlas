import type { DamPhotoLink, PhotoAsset, PhotoCatalog, PhotoObservation, PhotoRole } from '../../data/photos/types'

/** Só é publicável com identidade confirmada, direitos aprovados e estado publicado. */
export const isPublishable = (a: PhotoAsset) =>
  a.identity === 'confirmado' && a.rights === 'aprovado' && a.publication === 'publicado' && a.variants.length > 0

/** Variantes servidas a partir do próprio projeto ou do CDN do Unsplash (hotlink exigido pelas regras do Unsplash). */
export const isSafeVariantSrc = (src: string) =>
  /^\/photos\/[a-z0-9-]+\/[a-z0-9._-]+\.(webp|jpe?g)$/i.test(src) || /^https:\/\/images\.unsplash\.com\/photo-[a-z0-9-]+\?[a-z0-9=&%._-]+$/i.test(src)

export type Representation = NonNullable<DamPhotoLink['representation']>
export const representationOf = (l: DamPhotoLink): Representation => l.representation ?? 'local'

/** Publicável: direitos aprovados e publicado; identidade confirmada exigida quando se apresenta como sendo do local. */
export const isPublishableLink = (a: PhotoAsset, l: DamPhotoLink) =>
  representationOf(l) === 'local' ? isPublishable(a) : a.rights === 'aprovado' && a.publication === 'publicado' && a.variants.length > 0 && a.identity !== 'rejeitado'

const REP_RANK: Record<Representation, number> = { local: 0, regiao: 1, ilustrativa: 2 }

/** Rótulo obrigatório para imagens que não são comprovadamente desta albufeira. */
export const REPRESENTATION_LABEL: Record<Representation, string | null> = {
  local: null,
  regiao: 'Imagem da região · local exato não confirmado',
  ilustrativa: 'Imagem ilustrativa · não é desta barragem',
}

export interface DamPhoto {
  asset: PhotoAsset
  link: DamPhotoLink
}

export function photosForDam(catalog: PhotoCatalog, damId: string): DamPhoto[] {
  const byId = new Map(catalog.assets.map((a) => [a.id, a]))
  return catalog.links
    .filter((l) => l.damId === damId)
    .map((l) => ({ link: l, asset: byId.get(l.assetId) }))
    .filter((p): p is DamPhoto => !!p.asset && isPublishableLink(p.asset, p.link) && p.asset.variants.every((v) => isSafeVariantSrc(v.src)))
    .sort(
      (a, b) =>
        REP_RANK[representationOf(a.link)] - REP_RANK[representationOf(b.link)] ||
        Number(b.link.role === 'capa') - Number(a.link.role === 'capa') ||
        a.link.order - b.link.order,
    )
}

/** Capa: a melhor fotografia disponível (local > região > ilustrativa). */
export const coverForDam = (catalog: PhotoCatalog, damId: string): DamPhoto | null => {
  const all = photosForDam(catalog, damId)
  return all.find((p) => p.link.role === 'capa') ?? all[0] ?? null
}

/** Junta catálogos (ex.: pipeline + Unsplash) sem duplicar ids. */
export function mergeCatalogs(...cats: PhotoCatalog[]): PhotoCatalog {
  const ids = new Set<string>()
  const assets = cats.flatMap((c) => c.assets).filter((a) => !ids.has(a.id) && !!ids.add(a.id))
  return {
    generatedAt: cats.map((c) => c.generatedAt).filter(Boolean).sort().at(-1) ?? null,
    assets,
    links: cats.flatMap((c) => c.links),
    observations: cats.flatMap((c) => c.observations),
    adjacentPairs: cats.flatMap((c) => c.adjacentPairs),
  }
}

/** Observações aprovadas e ligadas à fotografia exata (mesmo id e mesmo checksum). */
export function observationsFor(catalog: PhotoCatalog, asset: PhotoAsset, layer?: PhotoObservation['layer']): PhotoObservation[] {
  return catalog.observations.filter(
    (o) => o.assetId === asset.id && o.assetChecksum === asset.checksumSha1 && o.review === 'aprovada' && (!layer || o.layer === layer),
  )
}

export interface DuplicateConflict {
  checksum: string
  assetIds: string[]
  damIds: string[]
}

/** Assinala a mesma imagem (checksum) ligada a albufeiras não declaradas como adjacentes. */
export function findDuplicateConflicts(catalog: PhotoCatalog): DuplicateConflict[] {
  const adj = new Set(catalog.adjacentPairs.flatMap(([a, b]) => [`${a}|${b}`, `${b}|${a}`]))
  const byChecksum = new Map<string, PhotoAsset[]>()
  for (const a of catalog.assets) byChecksum.set(a.checksumSha1, [...(byChecksum.get(a.checksumSha1) ?? []), a])
  const out: DuplicateConflict[] = []
  for (const [checksum, assets] of byChecksum) {
    const ids = new Set(assets.map((a) => a.id))
    const dams = [...new Set(catalog.links.filter((l) => ids.has(l.assetId)).map((l) => l.damId))]
    const incompatible = dams.some((a, i) => dams.slice(i + 1).some((b) => !adj.has(`${a}|${b}`)))
    if (dams.length > 1 && incompatible) out.push({ checksum, assetIds: [...ids], damIds: dams })
  }
  return out
}

export const ROLE_LABEL: Record<PhotoRole, string> = {
  capa: 'Capa',
  margens: 'Margens',
  estruturas: 'Estruturas',
  aerea: 'Vista aérea',
  complementar: 'Complementar',
}

export const shortCredit = (a: PhotoAsset) => (a.provider === 'unsplash' ? `${a.author} · Unsplash` : `${a.author} · ${a.license.name}`)

export const capturedLabel = (a: PhotoAsset) =>
  a.capturedAt ? `Captada em ${a.capturedAt}` : 'Data de captação não documentada na fonte'

/** O que nunca se deduz de uma fotografia isolada (mostrado como limite explícito). */
export const NOT_INFERABLE = [
  'Profundidade e batimetria',
  'Temperatura e oxigénio da água',
  'Espécies presentes e atividade do peixe',
  'Qualidade da água e turbidez medida',
  'Acesso autorizado, navegação ou segurança',
  'Nível atual da albufeira',
]
