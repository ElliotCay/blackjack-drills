import type { Action } from '../engine/ev.ts'
import {
  ACTION_SHORT,
  decisionKey,
  UPCARDS,
  type StrategyChart,
} from '../engine/strategy.ts'
import { isDrillable, type ProgressMap } from '../drill/scheduler.ts'
import { accuracyOf } from '../drill/stats.ts'

const ACTION_CLASS: Record<Action, string> = {
  hit: 'a-hit',
  stand: 'a-stand',
  double: 'a-double',
  split: 'a-split',
  surrender: 'a-hit',
}

interface Props {
  chart: StrategyChart
  /**
   * Fourni depuis l'écran de statistiques : assombrit les cases mal sues pour
   * faire ressortir d'un coup d'œil où se concentrent les erreurs.
   */
  progress?: ProgressMap
}

export function StrategyGrid({ chart, progress }: Props) {
  const cells = chart.cells.filter(isDrillable)

  return (
    <>
      <div className="grid-scroll">
        <table className="grid">
          <thead>
            <tr>
              <th />
              {UPCARDS.map((u) => (
                <th key={u}>{u === 1 ? 'A' : u}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {cells.map((cell) => (
              <tr key={cell.key}>
                <th className="row">{cell.label}</th>
                {UPCARDS.map((upcard) => {
                  const key = decisionKey(cell.key, upcard)
                  const decision = chart.decisions.get(key)!
                  const stat = progress?.[key]
                  const accuracy = stat ? accuracyOf(stat) : null

                  return (
                    <td
                      key={upcard}
                      className={`${ACTION_CLASS[decision.action]}${
                        decision.frenchDeviation ? ' deviation' : ''
                      }`}
                      title={buildTitle(cell.label, upcard, decision.action, accuracy)}
                    >
                      {ACTION_SHORT[decision.action]}
                      {accuracy !== null && accuracy < 1 && (
                        <span
                          className="mastery"
                          style={{ background: `rgba(0,0,0,${(1 - accuracy) * 0.62})` }}
                        />
                      )}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="legend">
        <span>
          <i style={{ background: '#6fb3e0' }} />T — tirer
        </span>
        <span>
          <i style={{ background: '#e0857f' }} />R — rester
        </span>
        <span>
          <i style={{ background: '#7fd6a4' }} />D — doubler
        </span>
        <span>
          <i style={{ background: '#e8c46a' }} />S — séparer
        </span>
        <span>
          <i style={{ background: '#1b1205' }} />point noir : réponse propre aux règles françaises
        </span>
        {progress && <span>plus la case est sombre, plus tu la rates</span>}
      </div>
    </>
  )
}

function buildTitle(
  label: string,
  upcard: number,
  action: Action,
  accuracy: number | null,
): string {
  const against = upcard === 1 ? 'As' : String(upcard)
  const base = `${label} contre ${against} : ${action}`
  if (accuracy === null) return base
  return `${base} — ${Math.round(accuracy * 100)} % de réussite`
}
