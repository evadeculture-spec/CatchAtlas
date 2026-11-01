import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useCallback, useEffect, useRef, type KeyboardEvent } from 'react'
import type { Dam } from '../../data/types'
import type { DamPhoto } from '../../lib/photos/rules'
import { cx } from '../ui'
import { PhotoImage } from './PhotoImage'

/**
 * Fundo fotográfico do cabeçalho. Com várias fotografias aprovadas mostra um carrossel
 * discreto: swipe (scroll-snap) no toque, setas no computador e teclado (← →).
 * Sem fotografias, mostra o fallback honesto do PhotoImage.
 */
export function HeroCarousel({
  dam,
  photos,
  index,
  onIndex,
  sizes,
}: {
  dam: Dam
  photos: DamPhoto[]
  index: number
  onIndex: (i: number) => void
  sizes: string
}) {
  const track = useRef<HTMLDivElement>(null)

  const go = useCallback(
    (i: number) => {
      const el = track.current
      if (!el) return
      const next = Math.max(0, Math.min(photos.length - 1, i))
      const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
      el.scrollTo({ left: next * el.clientWidth, behavior: reduce ? 'auto' : 'smooth' })
    },
    [photos.length],
  )

  // Mantém o índice sincronizado com o swipe.
  useEffect(() => {
    const el = track.current
    if (!el || photos.length < 2) return
    const onScroll = () => {
      const i = Math.round(el.scrollLeft / Math.max(1, el.clientWidth))
      if (i !== index) onIndex(i)
    }
    el.addEventListener('scroll', onScroll, { passive: true })
    return () => el.removeEventListener('scroll', onScroll)
  }, [photos.length, index, onIndex])

  if (photos.length <= 1) return <PhotoImage dam={dam} photo={photos[0] ?? null} variant="hero" sizes={sizes} priority />

  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'ArrowRight') { e.preventDefault(); go(index + 1) }
    if (e.key === 'ArrowLeft') { e.preventDefault(); go(index - 1) }
  }

  return (
    <div className="absolute inset-0" aria-roledescription="carrossel" aria-label={`Fotografias de ${dam.name}`}>
      <div
        ref={track}
        tabIndex={0}
        onKeyDown={onKey}
        className="no-scrollbar absolute inset-0 flex snap-x snap-mandatory overflow-x-auto overscroll-x-contain focus-visible:outline-none"
        aria-live="polite"
      >
        {photos.map((p, i) => (
          <div
            key={p.asset.id}
            className="relative h-full w-full shrink-0 snap-center"
            role="group"
            aria-roledescription="diapositivo"
            aria-label={`${i + 1} de ${photos.length}`}
            aria-hidden={i !== index}
          >
            <PhotoImage dam={dam} photo={p} variant="hero" sizes={sizes} priority={i === 0} />
          </div>
        ))}
      </div>
      <button
        type="button"
        onClick={() => go(index - 1)}
        disabled={index === 0}
        className="press absolute left-3 top-1/2 z-10 hidden h-11 w-11 -translate-y-1/2 place-items-center rounded-full bg-black/35 text-white backdrop-blur hover:bg-black/50 disabled:opacity-0 md:grid"
        aria-label="Fotografia anterior"
      >
        <ChevronLeft className="h-5 w-5" aria-hidden />
      </button>
      <button
        type="button"
        onClick={() => go(index + 1)}
        disabled={index === photos.length - 1}
        className="press absolute right-3 top-1/2 z-10 hidden h-11 w-11 -translate-y-1/2 place-items-center rounded-full bg-black/35 text-white backdrop-blur hover:bg-black/50 disabled:opacity-0 md:grid"
        aria-label="Fotografia seguinte"
      >
        <ChevronRight className="h-5 w-5" aria-hidden />
      </button>
      <div className="pointer-events-none absolute left-1/2 top-7 z-10 flex -translate-x-1/2 gap-1.5 lg:top-8" aria-hidden>
        {photos.map((p, i) => (
          <span key={p.asset.id} className={cx('h-1.5 rounded-full bg-white transition-all', i === index ? 'w-5 opacity-95' : 'w-1.5 opacity-50')} />
        ))}
      </div>
    </div>
  )
}
