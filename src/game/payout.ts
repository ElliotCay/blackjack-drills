/**
 * Règlement d'un coup.
 *
 * Convention comptable : la mise quitte la bankroll au moment où elle est
 * posée. Le règlement rend `returned` — mise récupérée comprise — et `net`
 * n'exprime que la variation finale. Un coup gagné rend donc 2x la mise pour un
 * net de +1x. Cette séparation est ce qui permet de vérifier qu'aucun jeton
 * n'est créé ni détruit.
 */

import { isBlackjack, valueOf, type Card } from '../engine/cards.ts'
import type { RuleSet } from '../engine/rules.ts'
import type { HandResult, PlayerHand, RoundState } from './round.ts'

export interface Settlement {
  results: HandResult[]
  /** Variation de bankroll due à l'assurance seule. */
  insuranceNet: number
  /** Somme rendue au joueur, assurance comprise. */
  totalReturned: number
  /** Variation nette de la bankroll sur le coup. */
  totalNet: number
  dealerBlackjack: boolean
}

function result(outcome: HandResult['outcome'], stake: number, net: number): HandResult {
  return { outcome, stake, net, returned: stake + net }
}

/** Résolution ordinaire : le croupier n'a pas blackjack. */
function resolveAgainstDealer(
  hand: PlayerHand,
  dealerCards: readonly Card[],
  rules: RuleSet,
): HandResult {
  // Un 21 issu d'une séparation n'est pas un blackjack.
  if (isBlackjack(hand.cards) && !hand.fromSplit) {
    return result('blackjack', hand.stake, hand.stake * rules.blackjackPays)
  }

  // Le joueur qui saute a perdu avant même que le croupier ne joue.
  if (hand.busted) return result('lose', hand.stake, -hand.stake)

  const player = valueOf(hand.cards).total
  const dealer = valueOf(dealerCards)

  if (dealer.busted || player > dealer.total) return result('win', hand.stake, hand.stake)
  if (player < dealer.total) return result('lose', hand.stake, -hand.stake)
  return result('push', hand.stake, 0)
}

/**
 * Résolution quand le croupier abat un blackjack.
 *
 * En France il le complète après le tour du joueur, et il emporte alors la mise
 * entière : doublement et séparation compris. La variante « mise d'origine
 * seulement », qu'on trouve ailleurs, ne prélève qu'une mise de base sur
 * l'ensemble du coup et rend tout le reste.
 */
function resolveDealerBlackjack(
  hands: readonly PlayerHand[],
  baseBet: number,
  rules: RuleSet,
): HandResult[] {
  const bustedBets = !rules.holeCard && rules.bustedBets

  if (bustedBets) {
    return hands.map((hand) =>
      isBlackjack(hand.cards) && !hand.fromSplit
        ? result('push', hand.stake, 0)
        : result('dealerBlackjack', hand.stake, -hand.stake),
    )
  }

  // Une seule mise de base est perdue sur tout le coup.
  let remainingLoss = baseBet
  return hands.map((hand) => {
    if (isBlackjack(hand.cards) && !hand.fromSplit) return result('push', hand.stake, 0)
    const lost = Math.min(remainingLoss, hand.stake)
    remainingLoss -= lost
    return result(lost > 0 ? 'dealerBlackjack' : 'push', hand.stake, -lost)
  })
}

export function settle(state: RoundState, rules: RuleSet): Settlement {
  const dealerBlackjack = isBlackjack(state.dealer)

  const results = dealerBlackjack
    ? resolveDealerBlackjack(state.hands, state.baseBet, rules)
    : state.hands.map((hand) => resolveAgainstDealer(hand, state.dealer, rules))

  // L'assurance est payée 2 pour 1 : elle rapporte deux fois sa mise.
  const insuranceNet = state.insurance
    ? dealerBlackjack
      ? state.insurance * 2
      : -state.insurance
    : 0
  const insuranceReturned = state.insurance + insuranceNet

  let totalReturned = state.insurance ? insuranceReturned : 0
  let totalNet = insuranceNet
  for (const hand of results) {
    totalReturned += hand.returned
    totalNet += hand.net
  }

  return { results, insuranceNet, totalReturned, totalNet, dealerBlackjack }
}
