/**
 * Représentation des cartes et des mains.
 *
 * Le moteur raisonne en « rangs » 1..10 où 1 = As et 10 regroupe 10/V/D/R.
 * L'affichage, lui, garde la vraie carte (figure + couleur) : à la table on lit
 * des cartes, pas des totaux.
 */

/** 1 = As, 10 = 10, Valet, Dame ou Roi. */
export type Rank = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10

export const RANKS: readonly Rank[] = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]

export type Suit = '♠' | '♥' | '♦' | '♣'

export const SUITS: readonly Suit[] = ['♠', '♥', '♦', '♣']

/** Étiquettes françaises : Valet, Dame, Roi. */
export type Face =
  | 'A' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '10' | 'V' | 'D' | 'R'

/** Les 13 figures d'une couleur, dans l'ordre du paquet. */
export const FACES: readonly Face[] = [
  'A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'V', 'D', 'R',
]

export interface Card {
  readonly face: Face
  readonly suit: Suit
  /** Rang de calcul : les figures valent toutes 10. */
  readonly rank: Rank
}

export function rankOfFace(face: Face): Rank {
  if (face === 'A') return 1
  if (face === 'V' || face === 'D' || face === 'R') return 10
  return Number(face) as Rank
}

export function makeCard(face: Face, suit: Suit): Card {
  return { face, suit, rank: rankOfFace(face) }
}

export function isRed(card: Card): boolean {
  return card.suit === '♥' || card.suit === '♦'
}

/** Clé stable d'une carte, pour les listes React et les tests. */
export function cardKey(card: Card): string {
  return `${card.face}${card.suit}`
}

// --- Totaux -----------------------------------------------------------------

export interface HandValue {
  /** Meilleur total ne dépassant pas 21 (l'as compté 11 si possible). */
  readonly total: number
  /** Vrai si un as est compté 11 — la main est « souple ». */
  readonly soft: boolean
  /** Total avec tous les as comptés 1. */
  readonly hard: number
  readonly busted: boolean
}

export function valueOfRanks(ranks: readonly Rank[]): HandValue {
  let hard = 0
  let hasAce = false
  for (const r of ranks) {
    hard += r
    if (r === 1) hasAce = true
  }
  const canSoften = hasAce && hard + 10 <= 21
  return {
    hard,
    total: canSoften ? hard + 10 : hard,
    soft: canSoften,
    busted: hard > 21,
  }
}

export function valueOf(cards: readonly Card[]): HandValue {
  return valueOfRanks(cards.map((c) => c.rank))
}

/** Blackjack = 21 en deux cartes exactement. */
export function isBlackjack(cards: readonly Card[]): boolean {
  return cards.length === 2 && valueOf(cards).total === 21
}

export function isPair(cards: readonly Card[]): boolean {
  return cards.length === 2 && cards[0].rank === cards[1].rank
}

// --- Composition du sabot ---------------------------------------------------

/**
 * Nombre de cartes restantes par rang. Index 0 inutilisé, 1..10 utilisés.
 * Sur 6 jeux : 24 cartes de chaque rang 1..9, et 96 de rang 10 (10/V/D/R).
 */
export type Composition = number[]

export function freshComposition(decks: number): Composition {
  const comp: Composition = new Array(11).fill(0)
  for (let r = 1; r <= 9; r++) comp[r] = 4 * decks
  comp[10] = 16 * decks
  return comp
}

export function countCards(comp: Composition): number {
  let n = 0
  for (let r = 1; r <= 10; r++) n += comp[r]
  return n
}

/** Retire des rangs d'une composition. Renvoie une copie. */
export function removeRanks(comp: Composition, ranks: readonly Rank[]): Composition {
  const next = comp.slice()
  for (const r of ranks) {
    if (next[r] <= 0) throw new Error(`Impossible de retirer un rang ${r} : plus aucune carte`)
    next[r]--
  }
  return next
}

/** Clé de mémoïsation d'une composition. */
export function compositionKey(comp: Composition): string {
  return comp.slice(1, 11).join(',')
}
