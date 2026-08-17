import { CHIPS } from '../settings/settings.ts'

interface Props {
  bet: number
  bankroll: number
  lastBet: number
  onChange: (bet: number) => void
  onDeal: () => void
}

export function BetControls({ bet, bankroll, lastBet, onChange, onDeal }: Props) {
  return (
    <div className="panel">
      <div className="bet-row">
        <div>
          <div className="faint">Mise</div>
          <div className="bet-amount">{bet.toLocaleString('fr-FR')} €</div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {lastBet > 0 && lastBet !== bet && lastBet <= bankroll && (
            <button className="action ghost" onClick={() => onChange(lastBet)}>
              Relancer {lastBet} €
            </button>
          )}
          {bet > 0 && (
            <button className="action ghost" onClick={() => onChange(0)}>
              Retirer
            </button>
          )}
        </div>
      </div>

      <div className="chips">
        {CHIPS.map((chip) => (
          <button
            key={chip}
            className={`chip chip-${chip}`}
            disabled={bet + chip > bankroll}
            onClick={() => onChange(bet + chip)}
          >
            {chip}
          </button>
        ))}
      </div>

      <button
        className="action primary"
        style={{ width: '100%', marginTop: 14 }}
        disabled={bet <= 0 || bet > bankroll}
        onClick={onDeal}
      >
        Distribuer
      </button>
    </div>
  )
}
