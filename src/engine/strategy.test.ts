import { describe, expect, it } from 'vitest'
import { makeCard, type Rank } from './cards.ts'
import { FRENCH_RULES } from './rules.ts'
import {
  buildChart,
  cellKeyForHand,
  decisionKey,
  frenchChart,
  lookup,
  UPCARDS,
} from './strategy.ts'
import type { Action } from './ev.ts'

const chart = frenchChart()

function actionFor(cellKey: string, upcard: Rank): Action {
  const d = chart.decisions.get(decisionKey(cellKey, upcard))
  if (!d) throw new Error(`case absente : ${cellKey} vs ${upcard}`)
  return d.action
}

describe('déviations propres aux règles françaises', () => {
  // Sans carte cachée, le croupier complète son blackjack après le tour du
  // joueur et emporte les mises doublées ou séparées. Ces quatre cases sont la
  // signature du jeu européen : une table américaine y donnerait une autre
  // réponse, et ferait perdre de l'argent.
  const deviations: [string, Rank, Action][] = [
    ['H11', 10, 'hit'],
    ['P8', 10, 'hit'],
    ['P8', 1, 'hit'],
    ['P1', 1, 'hit'],
  ]

  for (const [cell, upcard, expected] of deviations) {
    it(`${cell} contre ${upcard === 1 ? 'As' : upcard} → ${expected}`, () => {
      expect(actionFor(cell, upcard)).toBe(expected)
    })
  }

  it('marque ces cases comme divergentes d’une table à carte cachée', () => {
    for (const [cell, upcard] of deviations) {
      const d = chart.decisions.get(decisionKey(cell, upcard))!
      expect(d.frenchDeviation).toBe(true)
      expect(d.standardAction).not.toBe(d.action)
    }
  })

  it('c’est bien l’absence de carte cachée qui les provoque', () => {
    // Même sabot, même croupier S17 : on rétablit la carte cachée et 11 contre
    // 10 redevient un doublement, 8,8 contre 10 une séparation.
    const withHole = buildChart({ ...FRENCH_RULES, holeCard: true, bustedBets: false })
    expect(withHole.decisions.get(decisionKey('H11', 10))!.action).toBe('double')
    expect(withHole.decisions.get(decisionKey('P8', 10))!.action).toBe('split')
    expect(withHole.decisions.get(decisionKey('P1', 1))!.action).toBe('split')
  })

  it('ne signale aucune divergence ailleurs que sur 10 ou As', () => {
    for (const [key, d] of chart.decisions) {
      if (d.frenchDeviation) {
        expect([10, 1], `divergence inattendue sur ${key}`).toContain(d.upcard)
      }
    }
  })
})

describe('cases de référence de la stratégie de base', () => {
  const expected: [string, Rank, Action][] = [
    // Totaux durs
    ['H8', 5, 'hit'],
    ['H9', 2, 'hit'],
    ['H9', 3, 'double'],
    ['H9', 6, 'double'],
    ['H9', 7, 'hit'],
    ['H10', 9, 'double'],
    ['H10', 10, 'hit'],
    ['H11', 6, 'double'],
    ['H11', 1, 'hit'], // propre au S17 : on ne double pas 11 contre un as
    ['H12', 2, 'hit'],
    ['H12', 4, 'stand'],
    ['H13', 2, 'stand'],
    ['H16', 6, 'stand'],
    ['H16', 10, 'hit'],
    ['H17', 1, 'stand'],
    // Totaux souples
    ['S13', 5, 'double'],
    ['S15', 4, 'double'],
    ['S17', 3, 'double'],
    ['S18', 2, 'stand'],
    ['S18', 6, 'double'],
    ['S18', 8, 'stand'],
    ['S18', 9, 'hit'],
    ['S19', 6, 'stand'],
    // Paires
    ['P1', 6, 'split'],
    ['P2', 4, 'split'],
    ['P2', 8, 'hit'],
    ['P4', 4, 'hit'],
    ['P4', 5, 'split'],
    ['P5', 6, 'double'],
    ['P5', 10, 'hit'],
    ['P6', 6, 'split'],
    ['P7', 7, 'split'],
    ['P8', 6, 'split'],
    ['P9', 7, 'stand'],
    ['P9', 9, 'split'],
    ['P10', 6, 'stand'],
  ]

  for (const [cell, upcard, action] of expected) {
    it(`${cell} contre ${upcard === 1 ? 'As' : upcard} → ${action}`, () => {
      expect(actionFor(cell, upcard)).toBe(action)
    })
  }

  it('ne sépare jamais une paire de 10 ni une paire de 5', () => {
    for (const upcard of UPCARDS) {
      expect(actionFor('P10', upcard)).toBe('stand')
      expect(actionFor('P5', upcard)).not.toBe('split')
    }
  })

  it('reste toujours à 17 dur ou plus', () => {
    for (const total of [17, 18, 19, 20]) {
      for (const upcard of UPCARDS) {
        expect(actionFor(`H${total}`, upcard)).toBe('stand')
      }
    }
  })
})

describe('cohérence de la table', () => {
  it('couvre chaque case pour chaque carte visible', () => {
    expect(chart.cells).toHaveLength(34)
    for (const cell of chart.cells) {
      for (const upcard of UPCARDS) {
        expect(chart.decisions.has(decisionKey(cell.key, upcard))).toBe(true)
      }
    }
  })

  it('produit des EV bornées et une marge positive', () => {
    for (const [key, d] of chart.decisions) {
      for (const ev of [d.evs.stand, d.evs.hit, d.evs.double, d.evs.split]) {
        if (ev === null) continue
        expect(Number.isFinite(ev), key).toBe(true)
        expect(ev).toBeGreaterThanOrEqual(-2.001)
        expect(ev).toBeLessThanOrEqual(2.001)
      }
      expect(d.margin, key).toBeGreaterThanOrEqual(0)
    }
  })

  it('n’ouvre le doublement et la séparation que sur deux cartes cohérentes', () => {
    for (const [key, d] of chart.decisions) {
      expect(d.evs.double, key).not.toBeNull()
      if (d.cell.kind === 'pair') expect(d.evs.split, key).not.toBeNull()
      else expect(d.evs.split, key).toBeNull()
      // L'abandon n'est pas proposé en France.
      expect(d.evs.surrender, key).toBeNull()
    }
  })
})

describe('rattachement d’une vraie main à sa case', () => {
  it('reconnaît paires, mains souples et mains dures', () => {
    expect(cellKeyForHand([makeCard('8', '♠'), makeCard('8', '♥')])).toBe('P8')
    expect(cellKeyForHand([makeCard('A', '♠'), makeCard('A', '♥')])).toBe('P1')
    expect(cellKeyForHand([makeCard('R', '♠'), makeCard('D', '♥')])).toBe('P10')
    expect(cellKeyForHand([makeCard('A', '♠'), makeCard('6', '♥')])).toBe('S17')
    expect(cellKeyForHand([makeCard('9', '♠'), makeCard('7', '♥')])).toBe('H16')
    expect(cellKeyForHand([makeCard('V', '♠'), makeCard('6', '♥')])).toBe('H16')
  })

  it('ne rattache aucun blackjack : il n’y a rien à décider', () => {
    expect(cellKeyForHand([makeCard('A', '♠'), makeCard('R', '♥')])).toBeNull()
  })

  it('distingue 9+7 de 8+8, tous deux à 16', () => {
    const upcard: Rank = 10
    const mixed = lookup(chart, [makeCard('9', '♠'), makeCard('7', '♥')], upcard)!
    const pair = lookup(chart, [makeCard('8', '♠'), makeCard('8', '♥')], upcard)!
    expect(mixed.cell.key).toBe('H16')
    expect(pair.cell.key).toBe('P8')
    // Même total, mais la paire ouvre une option que l'autre n'a pas.
    expect(mixed.evs.split).toBeNull()
    expect(pair.evs.split).not.toBeNull()
  })
})
