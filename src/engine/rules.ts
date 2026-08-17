/**
 * Jeu de règles paramétrable, et le preset des casinos français.
 *
 * Sources du preset :
 *  - Légifrance, règles applicables au black-jack (art. 55-4 à 55-5) :
 *    six jeux de 52, croupier qui compte l'as pour 11 dès que cela lui donne 17
 *    ou plus (donc il reste sur 17 souple), double mise autorisée sur tout total
 *    initial et après séparation, une seule séparation des as avec une seule
 *    carte par as, blackjack payé 3 pour 2, assurance payée 2 pour 1.
 *  - Relevés de tables en France : pas de carte cachée, pas d'abandon.
 */

export interface RuleSet {
  decks: number
  /** Croupier tire sur 17 souple ? En France : non (il reste). */
  dealerHitsSoft17: boolean
  /**
   * Le croupier prend-il une carte cachée dès la donne ?
   * En France : non — il ne prend sa deuxième carte qu'après le tour des joueurs.
   */
  holeCard: boolean
  /**
   * Sans carte cachée : un blackjack du croupier emporte-t-il aussi les mises
   * doublées et séparées ? En France : oui (« busted bets »).
   * Si false, le joueur ne perd que sa mise d'origine (« original bets only »).
   */
  bustedBets: boolean
  /** Double sur n'importe quel total initial ? Sinon 9/10/11 seulement. */
  doubleAnyTwo: boolean
  /** Double autorisé après une séparation. */
  doubleAfterSplit: boolean
  /** Nombre maximum de mains issues des séparations (1 = pas de resplit). */
  maxSplitHands: number
  /** Un as séparé ne reçoit qu'une seule carte. */
  splitAcesOneCard: boolean
  /** Rapport du blackjack : 1.5 pour « 3 pour 2 ». */
  blackjackPays: number
  /** Abandon tardif proposé. En France : non. */
  surrender: boolean
}

export const FRENCH_RULES: RuleSet = {
  decks: 6,
  dealerHitsSoft17: false,
  holeCard: false,
  bustedBets: true,
  doubleAnyTwo: true,
  doubleAfterSplit: true,
  maxSplitHands: 2,
  splitAcesOneCard: true,
  blackjackPays: 1.5,
  surrender: false,
}

/** Résumé lisible, affiché dans l'écran des règles. */
export interface RuleLine {
  label: string
  value: string
}

export function describeRules(rules: RuleSet): RuleLine[] {
  return [
    { label: 'Sabot', value: `${rules.decks} jeux de 52 cartes` },
    {
      label: 'Croupier',
      value: rules.dealerHitsSoft17
        ? 'Tire à 16, et sur 17 souple'
        : 'Tire à 16, reste à 17 — y compris 17 souple',
    },
    {
      label: 'Carte cachée',
      value: rules.holeCard
        ? 'Le croupier prend ses deux cartes à la donne'
        : 'Aucune — il prend sa 2ᵉ carte après le tour des joueurs',
    },
    {
      label: 'Blackjack du croupier',
      value:
        rules.holeCard
          ? 'Annoncé immédiatement'
          : rules.bustedBets
            ? 'Emporte aussi les mises doublées et séparées'
            : 'Ne prend que la mise d’origine',
    },
    {
      label: 'Double',
      value: `${rules.doubleAnyTwo ? 'Sur tout total initial' : 'Sur 9, 10 et 11 seulement'}${
        rules.doubleAfterSplit ? ', et après séparation' : ', pas après séparation'
      }`,
    },
    {
      label: 'Séparation',
      value: `${rules.maxSplitHands <= 2 ? 'Une seule fois' : `Jusqu’à ${rules.maxSplitHands} mains`}${
        rules.splitAcesOneCard ? ' ; as séparés : une seule carte chacun' : ''
      }`,
    },
    { label: 'Blackjack', value: `Payé ${rules.blackjackPays === 1.5 ? '3 pour 2' : `${rules.blackjackPays}:1`}` },
    { label: 'Assurance', value: 'Proposée sur as du croupier, payée 2 pour 1' },
    { label: 'Abandon', value: rules.surrender ? 'Abandon tardif proposé' : 'Non proposé' },
  ]
}
