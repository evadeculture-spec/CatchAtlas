import type { Dam } from './types'

// Nomes, região, localidade e rio são informação geral. Tudo o resto é ilustrativo:
// espécies "de exemplo", características e condições NÃO estão verificadas.
// As coordenadas são aproximadas e servem apenas o mapa esquemático.
export const DAMS: Dam[] = [
  {
    id: 'alqueva',
    name: 'Alqueva',
    region: 'alentejo',
    place: 'Moura · Portel · Reguengos',
    river: 'Rio Guadiana',
    approx: { lat: 38.25, lon: -7.45 },
    species: ['achiga', 'carpa', 'lucioperca', 'barbo', 'siluro'],
    modalities: ['margem', 'caiaque', 'embarcacao'],
    summary:
      'Grande plano de água com braços extensos, ilhas e enseadas. Na demonstração serve de exemplo para jornadas longas, de margem ou embarcadas.',
    traits: [
      { label: 'Escala', value: 'Muito extensa' },
      { label: 'Margens', value: 'Mistas, com enseadas' },
      { label: 'Ambiente', value: 'Planície, montado' },
    ],
    art: { seed: 11, sky: ['#F6D9A8', '#9FC9D6'], hills: ['#A9B38A', '#7F9170', '#5D735B'], water: ['#5C9DAE', '#1D4A5C'], sun: 'low', trees: true },
  },
  {
    id: 'castelo-de-bode',
    name: 'Castelo de Bode',
    region: 'centro',
    place: 'Tomar · Abrantes',
    river: 'Rio Zêzere',
    approx: { lat: 39.55, lon: -8.32 },
    species: ['achiga', 'carpa', 'lucio', 'barbo'],
    modalities: ['margem', 'caiaque', 'embarcacao'],
    summary:
      'Albufeira encaixada entre encostas arborizadas, com muitas reentrâncias. Usada na demonstração para ilustrar pesca em estruturas e ravinas.',
    traits: [
      { label: 'Escala', value: 'Extensa' },
      { label: 'Margens', value: 'Íngremes, arborizadas' },
      { label: 'Ambiente', value: 'Vale encaixado' },
    ],
    art: { seed: 23, sky: ['#E8EEE9', '#A7C7CF'], hills: ['#6E8F78', '#4F7360', '#33574A'], water: ['#3F8C93', '#123B48'], sun: 'none', mist: true, trees: true },
  },
  {
    id: 'cabril',
    name: 'Cabril',
    region: 'centro',
    place: 'Pedrógão Grande · Sertã',
    river: 'Rio Zêzere',
    approx: { lat: 39.93, lon: -8.13 },
    species: ['achiga', 'carpa', 'barbo'],
    modalities: ['margem', 'caiaque', 'embarcacao'],
    summary:
      'Paisagem de montanha com encostas acentuadas e águas profundas junto às margens. Exemplo de jornada de técnica e paciência.',
    traits: [
      { label: 'Escala', value: 'Média' },
      { label: 'Margens', value: 'Rochosas, declive forte' },
      { label: 'Ambiente', value: 'Montanha, xisto' },
    ],
    art: { seed: 37, sky: ['#DCE6EC', '#8DB3C4'], hills: ['#7D8C86', '#5A6F6A', '#3B5250'], water: ['#2F7F8A', '#0E3341'], sun: 'high', trees: true },
  },
  {
    id: 'bouca',
    name: 'Bouçã',
    region: 'centro',
    place: 'Pedrógão Grande · Figueiró dos Vinhos',
    river: 'Rio Zêzere',
    approx: { lat: 39.86, lon: -8.22 },
    species: ['achiga', 'barbo', 'carpa'],
    modalities: ['margem', 'caiaque'],
    summary:
      'Plano de água mais estreito, em vale sinuoso. Na demonstração surge como opção tranquila para caiaque e margem.',
    traits: [
      { label: 'Escala', value: 'Pequena a média' },
      { label: 'Margens', value: 'Sinuosas' },
      { label: 'Ambiente', value: 'Vale fluvial' },
    ],
    art: { seed: 41, sky: ['#F1E4CF', '#B5CFD2'], hills: ['#8FA38A', '#668167', '#45604C'], water: ['#4C9599', '#164651'], sun: 'low', mist: true, trees: true },
  },
  {
    id: 'montargil',
    name: 'Montargil',
    region: 'alentejo',
    place: 'Ponte de Sor',
    river: 'Ribeira de Sor',
    approx: { lat: 39.05, lon: -8.17 },
    species: ['achiga', 'carpa', 'lucioperca', 'barbo'],
    modalities: ['margem', 'caiaque', 'embarcacao'],
    summary:
      'Albufeira aberta, de margens suaves e envolvida por montado. Exemplo de jornadas de margem e de provas na demonstração.',
    traits: [
      { label: 'Escala', value: 'Média a extensa' },
      { label: 'Margens', value: 'Suaves, acessíveis' },
      { label: 'Ambiente', value: 'Montado, planície' },
    ],
    art: { seed: 53, sky: ['#F7E2BD', '#A9CCD3'], hills: ['#B5B58E', '#8E9974', '#6A7D5E'], water: ['#68A5AE', '#1F5262'], sun: 'low', trees: true },
  },
  {
    id: 'maranhao',
    name: 'Maranhão',
    region: 'alentejo',
    place: 'Avis',
    river: 'Ribeira de Seda',
    approx: { lat: 39.02, lon: -7.93 },
    species: ['achiga', 'carpa', 'lucioperca'],
    modalities: ['margem', 'embarcacao'],
    summary:
      'Plano de água com longos braços e pontas de terra. Na demonstração ilustra jornadas de embarcação em zonas abertas.',
    traits: [
      { label: 'Escala', value: 'Extensa' },
      { label: 'Margens', value: 'Abertas, com pontões' },
      { label: 'Ambiente', value: 'Planície alentejana' },
    ],
    art: { seed: 67, sky: ['#EFD3B0', '#93BCCB'], hills: ['#ABA987', '#87906F', '#5F7058'], water: ['#5B98A7', '#18465A'], sun: 'high' },
  },
  {
    id: 'santa-clara',
    name: 'Santa Clara',
    region: 'alentejo',
    place: 'Odemira',
    river: 'Rio Mira',
    approx: { lat: 37.52, lon: -8.43 },
    species: ['achiga', 'carpa', 'barbo'],
    modalities: ['margem', 'caiaque', 'embarcacao'],
    summary:
      'Albufeira recortada entre serras baixas, com muitas pequenas baías. Exemplo de exploração de estruturas a partir de caiaque.',
    traits: [
      { label: 'Escala', value: 'Extensa' },
      { label: 'Margens', value: 'Recortadas, com baías' },
      { label: 'Ambiente', value: 'Serra baixa' },
    ],
    art: { seed: 79, sky: ['#F3DDC4', '#A2C3CF'], hills: ['#93A07F', '#6F8466', '#4D6650'], water: ['#4E95A0', '#123F4F'], sun: 'low', mist: true, trees: true },
  },
  {
    id: 'aguieira',
    name: 'Aguieira',
    region: 'centro',
    place: 'Penacova · Mortágua',
    river: 'Rio Mondego',
    approx: { lat: 40.34, lon: -8.2 },
    species: ['achiga', 'carpa', 'lucio', 'barbo'],
    modalities: ['margem', 'caiaque', 'embarcacao'],
    summary:
      'Albufeira ramificada, com vales arborizados e muitas margens. Na demonstração representa jornadas mistas ao longo do ano.',
    traits: [
      { label: 'Escala', value: 'Extensa' },
      { label: 'Margens', value: 'Arborizadas, variadas' },
      { label: 'Ambiente', value: 'Vales e floresta' },
    ],
    art: { seed: 89, sky: ['#E5ECEA', '#9DBFCB'], hills: ['#7E9A80', '#5C7E66', '#3D5F4E'], water: ['#3D8A92', '#0F3946'], sun: 'none', mist: true, trees: true },
  },
]

export const damById = Object.fromEntries(DAMS.map((d) => [d.id, d])) as Record<string, Dam>
