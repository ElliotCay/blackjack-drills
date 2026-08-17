/** Générateur déterministe, pour que les tests ne dépendent pas du hasard. */
export type Rng = () => number

export function mulberry32(seed: number): Rng {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export const systemRng: Rng = Math.random

export function pick<T>(items: readonly T[], rng: Rng): T {
  return items[Math.floor(rng() * items.length)]
}

/** Tirage proportionnel aux poids. Les poids doivent être positifs. */
export function weightedPick<T>(items: readonly T[], weights: readonly number[], rng: Rng): T {
  let total = 0
  for (const w of weights) total += w
  if (total <= 0) return pick(items, rng)

  let threshold = rng() * total
  for (let i = 0; i < items.length; i++) {
    threshold -= weights[i]
    if (threshold <= 0) return items[i]
  }
  return items[items.length - 1]
}
