export type SpeciesId = 'achiga' | 'carpa' | 'lucio' | 'lucioperca' | 'barbo' | 'siluro'
export type ModalityId = 'margem' | 'caiaque' | 'embarcacao'
export type RegionId = 'norte' | 'centro' | 'lisboa' | 'alentejo' | 'algarve'

export interface Species {
  id: SpeciesId
  name: string
  short: string
  /** Cor de identificação nos gráficos. */
  color: string
  kind: 'predador' | 'ciprinideo'
}

export interface Dam {
  id: string
  name: string
  region: RegionId
  /** Localidade/concelho de referência (informação geral). */
  place: string
  river: string
  /** Posição aproximada usada APENAS no mapa esquemático. */
  approx: { lat: number; lon: number }
  /** Espécies de exemplo — não verificadas. */
  species: SpeciesId[]
  modalities: ModalityId[]
  summary: string
  traits: { label: string; value: string }[]
  art: ArtPalette
}

export interface ArtPalette {
  seed: number
  sky: [string, string]
  hills: string[]
  water: [string, string]
  sun?: 'low' | 'high' | 'none'
  mist?: boolean
  trees?: boolean
}

export interface Angler {
  id: string
  name: string
  region: RegionId
  color: string
  isDemoUser?: boolean
}

export interface Catch {
  id: string
  anglerId: string
  damId: string
  speciesId: SpeciesId
  weightG: number
  lengthCm?: number
  /** Data local AAAA-MM-DD. */
  date: string
  technique: string
  lure: string
  notes: string
  released: boolean
  visibility: 'publica' | 'privada'
  ranking: boolean
  hasPhoto: boolean
  createdAt: number
  /** Captura inicial da demonstração (datas acompanham a data de referência). */
  seeded?: boolean
}

export interface DemoEvent {
  id: string
  title: string
  damId: string
  modality: ModalityId
  /** Desvio em dias face à data de referência da demonstração. */
  dayOffset: number
  startTime: string
  organizer: string
  format: string
  description: string
  schedule: { time: string; label: string }[]
  results?: { name: string; weightG: number; catches: number; biggestG: number }[]
  speciesFocus: SpeciesId[]
}

export interface Trip {
  id: string
  damId: string
  date: string
  speciesId: SpeciesId
  modality: ModalityId
  createdAt: number
  checked: string[]
}

export interface Profile {
  name: string
  region: RegionId
  species: SpeciesId[]
  modalities: ModalityId[]
  avatarColor: string
}
