import { useId, useMemo } from 'react'
import type { ArtPalette } from '../data/types'
import { mulberry32 } from '../lib/random'

const W = 400
const H = 260
const HORIZON = 156

function ridge(rand: () => number, base: number, amp: number, step = 6) {
  const p1 = rand() * 6.28
  const p2 = rand() * 6.28
  const p3 = rand() * 6.28
  const f1 = 0.6 + rand() * 0.8
  const f2 = 2 + rand() * 1.5
  const pts: [number, number][] = []
  for (let x = -step; x <= W + step; x += step) {
    const t = x / W
    const y =
      base -
      amp * (0.55 + 0.45 * Math.sin(t * 6.28 * f1 + p1)) -
      amp * 0.22 * Math.sin(t * 6.28 * f2 + p2) -
      amp * 0.08 * Math.sin(t * 6.28 * 7 + p3)
    pts.push([x, Math.min(y, HORIZON)])
  }
  return pts
}

const toPath = (pts: [number, number][], closeY: number) =>
  `M${pts[0][0]},${closeY} ` + pts.map(([x, y]) => `L${x.toFixed(1)},${y.toFixed(1)}`).join(' ') + ` L${pts[pts.length - 1][0]},${closeY} Z`

function mix(a: string, b: string, t: number) {
  const pa = [1, 3, 5].map((i) => parseInt(a.slice(i, i + 2), 16))
  const pb = [1, 3, 5].map((i) => parseInt(b.slice(i, i + 2), 16))
  return '#' + pa.map((v, i) => Math.round(v + (pb[i] - v) * t).toString(16).padStart(2, '0')).join('')
}

/**
 * Ilustração procedimental de uma albufeira. NÃO é uma fotografia do local:
 * os ecrãs mostram sempre a indicação "Imagem ilustrativa".
 */
export function DamArt({ art, className = '', detail = 'full' }: { art: ArtPalette; className?: string; detail?: 'full' | 'lite' }) {
  const id = useId().replace(/:/g, '')
  const scene = useMemo(() => {
    const rand = mulberry32(art.seed * 7919)
    const layers = art.hills.map((color, i) => {
      const depth = i / Math.max(1, art.hills.length - 1)
      const pts = ridge(rand, HORIZON + 2, 26 + (1 - depth) * 34 - depth * 6 + rand() * 10)
      return { color: mix(color, art.sky[0], (1 - depth) * 0.45), pts }
    })
    const sunX = 70 + rand() * 260
    const leftW = 110 + rand() * 60
    const rightW = 90 + rand() * 70
    const leftTop = 120 + rand() * 30
    const rightTop = 128 + rand() * 30
    const trees: { x: number; y: number; s: number; side: number }[] = []
    if (art.trees) {
      for (let i = 0; i < 26; i++) {
        const side = i % 2
        const t = rand()
        const x = side === 0 ? t * leftW * 0.8 : W - t * rightW * 0.8
        const top = side === 0 ? leftTop : rightTop
        const frac = side === 0 ? x / leftW : (W - x) / rightW
        const y = top + (H - top) * Math.max(0, frac - 0.05) * 0.9 + 3
        trees.push({ x, y, s: 5 + rand() * 9, side })
      }
    }
    const ripples = Array.from({ length: detail === 'full' ? 16 : 8 }, () => ({
      x: rand() * W,
      y: HORIZON + 8 + rand() * (H - HORIZON - 10),
      w: 14 + rand() * 50,
    }))
    return { layers, sunX, leftW, rightW, leftTop, rightTop, trees, ripples }
  }, [art, detail])

  const sunY = art.sun === 'high' ? 54 : 128
  const front = art.hills[art.hills.length - 1]
  const bankColor = mix(front, '#0d1f17', 0.35)

  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid slice" className={`block h-full w-full ${className}`} role="img" aria-label="Ilustração de uma albufeira (imagem ilustrativa)">
      <defs>
        <linearGradient id={`sky${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={art.sky[1]} />
          <stop offset="1" stopColor={art.sky[0]} />
        </linearGradient>
        <linearGradient id={`water${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={mix(art.water[0], art.sky[0], 0.3)} />
          <stop offset="0.35" stopColor={art.water[0]} />
          <stop offset="1" stopColor={art.water[1]} />
        </linearGradient>
        <radialGradient id={`sun${id}`}>
          <stop offset="0" stopColor="#FFF8E7" stopOpacity="1" />
          <stop offset="0.25" stopColor="#FFF1CC" stopOpacity=".85" />
          <stop offset="1" stopColor="#FFF1CC" stopOpacity="0" />
        </radialGradient>
        <linearGradient id={`mist${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fff" stopOpacity="0" />
          <stop offset=".55" stopColor="#fff" stopOpacity=".55" />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
        <linearGradient id={`glint${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#FFF4D6" stopOpacity=".75" />
          <stop offset="1" stopColor="#FFF4D6" stopOpacity="0" />
        </linearGradient>
        {detail === 'full' && (
          <filter id={`blur${id}`} x="-5%" y="-5%" width="110%" height="110%">
            <feGaussianBlur stdDeviation="1.6" />
          </filter>
        )}
      </defs>

      <rect width={W} height={HORIZON + 2} fill={`url(#sky${id})`} />
      {art.sun !== 'none' && <circle cx={scene.sunX} cy={sunY} r={art.sun === 'high' ? 70 : 95} fill={`url(#sun${id})`} />}
      {art.sun !== 'none' && <circle cx={scene.sunX} cy={sunY} r={art.sun === 'high' ? 9 : 13} fill="#FFFBF0" opacity=".95" />}

      {scene.layers.map((l, i) => (
        <path key={i} d={toPath(l.pts, HORIZON + 1)} fill={l.color} />
      ))}

      <rect y={HORIZON} width={W} height={H - HORIZON} fill={`url(#water${id})`} />
      <g opacity=".32" transform={`translate(0 ${HORIZON * 2}) scale(1 -1)`} filter={detail === 'full' ? `url(#blur${id})` : undefined}>
        {scene.layers.map((l, i) => (
          <path key={i} d={toPath(l.pts, HORIZON)} fill={mix(l.color, art.water[1], 0.35)} />
        ))}
      </g>
      {art.sun !== 'none' && (
        <rect x={scene.sunX - 16} y={HORIZON} width="32" height={H - HORIZON} fill={`url(#glint${id})`} opacity={art.sun === 'high' ? 0.35 : 0.6} />
      )}
      {scene.ripples.map((r, i) => (
        <line key={i} x1={r.x} x2={r.x + r.w} y1={r.y} y2={r.y} stroke="#fff" strokeOpacity={0.1 + ((r.y - HORIZON) / (H - HORIZON)) * 0.12} strokeWidth={0.6 + ((r.y - HORIZON) / (H - HORIZON)) * 1.2} strokeLinecap="round" />
      ))}
      {art.mist && <rect y={HORIZON - 30} width={W} height="50" fill={`url(#mist${id})`} />}

      <path d={`M0,${H} L0,${scene.leftTop} C${scene.leftW * 0.35},${scene.leftTop - 6} ${scene.leftW * 0.7},${scene.leftTop + 30} ${scene.leftW},${H} Z`} fill={bankColor} />
      <path d={`M${W},${H} L${W},${scene.rightTop} C${W - scene.rightW * 0.4},${scene.rightTop - 4} ${W - scene.rightW * 0.75},${scene.rightTop + 36} ${W - scene.rightW},${H} Z`} fill={mix(bankColor, '#000000', 0.08)} />
      {scene.trees.map((t, i) => (
        <path key={i} d={`M${t.x},${t.y - t.s * 2.2} C${t.x + t.s * 0.9},${t.y - t.s * 1.2} ${t.x + t.s * 0.7},${t.y} ${t.x},${t.y} C${t.x - t.s * 0.7},${t.y} ${t.x - t.s * 0.9},${t.y - t.s * 1.2} ${t.x},${t.y - t.s * 2.2} Z`} fill={mix(bankColor, '#000000', 0.18 + (i % 3) * 0.06)} />
      ))}
    </svg>
  )
}
