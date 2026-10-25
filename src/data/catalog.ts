import type { ModalityId, RegionId, Species, SpeciesId } from './types'

export const SPECIES: Species[] = [
  { id: 'achiga', name: 'Achigã', short: 'Achigã', color: '#20BFA9', kind: 'predador' },
  { id: 'carpa', name: 'Carpa', short: 'Carpa', color: '#F2B544', kind: 'ciprinideo' },
  { id: 'lucio', name: 'Lúcio', short: 'Lúcio', color: '#3E7CB1', kind: 'predador' },
  { id: 'lucioperca', name: 'Lucioperca', short: 'Lucioperca', color: '#8C6BB8', kind: 'predador' },
  { id: 'barbo', name: 'Barbo', short: 'Barbo', color: '#C9774A', kind: 'ciprinideo' },
  { id: 'siluro', name: 'Siluro', short: 'Siluro', color: '#5B6B73', kind: 'predador' },
]

export const speciesById = Object.fromEntries(SPECIES.map((s) => [s.id, s])) as Record<SpeciesId, Species>

export const MODALITIES: { id: ModalityId; name: string; hint: string }[] = [
  { id: 'margem', name: 'Margem', hint: 'A pé, a partir da orla' },
  { id: 'caiaque', name: 'Caiaque / pato', hint: 'Embarcação ligeira ou float tube' },
  { id: 'embarcacao', name: 'Embarcação', hint: 'Barco a motor ou elétrico' },
]

export const modalityName = (id: ModalityId) => MODALITIES.find((m) => m.id === id)?.name ?? id

export const REGIONS: { id: RegionId; name: string }[] = [
  { id: 'norte', name: 'Norte' },
  { id: 'centro', name: 'Centro' },
  { id: 'lisboa', name: 'Lisboa e Vale do Tejo' },
  { id: 'alentejo', name: 'Alentejo' },
  { id: 'algarve', name: 'Algarve' },
]

export const regionName = (id: RegionId) => REGIONS.find((r) => r.id === id)?.name ?? id

export const TECHNIQUES = [
  'Spinning',
  'Vinil texano',
  'Drop shot',
  'Jig',
  'Superfície (topwater)',
  'Crankbait',
  'Fundo / feeder',
  'Carpfishing',
  'Boia',
  'Vertical',
]
