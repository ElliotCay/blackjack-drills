/** Agrégats d'entraînement : précision par case, points faibles, bilan. */

import { decisionKey, type CellDecision, type StrategyChart } from '../engine/strategy.ts'
import {
  drillableDecisions,
  progressFor,
  type CellProgress,
  type ProgressMap,
} from './scheduler.ts'

export interface CellStat {
  key: string
  decision: CellDecision
  progress: CellProgress
  /** null tant que la case n'a jamais été posée. */
  accuracy: number | null
  /** Temps de réponse moyen, en millisecondes. */
  averageMs: number | null
}

export function accuracyOf(progress: CellProgress): number | null {
  return progress.seen === 0 ? null : progress.correct / progress.seen
}

export function averageMsOf(progress: CellProgress): number | null {
  return progress.seen === 0 ? null : progress.totalMs / progress.seen
}

export function cellStats(chart: StrategyChart, progress: ProgressMap): CellStat[] {
  return drillableDecisions(chart).map((decision) => {
    const key = decisionKey(decision.cell.key, decision.upcard)
    const cellProgress = progressFor(progress, key)
    return {
      key,
      decision,
      progress: cellProgress,
      accuracy: accuracyOf(cellProgress),
      averageMs: averageMsOf(cellProgress),
    }
  })
}

export interface Overview {
  /** Cases posées au moins une fois, sur le total jouable. */
  covered: number
  total: number
  seen: number
  correct: number
  accuracy: number | null
  /** Espérance perdue par les erreurs, en euros par euro misé. */
  evLost: number
  mastered: number
}

export function overview(chart: StrategyChart, progress: ProgressMap): Overview {
  const stats = cellStats(chart, progress)
  let seen = 0
  let correct = 0
  let covered = 0
  let mastered = 0
  let evLost = 0

  for (const stat of stats) {
    seen += stat.progress.seen
    correct += stat.progress.correct
    if (stat.progress.seen > 0) covered++
    if (stat.progress.box >= 5) mastered++
    evLost += (stat.progress.seen - stat.progress.correct) * stat.decision.margin
  }

  return {
    covered,
    total: stats.length,
    seen,
    correct,
    accuracy: seen === 0 ? null : correct / seen,
    evLost,
    mastered,
  }
}

/**
 * Points faibles, classés par ce qu'ils coûtent réellement : le nombre
 * d'erreurs multiplié par l'écart d'espérance de la case. Rater vingt fois une
 * case indifférente pèse moins qu'une erreur sur un doublement évident.
 */
export function weakestCells(
  chart: StrategyChart,
  progress: ProgressMap,
  limit = 8,
): CellStat[] {
  return cellStats(chart, progress)
    .filter((stat) => stat.progress.seen > stat.progress.correct)
    .sort((a, b) => {
      const costA = (a.progress.seen - a.progress.correct) * (a.decision.margin + 0.01)
      const costB = (b.progress.seen - b.progress.correct) * (b.decision.margin + 0.01)
      return costB - costA
    })
    .slice(0, limit)
}
