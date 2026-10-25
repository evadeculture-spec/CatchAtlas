import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { brand } from '../config/brand'
import { DEMO_USER_ID } from '../data/anglers'
import { buildSeedCatches } from '../data/seedCatches'
import type { Catch, Profile, Trip } from '../data/types'
import { addDaysISO, diffDays, todayISO } from '../lib/dates'
import { clearPhotos, deletePhoto } from '../lib/photos'
import { readJSON, removeKey, writeJSON } from '../lib/storage'

export interface Prefs {
  installTipDismissed: boolean
  communityOnHome: boolean
}

export interface PersistedState {
  v: 1
  /** Data de referência da demonstração (AAAA-MM-DD). */
  anchor: string
  onboarded: boolean
  profile: Profile
  favorites: string[]
  myCatches: Catch[]
  trips: Trip[]
  savedEvents: string[]
  prefs: Prefs
}

const SESSION_KEY = `${brand.storageKey}-session`

// Avaliado uma única vez por carregamento da página (estável mesmo com StrictMode).
const IS_NEW_SESSION = (() => {
  try {
    const isNew = !sessionStorage.getItem(SESSION_KEY)
    sessionStorage.setItem(SESSION_KEY, '1')
    return isNew
  } catch {
    return true
  }
})()

function initialState(): PersistedState {
  const anchor = todayISO()
  return {
    v: 1,
    anchor,
    onboarded: false,
    profile: { name: 'Pescador', region: 'centro', species: ['achiga'], modalities: ['margem'], avatarColor: '#20BFA9' },
    favorites: ['castelo-de-bode', 'alqueva'],
    myCatches: buildSeedCatches((n) => addDaysISO(anchor, n))
      .filter((c) => c.anglerId === DEMO_USER_ID)
      .map((c) => ({ ...c, seeded: true })),
    trips: [],
    savedEvents: [],
    prefs: { installTipDismissed: false, communityOnHome: true },
  }
}

/** Numa nova sessão, a demonstração avança para a data de hoje, para não parecer desatualizada. */
function loadState(): PersistedState {
  const stored = readJSON<PersistedState>(brand.storageKey)
  if (!stored || stored.v !== 1) return initialState()
  const today = todayISO()
  if (!IS_NEW_SESSION || stored.anchor === today) return stored
  const delta = diffDays(today, stored.anchor)
  return {
    ...stored,
    anchor: today,
    myCatches: stored.myCatches.map((c) => (c.seeded ? { ...c, date: addDaysISO(c.date, delta) } : c)),
  }
}

interface Ctx {
  state: PersistedState
  /** Capturas de todos os perfis (fictícios + as deste navegador). */
  allCatches: Catch[]
  storageWarning: string | null
  photoVersion: number
  completeOnboarding: (p: Partial<Profile>) => void
  updateProfile: (p: Partial<Profile>) => void
  toggleFavorite: (damId: string) => boolean
  addCatch: (c: Omit<Catch, 'id' | 'anglerId' | 'createdAt'>) => Catch
  updateCatch: (id: string, c: Partial<Catch>) => void
  deleteCatch: (id: string) => void
  saveTrip: (t: Omit<Trip, 'id' | 'createdAt' | 'checked'>) => Trip
  deleteTrip: (id: string) => void
  toggleTripItem: (tripId: string, itemId: string) => void
  toggleSavedEvent: (eventId: string) => boolean
  setPref: <K extends keyof Prefs>(k: K, v: Prefs[K]) => void
  bumpPhotos: () => void
  resetDemo: () => Promise<void>
}

const AppCtx = createContext<Ctx | null>(null)

const uid = (p: string) => `${p}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`

export function AppStateProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<PersistedState>(loadState)
  const [storageWarning, setStorageWarning] = useState<string | null>(null)
  const [photoVersion, setPhotoVersion] = useState(0)
  const stateRef = useRef(state)

  useEffect(() => {
    stateRef.current = state
    const r = writeJSON(brand.storageKey, state)
    // Reflete o resultado da escrita no sistema externo (localStorage).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setStorageWarning(
      r === 'ok'
        ? null
        : r === 'quota'
          ? 'O armazenamento deste navegador está cheio. As últimas alterações podem não ficar guardadas.'
          : 'Este navegador não permite guardar dados. As alterações perdem-se ao fechar a página.',
    )
  }, [state])

  const othersSeed = useMemo(
    () => buildSeedCatches((n) => addDaysISO(state.anchor, n)).filter((c) => c.anglerId !== DEMO_USER_ID),
    [state.anchor],
  )
  const allCatches = useMemo(() => [...state.myCatches, ...othersSeed], [state.myCatches, othersSeed])

  const patch = useCallback((fn: (s: PersistedState) => PersistedState) => setState(fn), [])

  const value: Ctx = {
    state,
    allCatches,
    storageWarning,
    photoVersion,
    completeOnboarding: (p) => patch((s) => ({ ...s, onboarded: true, profile: { ...s.profile, ...p } })),
    updateProfile: (p) => patch((s) => ({ ...s, profile: { ...s.profile, ...p } })),
    toggleFavorite: (damId) => {
      const willAdd = !stateRef.current.favorites.includes(damId)
      patch((s) => ({ ...s, favorites: willAdd ? [...s.favorites, damId] : s.favorites.filter((f) => f !== damId) }))
      return willAdd
    },
    addCatch: (c) => {
      const created: Catch = { ...c, id: uid('cap'), anglerId: DEMO_USER_ID, createdAt: Date.now() }
      patch((s) => ({ ...s, myCatches: [created, ...s.myCatches] }))
      return created
    },
    updateCatch: (id, c) => patch((s) => ({ ...s, myCatches: s.myCatches.map((x) => (x.id === id ? { ...x, ...c } : x)) })),
    deleteCatch: (id) => {
      void deletePhoto(id)
      patch((s) => ({ ...s, myCatches: s.myCatches.filter((x) => x.id !== id) }))
    },
    saveTrip: (t) => {
      const created: Trip = { ...t, id: uid('jor'), createdAt: Date.now(), checked: [] }
      patch((s) => ({ ...s, trips: [created, ...s.trips] }))
      return created
    },
    deleteTrip: (id) => patch((s) => ({ ...s, trips: s.trips.filter((t) => t.id !== id) })),
    toggleTripItem: (tripId, itemId) =>
      patch((s) => ({
        ...s,
        trips: s.trips.map((t) =>
          t.id !== tripId ? t : { ...t, checked: t.checked.includes(itemId) ? t.checked.filter((i) => i !== itemId) : [...t.checked, itemId] },
        ),
      })),
    toggleSavedEvent: (eventId) => {
      const willAdd = !stateRef.current.savedEvents.includes(eventId)
      patch((s) => ({ ...s, savedEvents: willAdd ? [...s.savedEvents, eventId] : s.savedEvents.filter((e) => e !== eventId) }))
      return willAdd
    },
    setPref: (k, v) => patch((s) => ({ ...s, prefs: { ...s.prefs, [k]: v } })),
    bumpPhotos: () => setPhotoVersion((v) => v + 1),
    resetDemo: async () => {
      await clearPhotos()
      removeKey(brand.storageKey)
      setState({ ...initialState() })
      setPhotoVersion((v) => v + 1)
    },
  }

  return <AppCtx.Provider value={value}>{children}</AppCtx.Provider>
}

export function useApp() {
  const ctx = useContext(AppCtx)
  if (!ctx) throw new Error('useApp fora do AppStateProvider')
  return ctx
}
