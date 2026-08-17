import { describe, expect, it } from 'vitest'
import { freshComposition, removeRanks, type Rank } from './cards.ts'
import { dealerOutcomes, distTotal, withoutBlackjack } from './dealer.ts'
import { FRENCH_RULES } from './rules.ts'

const UPCARDS: Rank[] = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]

function distFor(upcard: Rank) {
  const comp = removeRanks(freshComposition(FRENCH_RULES.decks), [upcard])
  return dealerOutcomes(upcard, comp, FRENCH_RULES)
}

describe('distribution du croupier', () => {
  it('somme à 1 pour chaque carte visible', () => {
    for (const upcard of UPCARDS) {
      expect(distTotal(distFor(upcard))).toBeCloseTo(1, 10)
    }
  })

  it('ne compte un blackjack que sur as ou 10', () => {
    for (const upcard of UPCARDS) {
      const dist = distFor(upcard)
      if (upcard === 1 || upcard === 10) expect(dist.bj).toBeGreaterThan(0)
      else expect(dist.bj).toBe(0)
    }
  })

  it('donne la probabilité exacte de blackjack : as puis 10', () => {
    // 6 jeux = 312 cartes ; une fois la carte visible retirée il en reste 311.
    // As visible : 96 bûches possibles. Dix visible : 24 as possibles.
    expect(distFor(1).bj).toBeCloseTo(96 / 311, 12)
    expect(distFor(10).bj).toBeCloseTo(24 / 311, 12)
  })

  it('reste sur 17 souple (S17)', () => {
    // Avec un as visible et S17, A+6 s'arrête à 17 : la masse sur 17 est forte.
    // En H17 elle basculerait sur les totaux supérieurs et sur le bust.
    const dist = distFor(1)
    const h17 = dealerOutcomes(
      1,
      removeRanks(freshComposition(FRENCH_RULES.decks), [1]),
      { ...FRENCH_RULES, dealerHitsSoft17: true },
    )
    expect(dist.t17).toBeGreaterThan(h17.t17)
    expect(dist.bust).toBeLessThan(h17.bust)
  })

  it('retrouve les probabilités de bust publiées (S17, 6 jeux)', () => {
    // Valeurs de référence, non conditionnées : les mains de blackjack comptent
    // dans le dénominateur, comme dans les tables usuelles.
    const expected: Record<number, number> = {
      2: 0.3536,
      3: 0.3739,
      4: 0.3958,
      5: 0.4164,
      6: 0.4232,
      7: 0.2586,
      8: 0.2386,
      9: 0.2334,
      10: 0.2143,
      1: 0.1165,
    }
    for (const upcard of UPCARDS) {
      expect(Math.abs(distFor(upcard).bust - expected[upcard])).toBeLessThan(0.006)
    }
  })

  it('sépare le bust brut du bust sachant qu’il n’a pas blackjack', () => {
    // Sur as visible, écarter les blackjacks concentre la masse restante sur des
    // mains qui tirent : le taux de bust conditionnel monte nettement.
    const ace = distFor(1)
    expect(withoutBlackjack(ace).bust).toBeGreaterThan(ace.bust * 1.3)
  })

  it('rend le croupier bien plus fragile sur 6 que sur 10', () => {
    expect(distFor(6).bust).toBeGreaterThan(distFor(10).bust * 1.8)
  })
})
