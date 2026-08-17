import type { Action, ActionEvs } from '../engine/ev.ts'
import { ACTION_LABELS } from '../engine/strategy.ts'

export interface ActionBarProps {
  available: Record<Action, boolean>
  onChoose: (action: Action) => void
  disabled?: boolean
  /**
   * Espérances affichées sur les boutons. Fournies uniquement quand les
   * conseils sont activés — c'est toute la différence entre s'entraîner avec
   * une aide et jouer dans les conditions de la table.
   */
  evs?: ActionEvs | null
  best?: Action | null
}

const ORDER: Action[] = ['hit', 'stand', 'double', 'split', 'surrender']

function formatEv(ev: number): string {
  const sign = ev > 0 ? '+' : ''
  return `${sign}${ev.toFixed(2).replace('.', ',')} €`
}

export function ActionBar({ available, onChoose, disabled, evs, best }: ActionBarProps) {
  const shown = ORDER.filter((action) => available[action])

  return (
    <div className={`actions${shown.length > 2 ? ' wide' : ''}`}>
      {shown.map((action) => {
        const ev = evs ? evs[action] : null
        return (
          <button
            key={action}
            className="action"
            data-best={best === action}
            disabled={disabled}
            onClick={() => onChoose(action)}
          >
            <span>{ACTION_LABELS[action]}</span>
            {ev !== null && ev !== undefined && <span className="ev">{formatEv(ev)}</span>}
          </button>
        )
      })}
    </div>
  )
}
