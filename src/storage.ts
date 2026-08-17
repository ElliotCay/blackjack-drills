/**
 * Persistance locale. Tout tient dans le navigateur : aucune donnée ne sort,
 * et l'app reste utilisable hors ligne.
 *
 * Le schéma est versionné. Une version inconnue est repartie de zéro plutôt que
 * lue de travers — perdre un historique d'entraînement est bénin, l'interpréter
 * mal fausserait la pondération du drill.
 */

import type { ProgressMap } from './drill/scheduler.ts'
import { DEFAULT_SETTINGS, sanitizeSettings, type Settings } from './settings/settings.ts'

export const STORAGE_KEY = 'blackjack-drills'
export const SCHEMA_VERSION = 1

export interface SessionSummary {
  /** Horodatage de fin. */
  at: number
  hands: number
  correct: number
  /** Somme des coûts d'erreur, en euros par euro misé. */
  evLost: number
  /** Conseils activés pendant cette session ? */
  coaching: boolean
}

export interface GameTotals {
  handsPlayed: number
  /** Résultat net réel, en euros. */
  net: number
  /** Résultat qu'aurait donné un jeu parfait sur les mêmes donnes. */
  netIfPerfect: number
  /** Nombre de décisions prises et nombre d'écarts à la stratégie. */
  decisions: number
  mistakes: number
  /** Total misé, pour rapporter le résultat à l'exposition. */
  wagered: number
}

export function emptyGameTotals(): GameTotals {
  return {
    handsPlayed: 0,
    net: 0,
    netIfPerfect: 0,
    decisions: 0,
    mistakes: 0,
    wagered: 0,
  }
}

export interface PersistedState {
  version: number
  progress: ProgressMap
  settings: Settings
  bankroll: number
  game: GameTotals
  sessions: SessionSummary[]
}

export function defaultState(): PersistedState {
  return {
    version: SCHEMA_VERSION,
    progress: {},
    settings: { ...DEFAULT_SETTINGS },
    bankroll: DEFAULT_SETTINGS.startingBankroll,
    game: emptyGameTotals(),
    sessions: [],
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

/** Relit un état persisté en écartant tout ce qui n'a pas la forme attendue. */
export function parseState(raw: string | null): PersistedState {
  if (!raw) return defaultState()

  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return defaultState()
  }

  if (!isRecord(parsed) || parsed.version !== SCHEMA_VERSION) return defaultState()

  const base = defaultState()
  const settings = sanitizeSettings(parsed.settings)

  return {
    version: SCHEMA_VERSION,
    settings,
    progress: isRecord(parsed.progress) ? (parsed.progress as ProgressMap) : base.progress,
    bankroll:
      typeof parsed.bankroll === 'number' && Number.isFinite(parsed.bankroll)
        ? parsed.bankroll
        : settings.startingBankroll,
    game: isRecord(parsed.game) ? { ...base.game, ...(parsed.game as GameTotals) } : base.game,
    sessions: Array.isArray(parsed.sessions) ? (parsed.sessions as SessionSummary[]) : [],
  }
}

export function loadState(): PersistedState {
  if (typeof localStorage === 'undefined') return defaultState()
  try {
    return parseState(localStorage.getItem(STORAGE_KEY))
  } catch {
    return defaultState()
  }
}

export function saveState(state: PersistedState): void {
  if (typeof localStorage === 'undefined') return
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  } catch {
    // Quota plein ou stockage refusé : l'entraînement continue sans historique.
  }
}

export function clearState(): void {
  if (typeof localStorage === 'undefined') return
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch {
    // Rien à faire de plus.
  }
}
