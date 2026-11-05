import type { ExpressionSpecification, LayerSpecification, StyleSpecification } from 'maplibre-gl'
import type { Tier } from './waterConfig'

/** Cores do mapa (identidade CatchAtlas: terra clara, água azul, seleção na cor de marca). */
export const MAP_COLORS = {
  sea: '#cfe2ea',
  land: '#f3f1ea',
  wood: '#e2e9d8',
  water: '#4b9cc3',
  waterCatalog: '#3a8bb4',
  waterOutline: '#2a6f93',
  river: '#8ec0d8',
  border: '#a9a397',
  region: '#cfc9bd',
  road: '#ded5c6',
  roadMajor: '#d3c7b3',
  label: '#3f4b52',
  waterLabel: '#1f5f80',
  brand: '#20bfa9',
  ink: '#102b3a',
}

/** Mapa base vetorial (OpenStreetMap, esquema OpenMapTiles) servido pelo OpenFreeMap: gratuito, sem chave. */
export const BASEMAP_TILEJSON = 'https://tiles.openfreemap.org/planet'
const OMT_ATTRIBUTION =
  '<a href="https://openfreemap.org" target="_blank" rel="noopener">OpenFreeMap</a> <a href="https://www.openmaptiles.org/" target="_blank" rel="noopener">© OpenMapTiles</a> Dados <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">© contribuidores do OpenStreetMap</a>'
const WATER_ATTRIBUTION =
  'Albufeiras: <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">© contribuidores do OpenStreetMap</a> (ODbL), extração <a href="https://github.com/bquelhas/barragens" target="_blank" rel="noopener">bquelhas/barragens</a>'

export const TIERS: Tier[] = [1, 2, 3, 4, 5]
export const OVERVIEW_TIERS: Tier[] = [1, 2]
const nameLatin: ExpressionSpecification = ['coalesce', ['get', 'name:pt'], ['get', 'name:latin'], ['get', 'name']]
const LABEL_SIZE: Record<Tier, number> = { 1: 13, 2: 12.5, 3: 12, 4: 11.5, 5: 11 }

export const layerIds = {
  fill: (src: 'ov' | 'dt', t: Tier) => `water-${src}-fill-${t}`,
  label: (src: 'ov' | 'dt', t: Tier) => `water-${src}-label-${t}`,
}

/**
 * Estilo do mapa. Os limiares de zoom por escalão são aplicados depois, em função do
 * enquadramento real da Península (ver applyZoomPolicy no componente).
 */
export function buildStyle(origin: string): StyleSpecification {
  const waterFill = (src: 'ov' | 'dt', t: Tier): LayerSpecification => ({
    id: layerIds.fill(src, t),
    type: 'fill',
    source: src === 'ov' ? 'water-overview' : 'water-detail',
    filter: ['all', ['==', ['get', 'kind'], 'area'], ['==', ['get', 'tier'], t]],
    paint: {
      'fill-color': ['case', ['!=', ['get', 'catalog'], ''], MAP_COLORS.waterCatalog, MAP_COLORS.water],
      'fill-outline-color': ['case', ['!=', ['get', 'catalog'], ''], MAP_COLORS.waterOutline, MAP_COLORS.water],
      'fill-antialias': true,
    },
  })
  const waterLabel = (src: 'ov' | 'dt', t: Tier): LayerSpecification => ({
    id: layerIds.label(src, t),
    type: 'symbol',
    source: src === 'ov' ? 'water-overview' : 'water-detail',
    filter: ['all', ['==', ['get', 'kind'], 'label'], ['==', ['get', 'tier'], t], ['!=', ['get', 'short'], '']],
    layout: {
      'text-field': ['get', 'short'],
      'text-font': ['Noto Sans Italic'],
      'text-size': LABEL_SIZE[t],
      'text-max-width': 8,
      'symbol-sort-key': ['-', 0, ['get', 'area_km2']],
      'text-padding': 4,
      'text-optional': true,
    },
    paint: { 'text-color': MAP_COLORS.waterLabel, 'text-halo-color': 'rgba(255,255,255,0.92)', 'text-halo-width': 1.4, 'text-halo-blur': 0.4 },
  })

  return {
    version: 8,
    glyphs: `${origin}/map/fonts/{fontstack}/{range}.pbf`,
    sources: {
      base: { type: 'geojson', data: `${origin}/map/base.geojson`, attribution: '<a href="https://www.naturalearthdata.com/" target="_blank" rel="noopener">Natural Earth</a>', tolerance: 0.6 },
      omt: { type: 'vector', url: BASEMAP_TILEJSON, attribution: OMT_ATTRIBUTION },
      'water-overview': { type: 'geojson', data: { type: 'FeatureCollection', features: [] }, attribution: WATER_ATTRIBUTION, maxzoom: 11, promoteId: 'id' },
      'water-detail': { type: 'geojson', data: { type: 'FeatureCollection', features: [] }, attribution: WATER_ATTRIBUTION, maxzoom: 14, promoteId: 'id' },
      dams: { type: 'geojson', data: { type: 'FeatureCollection', features: [] } },
    },
    layers: [
      { id: 'bg', type: 'background', paint: { 'background-color': MAP_COLORS.sea } },
      { id: 'ne-land', type: 'fill', source: 'base', filter: ['==', ['get', 'layer'], 'land'], paint: { 'fill-color': MAP_COLORS.land } },
      { id: 'omt-wood', type: 'fill', source: 'omt', 'source-layer': 'landcover', filter: ['==', ['get', 'class'], 'wood'], minzoom: 7, paint: { 'fill-color': MAP_COLORS.wood, 'fill-opacity': ['interpolate', ['linear'], ['zoom'], 7, 0, 8, 0.7] } },
      // Oceano do mapa base: refina a linha de costa a qualquer escala.
      { id: 'omt-ocean', type: 'fill', source: 'omt', 'source-layer': 'water', filter: ['==', ['get', 'class'], 'ocean'], paint: { 'fill-color': MAP_COLORS.sea } },
      // Restante água do mapa base (lagos, lagoas, albufeiras < 5 ha): só à escala local (ver BASEMAP_WATER_OFFSET).
      { id: 'omt-water', type: 'fill', source: 'omt', 'source-layer': 'water', filter: ['all', ['!=', ['get', 'class'], 'ocean'], ['!=', ['get', 'class'], 'swimming_pool']], minzoom: 9, paint: { 'fill-color': MAP_COLORS.water, 'fill-opacity': 1 } },
      { id: 'ne-river', type: 'line', source: 'base', filter: ['all', ['==', ['get', 'layer'], 'river'], ['<=', ['get', 'rank'], 9]], paint: { 'line-color': MAP_COLORS.river, 'line-width': ['interpolate', ['linear'], ['zoom'], 4, 0.4, 8, 1.4] } },
      { id: 'omt-river', type: 'line', source: 'omt', 'source-layer': 'waterway', filter: ['in', ['get', 'class'], ['literal', ['river', 'canal']]], minzoom: 8, paint: { 'line-color': MAP_COLORS.river, 'line-width': ['interpolate', ['linear'], ['zoom'], 8, 0.8, 12, 2.2, 15, 5] } },
      { id: 'omt-stream', type: 'line', source: 'omt', 'source-layer': 'waterway', filter: ['in', ['get', 'class'], ['literal', ['stream']]], minzoom: 11, paint: { 'line-color': MAP_COLORS.river, 'line-width': ['interpolate', ['linear'], ['zoom'], 11, 0.4, 15, 1.4] } },
      { id: 'omt-region', type: 'line', source: 'omt', 'source-layer': 'boundary', filter: ['all', ['==', ['get', 'admin_level'], 4], ['!=', ['get', 'maritime'], 1]], minzoom: 6, paint: { 'line-color': MAP_COLORS.region, 'line-width': 0.7, 'line-dasharray': [3, 2] } },
      { id: 'ne-border', type: 'line', source: 'base', filter: ['==', ['get', 'layer'], 'border'], paint: { 'line-color': MAP_COLORS.border, 'line-width': ['interpolate', ['linear'], ['zoom'], 4, 0.8, 8, 1.4] } },
      { id: 'omt-border', type: 'line', source: 'omt', 'source-layer': 'boundary', filter: ['all', ['==', ['get', 'admin_level'], 2], ['!=', ['get', 'maritime'], 1]], minzoom: 7, paint: { 'line-color': MAP_COLORS.border, 'line-width': ['interpolate', ['linear'], ['zoom'], 7, 1.2, 12, 1.8] } },
      { id: 'omt-road-minor', type: 'line', source: 'omt', 'source-layer': 'transportation', filter: ['in', ['get', 'class'], ['literal', ['secondary', 'tertiary']]], minzoom: 9, paint: { 'line-color': MAP_COLORS.road, 'line-width': ['interpolate', ['linear'], ['zoom'], 9, 0.5, 14, 2.5] } },
      { id: 'omt-road-major', type: 'line', source: 'omt', 'source-layer': 'transportation', filter: ['in', ['get', 'class'], ['literal', ['motorway', 'trunk', 'primary']]], minzoom: 6, paint: { 'line-color': MAP_COLORS.roadMajor, 'line-width': ['interpolate', ['linear'], ['zoom'], 6, 0.5, 10, 1.4, 14, 3.5] } },

      ...OVERVIEW_TIERS.map((t) => waterFill('ov', t)),
      ...TIERS.map((t) => waterFill('dt', t)),
      // Seleção: cor de marca, por cima de tudo (visível mesmo se o escalão estiver oculto).
      { id: 'water-sel-ov', type: 'fill', source: 'water-overview', filter: ['==', ['get', 'id'], ''], paint: { 'fill-color': MAP_COLORS.brand, 'fill-opacity': 0.85 } },
      { id: 'water-sel-dt', type: 'fill', source: 'water-detail', filter: ['==', ['get', 'id'], ''], paint: { 'fill-color': MAP_COLORS.brand, 'fill-opacity': 0.85 } },
      { id: 'water-sel-line', type: 'line', source: 'water-detail', filter: ['==', ['get', 'id'], ''], paint: { 'line-color': MAP_COLORS.ink, 'line-width': 1.6 } },
      { id: 'water-sel-line-ov', type: 'line', source: 'water-overview', filter: ['==', ['get', 'id'], ''], paint: { 'line-color': MAP_COLORS.ink, 'line-width': 1.6 } },

      // Barragens do catálogo (infraestrutura): ponto discreto em escalas de detalhe.
      {
        id: 'dams', type: 'circle', source: 'dams', minzoom: 7, // pontos das fichas sem contorno
        paint: {
          'circle-radius': ['case', ['boolean', ['get', 'selected'], false], 6, 3.5],
          'circle-color': ['case', ['boolean', ['get', 'selected'], false], MAP_COLORS.brand, MAP_COLORS.ink],
          'circle-stroke-color': '#ffffff', 'circle-stroke-width': 1.5,
        },
      },
      { id: 'dams-selected', type: 'circle', source: 'dams', filter: ['boolean', ['get', 'selected'], false], paint: { 'circle-radius': 7, 'circle-color': MAP_COLORS.brand, 'circle-stroke-color': '#fff', 'circle-stroke-width': 2 } },

      // Localidades e países.
      { id: 'omt-place', type: 'symbol', source: 'omt', 'source-layer': 'place', filter: ['in', ['get', 'class'], ['literal', ['city', 'town', 'village']]], minzoom: 5, layout: { 'text-field': nameLatin, 'text-font': ['Noto Sans Regular'], 'text-size': ['match', ['get', 'class'], 'city', 13, 'town', 11.5, 10.5], 'symbol-sort-key': ['get', 'rank'], 'text-max-width': 8, visibility: 'visible' }, paint: { 'text-color': MAP_COLORS.label, 'text-halo-color': 'rgba(255,255,255,0.9)', 'text-halo-width': 1.2 } },
      { id: 'ne-place', type: 'symbol', source: 'base', filter: ['==', ['get', 'layer'], 'place'], layout: { 'text-field': ['get', 'name'], 'text-font': ['Noto Sans Regular'], 'text-size': ['interpolate', ['linear'], ['get', 'rank'], 0, 13, 8, 10.5], 'symbol-sort-key': ['get', 'rank'], visibility: 'none' }, paint: { 'text-color': MAP_COLORS.label, 'text-halo-color': 'rgba(255,255,255,0.9)', 'text-halo-width': 1.2 } },
      { id: 'ne-country', type: 'symbol', source: 'base', filter: ['==', ['get', 'layer'], 'country'], maxzoom: 8, layout: { 'text-field': ['upcase', ['get', 'name']], 'text-font': ['Noto Sans Medium'], 'text-size': 12, 'text-letter-spacing': 0.25 }, paint: { 'text-color': '#7d847f', 'text-halo-color': 'rgba(255,255,255,0.8)', 'text-halo-width': 1 } },

      ...TIERS.map((t) => waterLabel('dt', t)),
      ...OVERVIEW_TIERS.map((t) => waterLabel('ov', t)),
    ],
  }
}
