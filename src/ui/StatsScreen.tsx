import { useMemo } from 'react'
import { ACTION_LABELS, frenchChart } from '../engine/strategy.ts'
import { overview, weakestCells } from '../drill/stats.ts'
import { report } from '../game/bankroll.ts'
import { useStore } from '../state.tsx'
import { StrategyGrid } from './StrategyGrid.tsx'

const euros = (value: number) =>
  `${value >= 0 ? '+' : '−'}${Math.abs(value).toLocaleString('fr-FR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} €`

export function StatsScreen() {
  const chart = useMemo(() => frenchChart(), [])
  const { state, resetProgress, resetGame } = useStore()

  const drill = useMemo(() => overview(chart, state.progress), [chart, state.progress])
  const weakest = useMemo(() => weakestCells(chart, state.progress, 6), [chart, state.progress])
  const game = report(state.game)

  return (
    <>
      <div className="panel">
        <h2>Entraînement</h2>
        <div className="stat-grid">
          <div className="stat">
            <div className="value">
              {drill.accuracy === null ? '—' : `${Math.round(drill.accuracy * 100)} %`}
            </div>
            <div className="label">Réussite sur {drill.seen} réponses</div>
          </div>
          <div className="stat">
            <div className="value">
              {drill.covered}/{drill.total}
            </div>
            <div className="label">Cases rencontrées</div>
          </div>
          <div className="stat">
            <div className="value">{drill.mastered}</div>
            <div className="label">Cases acquises</div>
          </div>
        </div>
        <div className="progress">
          <span style={{ width: `${(drill.covered / drill.total) * 100}%` }} />
        </div>
      </div>

      {weakest.length > 0 && (
        <div className="panel">
          <h2>Tes points faibles</h2>
          <p className="faint" style={{ marginTop: -6 }}>
            Classés par ce qu’ils coûtent réellement : le nombre d’erreurs multiplié par l’enjeu
            de la case.
          </p>
          {weakest.map((stat) => (
            <div className="row" key={stat.key}>
              <span className="k">
                {stat.decision.cell.label} contre{' '}
                {stat.decision.upcard === 1 ? 'As' : stat.decision.upcard}
              </span>
              <span className="v">
                {ACTION_LABELS[stat.decision.action]}{' '}
                <span className="faint">
                  · {stat.progress.correct}/{stat.progress.seen}
                </span>
              </span>
            </div>
          ))}
        </div>
      )}

      <div className="panel">
        <h2>Où tu en es sur la table</h2>
        <StrategyGrid chart={chart} progress={state.progress} />
      </div>

      <div className="panel">
        <h2>Partie réelle</h2>
        {game.handsPlayed === 0 ? (
          <p className="muted">Aucune main jouée pour l’instant.</p>
        ) : (
          <>
            <div className="stat-grid">
              <div className="stat">
                <div className={`value ${game.net > 0 ? 'good' : game.net < 0 ? 'bad' : ''}`}>
                  {euros(game.net)}
                </div>
                <div className="label">Résultat réel sur {game.handsPlayed} mains</div>
              </div>
              <div className="stat">
                <div className={`value ${game.evLost > 0 ? 'bad' : ''}`}>
                  {euros(-game.evLost)}
                </div>
                <div className="label">Coût de tes écarts à la stratégie</div>
              </div>
              <div className="stat">
                <div className="value">{euros(game.netCorrected)}</div>
                <div className="label">Résultat une fois tes erreurs neutralisées</div>
              </div>
            </div>

            <p className="muted" style={{ marginTop: 14, marginBottom: 0 }}>
              Sur {game.wagered.toLocaleString('fr-FR')} € misés, un jeu parfait rapporterait en
              moyenne {euros(game.expectedPerfect)} — l’avantage de la maison ne disparaît pas,
              même en jouant juste. L’écart entre ton résultat réel et le résultat corrigé, c’est
              la variance ; le reste, c’est toi.
            </p>

            {game.accuracy !== null && (
              <div className="row" style={{ marginTop: 10 }}>
                <span className="k">Décisions conformes à la stratégie</span>
                <span className="v">{Math.round(game.accuracy * 100)} %</span>
              </div>
            )}
          </>
        )}
      </div>

      <div className="panel">
        <h2>Repartir de zéro</h2>
        <div className="actions">
          <button className="action ghost" onClick={resetProgress}>
            Effacer l’entraînement
          </button>
          <button className="action ghost" onClick={resetGame}>
            Réinitialiser la bankroll
          </button>
        </div>
      </div>
    </>
  )
}
