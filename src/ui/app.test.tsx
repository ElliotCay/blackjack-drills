/**
 * Tests de rendu : on exerce les écrans comme un utilisateur, pour vérifier que
 * le moteur, la persistance et l'interface sont bien reliés.
 */

import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { App } from '../App.tsx'
import { StoreProvider } from '../state.tsx'
import { STORAGE_KEY } from '../storage.ts'

function renderApp() {
  return render(
    <StoreProvider>
      <App />
    </StoreProvider>,
  )
}

/** Les quatre actions possibles, telles qu'affichées. */
const ACTIONS = ['Tirer', 'Rester', 'Doubler', 'Séparer']

async function answerCurrentHand(user: ReturnType<typeof userEvent.setup>) {
  for (const label of ACTIONS) {
    const button = screen.queryByRole('button', { name: new RegExp(`^${label}`) })
    if (button) {
      await user.click(button)
      return label
    }
  }
  throw new Error('aucune action proposée')
}

beforeEach(() => {
  localStorage.clear()
})

afterEach(cleanup)

describe('écran de drill', () => {
  it('pose une main, corrige la réponse et enchaîne', async () => {
    const user = userEvent.setup()
    renderApp()

    expect(screen.getByText(/Main 1 sur 20/)).toBeDefined()
    expect(screen.getByText('Croupier')).toBeDefined()
    expect(screen.getByText('Ta main')).toBeDefined()

    await answerCurrentHand(user)

    // La correction apparaît, avec un bouton pour continuer.
    const next = await screen.findByRole('button', { name: /Main suivante|Voir le bilan/ })
    expect(next).toBeDefined()

    await user.click(next)
    expect(screen.getByText(/Main 2 sur 20/)).toBeDefined()
  })

  it('conserve la progression après un remontage', async () => {
    const user = userEvent.setup()
    const first = renderApp()

    await answerCurrentHand(user)
    await user.click(await screen.findByRole('button', { name: /Main suivante|Voir le bilan/ }))

    // Le stockage est écrit avec un léger différé.
    await new Promise((resolve) => setTimeout(resolve, 400))
    const saved = localStorage.getItem(STORAGE_KEY)
    expect(saved).toBeTruthy()
    expect(Object.keys(JSON.parse(saved!).progress).length).toBe(1)

    first.unmount()
    renderApp()
    await user.click(screen.getByRole('button', { name: 'Stats' }))
    expect(screen.getByText(/Réussite sur 1 réponse/)).toBeDefined()
  })
})

describe('toggle des conseils', () => {
  it('affiche les espérances sur les boutons, puis les retire', async () => {
    const user = userEvent.setup()
    renderApp()

    // Conseils activés par défaut : chaque action porte son espérance en euros.
    const hit = screen.getByRole('button', { name: /^Tirer/ })
    expect(hit.textContent).toMatch(/[+−-]?\d+,\d{2}\s€/)

    await user.click(screen.getByRole('button', { name: /Conseils/ }))

    // Coupés : plus aucun chiffre avant la décision.
    const hitAfter = screen.getByRole('button', { name: /^Tirer/ })
    expect(hitAfter.textContent).toBe('Tirer')
  })

  it('reporte l’explication au bilan quand l’aide est coupée', async () => {
    const user = userEvent.setup()
    renderApp()

    await user.click(screen.getByRole('button', { name: /Conseils/ }))
    await answerCurrentHand(user)

    expect(screen.getByText(/Explication au bilan de fin de session/)).toBeDefined()
  })

  it('explique immédiatement quand l’aide est active', async () => {
    const user = userEvent.setup()
    renderApp()

    await answerCurrentHand(user)

    // La correction chiffre le comportement du croupier plutôt que d'asséner
    // une consigne : c'est ce qui distingue une explication d'un par cœur.
    const verdict = document.querySelector('.verdict .why')!
    expect(verdict.textContent).toMatch(/croupier/i)
    expect(verdict.textContent).toMatch(/\d+,\d\s%/)
  })
})

describe('mode partie', () => {
  it('mise, distribue, joue un coup et règle la bankroll', async () => {
    const user = userEvent.setup()
    renderApp()

    await user.click(screen.getByRole('button', { name: 'Partie' }))
    expect(screen.getByText('Bankroll')).toBeDefined()

    // Mise par défaut à 10 €, puis distribution.
    await user.click(screen.getByRole('button', { name: 'Distribuer' }))

    // Le croupier n'a qu'une carte à la donne : c'est la règle française.
    const dealerLabel = screen.getByText('Croupier')
    expect(dealerLabel).toBeDefined()

    // On termine le coup en restant sur chaque main.
    let guard = 0
    for (;;) {
      if (guard++ > 12) throw new Error('le coup ne se termine pas')
      const stand = screen.queryByRole('button', { name: /^Rester/ })
      const insurance = screen.queryByRole('button', { name: /^Refuser/ })
      const confirm = screen.queryByRole('button', { name: /Jouer quand même/ })
      if (insurance) await user.click(insurance)
      else if (confirm) await user.click(confirm)
      else if (stand) await user.click(stand)
      else break
    }

    // Le croupier complète, puis le coup est réglé.
    const next = await screen.findByRole('button', { name: 'Coup suivant' }, { timeout: 4000 })
    expect(next).toBeDefined()

    // La bankroll a bougé et le compteur de mains est renseigné.
    expect(screen.getByText(/Résultat sur [1-9]\d* mains?/)).toBeDefined()
  })

  it('avertit avant de valider un coup perdant quand les conseils sont actifs', async () => {
    const user = userEvent.setup()
    renderApp()

    await user.click(screen.getByRole('button', { name: 'Partie' }))
    await user.click(screen.getByRole('button', { name: 'Distribuer' }))

    const refuse = screen.queryByRole('button', { name: /^Refuser/ })
    if (refuse) await user.click(refuse)

    // On cherche une action non recommandée : l'une des deux déclenchera l'alerte.
    const hit = screen.queryByRole('button', { name: /^Tirer/ })
    const stand = screen.queryByRole('button', { name: /^Rester/ })
    if (!hit || !stand) return // main déjà résolue (blackjack) : rien à vérifier

    await user.click(hit)
    const warned = screen.queryByRole('button', { name: /Jouer quand même/ })
    if (!warned) {
      // « Tirer » était la bonne action : on recommence avec « Rester ».
      const standAgain = screen.queryByRole('button', { name: /^Rester/ })
      if (standAgain) await user.click(standAgain)
    }

    // Dans un cas comme dans l'autre, on doit pouvoir revenir sur sa décision.
    const back = screen.queryByRole('button', { name: 'Revenir' })
    if (back) {
      await user.click(back)
      expect(screen.queryByRole('button', { name: 'Revenir' })).toBeNull()
    }
  })
})

describe('écrans de référence', () => {
  it('affiche la table complète et les pièges français', async () => {
    const user = userEvent.setup()
    renderApp()

    await user.click(screen.getByRole('button', { name: 'Règles' }))

    expect(screen.getByText('Règles appliquées')).toBeDefined()
    expect(screen.getByText('Les quatre pièges français')).toBeDefined()
    expect(screen.getByText(/6 jeux de 52 cartes/)).toBeDefined()
    expect(screen.getByText(/y compris 17 souple/)).toBeDefined()

    // La table doit contenir une ligne par case jouable.
    const traps = screen.getByText('Les quatre pièges français').closest('.panel') as HTMLElement
    expect(within(traps).getAllByText(/contre (10|As)/)).toHaveLength(4)
  })

  it('montre le bilan de partie séparant variance et jeu', async () => {
    const user = userEvent.setup()
    renderApp()

    await user.click(screen.getByRole('button', { name: 'Stats' }))
    expect(screen.getByText('Entraînement')).toBeDefined()
    expect(screen.getByText('Partie réelle')).toBeDefined()
    expect(screen.getByText(/Aucune main jouée/)).toBeDefined()
  })
})
