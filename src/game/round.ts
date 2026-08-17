/**
 * Déroulé d'un coup, conforme aux règles françaises.
 *
 * Le point qui change tout par rapport aux implémentations américaines : le
 * croupier ne prend qu'une carte à la donne. Il complète sa main après le tour
 * du joueur, et si un blackjack sort à ce moment-là, il emporte aussi les mises
 * doublées et séparées. On double donc « en aveugle », et c'est exactement le
 * risque que ce mode doit faire ressentir.
 */

import { isBlackjack, valueOf, type Card, type Rank } from '../engine/cards.ts'
import type { Action } from '../engine/ev.ts'
import { referenceDecision, type ReferenceDecision } from '../engine/strategy.ts'
import type { RuleSet } from '../engine/rules.ts'
import { draw, type Shoe } from './shoe.ts'

export type Phase = 'betting' | 'insurance' | 'playing' | 'showdown' | 'settled'

export interface PlayerHand {
  cards: Card[]
  /** Mise engagée sur cette main, doublement compris. */
  stake: number
  doubled: boolean
  fromSplit: boolean
  /** As séparé : une seule carte, puis arrêt forcé. */
  frozen: boolean
  done: boolean
  busted: boolean
}

export interface Mistake {
  handIndex: number
  cards: Card[]
  upcard: Rank
  chosen: Action
  best: Action
  /** Coût de l'écart, en euros par euro misé. */
  cost: number
}

export interface RoundState {
  phase: Phase
  hands: PlayerHand[]
  /** Index de la main en cours. */
  active: number
  dealer: Card[]
  baseBet: number
  insurance: number
  /** Décisions prises et écarts relevés pendant le coup. */
  decisions: number
  mistakes: Mistake[]
  results: HandResult[] | null
  insuranceNet: number
}

export type Outcome = 'blackjack' | 'win' | 'push' | 'lose' | 'dealerBlackjack'

export interface HandResult {
  outcome: Outcome
  stake: number
  /** Variation de bankroll pour cette main, mise récupérée exclue. */
  net: number
  /** Somme rendue au joueur : mise récupérée + gain. */
  returned: number
}

function newHand(cards: Card[], stake: number, fromSplit = false, frozen = false): PlayerHand {
  return { cards, stake, doubled: false, fromSplit, frozen, done: false, busted: false }
}

export function upcardOf(state: RoundState): Rank {
  return state.dealer[0].rank
}

// --- Donne -------------------------------------------------------------------

export function startRound(shoe: Shoe, bet: number, rules: RuleSet): RoundState {
  const player = [draw(shoe), draw(shoe)]
  const dealer = [draw(shoe)]

  const state: RoundState = {
    phase: 'playing',
    hands: [newHand(player, bet)],
    active: 0,
    dealer,
    baseBet: bet,
    insurance: 0,
    decisions: 0,
    mistakes: [],
    results: null,
    insuranceNet: 0,
  }

  // Le croupier propose l'assurance sur un as, avant que le joueur ne joue.
  if (dealer[0].rank === 1) {
    state.phase = 'insurance'
    return state
  }

  return afterInsurance(state, rules)
}

/**
 * Une fois l'assurance réglée, un joueur qui a blackjack n'a plus rien à
 * décider : il attend que le croupier complète.
 */
function afterInsurance(state: RoundState, rules: RuleSet): RoundState {
  if (isBlackjack(state.hands[0].cards)) {
    const hands = [{ ...state.hands[0], done: true }]
    return { ...state, hands, phase: 'showdown' }
  }
  void rules
  return { ...state, phase: 'playing' }
}

export function takeInsurance(state: RoundState, amount: number, rules: RuleSet): RoundState {
  return afterInsurance({ ...state, insurance: amount }, rules)
}

export function declineInsurance(state: RoundState, rules: RuleSet): RoundState {
  return afterInsurance(state, rules)
}

// --- Actions disponibles -----------------------------------------------------

export interface Availability {
  hit: boolean
  stand: boolean
  double: boolean
  split: boolean
}

export function availableActions(
  state: RoundState,
  rules: RuleSet,
  bankroll: number,
): Availability {
  if (state.phase !== 'playing') {
    return { hit: false, stand: false, double: false, split: false }
  }
  const hand = state.hands[state.active]
  if (!hand || hand.done) return { hit: false, stand: false, double: false, split: false }

  const twoCards = hand.cards.length === 2
  const { total } = valueOf(hand.cards)
  const canAfford = bankroll >= hand.stake

  const doubleAllowed =
    twoCards &&
    !hand.frozen &&
    canAfford &&
    (rules.doubleAnyTwo || total === 9 || total === 10 || total === 11) &&
    (!hand.fromSplit || rules.doubleAfterSplit)

  const splitAllowed =
    twoCards &&
    !hand.frozen &&
    canAfford &&
    hand.cards[0].rank === hand.cards[1].rank &&
    state.hands.length < rules.maxSplitHands

  return {
    hit: !hand.frozen,
    stand: true,
    double: doubleAllowed,
    split: splitAllowed,
  }
}

/**
 * Ce que la stratégie de base recommande pour la main en cours, compte tenu de
 * ce qui est réellement jouable.
 */
export function adviceFor(
  state: RoundState,
  rules: RuleSet,
  bankroll: number,
): ReferenceDecision | null {
  if (state.phase !== 'playing') return null
  const hand = state.hands[state.active]
  if (!hand || hand.done) return null

  const options = availableActions(state, rules, bankroll)
  return referenceDecision(
    hand.cards.map((c) => c.rank),
    upcardOf(state),
    { allowDouble: options.double, allowSplit: options.split },
    rules,
  )
}

// --- Jouer une action --------------------------------------------------------

function advance(state: RoundState): RoundState {
  let active = state.active
  while (active < state.hands.length && state.hands[active].done) active++
  if (active >= state.hands.length) {
    return { ...state, active: state.hands.length - 1, phase: 'showdown' }
  }
  return { ...state, active }
}

function recordDecision(
  state: RoundState,
  chosen: Action,
  advice: ReferenceDecision | null,
): RoundState {
  const decisions = state.decisions + 1
  if (!advice || advice.action === chosen) return { ...state, decisions }

  const hand = state.hands[state.active]
  const chosenEv = advice.evs[chosen]
  const bestEv = advice.evs[advice.action] ?? 0
  const cost = chosenEv === null || chosenEv === undefined ? advice.margin : bestEv - chosenEv

  return {
    ...state,
    decisions,
    mistakes: [
      ...state.mistakes,
      {
        handIndex: state.active,
        cards: [...hand.cards],
        upcard: upcardOf(state),
        chosen,
        best: advice.action,
        cost,
      },
    ],
  }
}

export function play(
  state: RoundState,
  action: Action,
  shoe: Shoe,
  rules: RuleSet,
  bankroll: number,
): { state: RoundState; extraStake: number } {
  const advice = adviceFor(state, rules, bankroll)
  let next = recordDecision(state, action, advice)
  const index = next.active
  const hand = { ...next.hands[index], cards: [...next.hands[index].cards] }
  let extraStake = 0

  switch (action) {
    case 'stand':
      hand.done = true
      break

    case 'hit': {
      hand.cards.push(draw(shoe))
      const value = valueOf(hand.cards)
      if (value.busted) {
        hand.busted = true
        hand.done = true
      }
      break
    }

    case 'double': {
      extraStake = hand.stake
      hand.stake *= 2
      hand.doubled = true
      hand.cards.push(draw(shoe))
      if (valueOf(hand.cards).busted) hand.busted = true
      hand.done = true
      break
    }

    case 'split': {
      const splittingAces = hand.cards[0].rank === 1 && rules.splitAcesOneCard
      extraStake = next.baseBet

      const first = newHand([hand.cards[0], draw(shoe)], next.baseBet, true, splittingAces)
      const second = newHand([hand.cards[1], draw(shoe)], next.baseBet, true, splittingAces)
      if (splittingAces) {
        first.done = true
        second.done = true
      }

      const hands = [...next.hands]
      hands.splice(index, 1, first, second)
      next = { ...next, hands }
      return { state: advance(next), extraStake }
    }

    case 'surrender':
      hand.done = true
      break
  }

  const hands = [...next.hands]
  hands[index] = hand
  next = { ...next, hands }
  return { state: advance(next), extraStake }
}

// --- Tour du croupier --------------------------------------------------------

/**
 * Le croupier prend sa deuxième carte, puis complète. Il ne tire au-delà que si
 * une main du joueur est encore en lice : inutile de brûler le sabot sinon.
 */
export function playDealer(state: RoundState, shoe: Shoe, rules: RuleSet): RoundState {
  const dealer = [...state.dealer, draw(shoe)]

  const playerStillIn = state.hands.some((h) => !h.busted && !isBlackjack(h.cards))
  const dealerHasBlackjack = isBlackjack(dealer)

  if (playerStillIn && !dealerHasBlackjack) {
    for (;;) {
      const { total, soft, busted } = valueOf(dealer)
      if (busted) break
      const mustHit = total < 17 || (rules.dealerHitsSoft17 && soft && total === 17)
      if (!mustHit) break
      dealer.push(draw(shoe))
    }
  }

  return { ...state, dealer, phase: 'settled' }
}
