import { useEffect, useMemo, useRef, useState } from 'react'
import type { Action } from '../engine/ev.ts'
import { FRENCH_RULES } from '../engine/rules.ts'
import { ACTION_LABELS } from '../engine/strategy.ts'
import { systemRng } from '../drill/rng.ts'
import {
  act,
  createSession,
  declineInsurance,
  finishRound,
  insuranceEv,
  placeBet,
  report,
  takeInsurance,
  type GameSession,
} from '../game/bankroll.ts'
import { adviceFor, availableActions, type HandResult } from '../game/round.ts'
import { penetration } from '../game/shoe.ts'
import { useStore } from '../state.tsx'
import { ActionBar } from './ActionBar.tsx'
import { HandDisplay } from './HandDisplay.tsx'
import { BetControls } from './BetControls.tsx'

/** Délai avant que le croupier ne complète : on veut voir sa carte tomber. */
const DEALER_DELAY = 650

export function TableScreen() {
  const { state, setBankroll, setGameTotals, resetGame } = useStore()
  const { coaching, defaultBet } = state.settings

  const [session, setSession] = useState<GameSession>(() => {
    const fresh = createSession(FRENCH_RULES, state.bankroll, systemRng)
    return { ...fresh, totals: state.game }
  })
  const [bet, setBet] = useState(Math.min(defaultBet, state.bankroll))
  const [lastBet, setLastBet] = useState(0)
  const [pendingMistake, setPendingMistake] = useState<{ action: Action; cost: number } | null>(
    null,
  )

  // La bankroll et les totaux vivent dans la session ; on les recopie dans le
  // stockage pour qu'ils survivent à un rechargement.
  const persisted = useRef({ bankroll: state.bankroll, totals: state.game })
  useEffect(() => {
    if (persisted.current.bankroll !== session.bankroll) {
      persisted.current.bankroll = session.bankroll
      setBankroll(session.bankroll)
    }
    if (persisted.current.totals !== session.totals) {
      persisted.current.totals = session.totals
      setGameTotals(session.totals)
    }
  }, [session.bankroll, session.totals, setBankroll, setGameTotals])

  const round = session.round
  const phase = round?.phase ?? 'betting'

  // Le croupier complète tout seul une fois le joueur servi.
  useEffect(() => {
    if (phase !== 'showdown') return
    const id = window.setTimeout(() => setSession((s) => finishRound(s)), DEALER_DELAY)
    return () => window.clearTimeout(id)
  }, [phase])

  const advice = useMemo(
    () => (round ? adviceFor(round, session.rules, session.bankroll) : null),
    [round, session.rules, session.bankroll],
  )

  const available = useMemo(
    () =>
      round
        ? { ...availableActions(round, session.rules, session.bankroll), surrender: false }
        : { hit: false, stand: false, double: false, split: false, surrender: false },
    [round, session.rules, session.bankroll],
  )

  const choose = (action: Action) => {
    // Conseils activés : on avertit avant de valider un coup perdant.
    if (coaching && advice && advice.action !== action) {
      const chosenEv = advice.evs[action]
      const bestEv = advice.evs[advice.action] ?? 0
      const cost = chosenEv === null || chosenEv === undefined ? advice.margin : bestEv - chosenEv
      setPendingMistake({ action, cost })
      return
    }
    setSession((s) => act(s, action))
  }

  const confirmMistake = () => {
    if (!pendingMistake) return
    const action = pendingMistake.action
    setPendingMistake(null)
    setSession((s) => act(s, action))
  }

  const deal = () => {
    setLastBet(bet)
    setSession((s) => placeBet(s, bet))
  }

  const nextRound = () => {
    setSession((s) => ({ ...s, round: null, lastSettlement: null }))
    setBet(Math.min(lastBet || defaultBet, session.bankroll))
  }

  const summary = report(session.totals)

  if (session.bankroll <= 0 && !round) {
    return (
      <div className="panel center">
        <h2>Bankroll épuisée</h2>
        <p className="muted">
          {summary.handsPlayed} mains jouées. Tes écarts à la stratégie ont coûté{' '}
          {summary.evLost.toFixed(2).replace('.', ',')} € d’espérance — le reste est de la
          variance.
        </p>
        <button
          className="action primary"
          style={{ width: '100%', marginTop: 12 }}
          onClick={() => {
            resetGame()
            const fresh = createSession(FRENCH_RULES, state.settings.startingBankroll, systemRng)
            persisted.current = { bankroll: fresh.bankroll, totals: fresh.totals }
            setSession(fresh)
            setBet(state.settings.defaultBet)
          }}
        >
          Repartir sur {state.settings.startingBankroll} €
        </button>
      </div>
    )
  }

  return (
    <>
      <div className="panel">
        <div className="row" style={{ paddingTop: 0 }}>
          <span className="k">Bankroll</span>
          <span className="v" style={{ fontSize: 18, fontWeight: 680 }}>
            {session.bankroll.toLocaleString('fr-FR')} €
          </span>
        </div>
        <div className="row">
          <span className="k">Résultat sur {summary.handsPlayed} mains</span>
          <span className={`v ${summary.net > 0 ? 'value good' : summary.net < 0 ? 'value bad' : ''}`}>
            {summary.net >= 0 ? '+' : ''}
            {summary.net.toLocaleString('fr-FR')} €
          </span>
        </div>
        <ShoeGauge value={penetration(session.shoe)} justShuffled={session.justShuffled} />
      </div>

      {round ? (
        <>
          <div className="felt">
            <HandDisplay
              cards={round.dealer}
              label="Croupier"
              pending={round.dealer.length === 1}
              showTotal={round.dealer.length > 1}
            />

            {round.hands.map((hand, i) => (
              <div
                key={i}
                className="seat"
                data-active={phase === 'playing' && i === round.active}
                data-settled={settledTone(round.results?.[i])}
              >
                <HandDisplay
                  cards={hand.cards}
                  label={
                    round.hands.length > 1 ? `Main ${i + 1} — ${hand.stake} €` : `Ta main — ${hand.stake} €`
                  }
                />
                {round.results?.[i] && <ResultLine result={round.results[i]} />}
              </div>
            ))}
          </div>

          {phase === 'insurance' && (
            <InsurancePrompt
              session={session}
              coaching={coaching}
              onTake={(amount) => setSession((s) => takeInsurance(s, amount))}
              onDecline={() => setSession((s) => declineInsurance(s))}
            />
          )}

          {phase === 'playing' && !pendingMistake && (
            <ActionBar
              available={available}
              onChoose={choose}
              evs={coaching && advice ? advice.evs : null}
              best={coaching && advice ? advice.action : null}
            />
          )}

          {pendingMistake && advice && (
            <div className="verdict bad">
              <div className="head">
                <span>!</span>
                <span>
                  {ACTION_LABELS[pendingMistake.action]} coûte{' '}
                  {(pendingMistake.cost * round.baseBet).toFixed(2).replace('.', ',')} € face à{' '}
                  {ACTION_LABELS[advice.action].toLowerCase()}
                </span>
              </div>
              <div className="actions" style={{ marginTop: 12 }}>
                <button className="action" onClick={() => setPendingMistake(null)}>
                  Revenir
                </button>
                <button className="action ghost" onClick={confirmMistake}>
                  Jouer quand même
                </button>
              </div>
            </div>
          )}

          {phase === 'showdown' && <p className="muted center">Le croupier complète sa main…</p>}

          {phase === 'settled' && (
            <>
              {round.mistakes.length > 0 && (
                <div className="panel">
                  <h2>Écarts relevés sur ce coup</h2>
                  {round.mistakes.map((m, i) => (
                    <div className="row" key={i}>
                      <span className="k">
                        {ACTION_LABELS[m.chosen]} au lieu de {ACTION_LABELS[m.best].toLowerCase()}
                      </span>
                      <span className="v value bad">
                        −{(m.cost * round.baseBet).toFixed(2).replace('.', ',')} €
                      </span>
                    </div>
                  ))}
                </div>
              )}
              <button className="action primary" style={{ width: '100%' }} onClick={nextRound}>
                Coup suivant
              </button>
            </>
          )}
        </>
      ) : (
        <BetControls
          bet={bet}
          bankroll={session.bankroll}
          lastBet={lastBet}
          onChange={(value) => setBet(Math.max(0, Math.min(value, session.bankroll)))}
          onDeal={deal}
        />
      )}
    </>
  )
}

function settledTone(result: HandResult | undefined): string | undefined {
  if (!result) return undefined
  if (result.net > 0) return 'win'
  if (result.net < 0) return 'lose'
  return undefined
}

const OUTCOME_LABELS: Record<HandResult['outcome'], string> = {
  blackjack: 'Blackjack',
  win: 'Gagné',
  push: 'Égalité',
  lose: 'Perdu',
  dealerBlackjack: 'Blackjack du croupier',
}

function ResultLine({ result }: { result: HandResult }) {
  return (
    <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
      <span className={`pill ${result.net > 0 ? 'good' : result.net < 0 ? 'bad' : ''}`}>
        {OUTCOME_LABELS[result.outcome]}
      </span>
      <span className={result.net > 0 ? 'value good' : result.net < 0 ? 'value bad' : ''} style={{ fontSize: 14, fontWeight: 620 }}>
        {result.net >= 0 ? '+' : ''}
        {result.net.toLocaleString('fr-FR')} €
      </span>
    </div>
  )
}

function InsurancePrompt({
  session,
  coaching,
  onTake,
  onDecline,
}: {
  session: GameSession
  coaching: boolean
  onTake: (amount: number) => void
  onDecline: () => void
}) {
  const round = session.round!
  const maximum = Math.min(round.baseBet / 2, session.bankroll)
  const visible = [...round.hands[0].cards, round.dealer[0]]
  const ev = insuranceEv(visible, session.rules)

  return (
    <div className="panel">
      <h2>Assurance ?</h2>
      <p className="muted">
        Le croupier montre un as. L’assurance coûte {maximum.toLocaleString('fr-FR')} € et paie 2
        contre 1 s’il complète un blackjack.
      </p>
      {coaching && (
        <div className="trap">
          Espérance : {(ev * 100).toFixed(1).replace('.', ',')} % par euro assuré. Sans comptage,
          ce pari est perdant à chaque fois — il y a moins d’une chance sur trois qu’une bûche
          tombe, pour un paiement de 2 contre 1.
        </div>
      )}
      <div className="actions" style={{ marginTop: 12 }}>
        <button className="action primary" onClick={onDecline}>
          Refuser
        </button>
        <button className="action" disabled={maximum <= 0} onClick={() => onTake(maximum)}>
          Assurer {maximum.toLocaleString('fr-FR')} €
        </button>
      </div>
    </div>
  )
}

function ShoeGauge({ value, justShuffled }: { value: number; justShuffled: boolean }) {
  const near = value > 0.6
  return (
    <div className="shoe-gauge">
      <span>{justShuffled ? 'Sabot rebattu' : 'Sabot'}</span>
      <span className="bar">
        <span style={{ width: `${Math.min(value, 1) * 100}%` }} data-near={near} />
      </span>
      <span>{Math.round(value * 100)} %</span>
    </div>
  )
}
