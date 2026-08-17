/**
 * Sabot de six jeux, mélangé et coupé comme en salle.
 *
 * Une carte de coupe est placée aux trois quarts : le sabot n'est pas rebattu
 * en cours de coup, mais dès qu'elle est atteinte le coup suivant repart d'un
 * sabot neuf.
 */

import {
  FACES,
  SUITS,
  freshComposition,
  makeCard,
  type Card,
  type Composition,
} from '../engine/cards.ts'
import type { Rng } from '../drill/rng.ts'

/** Fraction du sabot distribuée avant rebattage. */
export const PENETRATION = 0.75

export interface Shoe {
  cards: Card[]
  /** Index de la prochaine carte à sortir. */
  index: number
  /** Une fois cet index atteint, le sabot sera rebattu au prochain coup. */
  cutIndex: number
  decks: number
}

function buildDeck(decks: number): Card[] {
  const cards: Card[] = []
  for (let d = 0; d < decks; d++) {
    for (const suit of SUITS) {
      for (const face of FACES) {
        cards.push(makeCard(face, suit))
      }
    }
  }
  return cards
}

function shuffle(cards: Card[], rng: Rng): void {
  for (let i = cards.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    const tmp = cards[i]
    cards[i] = cards[j]
    cards[j] = tmp
  }
}

export function createShoe(decks: number, rng: Rng): Shoe {
  const cards = buildDeck(decks)
  shuffle(cards, rng)
  return {
    cards,
    index: 0,
    cutIndex: Math.floor(cards.length * PENETRATION),
    decks,
  }
}

export function draw(shoe: Shoe): Card {
  if (shoe.index >= shoe.cards.length) {
    throw new Error('Sabot épuisé : il aurait dû être rebattu à la carte de coupe')
  }
  return shoe.cards[shoe.index++]
}

/** La carte de coupe est passée : on rebat avant le prochain coup. */
export function needsShuffle(shoe: Shoe): boolean {
  return shoe.index >= shoe.cutIndex
}

export function cardsRemaining(shoe: Shoe): number {
  return shoe.cards.length - shoe.index
}

export function decksRemaining(shoe: Shoe): number {
  return cardsRemaining(shoe) / 52
}

/** Fraction du sabot déjà distribuée, pour la jauge de pénétration. */
export function penetration(shoe: Shoe): number {
  return shoe.index / shoe.cards.length
}

/** Composition des cartes encore dans le sabot. */
export function remainingComposition(shoe: Shoe): Composition {
  const comp = freshComposition(shoe.decks)
  for (let i = 0; i < shoe.index; i++) {
    comp[shoe.cards[i].rank]--
  }
  return comp
}
