/**
 * Table de stratégie de base, calculée et non recopiée.
 *
 * Chaque case est évaluée deux fois : une fois sous les règles françaises, une
 * fois sous des règles à carte cachée. Quand les deux réponses diffèrent, la
 * case est marquée : ce sont exactement les coups où une table américaine
 * trouvée en ligne ferait perdre de l'argent à une table française.
 */

import {
  freshComposition,
  isPair,
  removeRanks,
  valueOf,
  type Card,
  type Rank,
} from './cards.ts'
import { dealerOutcomes } from './dealer.ts'
import { actionEvs, bestOf, type Action, type ActionEvs } from './ev.ts'
import { FRENCH_RULES, type RuleSet } from './rules.ts'

export type CellKind = 'hard' | 'soft' | 'pair'

export interface Cell {
  key: string
  kind: CellKind
  /** Total pour hard/soft ; rang de la paire pour pair (1 = as). */
  value: number
  /** Étiquette lisible : « 16 », « A,6 », « 8,8 ». */
  label: string
  ranks: readonly [Rank, Rank]
}

export interface CellDecision {
  cell: Cell
  upcard: Rank
  action: Action
  evs: ActionEvs
  /** Écart d'EV entre la meilleure action et la deuxième. */
  margin: number
  /** Probabilité que le croupier saute avec cette carte visible. */
  dealerBust: number
  /** Probabilité qu'il complète un blackjack. */
  dealerBlackjack: number
  /** Ce qu'on jouerait à une table avec carte cachée. */
  standardAction: Action
  /** Vrai si la règle française change la réponse. */
  frenchDeviation: boolean
}

export const UPCARDS: readonly Rank[] = [2, 3, 4, 5, 6, 7, 8, 9, 10, 1]

// --- Énumération des cases ---------------------------------------------------

/** Deux cartes non appariées totalisant `total`, sans as. */
function hardRepresentative(total: number): [Rank, Rank] {
  for (let a = 2; a <= 10; a++) {
    const b = total - a
    if (b >= 2 && b <= 10 && a !== b) return [a as Rank, b as Rank]
  }
  // Seul 20 n'a pas de combinaison non appariée sans as (10+10).
  const half = Math.floor(total / 2)
  return [half as Rank, (total - half) as Rank]
}

export function buildCells(): Cell[] {
  const cells: Cell[] = []

  for (let total = 5; total <= 20; total++) {
    cells.push({
      key: `H${total}`,
      kind: 'hard',
      value: total,
      label: String(total),
      ranks: hardRepresentative(total),
    })
  }

  // A,2 (13) jusqu'à A,9 (20). A,10 est un blackjack : aucune décision à prendre.
  for (let total = 13; total <= 20; total++) {
    const kicker = (total - 11) as Rank
    cells.push({
      key: `S${total}`,
      kind: 'soft',
      value: total,
      label: `A,${kicker}`,
      ranks: [1, kicker],
    })
  }

  for (let r = 1; r <= 10; r++) {
    const rank = r as Rank
    const face = r === 1 ? 'A' : String(r)
    cells.push({
      key: `P${r}`,
      kind: 'pair',
      value: r,
      label: `${face},${face}`,
      ranks: [rank, rank],
    })
  }

  return cells
}

// --- Calcul de la table ------------------------------------------------------

function decide(cell: Cell, upcard: Rank, rules: RuleSet): CellDecision {
  const comp = removeRanks(freshComposition(rules.decks), [...cell.ranks, upcard])
  const dist = dealerOutcomes(upcard, comp, rules)
  const allowSplit = cell.kind === 'pair'
  const evs = actionEvs({ playerRanks: cell.ranks, upcard, comp, dist, rules, allowSplit })
  const best = bestOf(evs)

  const others = [evs.stand, evs.hit, evs.double, evs.split, evs.surrender].filter(
    (v): v is number => v !== null && v !== best.ev,
  )
  const runnerUp = others.length > 0 ? Math.max(...others) : best.ev

  // Même situation, mais à une table où le croupier a une carte cachée.
  const standardRules: RuleSet = { ...rules, holeCard: true, bustedBets: false }
  const standardDist = dealerOutcomes(upcard, comp, standardRules)
  const standardBest = bestOf(
    actionEvs({
      playerRanks: cell.ranks,
      upcard,
      comp,
      dist: standardDist,
      rules: standardRules,
      allowSplit,
    }),
  )

  return {
    cell,
    upcard,
    action: best.action,
    evs,
    margin: best.ev - runnerUp,
    dealerBust: dist.bust,
    dealerBlackjack: dist.bj,
    standardAction: standardBest.action,
    frenchDeviation: standardBest.action !== best.action,
  }
}

export interface StrategyChart {
  rules: RuleSet
  cells: Cell[]
  /** Clé : `${cell.key}|${upcard}`. */
  decisions: Map<string, CellDecision>
}

export function decisionKey(cellKey: string, upcard: Rank): string {
  return `${cellKey}|${upcard}`
}

export function buildChart(rules: RuleSet = FRENCH_RULES): StrategyChart {
  const cells = buildCells()
  const decisions = new Map<string, CellDecision>()
  for (const cell of cells) {
    for (const upcard of UPCARDS) {
      decisions.set(decisionKey(cell.key, upcard), decide(cell, upcard, rules))
    }
  }
  return { rules, cells, decisions }
}

let cachedChart: StrategyChart | null = null

/** Table des règles françaises, calculée une seule fois. */
export function frenchChart(): StrategyChart {
  if (!cachedChart) cachedChart = buildChart(FRENCH_RULES)
  return cachedChart
}

// --- Recherche depuis une vraie main ----------------------------------------

/** Clé de la case correspondant à une main de deux cartes. */
export function cellKeyForHand(cards: readonly Card[]): string | null {
  if (cards.length !== 2) return null
  if (isPair(cards)) return `P${cards[0].rank}`
  const { total, soft } = valueOf(cards)
  if (total === 21) return null // blackjack
  return soft ? `S${total}` : `H${total}`
}

export function lookup(
  chart: StrategyChart,
  cards: readonly Card[],
  upcard: Rank,
): CellDecision | null {
  const key = cellKeyForHand(cards)
  if (!key) return null
  return chart.decisions.get(decisionKey(key, upcard)) ?? null
}

// --- Décision de référence sur une main quelconque ---------------------------

export interface HandOptions {
  allowDouble: boolean
  allowSplit: boolean
}

export interface ReferenceDecision {
  action: Action
  evs: ActionEvs
  margin: number
}

const referenceCache = new Map<string, ReferenceDecision>()

/**
 * Décision optimale pour une main de taille quelconque — y compris déjà tirée,
 * où seuls tirer et rester restent ouverts.
 *
 * Le sabot pris en compte est un sabot neuf moins les cartes visibles, et non
 * le sabot réel : sans mode comptage, être noté sur une information qu'on n'est
 * pas censé suivre n'aurait aucun sens. C'est aussi ce qui garantit que la
 * correction en partie et la table consultable disent la même chose.
 */
export function referenceDecision(
  ranks: readonly Rank[],
  upcard: Rank,
  options: HandOptions,
  rules: RuleSet = FRENCH_RULES,
): ReferenceDecision {
  const key = `${[...ranks].sort((a, b) => a - b).join('-')}|${upcard}|${
    options.allowDouble ? 'd' : ''
  }${options.allowSplit ? 's' : ''}|${rules.decks}${rules.holeCard ? 'h' : ''}`

  const cached = referenceCache.get(key)
  if (cached) return cached

  const comp = removeRanks(freshComposition(rules.decks), [...ranks, upcard])
  const dist = dealerOutcomes(upcard, comp, rules)
  const evs = actionEvs({
    playerRanks: ranks,
    upcard,
    comp,
    dist,
    rules,
    allowDouble: options.allowDouble,
    allowSplit: options.allowSplit,
  })
  const best = bestOf(evs)

  const others = [evs.stand, evs.hit, evs.double, evs.split, evs.surrender].filter(
    (v): v is number => v !== null && v !== best.ev,
  )
  const runnerUp = others.length > 0 ? Math.max(...others) : best.ev

  const decision: ReferenceDecision = {
    action: best.action,
    evs,
    margin: best.ev - runnerUp,
  }
  referenceCache.set(key, decision)
  return decision
}

// --- Libellés ----------------------------------------------------------------

export const ACTION_LABELS: Record<Action, string> = {
  hit: 'Tirer',
  stand: 'Rester',
  double: 'Doubler',
  split: 'Séparer',
  surrender: 'Abandonner',
}

export const ACTION_SHORT: Record<Action, string> = {
  hit: 'T',
  stand: 'R',
  double: 'D',
  split: 'S',
  surrender: 'A',
}

function pct(x: number): string {
  return `${(x * 100).toFixed(1).replace('.', ',')} %`
}

/**
 * Phrase de correction : pourquoi cette action, et ce que coûte l'erreur.
 * Volontairement chiffrée — on retient mieux une hiérarchie qu'une consigne.
 */
export function explainDecision(decision: CellDecision, chosen?: Action): string {
  const parts: string[] = []
  const best = ACTION_LABELS[decision.action]

  if (decision.frenchDeviation) {
    parts.push(
      `Case piégeuse : à une table avec carte cachée on jouerait « ${ACTION_LABELS[decision.standardAction]} », ` +
        `mais ici le croupier complète son blackjack après ton tour et emporte les mises doublées ou séparées. ` +
        `D'où « ${best} ».`,
    )
  } else if (decision.upcard >= 2 && decision.upcard <= 6) {
    parts.push(`Le croupier saute ${pct(decision.dealerBust)} du temps avec cette carte.`)
  } else {
    parts.push(
      `Carte forte pour le croupier : il ne saute que ${pct(decision.dealerBust)} du temps.`,
    )
  }

  if (chosen && chosen !== decision.action) {
    const chosenEv = decision.evs[chosen]
    if (chosenEv !== null && chosenEv !== undefined) {
      const cost = decision.evs[decision.action]! - chosenEv
      parts.push(
        `« ${ACTION_LABELS[chosen]} » coûte ${cost.toFixed(3).replace('.', ',')} € par euro misé ` +
          `par rapport à « ${best} ».`,
      )
    }
  }

  return parts.join(' ')
}

/** Gain moyen attendu de l'action optimale, en euros par euro misé. */
export function expectedValueOf(decision: CellDecision): number {
  const ev = decision.evs[decision.action]
  return ev ?? 0
}
