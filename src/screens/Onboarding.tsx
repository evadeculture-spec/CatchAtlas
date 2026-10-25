import { ArrowRight, Check, Anchor, Footprints, Sailboat } from 'lucide-react'
import { useState } from 'react'
import { useNavigate } from 'react-router'
import { BrandLockup } from '../components/BrandMark'
import { DamArt } from '../components/DamArt'
import { Button, cx, DemoTag, inputCls } from '../components/ui'
import { brand } from '../config/brand'
import { MODALITIES, REGIONS, SPECIES } from '../data/catalog'
import { damById } from '../data/dams'
import type { ModalityId, RegionId, SpeciesId } from '../data/types'
import { useApp } from '../state/AppState'

const MOD_ICON = { margem: Footprints, caiaque: Sailboat, embarcacao: Anchor }

export default function Onboarding() {
  const { state, completeOnboarding } = useApp()
  const navigate = useNavigate()
  const [step, setStep] = useState(0)
  const [species, setSpecies] = useState<SpeciesId[]>(state.profile.species)
  const [modalities, setModalities] = useState<ModalityId[]>(state.profile.modalities)
  const [region, setRegion] = useState<RegionId>(state.profile.region)
  const [name, setName] = useState(state.profile.name === 'Pescador' ? '' : state.profile.name)

  const toggle = <T,>(list: T[], v: T) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v])
  const finish = (skip = false) => {
    completeOnboarding(skip ? {} : { species: species.length ? species : ['achiga'], modalities: modalities.length ? modalities : ['margem'], region, name: name.trim() || 'Pescador' })
    navigate('/', { replace: true })
  }

  if (step === 0)
    return (
      <div className="relative flex min-h-dvh flex-col bg-ink text-white">
        <div className="absolute inset-0">
          <DamArt art={damById['santa-clara'].art} />
          <div className="absolute inset-0 bg-gradient-to-b from-ink/40 via-ink/30 to-ink" />
        </div>
        <div className="pt-safe relative mx-auto flex w-full max-w-xl flex-1 flex-col px-6 pb-8">
          <div className="flex items-center justify-between pt-5">
            <BrandLockup light />
            <span className="rounded-full bg-black/25 px-2.5 py-1 text-[11px] font-bold text-white/85 backdrop-blur">Imagem ilustrativa</span>
          </div>
          <div className="mt-auto">
            <DemoTag tone="dark" />
            <h1 className="font-display mt-4 text-[42px] font-semibold leading-[1.02] sm:text-[54px]">{brand.tagline}</h1>
            <p className="mt-4 max-w-md text-[16px] leading-relaxed text-white/75">
              Barragens portuguesas, condições para preparar a saída, o teu diário de capturas, rankings e provas. Tudo num só lugar.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Button size="lg" icon={ArrowRight} className="flex-row-reverse sm:flex-1" onClick={() => setStep(1)}>
                Personalizar em 30 segundos
              </Button>
              <Button size="lg" variant="ghost" className="bg-white/10 text-white hover:bg-white/15 sm:flex-1" onClick={() => finish(true)}>
                Explorar demonstração
              </Button>
            </div>
            <p className="mt-5 text-center text-[12px] text-white/50">Sem registo. Os dados são fictícios e ficam apenas neste navegador.</p>
          </div>
        </div>
      </div>
    )

  return (
    <div className="pt-safe mx-auto flex min-h-dvh w-full max-w-xl flex-col px-6 pb-8">
      <div className="flex items-center justify-between pt-5">
        <BrandLockup compact />
        <button onClick={() => finish(true)} className="press rounded-full px-3 py-2 text-[13px] font-bold text-muted hover:bg-ink/5">
          Saltar
        </button>
      </div>
      <div className="mt-6 flex gap-1.5" aria-label={`Passo ${step} de 3`}>
        {[1, 2, 3].map((i) => (
          <span key={i} className={cx('h-1.5 flex-1 rounded-full transition-colors', i <= step ? 'bg-teal' : 'bg-line')} />
        ))}
      </div>

      {step === 1 && (
        <section className="page-in mt-8">
          <p className="text-[12px] font-bold uppercase tracking-[0.14em] text-teal-700">Passo 1 de 3</p>
          <h1 className="font-display mt-2 text-[32px] font-semibold leading-tight text-ink">Que espécies procuras?</h1>
          <p className="mt-2 text-muted">Usamos isto para destacar rankings e sugestões. Podes escolher várias.</p>
          <div className="mt-6 grid grid-cols-2 gap-2.5">
            {SPECIES.map((s) => {
              const on = species.includes(s.id)
              return (
                <button
                  key={s.id}
                  onClick={() => setSpecies(toggle(species, s.id))}
                  aria-pressed={on}
                  className={cx('press flex h-16 items-center gap-3 rounded-2xl border-2 px-4 text-left', on ? 'border-ink bg-white' : 'border-transparent bg-white shadow-card')}
                >
                  <span className="h-3 w-3 rounded-full" style={{ background: s.color }} aria-hidden />
                  <span className="flex-1 font-extrabold text-ink">{s.name}</span>
                  {on && <Check className="h-5 w-5 text-teal-700" aria-hidden />}
                </button>
              )
            })}
          </div>
        </section>
      )}

      {step === 2 && (
        <section className="page-in mt-8">
          <p className="text-[12px] font-bold uppercase tracking-[0.14em] text-teal-700">Passo 2 de 3</p>
          <h1 className="font-display mt-2 text-[32px] font-semibold leading-tight text-ink">Como costumas pescar?</h1>
          <p className="mt-2 text-muted">Ajustamos o equipamento sugerido e as barragens em destaque.</p>
          <div className="mt-6 space-y-2.5">
            {MODALITIES.map((m) => {
              const on = modalities.includes(m.id)
              const I = MOD_ICON[m.id]
              return (
                <button
                  key={m.id}
                  onClick={() => setModalities(toggle(modalities, m.id))}
                  aria-pressed={on}
                  className={cx('press flex w-full items-center gap-4 rounded-2xl border-2 p-4 text-left', on ? 'border-ink bg-white' : 'border-transparent bg-white shadow-card')}
                >
                  <span className={cx('grid h-12 w-12 place-items-center rounded-xl', on ? 'bg-ink text-teal' : 'bg-mist text-ink')}>
                    <I className="h-6 w-6" aria-hidden />
                  </span>
                  <span className="flex-1">
                    <span className="block font-extrabold text-ink">{m.name}</span>
                    <span className="block text-[13px] text-muted">{m.hint}</span>
                  </span>
                  {on && <Check className="h-5 w-5 text-teal-700" aria-hidden />}
                </button>
              )
            })}
          </div>
        </section>
      )}

      {step === 3 && (
        <section className="page-in mt-8">
          <p className="text-[12px] font-bold uppercase tracking-[0.14em] text-teal-700">Passo 3 de 3</p>
          <h1 className="font-display mt-2 text-[32px] font-semibold leading-tight text-ink">Onde pescas mais?</h1>
          <div className="mt-6 flex flex-wrap gap-2">
            {REGIONS.map((r) => (
              <button
                key={r.id}
                onClick={() => setRegion(r.id)}
                aria-pressed={region === r.id}
                className={cx('press h-11 rounded-full border px-4 text-[14px] font-bold', region === r.id ? 'border-ink bg-ink text-white' : 'border-line bg-white text-ink')}
              >
                {r.name}
              </button>
            ))}
          </div>
          <label htmlFor="ob-name" className="mt-8 block text-[13px] font-bold text-ink">
            Como te tratamos? <span className="font-semibold text-subtle">(opcional)</span>
          </label>
          <input id="ob-name" className={cx(inputCls, 'mt-1.5')} value={name} maxLength={24} onChange={(e) => setName(e.target.value)} placeholder="O teu nome" autoComplete="given-name" />
          <p className="mt-2 text-[12.5px] text-muted">Fica apenas neste navegador. Não há conta nem registo.</p>
        </section>
      )}

      <div className="mt-auto flex gap-3 pt-10">
        <Button variant="outline" size="lg" className="flex-1" onClick={() => setStep(step - 1)}>
          Voltar
        </Button>
        <Button size="lg" className="flex-[2]" onClick={() => (step < 3 ? setStep(step + 1) : finish())}>
          {step < 3 ? 'Continuar' : 'Começar a explorar'}
        </Button>
      </div>
    </div>
  )
}
