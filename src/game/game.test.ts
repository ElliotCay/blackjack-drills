import { describe, expect, it } from 'vitest'
import { cardKey, isBlackjack, makeCard, valueOf, type Card } from '../engine/cards.ts'
import { FRENCH_RULES } from '../engine/rules.ts'
import { mulberry32 } from '../drill/rng.ts'
import {
  act,
  createSession,
  declineInsurance,
  finishRound,
  placeBet,
  report,
  takeInsurance,
  type GameSession,
} from './bankroll.ts'
import { settle } from './payout.ts'
import type { PlayerHand, RoundState } from './round.ts'
import { availableActions } from './round.ts'
import { cardsRemaining, createShoe, draw, needsShuffle, PENETRATION } from './shoe.ts'

const rules = FRENCH_RULES

describe('sabot', () => {
  it('contient six jeux complets sans doublon', () => {
    const shoe = createShoe(6, mulberry32(1))
    expect(shoe.cards).toHaveLength(312)
    const counts = new Map<string, number>()
    for (const card of shoe.cards) {
      counts.set(cardKey(card), (counts.get(cardKey(card)) ?? 0) + 1)
    }
    expect(counts.size).toBe(52)
    for (const n of counts.values()) expect(n).toBe(6)
  })

  it('mélange réellement', () => {
    const a = createShoe(6, mulberry32(1)).cards.map(cardKey).join()
    const b = createShoe(6, mulberry32(2)).cards.map(cardKey).join()
    expect(a).not.toBe(b)
  })

  it('signale la carte de coupe aux trois quarts', () => {
    const shoe = createShoe(6, mulberry32(3))
    expect(needsShuffle(shoe)).toBe(false)
    while (cardsRemaining(shoe) > 312 * (1 - PENETRATION)) draw(shoe)
    expect(needsShuffle(shoe)).toBe(true)
  })

  it('ne sort jamais deux fois la même carte', () => {
    const shoe = createShoe(6, mulberry32(4))
    const seen = new Set<Card>()
    while (cardsRemaining(shoe) > 0) {
      const card = draw(shoe)
      expect(seen.has(card)).toBe(false)
      seen.add(card)
    }
  })
})

// --- Coups fabriqués à la main ----------------------------------------------

function hand(cards: Card[], stake: number, extra: Partial<PlayerHand> = {}): PlayerHand {
  return {
    cards,
    stake,
    doubled: false,
    fromSplit: false,
    frozen: false,
    done: true,
    busted: valueOf(cards).busted,
    ...extra,
  }
}

function round(hands: PlayerHand[], dealer: Card[], baseBet = 10, insurance = 0): RoundState {
  return {
    phase: 'settled',
    hands,
    active: 0,
    dealer,
    baseBet,
    insurance,
    decisions: 0,
    mistakes: [],
    results: null,
    insuranceNet: 0,
  }
}

describe('paiements', () => {
  it('paie le blackjack 3 pour 2', () => {
    const state = round([hand([makeCard('A', '♠'), makeCard('R', '♥')], 10)], [
      makeCard('9', '♦'),
      makeCard('7', '♣'),
    ])
    const { results } = settle(state, rules)
    expect(results[0].outcome).toBe('blackjack')
    expect(results[0].net).toBe(15)
    expect(results[0].returned).toBe(25)
  })

  it('rend la mise sur deux blackjacks', () => {
    const state = round([hand([makeCard('A', '♠'), makeCard('R', '♥')], 10)], [
      makeCard('A', '♦'),
      makeCard('D', '♣'),
    ])
    const { results } = settle(state, rules)
    expect(results[0].outcome).toBe('push')
    expect(results[0].returned).toBe(10)
  })

  it('fait perdre la mise doublée entière face à un blackjack du croupier', () => {
    // C'est la règle française qui fait mal : le croupier complète après coup.
    const doubledHand = hand([makeCard('6', '♠'), makeCard('5', '♥'), makeCard('9', '♦')], 20, {
      doubled: true,
    })
    const state = round([doubledHand], [makeCard('A', '♦'), makeCard('R', '♣')])
    const { results } = settle(state, rules)
    expect(results[0].outcome).toBe('dealerBlackjack')
    expect(results[0].net).toBe(-20)
    expect(results[0].returned).toBe(0)
  })

  it('ne prélève qu’une mise de base sous la variante « mise d’origine seulement »', () => {
    const doubledHand = hand([makeCard('6', '♠'), makeCard('5', '♥'), makeCard('9', '♦')], 20, {
      doubled: true,
    })
    const state = round([doubledHand], [makeCard('A', '♦'), makeCard('R', '♣')])
    const { results } = settle(state, { ...rules, bustedBets: false })
    expect(results[0].net).toBe(-10)
    expect(results[0].returned).toBe(10)
  })

  it('fait perdre les deux mains séparées face à un blackjack du croupier', () => {
    const hands = [
      hand([makeCard('8', '♠'), makeCard('3', '♥')], 10, { fromSplit: true }),
      hand([makeCard('8', '♦'), makeCard('9', '♣')], 10, { fromSplit: true }),
    ]
    const state = round(hands, [makeCard('R', '♦'), makeCard('A', '♣')])
    const { totalNet, totalReturned } = settle(state, rules)
    expect(totalNet).toBe(-20)
    expect(totalReturned).toBe(0)
  })

  it('ne traite pas un 21 issu d’une séparation comme un blackjack', () => {
    const splitHand = hand([makeCard('A', '♠'), makeCard('R', '♥')], 10, { fromSplit: true })
    const state = round([splitHand], [makeCard('R', '♦'), makeCard('9', '♣')])
    const { results } = settle(state, rules)
    expect(results[0].outcome).toBe('win')
    expect(results[0].net).toBe(10)
  })

  it('paie l’assurance 2 pour 1 et la perd sinon', () => {
    const player = hand([makeCard('R', '♠'), makeCard('9', '♥')], 10)

    const won = settle(round([player], [makeCard('A', '♦'), makeCard('D', '♣')], 10, 5), rules)
    expect(won.insuranceNet).toBe(10)
    expect(won.totalNet).toBe(0) // -10 sur la main, +10 sur l'assurance

    const lost = settle(round([player], [makeCard('A', '♦'), makeCard('7', '♣')], 10, 5), rules)
    expect(lost.insuranceNet).toBe(-5)
  })

  it('fait perdre la main du joueur qui saute même si le croupier saute aussi', () => {
    const busted = hand([makeCard('R', '♠'), makeCard('7', '♥'), makeCard('8', '♦')], 10)
    const state = round([busted], [makeCard('6', '♦'), makeCard('R', '♣'), makeCard('9', '♠')])
    const { results } = settle(state, rules)
    expect(results[0].outcome).toBe('lose')
    expect(results[0].net).toBe(-10)
  })
})

// --- Partie complète simulée -------------------------------------------------

/** Joue un coup entier en suivant la stratégie de base. */
function playOptimalRound(session: GameSession, bet: number): GameSession {
  let s = placeBet(session, bet)
  if (!s.round) return s

  if (s.round.phase === 'insurance') s = declineInsurance(s)

  let guard = 0
  while (s.round && s.round.phase === 'playing') {
    if (guard++ > 50) throw new Error('coup qui ne se termine pas')
    const available = availableActions(s.round, s.rules, s.bankroll)
    const advice = s.round.hands[s.round.active]
    const value = valueOf(advice.cards)
    // Stratégie volontairement simpliste : le but est d'exercer la mécanique,
    // pas de rejouer la table.
    const action =
      available.split && advice.cards[0].rank === 8
        ? 'split'
        : available.double && value.total === 11
          ? 'double'
          : value.total < 17
            ? 'hit'
            : 'stand'
    s = act(s, action)
  }

  return finishRound(s)
}

describe('partie complète', () => {
  it('ne crée ni ne détruit de jetons sur 10 000 mains', () => {
    const rng = mulberry32(1234)
    let session = createSession(rules, 1_000_000, rng)
    const start = session.bankroll

    for (let i = 0; i < 10_000; i++) {
      session = playOptimalRound(session, 10)
      expect(session.round?.phase).toBe('settled')
    }

    // La bankroll finale doit s'expliquer exactement par la somme des résultats.
    expect(session.bankroll).toBeCloseTo(start + session.totals.net, 6)
    expect(session.totals.handsPlayed).toBeGreaterThanOrEqual(10_000)
  })

  it('rebat le sabot à la carte de coupe et ne l’épuise jamais', () => {
    const rng = mulberry32(77)
    let session = createSession(rules, 1_000_000, rng)
    for (let i = 0; i < 5_000; i++) {
      session = playOptimalRound(session, 10)
      expect(cardsRemaining(session.shoe)).toBeGreaterThan(0)
    }
  })

  it('reste dans une fourchette de résultat plausible', () => {
    // 10 000 mains à 10 € : l'avantage de la maison sur des règles françaises
    // situe le résultat autour de -600 €. On vérifie l'ordre de grandeur, pas
    // la valeur exacte — la stratégie simplifiée ci-dessus joue un peu moins
    // bien que la table.
    const rng = mulberry32(2026)
    let session = createSession(rules, 1_000_000, rng)
    for (let i = 0; i < 10_000; i++) session = playOptimalRound(session, 10)

    const perHand = session.totals.net / session.totals.handsPlayed
    expect(perHand).toBeLessThan(0.1)
    expect(perHand).toBeGreaterThan(-0.6)
  })

  it('compte l’assurance comme un écart et en chiffre le coût', () => {
    const rng = mulberry32(5)
    let session = createSession(rules, 10_000, rng)

    // On cherche un coup où l'assurance est proposée.
    let guard = 0
    for (;;) {
      if (guard++ > 500) throw new Error('aucune assurance proposée')
      session = placeBet(session, 10)
      if (session.round?.phase === 'insurance') break
      // Coup sans assurance : on le termine proprement.
      let s = session
      while (s.round && s.round.phase === 'playing') s = act(s, 'stand')
      session = finishRound(s)
    }

    session = takeInsurance(session, 5)
    let s = session
    while (s.round && s.round.phase === 'playing') s = act(s, 'stand')
    s = finishRound(s)

    expect(s.totals.mistakes).toBeGreaterThanOrEqual(1)
    expect(s.totals.evLost).toBeGreaterThan(0)
  })
})

describe('bilan', () => {
  it('sépare la variance du jeu', () => {
    const summary = report({
      handsPlayed: 100,
      net: -50,
      wagered: 1000,
      evLost: 30,
      decisions: 120,
      mistakes: 12,
    })
    // Le résultat corrigé neutralise les erreurs : ce qui reste est la variance.
    expect(summary.netCorrected).toBe(-20)
    expect(summary.expectedPerfect).toBeCloseTo(-6.2, 6)
    expect(summary.accuracy).toBeCloseTo(0.9, 6)
  })
})

describe('règles du coup', () => {
  it('gèle les as séparés après une seule carte', () => {
    const rng = mulberry32(11)
    let session = createSession(rules, 1000, rng)
    // On force une paire d'as en tête de sabot.
    session.shoe.cards[0] = makeCard('A', '♠')
    session.shoe.cards[1] = makeCard('A', '♥')
    session.shoe.cards[2] = makeCard('7', '♦')

    session = placeBet(session, 10)
    if (session.round?.phase === 'insurance') session = declineInsurance(session)
    session = act(session, 'split')

    expect(session.round!.hands).toHaveLength(2)
    for (const h of session.round!.hands) {
      expect(h.cards).toHaveLength(2)
      expect(h.frozen).toBe(true)
      expect(h.done).toBe(true)
    }
    expect(session.round!.phase).toBe('showdown')
  })

  it('n’autorise pas de troisième séparation', () => {
    const rng = mulberry32(13)
    let session = createSession(rules, 1000, rng)
    session.shoe.cards[0] = makeCard('8', '♠')
    session.shoe.cards[1] = makeCard('8', '♥')
    session.shoe.cards[2] = makeCard('5', '♦')
    session.shoe.cards[3] = makeCard('8', '♣')
    session.shoe.cards[4] = makeCard('8', '♦')

    session = placeBet(session, 10)
    if (session.round?.phase === 'insurance') session = declineInsurance(session)
    session = act(session, 'split')

    expect(availableActions(session.round!, rules, session.bankroll).split).toBe(false)
  })

  it('ne laisse pas doubler sans la mise correspondante', () => {
    const rng = mulberry32(17)
    let session = createSession(rules, 10, rng)
    session = placeBet(session, 10)
    if (session.round?.phase === 'insurance') session = declineInsurance(session)
    expect(session.bankroll).toBe(0)
    expect(availableActions(session.round!, rules, session.bankroll).double).toBe(false)
  })

  it('n’attribue pas de blackjack au croupier avant qu’il ait complété', () => {
    const rng = mulberry32(19)
    let session = createSession(rules, 1000, rng)
    session = placeBet(session, 10)
    // À la donne, le croupier n'a qu'une carte : aucun blackjack possible.
    expect(session.round!.dealer).toHaveLength(1)
    expect(isBlackjack(session.round!.dealer)).toBe(false)
  })
})
