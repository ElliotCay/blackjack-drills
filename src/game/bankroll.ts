/**
 * Bankroll et suivi d'une partie.
 *
 * Le chiffre qui fait progresser n'est pas le solde : c'est la séparation entre
 * ce que la variance explique et ce que le jeu explique. On additionne donc, à
 * chaque écart à la stratégie, l'espérance abandonnée. Sans cette colonne, une
 * session perdante n'apprend rien et une session gagnante conforte les erreurs.
 */

import { countCards, freshComposition, type Card } from '../engine/cards.ts'
import type { Action } from '../engine/ev.ts'
import type { RuleSet } from '../engine/rules.ts'
import type { Rng } from '../drill/rng.ts'
import { emptyGameTotals, type GameTotals } from '../storage.ts'
import { settle, type Settlement } from './payout.ts'
import {
  availableActions,
  play,
  playDealer,
  startRound,
  takeInsurance as applyInsurance,
  declineInsurance as skipInsurance,
  type RoundState,
} from './round.ts'
import { createShoe, needsShuffle, type Shoe } from './shoe.ts'

export interface GameSession {
  rules: RuleSet
  shoe: Shoe
  bankroll: number
  totals: GameTotals
  round: RoundState | null
  lastSettlement: Settlement | null
  /** Vrai si le sabot vient d'être rebattu avant ce coup. */
  justShuffled: boolean
  rng: Rng
}

export function createSession(rules: RuleSet, bankroll: number, rng: Rng): GameSession {
  return {
    rules,
    shoe: createShoe(rules.decks, rng),
    bankroll,
    totals: emptyGameTotals(),
    round: null,
    lastSettlement: null,
    justShuffled: false,
    rng,
  }
}

/**
 * Espérance de l'assurance, par euro assuré. Sans comptage elle est toujours
 * négative : c'est un pari sur une bûche à un peu moins d'une chance sur trois,
 * payé 2 contre 1.
 */
export function insuranceEv(visible: readonly Card[], rules: RuleSet): number {
  const comp = freshComposition(rules.decks)
  for (const card of visible) comp[card.rank]--
  const tenProbability = comp[10] / countCards(comp)
  return 3 * tenProbability - 1
}

export function placeBet(session: GameSession, bet: number): GameSession {
  if (bet <= 0 || bet > session.bankroll) return session

  // La carte de coupe est passée : on repart d'un sabot neuf.
  const reshuffled = needsShuffle(session.shoe)
  const shoe = reshuffled ? createShoe(session.rules.decks, session.rng) : session.shoe

  return {
    ...session,
    shoe,
    justShuffled: reshuffled,
    bankroll: session.bankroll - bet,
    round: startRound(shoe, bet, session.rules),
    lastSettlement: null,
    totals: { ...session.totals, wagered: session.totals.wagered + bet },
  }
}

export function act(session: GameSession, action: Action): GameSession {
  if (!session.round) return session

  const available = availableActions(session.round, session.rules, session.bankroll)
  if (!available[action as keyof typeof available]) return session

  const { state, extraStake } = play(
    session.round,
    action,
    session.shoe,
    session.rules,
    session.bankroll,
  )

  return {
    ...session,
    round: state,
    bankroll: session.bankroll - extraStake,
    totals: { ...session.totals, wagered: session.totals.wagered + extraStake },
  }
}

export function takeInsurance(session: GameSession, amount: number): GameSession {
  if (!session.round || session.round.phase !== 'insurance') return session
  const capped = Math.min(amount, session.bankroll, session.round.baseBet / 2)
  if (capped <= 0) return declineInsurance(session)

  return {
    ...session,
    bankroll: session.bankroll - capped,
    round: applyInsurance(session.round, capped, session.rules),
    totals: { ...session.totals, wagered: session.totals.wagered + capped },
  }
}

export function declineInsurance(session: GameSession): GameSession {
  if (!session.round || session.round.phase !== 'insurance') return session
  return { ...session, round: skipInsurance(session.round, session.rules) }
}

/** Le croupier complète sa main, puis le coup est réglé. */
export function finishRound(session: GameSession): GameSession {
  if (!session.round || session.round.phase !== 'showdown') return session

  const round = playDealer(session.round, session.shoe, session.rules)
  const settlement = settle(round, session.rules)

  // Espérance abandonnée : chaque écart coûte sa marge, rapportée à la mise.
  let evLost = 0
  for (const mistake of round.mistakes) {
    evLost += mistake.cost * round.baseBet
  }

  // Prendre l'assurance est un écart à part entière : le pari est perdant.
  let insuranceMistakes = 0
  if (round.insurance > 0) {
    const visible = [...round.hands[0].cards, round.dealer[0]]
    evLost += -insuranceEv(visible, session.rules) * round.insurance
    insuranceMistakes = 1
  }

  return {
    ...session,
    round: { ...round, results: settlement.results, insuranceNet: settlement.insuranceNet },
    bankroll: session.bankroll + settlement.totalReturned,
    lastSettlement: settlement,
    totals: {
      ...session.totals,
      handsPlayed: session.totals.handsPlayed + round.hands.length,
      net: session.totals.net + settlement.totalNet,
      evLost: session.totals.evLost + evLost,
      decisions: session.totals.decisions + round.decisions + insuranceMistakes,
      mistakes: session.totals.mistakes + round.mistakes.length + insuranceMistakes,
    },
  }
}

// --- Lecture du bilan --------------------------------------------------------

export interface GameReport {
  handsPlayed: number
  /** Résultat réel, en euros. */
  net: number
  wagered: number
  /** Ce que les écarts à la stratégie ont coûté, en euros. */
  evLost: number
  /** Résultat une fois les erreurs neutralisées : ce que la variance explique. */
  netCorrected: number
  /** Espérance d'un jeu parfait sur le même volume misé. */
  expectedPerfect: number
  accuracy: number | null
}

/**
 * Avantage de la maison sous les règles françaises, en stratégie de base.
 * Sert de repère : même parfaitement joué, le jeu reste perdant sur la durée.
 */
export const HOUSE_EDGE = 0.0062

export function report(totals: GameTotals): GameReport {
  return {
    handsPlayed: totals.handsPlayed,
    net: totals.net,
    wagered: totals.wagered,
    evLost: totals.evLost,
    netCorrected: totals.net + totals.evLost,
    expectedPerfect: -HOUSE_EDGE * totals.wagered,
    accuracy:
      totals.decisions === 0 ? null : (totals.decisions - totals.mistakes) / totals.decisions,
  }
}
