import raw from '../../data/photos/catalog.json'
import type { PhotoCatalog } from '../../data/photos/types'

/** Catálogo de fotografias gerado pelo pipeline (scripts/photos). */
export const PHOTO_CATALOG = raw as unknown as PhotoCatalog
