import raw from '../../data/photos/catalog.json'
import unsplash from '../../data/photos/unsplash.json'
import type { PhotoCatalog } from '../../data/photos/types'
import { mergeCatalogs } from './rules'

/** Catálogo de fotografias: pipeline (scripts/photos) + seleção Unsplash (local, região ou ilustrativa, sempre rotulada). */
export const PHOTO_CATALOG = mergeCatalogs(raw as unknown as PhotoCatalog, unsplash as unknown as PhotoCatalog)
