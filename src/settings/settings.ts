/** Réglages partagés par les deux modes. */

export interface Settings {
  /**
   * Toggle « conseils ».
   * Activé : l'espérance de chaque action est affichée avant la décision, et la
   * correction est expliquée dans la foulée.
   * Coupé : rien avant, un simple ✓/✗ après, et l'explication attend le bilan de
   * fin de session — les conditions de la table.
   */
  coaching: boolean
  /** Bankroll de départ du mode partie, en euros. */
  startingBankroll: number
  /** Mise proposée par défaut. */
  defaultBet: number
  /** Nombre de mains par session de drill. */
  handsPerSession: number
}

export const DEFAULT_SETTINGS: Settings = {
  coaching: true,
  startingBankroll: 500,
  defaultBet: 10,
  handsPerSession: 20,
}

/** Jetons proposés à la mise, en euros. */
export const CHIPS: readonly number[] = [1, 5, 10, 25, 100]

export function sanitizeSettings(raw: unknown): Settings {
  if (!raw || typeof raw !== 'object') return { ...DEFAULT_SETTINGS }
  const input = raw as Partial<Settings>
  return {
    coaching: typeof input.coaching === 'boolean' ? input.coaching : DEFAULT_SETTINGS.coaching,
    startingBankroll: positive(input.startingBankroll, DEFAULT_SETTINGS.startingBankroll),
    defaultBet: positive(input.defaultBet, DEFAULT_SETTINGS.defaultBet),
    handsPerSession: Math.round(positive(input.handsPerSession, DEFAULT_SETTINGS.handsPerSession)),
  }
}

function positive(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : fallback
}
