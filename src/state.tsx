/** État persisté, partagé par les deux modes. */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import type { CellProgress, ProgressMap } from './drill/scheduler.ts'
import type { Settings } from './settings/settings.ts'
import {
  defaultState,
  loadState,
  saveState,
  type GameTotals,
  type PersistedState,
  type SessionSummary,
} from './storage.ts'

interface Store {
  state: PersistedState
  setSettings: (patch: Partial<Settings>) => void
  setProgress: (key: string, progress: CellProgress) => void
  addSession: (summary: SessionSummary) => void
  setBankroll: (bankroll: number) => void
  setGameTotals: (totals: GameTotals) => void
  resetProgress: () => void
  resetGame: () => void
}

const StoreContext = createContext<Store | null>(null)

export function StoreProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<PersistedState>(() => loadState())

  // L'écriture est différée : une session de drill enchaîne les réponses vite,
  // et sérialiser à chaque frappe n'apporte rien.
  const timer = useRef<number | null>(null)
  useEffect(() => {
    if (timer.current !== null) window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => saveState(state), 250)
    return () => {
      if (timer.current !== null) window.clearTimeout(timer.current)
    }
  }, [state])

  // Une fermeture d'onglet ne doit pas emporter les dernières réponses.
  useEffect(() => {
    const flush = () => saveState(state)
    window.addEventListener('pagehide', flush)
    return () => window.removeEventListener('pagehide', flush)
  }, [state])

  const setSettings = useCallback((patch: Partial<Settings>) => {
    setState((prev) => ({ ...prev, settings: { ...prev.settings, ...patch } }))
  }, [])

  const setProgress = useCallback((key: string, progress: CellProgress) => {
    setState((prev) => ({ ...prev, progress: { ...prev.progress, [key]: progress } }))
  }, [])

  const addSession = useCallback((summary: SessionSummary) => {
    setState((prev) => ({ ...prev, sessions: [...prev.sessions, summary].slice(-100) }))
  }, [])

  const setBankroll = useCallback((bankroll: number) => {
    setState((prev) => ({ ...prev, bankroll }))
  }, [])

  const setGameTotals = useCallback((game: GameTotals) => {
    setState((prev) => ({ ...prev, game }))
  }, [])

  const resetProgress = useCallback(() => {
    setState((prev) => ({ ...prev, progress: {}, sessions: [] }))
  }, [])

  const resetGame = useCallback(() => {
    setState((prev) => ({
      ...prev,
      bankroll: prev.settings.startingBankroll,
      game: defaultState().game,
    }))
  }, [])

  const value = useMemo<Store>(
    () => ({
      state,
      setSettings,
      setProgress,
      addSession,
      setBankroll,
      setGameTotals,
      resetProgress,
      resetGame,
    }),
    [state, setSettings, setProgress, addSession, setBankroll, setGameTotals, resetProgress, resetGame],
  )

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>
}

export function useStore(): Store {
  const store = useContext(StoreContext)
  if (!store) throw new Error('useStore doit être utilisé dans un StoreProvider')
  return store
}

export function useSettings(): Settings {
  return useStore().state.settings
}

export function useProgress(): ProgressMap {
  return useStore().state.progress
}
