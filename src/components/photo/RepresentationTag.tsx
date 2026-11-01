import { ImageIcon } from 'lucide-react'
import { REPRESENTATION_LABEL, representationOf, type DamPhoto } from '../../lib/photos/rules'
import { cx } from '../ui'

/** Rótulo obrigatório quando a imagem não é comprovadamente desta albufeira. */
export function RepresentationTag({ photo, compact, className }: { photo: DamPhoto | null; compact?: boolean; className?: string }) {
  if (!photo) return null
  const rep = representationOf(photo.link)
  const label = REPRESENTATION_LABEL[rep]
  if (!label) return null
  return (
    <span
      className={cx(
        'inline-flex max-w-full items-center gap-1.5 rounded-full font-bold text-white backdrop-blur',
        rep === 'ilustrativa' ? 'bg-amber-600/80' : 'bg-black/45',
        compact ? 'px-2 py-0.5 text-[10.5px]' : 'px-3 py-1.5 text-[12px]',
        className,
      )}
      data-representation-label={rep}
    >
      <ImageIcon className={compact ? 'h-3 w-3 shrink-0' : 'h-3.5 w-3.5 shrink-0'} aria-hidden />
      <span className="truncate">{compact ? (rep === 'ilustrativa' ? 'Imagem ilustrativa' : 'Imagem da região') : label}</span>
    </span>
  )
}
