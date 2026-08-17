import { describe, expect, it } from 'vitest'
import { isPair, valueOf } from '../engine/cards.ts'
import { decisionKey, frenchChart } from '../engine/strategy.ts'
import { mulberry32 } from './rng.ts'
import {
  cellWeight,
  dealForDecision,
  drillableDecisions,
  emptyProgress,
  hardCombos,
  isDrillable,
  MAX_BOX,
  naturalFrequency,
  nextQuestion,
  updateProgress,
  type ProgressMap,
} from './scheduler.ts'
import { overview, weakestCells } from './stats.ts'

const chart = frenchChart()

describe('boîtes de Leitner', () => {
  it('promeut sur une bonne réponse et remet à zéro sur une erreur', () => {
    let p = emptyProgress()
    p = updateProgress(p, true, 1000, 1)
    p = updateProgress(p, true, 1000, 2)
    expect(p.box).toBe(3)
    p = updateProgress(p, false, 1000, 3)
    expect(p.box).toBe(1)
    expect(p.seen).toBe(3)
    expect(p.correct).toBe(2)
  })

  it('plafonne à la dernière boîte', () => {
    let p = emptyProgress()
    for (let i = 0; i < 20; i++) p = updateProgress(p, true, 500, i)
    expect(p.box).toBe(MAX_BOX)
  })
})

describe('cases jouables', () => {
  it('exclut « 20 dur », qu’aucune donne de deux cartes ne produit', () => {
    // En deux cartes, 20 est soit 10+10 (une paire), soit A,9 (une main souple).
    expect(hardCombos(20)).toHaveLength(0)
    const hard20 = chart.cells.find((c) => c.key === 'H20')!
    expect(isDrillable(hard20)).toBe(false)
    expect(drillableDecisions(chart).some((d) => d.cell.key === 'H20')).toBe(false)
  })

  it('garde toutes les autres cases', () => {
    // 34 cases moins « 20 dur », sur 10 cartes visibles.
    expect(drillableDecisions(chart)).toHaveLength(33 * 10)
  })
})

describe('pondération du tirage', () => {
  const decisionOf = (cellKey: string, upcard: number) =>
    chart.decisions.get(decisionKey(cellKey, upcard as never))!

  it('privilégie une case mal sue sur une case acquise', () => {
    const decision = decisionOf('H16', 10)
    const fresh = cellWeight(decision, { ...emptyProgress(), box: 1 })
    const learned = cellWeight(decision, { ...emptyProgress(), box: MAX_BOX, seen: 9, correct: 9 })
    expect(fresh).toBeGreaterThan(learned * 8)
  })

  it('privilégie une erreur coûteuse sur une case quasi indifférente', () => {
    // « 11 contre 6 » : doubler ou tirer se jouent à plusieurs centimes près.
    // « A,7 contre 2 » : rester ou doubler sont à trois millièmes l'un de l'autre.
    const costly = decisionOf('H11', 6)
    const marginal = decisionOf('S18', 2)
    expect(costly.margin).toBeGreaterThan(marginal.margin * 10)

    const progress = { ...emptyProgress(), box: 1 }
    expect(cellWeight(costly, progress)).toBeGreaterThan(cellWeight(marginal, progress))
  })

  it('laisse malgré tout une chance aux cases indifférentes', () => {
    // Sans plancher sur le coût, une case à marge nulle ne sortirait jamais.
    const marginal = decisionOf('S18', 2)
    expect(cellWeight(marginal, emptyProgress())).toBeGreaterThan(0)
  })

  it('mesure la fréquence réelle : un 10 sort quatre fois plus qu’un 5', () => {
    const cell = chart.cells.find((c) => c.key === 'H16')!
    const ratio = naturalFrequency(cell, 10) / naturalFrequency(cell, 5)
    expect(ratio).toBeCloseTo(4, 1)
  })

  it('classe les paires selon leur rareté', () => {
    const pairOfEights = chart.cells.find((c) => c.key === 'P8')!
    const pairOfTens = chart.cells.find((c) => c.key === 'P10')!
    // Seize bûches par jeu contre quatre 8 : la paire de bûches est bien plus
    // fréquente, et la pondération doit le savoir.
    expect(naturalFrequency(pairOfTens, 6)).toBeGreaterThan(naturalFrequency(pairOfEights, 6) * 10)
  })

  it('n’écrase pas le coût d’erreur sous la seule fréquence', () => {
    // « 16 contre 10 » est la main la plus fréquente du drill, mais tirer et
    // rester y sont presque équivalents : une erreur n'y coûte presque rien.
    // « 16 contre 5 » est plus rare et bien plus cher à rater — il doit passer
    // devant. C'est le produit fréquence x coût qui décide, pas la fréquence.
    const common = decisionOf('H16', 10)
    const expensive = decisionOf('H16', 5)
    expect(common.margin).toBeLessThan(expensive.margin)

    const progress = { ...emptyProgress(), box: 1 }
    expect(cellWeight(expensive, progress)).toBeGreaterThan(cellWeight(common, progress))
  })

  it('évite de reposer la case qui vient de sortir', () => {
    const decision = decisionOf('H16', 10)
    const progress = emptyProgress()
    const normal = cellWeight(decision, progress)
    const justAsked = cellWeight(decision, progress, {
      recent: [decisionKey('H16', 10)],
    })
    expect(justAsked).toBeLessThan(normal * 0.1)
  })
})

describe('donne d’une question', () => {
  it('produit de vraies cartes cohérentes avec la case', () => {
    const rng = mulberry32(42)
    for (const decision of drillableDecisions(chart)) {
      const q = dealForDecision(decision, rng)
      expect(q.dealerCard.rank).toBe(decision.upcard)

      const value = valueOf(q.playerCards)
      if (decision.cell.kind === 'pair') {
        expect(isPair(q.playerCards)).toBe(true)
        expect(q.playerCards[0].rank).toBe(decision.cell.value)
      } else if (decision.cell.kind === 'soft') {
        expect(value.soft).toBe(true)
        expect(value.total).toBe(decision.cell.value)
      } else {
        expect(value.soft).toBe(false)
        expect(isPair(q.playerCards)).toBe(false)
        expect(value.total).toBe(decision.cell.value)
      }
    }
  })

  it('varie les combinaisons d’un même total', () => {
    // Un 16 doit tomber tantôt en 10+6, tantôt en 9+7 : à la table on lit des
    // cartes, pas des totaux.
    const rng = mulberry32(7)
    const decision = chart.decisions.get(decisionKey('H16', 10))!
    const shapes = new Set<string>()
    for (let i = 0; i < 200; i++) {
      const q = dealForDecision(decision, rng)
      shapes.add([q.playerCards[0].rank, q.playerCards[1].rank].sort((a, b) => a - b).join('+'))
    }
    expect(shapes.size).toBeGreaterThan(1)
  })

  it('ne donne jamais deux fois exactement la même carte', () => {
    const rng = mulberry32(99)
    for (let i = 0; i < 500; i++) {
      const q = nextQuestion(chart, {}, rng)
      const [a, b] = q.playerCards
      expect(`${a.face}${a.suit}`).not.toBe(`${b.face}${b.suit}`)
    }
  })
})

describe('sélection sur une longue session', () => {
  it('couvre largement la table et insiste sur les cases ratées', () => {
    const rng = mulberry32(2024)
    const progress: ProgressMap = {}
    const counts = new Map<string, number>()

    // On répond juste partout, sauf sur « 12 contre 3 » qu'on rate toujours.
    const alwaysWrong = decisionKey('H12', 3)

    for (let i = 0; i < 3000; i++) {
      const q = nextQuestion(chart, progress, rng)
      const key = decisionKey(q.decision.cell.key, q.decision.upcard)
      counts.set(key, (counts.get(key) ?? 0) + 1)
      const correct = key !== alwaysWrong
      progress[key] = updateProgress(
        progress[key] ?? emptyProgress(),
        correct,
        1500,
        Date.now() + i,
      )
    }

    // La case systématiquement ratée doit revenir bien plus que la moyenne…
    const average = 3000 / (33 * 10)
    const missed = counts.get(alwaysWrong)!
    expect(missed).toBeGreaterThan(average * 2)

    // …et se retrouver dans le haut du classement des cases posées, alors même
    // qu'une erreur y coûte peu : c'est la boîte de Leitner qui la fait remonter.
    const ranked = [...counts.values()].sort((a, b) => b - a)
    expect(ranked.indexOf(missed)).toBeLessThan(counts.size * 0.1)

    // Et l'entraînement doit avoir balayé l'essentiel de la table.
    expect(counts.size).toBeGreaterThan(33 * 10 * 0.85)
  })
})

describe('agrégats', () => {
  it('classe les points faibles par coût réel et non par nombre d’erreurs', () => {
    const progress: ProgressMap = {}
    // Beaucoup d'erreurs sur une case sans enjeu…
    progress[decisionKey('S18', 2)] = { box: 1, seen: 20, correct: 0, lastSeen: 1, totalMs: 20000 }
    // …contre quelques-unes sur un doublement franc.
    progress[decisionKey('H11', 6)] = { box: 1, seen: 4, correct: 0, lastSeen: 1, totalMs: 4000 }

    const weakest = weakestCells(chart, progress, 2)
    expect(weakest[0].key).toBe(decisionKey('H11', 6))
  })

  it('résume la progression globale', () => {
    const progress: ProgressMap = {
      [decisionKey('H16', 10)]: { box: 5, seen: 10, correct: 8, lastSeen: 1, totalMs: 15000 },
    }
    const summary = overview(chart, progress)
    expect(summary.total).toBe(33 * 10)
    expect(summary.covered).toBe(1)
    expect(summary.seen).toBe(10)
    expect(summary.accuracy).toBeCloseTo(0.8, 6)
    expect(summary.mastered).toBe(1)
    expect(summary.evLost).toBeGreaterThan(0)
  })
})
