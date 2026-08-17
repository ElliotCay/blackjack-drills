/**
 * Choix de la prochaine main à réviser.
 *
 * Un tirage uniforme ferait perdre du temps : on réviserait « 20 contre 6 »
 * aussi souvent que les cases réellement difficiles. Le poids d'une case est
 * donc le produit de trois quantités :
 *
 *   fréquence réelle  ×  coût d'une erreur  ×  méconnaissance
 *
 * La première vient du sabot lui-même, la deuxième de l'écart d'espérance entre
 * la bonne action et la deuxième meilleure, la troisième d'un système de boîtes
 * à la Leitner. Le produit est l'espérance de gain à réviser cette case-là :
 * c'est ce qu'on veut maximiser à chaque question.
 */

import {
  FACES,
  SUITS,
  freshComposition,
  makeCard,
  type Card,
  type Face,
  type Rank,
} from '../engine/cards.ts'
import {
  decisionKey,
  UPCARDS,
  type Cell,
  type CellDecision,
  type StrategyChart,
} from '../engine/strategy.ts'
import { pick, weightedPick, type Rng } from './rng.ts'

// --- Progression par case ----------------------------------------------------

export interface CellProgress {
  /** Boîte de Leitner, de 1 (à revoir) à 5 (acquis). */
  box: number
  seen: number
  correct: number
  /** Horodatage de la dernière apparition. */
  lastSeen: number
  /** Cumul des temps de réponse, pour la moyenne. */
  totalMs: number
}

export const MAX_BOX = 5

export function emptyProgress(): CellProgress {
  return { box: 1, seen: 0, correct: 0, lastSeen: 0, totalMs: 0 }
}

/** Une bonne réponse promeut d'une boîte, une erreur ramène à la première. */
export function updateProgress(
  progress: CellProgress,
  correct: boolean,
  elapsedMs: number,
  now: number,
): CellProgress {
  return {
    box: correct ? Math.min(progress.box + 1, MAX_BOX) : 1,
    seen: progress.seen + 1,
    correct: progress.correct + (correct ? 1 : 0),
    lastSeen: now,
    totalMs: progress.totalMs + elapsedMs,
  }
}

// --- Fréquence naturelle d'une case ------------------------------------------

/**
 * Probabilité qu'une donne de deux cartes tombe sur cette case, multipliée par
 * celle de la carte visible du croupier. Calculée sur un sabot neuf.
 */
export function naturalFrequency(cell: Cell, upcard: Rank, decks = 6): number {
  const comp = freshComposition(decks)
  let n = 0
  for (let r = 1; r <= 10; r++) n += comp[r]

  const ordered = n * (n - 1)
  let handProb: number

  if (cell.kind === 'pair') {
    const c = comp[cell.value]
    handProb = (c * (c - 1)) / ordered
  } else if (cell.kind === 'soft') {
    const kicker = cell.value - 11
    handProb = (2 * comp[1] * comp[kicker]) / ordered
  } else {
    handProb = 0
    for (const [a, b] of hardCombos(cell.value)) {
      handProb += (2 * comp[a] * comp[b]) / ordered
    }
  }

  return handProb * (comp[upcard] / n)
}

/** Paires de cartes non appariées et sans as totalisant `total`. */
export function hardCombos(total: number): [Rank, Rank][] {
  const combos: [Rank, Rank][] = []
  for (let a = 2; a <= 10; a++) {
    const b = total - a
    if (b > a && b <= 10) combos.push([a as Rank, b as Rank])
  }
  return combos
}

/**
 * Une case est jouable au drill si une vraie donne de deux cartes peut la
 * produire. « 20 dur » ne l'est pas : en deux cartes, 20 est soit une paire de
 * bûches, soit A,9 — donc jamais un total dur non apparié.
 */
export function isDrillable(cell: Cell): boolean {
  if (cell.kind !== 'hard') return true
  return hardCombos(cell.value).length > 0
}

// --- Pondération -------------------------------------------------------------

export interface WeightOptions {
  /** Cases vues récemment dans la session, pour éviter les répétitions. */
  recent?: readonly string[]
  decks?: number
}

/**
 * Approximation de la probabilité de se tromper selon la boîte. L'amplitude
 * (20x entre « jamais su » et « acquis ») reflète l'écart réel entre une case
 * découverte et une case répétée cinq fois de suite sans faute.
 */
const BOX_WEIGHT = [0, 20, 10, 5, 2, 1]

/**
 * Plancher sur le coût d'erreur : sans lui, les cases quasi indifférentes
 * (« A,7 contre 2 », deux actions à trois millièmes près) ne sortiraient
 * jamais. Elles comptent peu, mais elles doivent rester visitables.
 */
const MARGIN_FLOOR = 0.01

export function cellWeight(
  decision: CellDecision,
  progress: CellProgress,
  options: WeightOptions = {},
): number {
  const decks = options.decks ?? 6
  const frequency = naturalFrequency(decision.cell, decision.upcard, decks)
  const cost = MARGIN_FLOOR + decision.margin
  const box = BOX_WEIGHT[Math.min(Math.max(progress.box, 1), MAX_BOX)]

  // Une case jamais vue mérite d'être découverte avant d'être re-testée.
  const unseenBonus = progress.seen === 0 ? 1.5 : 1

  let weight = frequency * cost * box * unseenBonus

  const recent = options.recent ?? []
  const position = recent.indexOf(decisionKey(decision.cell.key, decision.upcard))
  if (position !== -1) {
    // D'autant plus pénalisée qu'elle vient de sortir.
    weight *= 0.05 + 0.15 * position
  }

  return Math.max(weight, 1e-12)
}

// --- Sélection ---------------------------------------------------------------

export interface Question {
  decision: CellDecision
  playerCards: [Card, Card]
  dealerCard: Card
}

function randomSuit(rng: Rng) {
  return pick(SUITS, rng)
}

/** Une figure au hasard parmi celles qui valent ce rang (10, V, D ou R). */
function randomFaceForRank(rank: Rank, rng: Rng): Face {
  if (rank === 10) return pick(['10', 'V', 'D', 'R'] as Face[], rng)
  if (rank === 1) return 'A'
  return FACES[rank - 1]
}

function cardOfRank(rank: Rank, rng: Rng): Card {
  return makeCard(randomFaceForRank(rank, rng), randomSuit(rng))
}

/**
 * Fabrique une vraie donne pour une case. Un « 16 » sort tantôt en 10+6, tantôt
 * en 9+7 : à la table on lit des cartes, pas des totaux, et deux mains de même
 * total ne se jouent pas forcément pareil.
 */
export function dealForDecision(decision: CellDecision, rng: Rng): Question {
  const { cell } = decision
  let ranks: [Rank, Rank]

  if (cell.kind === 'pair') {
    ranks = [cell.value as Rank, cell.value as Rank]
  } else if (cell.kind === 'soft') {
    ranks = [1, (cell.value - 11) as Rank]
  } else {
    ranks = pick(hardCombos(cell.value), rng)
  }

  const order = rng() < 0.5 ? ranks : ([ranks[1], ranks[0]] as [Rank, Rank])
  const playerCards: [Card, Card] = [cardOfRank(order[0], rng), cardOfRank(order[1], rng)]

  // Deux cartes de même rang ne peuvent pas partager la même couleur.
  if (playerCards[0].face === playerCards[1].face && playerCards[0].suit === playerCards[1].suit) {
    const others = SUITS.filter((s) => s !== playerCards[0].suit)
    playerCards[1] = makeCard(playerCards[1].face, pick(others, rng))
  }

  return {
    decision,
    playerCards,
    dealerCard: cardOfRank(decision.upcard, rng),
  }
}

export type ProgressMap = Record<string, CellProgress>

export function progressFor(progress: ProgressMap, key: string): CellProgress {
  return progress[key] ?? emptyProgress()
}

/** Toutes les cases jouables, décision comprise. */
export function drillableDecisions(chart: StrategyChart): CellDecision[] {
  const out: CellDecision[] = []
  for (const cell of chart.cells) {
    if (!isDrillable(cell)) continue
    for (const upcard of UPCARDS) {
      const decision = chart.decisions.get(decisionKey(cell.key, upcard))
      if (decision) out.push(decision)
    }
  }
  return out
}

export function nextQuestion(
  chart: StrategyChart,
  progress: ProgressMap,
  rng: Rng,
  options: WeightOptions = {},
): Question {
  const pool = drillableDecisions(chart)
  const weights = pool.map((decision) =>
    cellWeight(
      decision,
      progressFor(progress, decisionKey(decision.cell.key, decision.upcard)),
      { ...options, decks: options.decks ?? chart.rules.decks },
    ),
  )
  return dealForDecision(weightedPick(pool, weights, rng), rng)
}
