import { Info } from 'lucide-react'
import type { Dam } from '../data/types'
import { cx } from './ui'

// Contorno muito simplificado de Portugal continental (aprox.), apenas para orientação esquemática.
const OUTLINE: [number, number][] = [
  [-8.87, 41.87], [-8.6, 42.05], [-8.2, 42.14], [-8.0, 41.95], [-7.6, 41.88], [-7.2, 41.98], [-6.9, 41.94], [-6.55, 41.94],
  [-6.2, 41.6], [-6.5, 41.3], [-6.8, 41.05], [-6.93, 40.6], [-6.85, 40.25], [-7.0, 39.9], [-7.5, 39.66], [-7.25, 39.45],
  [-7.0, 39.1], [-7.05, 38.85], [-7.3, 38.45], [-7.0, 38.15], [-7.25, 37.95], [-7.5, 37.55], [-7.42, 37.18], [-7.9, 37.0],
  [-8.3, 37.1], [-8.65, 37.1], [-8.99, 37.02], [-8.8, 37.4], [-8.82, 37.9], [-8.75, 38.3], [-9.2, 38.42], [-9.05, 38.6],
  [-9.5, 38.78], [-9.4, 39.1], [-9.35, 39.36], [-9.05, 39.6], [-8.9, 40.0], [-8.75, 40.6], [-8.66, 41.2], [-8.8, 41.55],
]
const LON0 = -9.75
const LON1 = -6.0
const LAT0 = 36.8
const LAT1 = 42.35
const VW = 220
const VH = 340
const px = (lon: number) => ((lon - LON0) / (LON1 - LON0)) * VW
const py = (lat: number) => ((LAT1 - lat) / (LAT1 - LAT0)) * VH

const outlinePath =
  OUTLINE.map(([lon, lat], i) => `${i ? 'L' : 'M'}${px(lon).toFixed(1)},${py(lat).toFixed(1)}`).join(' ') + ' Z'

export function SchematicMap({
  dams,
  selected,
  onSelect,
  favorites,
  className,
}: { dams: Dam[]; selected?: string; onSelect: (id: string) => void; favorites: string[]; className?: string }) {
  return (
    <div className={cx('relative overflow-hidden rounded-[var(--radius-card)] bg-[#E7EFF1]', className)}>
      <div className="absolute inset-0 opacity-60" style={{ backgroundImage: 'radial-gradient(#c9d7db 1px, transparent 1px)', backgroundSize: '14px 14px' }} aria-hidden />
      <div className="relative mx-auto aspect-[220/340] h-full max-h-[560px] max-w-full">
        <svg viewBox={`0 0 ${VW} ${VH}`} className="absolute inset-0 h-full w-full" aria-hidden>
          <path d={outlinePath} fill="#F9FBFB" stroke="#B8CACF" strokeWidth="1.2" strokeLinejoin="round" />
          {[0.2, 0.4, 0.6, 0.8].map((t) => (
            <line key={t} x1={0} x2={VW} y1={VH * t} y2={VH * t} stroke="#B8CACF" strokeOpacity=".35" strokeDasharray="2 4" />
          ))}
          <text x={14} y={VH * 0.62} fill="#7F969C" fontSize="8" fontWeight="700" letterSpacing="2">OCEANO</text>
          <text x={14} y={VH * 0.62 + 10} fill="#7F969C" fontSize="8" fontWeight="700" letterSpacing="2">ATLÂNTICO</text>
          <text x={VW - 52} y={30} fill="#9AADB2" fontSize="7.5" fontWeight="700" letterSpacing="1.5">ESPANHA</text>
        </svg>
        {dams.map((d) => {
          const active = d.id === selected
          return (
            <button
              key={d.id}
              onClick={() => onSelect(d.id)}
              aria-label={`${d.name}${favorites.includes(d.id) ? ' (favorita)' : ''}`}
              aria-pressed={active}
              className="group absolute -translate-x-1/2 -translate-y-1/2 p-2"
              style={{ left: `${(px(d.approx.lon) / VW) * 100}%`, top: `${(py(d.approx.lat) / VH) * 100}%`, zIndex: active ? 5 : 1 }}
            >
              {active && <span className="pulse-ring absolute inset-2 rounded-full bg-teal" aria-hidden />}
              <span
                className={cx(
                  'relative grid place-items-center rounded-full border-[2.5px] border-white shadow-lift transition-transform',
                  active ? 'h-6 w-6 scale-110 bg-teal' : 'h-5 w-5 bg-ink group-hover:scale-110',
                )}
              >
                {favorites.includes(d.id) && <span className="h-1.5 w-1.5 rounded-full bg-amber" />}
              </span>
              <span
                className={cx(
                  'pointer-events-none absolute left-1/2 top-full -translate-x-1/2 whitespace-nowrap rounded-full bg-ink px-2 py-0.5 text-[11px] font-bold text-white shadow-card transition-opacity',
                  active ? 'opacity-100' : 'opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100',
                )}
              >
                {d.name}
              </span>
            </button>
          )
        })}
      </div>
      <p className="absolute left-3 top-3 flex max-w-[78%] items-start gap-1.5 rounded-xl bg-white/90 px-2.5 py-1.5 text-[11px] font-semibold leading-snug text-muted shadow-card backdrop-blur">
        <Info className="mt-px h-3.5 w-3.5 shrink-0 text-teal-700" aria-hidden />
        Mapa esquemático com posições aproximadas. Não serve para navegação.
      </p>
      <p className="absolute bottom-3 right-3 rounded-full bg-white/90 px-2.5 py-1 text-[11px] font-bold text-muted shadow-card">Toque num marcador</p>
    </div>
  )
}
