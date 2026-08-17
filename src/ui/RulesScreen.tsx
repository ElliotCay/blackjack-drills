import { useMemo } from 'react'
import { describeRules, FRENCH_RULES } from '../engine/rules.ts'
import { ACTION_LABELS, decisionKey, frenchChart } from '../engine/strategy.ts'
import { useStore } from '../state.tsx'
import { StrategyGrid } from './StrategyGrid.tsx'

/** Les cases où la règle française impose une autre réponse qu'ailleurs. */
const TRAPS: [string, number][] = [
  ['H11', 10],
  ['P8', 10],
  ['P8', 1],
  ['P1', 1],
]

export function RulesScreen() {
  const chart = useMemo(() => frenchChart(), [])
  const { state, setSettings } = useStore()
  const { settings } = state

  return (
    <>
      <div className="panel">
        <h2>Règles appliquées</h2>
        {describeRules(FRENCH_RULES).map((line) => (
          <div className="row" key={line.label}>
            <span className="k">{line.label}</span>
            <span className="v">{line.value}</span>
          </div>
        ))}
        <p className="faint" style={{ marginTop: 12, marginBottom: 0, lineHeight: 1.6 }}>
          Conforme aux articles 55-4 et 55-5 sur le black-jack. À noter, contre une idée répandue :
          le texte autorise le doublement sur tout total initial, et pas seulement sur 9, 10 et 11.
        </p>
      </div>

      <div className="panel">
        <h2>Les quatre pièges français</h2>
        <p className="muted" style={{ marginTop: -4 }}>
          Le croupier complétant sa main après ton tour, un blackjack de sa part emporte aussi les
          mises doublées et séparées. On engage donc en aveugle, et quatre cases changent de
          réponse par rapport à une table de stratégie américaine.
        </p>
        {TRAPS.map(([cellKey, upcard]) => {
          const decision = chart.decisions.get(decisionKey(cellKey, upcard as never))!
          return (
            <div className="row" key={`${cellKey}-${upcard}`}>
              <span className="k">
                {decision.cell.label} contre {upcard === 1 ? 'As' : upcard}
              </span>
              <span className="v">
                <span className="pill bad">{ACTION_LABELS[decision.standardAction]}</span>{' '}
                <span className="faint">→</span>{' '}
                <span className="pill good">{ACTION_LABELS[decision.action]}</span>
              </span>
            </div>
          )
        })}
      </div>

      <div className="panel">
        <h2>Table complète</h2>
        <p className="faint" style={{ marginTop: -4 }}>
          Calculée pour ces règles-là, pas recopiée.
        </p>
        <StrategyGrid chart={chart} />
      </div>

      <div className="panel">
        <h2>Réglages</h2>
        <div className="field">
          <label htmlFor="hands">Mains par session de drill</label>
          <input
            id="hands"
            type="number"
            min={5}
            max={200}
            value={settings.handsPerSession}
            onChange={(e) => setSettings({ handsPerSession: Number(e.target.value) })}
          />
        </div>
        <div className="field">
          <label htmlFor="bankroll">Bankroll de départ (€)</label>
          <input
            id="bankroll"
            type="number"
            min={10}
            step={10}
            value={settings.startingBankroll}
            onChange={(e) => setSettings({ startingBankroll: Number(e.target.value) })}
          />
        </div>
        <div className="field">
          <label htmlFor="bet">Mise par défaut (€)</label>
          <input
            id="bet"
            type="number"
            min={1}
            value={settings.defaultBet}
            onChange={(e) => setSettings({ defaultBet: Number(e.target.value) })}
          />
        </div>
      </div>
    </>
  )
}
