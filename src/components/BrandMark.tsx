import { brand } from '../config/brand'

/** Símbolo original: anzol sobre linhas de contorno de água. */
export function BrandMark({ size = 36, className = '' }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" className={className} aria-hidden>
      <rect width="48" height="48" rx="13" fill="#102B3A" />
      <path d="M9 32.5c3.2-2.6 6.6-2.6 9.8 0s6.6 2.6 9.8 0 6.6-2.6 9.8 0" fill="none" stroke="#20BFA9" strokeWidth="2.6" strokeLinecap="round" />
      <path d="M12 38.5c2.8-2 5.6-2 8.4 0s5.6 2 8.4 0 5.6-2 8.4 0" fill="none" stroke="#20BFA9" strokeOpacity=".45" strokeWidth="2.2" strokeLinecap="round" />
      <path d="M27 11.5v11a5.5 5.5 0 0 1-11 0v-1.6" fill="none" stroke="#fff" strokeWidth="2.7" strokeLinecap="round" />
      <path d="M16 20.9l-2.4 2.6" fill="none" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" />
      <circle cx="27" cy="9" r="2.2" fill="none" stroke="#F2B544" strokeWidth="2" />
    </svg>
  )
}

export function BrandLockup({ light = false, compact = false }: { light?: boolean; compact?: boolean }) {
  return (
    <span className="inline-flex items-center gap-2.5">
      <BrandMark size={compact ? 30 : 36} />
      <span className={`text-[17px] font-extrabold tracking-tight ${light ? 'text-white' : 'text-ink'}`}>
        {brand.name.replace('Catch', '')}
        <span className={light ? 'text-teal' : 'text-teal-700'}>Catch</span>
      </span>
    </span>
  )
}
