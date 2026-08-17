/**
 * Espérance de gain de chaque action, pour une mise d'une unité.
 *
 * Décomposition centrale : « le croupier a blackjack » et « il ne l'a pas » sont
 * deux événements disjoints. Le second se résout normalement ; le premier coûte
 * une somme qui dépend de ce qu'on a engagé — et c'est précisément là que les
 * règles françaises mordent. Sans carte cachée, on double ou on sépare *avant*
 * de savoir, et un blackjack du croupier emporte alors la mise entière. C'est ce
 * terme qui rend « 11 contre 10 » tirable plutôt que doublable.
 */

import { RANKS, type Composition, type Rank, countCards } from './cards.ts'
import { withoutBlackjack, type DealerDist } from './dealer.ts'
import type { RuleSet } from './rules.ts'

export type Action = 'stand' | 'hit' | 'double' | 'split' | 'surrender'

export interface ActionEvs {
  stand: number
  hit: number
  /** null si l'action est interdite dans cette situation. */
  double: number | null
  split: number | null
  surrender: number | null
}

/** Probabilité de tirer chaque rang, index 1..10. */
export type DrawProbs = number[]

export function drawProbs(comp: Composition): DrawProbs {
  const total = countCards(comp)
  const probs: DrawProbs = new Array(11).fill(0)
  if (total === 0) return probs
  for (let r = 1; r <= 10; r++) probs[r] = comp[r] / total
  return probs
}

// --- Résolution face au croupier (monde « sans blackjack ») ------------------

function compare(playerTotal: number, dealerTotal: number): number {
  if (playerTotal > dealerTotal) return 1
  if (playerTotal < dealerTotal) return -1
  return 0
}

/**
 * EV de rester, sachant que le croupier n'a pas blackjack.
 * `dist` doit être la distribution déjà conditionnée (voir `withoutBlackjack`).
 */
export function standGiven(playerTotal: number, dist: DealerDist): number {
  if (playerTotal > 21) return -1
  return (
    dist.bust +
    dist.t17 * compare(playerTotal, 17) +
    dist.t18 * compare(playerTotal, 18) +
    dist.t19 * compare(playerTotal, 19) +
    dist.t20 * compare(playerTotal, 20) +
    dist.t21 * compare(playerTotal, 21)
  )
}

interface HitContext {
  probs: DrawProbs
  dist: DealerDist
  memo: Map<number, number>
}

function totalOf(hard: number, hasAce: boolean): number {
  return hasAce && hard + 10 <= 21 ? hard + 10 : hard
}

/**
 * EV de tirer puis de jouer au mieux (tirer encore ou rester), sachant que le
 * croupier n'a pas blackjack.
 *
 * Les probabilités de tirage sont figées sur la composition d'après la donne :
 * c'est l'approximation classique des générateurs de stratégie de base, et
 * l'écart avec un épuisement carte à carte est très en dessous du seuil qui
 * ferait basculer une case de la table.
 */
function hitGiven(hard: number, hasAce: boolean, ctx: HitContext): number {
  if (hard > 21) return -1
  const key = hard * 2 + (hasAce ? 1 : 0)
  const cached = ctx.memo.get(key)
  if (cached !== undefined) return cached

  let ev = 0
  for (const r of RANKS) {
    const p = ctx.probs[r]
    if (p === 0) continue
    const nextHard = hard + r
    if (nextHard > 21) {
      ev += p * -1
      continue
    }
    const nextAce = hasAce || r === 1
    const nextTotal = totalOf(nextHard, nextAce)
    const best = Math.max(standGiven(nextTotal, ctx.dist), hitGiven(nextHard, nextAce, ctx))
    ev += p * best
  }

  ctx.memo.set(key, ev)
  return ev
}

/** EV de doubler (une seule carte, mise x2), monde « sans blackjack ». */
function doubleGiven(hard: number, hasAce: boolean, ctx: HitContext): number {
  let ev = 0
  for (const r of RANKS) {
    const p = ctx.probs[r]
    if (p === 0) continue
    const nextHard = hard + r
    const nextTotal = nextHard > 21 ? 22 : totalOf(nextHard, hasAce || r === 1)
    ev += p * standGiven(nextTotal, ctx.dist)
  }
  return 2 * ev
}

// --- Le terme « blackjack du croupier » -------------------------------------

/**
 * Ce que coûte un blackjack du croupier, en unités, selon la mise engagée.
 * Avec carte cachée, le coup est annoncé avant qu'on n'engage quoi que ce soit :
 * on ne perd que la mise d'origine.
 */
function lossOnDealerBlackjack(stake: number, rules: RuleSet): number {
  if (rules.holeCard) return 1
  return rules.bustedBets ? stake : 1
}

function absolute(given: number, stake: number, dist: DealerDist, rules: RuleSet): number {
  return -dist.bj * lossOnDealerBlackjack(stake, rules) + (1 - dist.bj) * given
}

// --- Séparation --------------------------------------------------------------

/**
 * EV d'une des deux mains issues d'une séparation, monde « sans blackjack ».
 *
 * Le doublement après séparation engage une unité de plus, donc s'expose à une
 * perte supplémentaire face à un blackjack du croupier. On soustrait ce
 * surcoût — exprimé en unités conditionnelles — pour que la comparaison entre
 * doubler et ne pas doubler reste celle des EV absolues.
 */
function splitHandGiven(
  pairRank: Rank,
  ctx: HitContext,
  rules: RuleSet,
  extraStakeCost: number,
): number {
  let ev = 0
  const acesOneCard = pairRank === 1 && rules.splitAcesOneCard

  for (const r of RANKS) {
    const p = ctx.probs[r]
    if (p === 0) continue

    const hard = pairRank + r
    const hasAce = pairRank === 1 || r === 1
    const total = totalOf(hard, hasAce)

    if (acesOneCard) {
      // Un as séparé reçoit une carte et s'arrête. 21 ici n'est pas un blackjack.
      ev += p * standGiven(total, ctx.dist)
      continue
    }

    let best = Math.max(standGiven(total, ctx.dist), hitGiven(hard, hasAce, ctx))
    if (rules.doubleAfterSplit && (rules.doubleAnyTwo || total === 9 || total === 10 || total === 11)) {
      best = Math.max(best, doubleGiven(hard, hasAce, ctx) - extraStakeCost)
    }
    ev += p * best
  }

  return ev
}

// --- API ---------------------------------------------------------------------

export interface EvInput {
  /** Les cartes du joueur, en rangs (deux cartes pour une décision initiale). */
  playerRanks: readonly Rank[]
  upcard: Rank
  /** Composition du sabot APRÈS retrait des cartes visibles. */
  comp: Composition
  dist: DealerDist
  rules: RuleSet
  /**
   * Force l'indisponibilité de la séparation ou du doublement, même si la main
   * y semble éligible. Deux usages : une case « total dur » dont le représentant
   * est fortuitement une paire (20 = 10+10), et une main déjà tirée ou issue
   * d'une séparation d'as.
   */
  allowSplit?: boolean
  allowDouble?: boolean
}

/**
 * EV absolue de chaque action possible, mise d'une unité, blackjack du croupier
 * inclus.
 */
export function actionEvs(input: EvInput): ActionEvs {
  const { playerRanks, comp, dist, rules } = input
  const noBj = withoutBlackjack(dist)
  const ctx: HitContext = { probs: drawProbs(comp), dist: noBj, memo: new Map() }

  let hard = 0
  let hasAce = false
  for (const r of playerRanks) {
    hard += r
    if (r === 1) hasAce = true
  }
  const total = totalOf(hard, hasAce)
  const twoCards = playerRanks.length === 2
  const pair = twoCards && playerRanks[0] === playerRanks[1]

  const stand = absolute(standGiven(total, noBj), 1, dist, rules)
  const hit = absolute(hitGiven(hard, hasAce, ctx), 1, dist, rules)

  const mayDouble =
    (input.allowDouble ?? true) &&
    twoCards &&
    (rules.doubleAnyTwo || total === 9 || total === 10 || total === 11)
  const double = mayDouble
    ? absolute(doubleGiven(hard, hasAce, ctx), 2, dist, rules)
    : null

  let split: number | null = null
  if (pair && (input.allowSplit ?? true) && rules.maxSplitHands >= 2) {
    // Surcoût, en unités conditionnelles, d'une unité de mise supplémentaire
    // exposée au blackjack du croupier.
    const survive = 1 - dist.bj
    const extraStakeCost =
      rules.holeCard || !rules.bustedBets || survive <= 0 ? 0 : dist.bj / survive
    const perHand = splitHandGiven(playerRanks[0], ctx, rules, extraStakeCost)
    split = absolute(2 * perHand, 2, dist, rules)
  }

  const surrender = twoCards && rules.surrender ? -0.5 : null

  return { stand, hit, double, split, surrender }
}

export function bestOf(evs: ActionEvs): { action: Action; ev: number } {
  const candidates: [Action, number | null][] = [
    ['stand', evs.stand],
    ['hit', evs.hit],
    ['double', evs.double],
    ['split', evs.split],
    ['surrender', evs.surrender],
  ]
  let bestAction: Action = 'stand'
  let bestEv = -Infinity
  for (const [action, ev] of candidates) {
    if (ev === null) continue
    if (ev > bestEv) {
      bestEv = ev
      bestAction = action
    }
  }
  return { action: bestAction, ev: bestEv }
}
