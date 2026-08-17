/**
 * Distribution des résultats du croupier.
 *
 * On part de la carte visible seule et on déroule tous les tirages possibles en
 * épuisant réellement le sabot au fil de la récursion. Le blackjack (21 en deux
 * cartes) est compté à part de 21 en trois cartes ou plus : sans carte cachée,
 * c'est lui qui emporte les mises doublées et séparées, et il bat un 21 joueur.
 */

import { RANKS, type Composition, type Rank, compositionKey } from './cards.ts'
import type { RuleSet } from './rules.ts'

export interface DealerDist {
  bust: number
  t17: number
  t18: number
  t19: number
  t20: number
  t21: number
  /** 21 en deux cartes. Toujours 0 si la carte visible n'est ni 10 ni as. */
  bj: number
}

function emptyDist(): DealerDist {
  return { bust: 0, t17: 0, t18: 0, t19: 0, t20: 0, t21: 0, bj: 0 }
}

function recurse(
  hard: number,
  hasAce: boolean,
  cardCount: number,
  comp: Composition,
  remaining: number,
  prob: number,
  rules: RuleSet,
  out: DealerDist,
): void {
  if (prob === 0) return

  if (hard > 21) {
    out.bust += prob
    return
  }

  const soft = hasAce && hard + 10 <= 21
  const total = soft ? hard + 10 : hard

  // S17 : le croupier reste sur 17 souple. H17 : il tire.
  const mustHit = total < 17 || (rules.dealerHitsSoft17 && soft && total === 17)

  if (!mustHit) {
    if (total === 21 && cardCount === 2) out.bj += prob
    else if (total === 17) out.t17 += prob
    else if (total === 18) out.t18 += prob
    else if (total === 19) out.t19 += prob
    else if (total === 20) out.t20 += prob
    else out.t21 += prob
    return
  }

  for (const r of RANKS) {
    const available = comp[r]
    if (available === 0) continue
    comp[r] = available - 1
    recurse(
      hard + r,
      hasAce || r === 1,
      cardCount + 1,
      comp,
      remaining - 1,
      (prob * available) / remaining,
      rules,
      out,
    )
    comp[r] = available
  }
}

const cache = new Map<string, DealerDist>()

/**
 * Distribution des totaux finaux du croupier, sachant sa carte visible et la
 * composition du sabot après retrait des cartes déjà visibles (celles du joueur
 * et la carte du croupier).
 */
export function dealerOutcomes(
  upcard: Rank,
  comp: Composition,
  rules: RuleSet,
): DealerDist {
  const key = `${upcard}|${compositionKey(comp)}|${rules.dealerHitsSoft17 ? 'h17' : 's17'}`
  const hit = cache.get(key)
  if (hit) return hit

  const out = emptyDist()
  const working = comp.slice()
  let remaining = 0
  for (let r = 1; r <= 10; r++) remaining += working[r]

  recurse(upcard, upcard === 1, 1, working, remaining, 1, rules, out)

  cache.set(key, out)
  return out
}

/**
 * Même distribution, conditionnée à « le croupier n'a pas blackjack ».
 * C'est dans ce monde-là que se résolvent tous les coups ordinaires : la perte
 * face à un blackjack est traitée séparément, car elle ne coûte pas la même
 * chose selon qu'on a doublé, séparé, ou rien fait.
 */
export function withoutBlackjack(dist: DealerDist): DealerDist {
  const survive = 1 - dist.bj
  if (survive <= 0) return emptyDist()
  return {
    bust: dist.bust / survive,
    t17: dist.t17 / survive,
    t18: dist.t18 / survive,
    t19: dist.t19 / survive,
    t20: dist.t20 / survive,
    t21: dist.t21 / survive,
    bj: 0,
  }
}

/** Probabilité que le croupier saute, tous tirages confondus. */
export function bustProbability(dist: DealerDist): number {
  return dist.bust
}

export function distTotal(dist: DealerDist): number {
  return dist.bust + dist.t17 + dist.t18 + dist.t19 + dist.t20 + dist.t21 + dist.bj
}

/** Réinitialise le cache — utile entre deux jeux de règles dans les tests. */
export function clearDealerCache(): void {
  cache.clear()
}
