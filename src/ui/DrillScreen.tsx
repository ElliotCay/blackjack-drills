import { useCallback, useMemo, useRef, useState } from 'react'
import type { Action } from '../engine/ev.ts'
import {
  ACTION_LABELS,
  decisionKey,
  explainDecision,
  frenchChart,
  type CellDecision,
} from '../engine/strategy.ts'
import { systemRng } from '../drill/rng.ts'
import {
  emptyProgress,
  nextQuestion,
  updateProgress,
  type Question,
} from '../drill/scheduler.ts'
import { useStore } from '../state.tsx'
import { ActionBar } from './ActionBar.tsx'
import { HandDisplay } from './HandDisplay.tsx'

interface Attempt {
  question: Question
  chosen: Action
  correct: boolean
}

const RECENT_MEMORY = 6

export function DrillScreen() {
  const chart = useMemo(() => frenchChart(), [])
  const { state, setProgress, addSession } = useStore()
  const { coaching, handsPerSession } = state.settings

  const recent = useRef<string[]>([])
  const askedAt = useRef<number>(Date.now())

  const draw = useCallback(() => {
    askedAt.current = Date.now()
    return nextQuestion(chart, state.progress, systemRng, { recent: recent.current })
    // La progression évolue à chaque réponse ; on la relit au moment du tirage.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chart])

  const [question, setQuestion] = useState<Question>(() => draw())
  const [chosen, setChosen] = useState<Action | null>(null)
  const [attempts, setAttempts] = useState<Attempt[]>([])
  const [finished, setFinished] = useState(false)

  const decision = question.decision
  const available = useMemo(
    () => ({
      hit: true,
      stand: true,
      double: decision.evs.double !== null,
      split: decision.evs.split !== null,
      surrender: false,
    }),
    [decision],
  )

  const answer = (action: Action) => {
    if (chosen) return
    const correct = action === decision.action
    const key = decisionKey(decision.cell.key, decision.upcard)

    setProgress(
      key,
      updateProgress(
        state.progress[key] ?? emptyProgress(),
        correct,
        Date.now() - askedAt.current,
        Date.now(),
      ),
    )

    recent.current = [key, ...recent.current].slice(0, RECENT_MEMORY)
    setChosen(action)
    setAttempts((prev) => [...prev, { question, chosen: action, correct }])
  }

  const next = () => {
    if (attempts.length >= handsPerSession) {
      const correct = attempts.filter((a) => a.correct).length
      addSession({
        at: Date.now(),
        hands: attempts.length,
        correct,
        evLost: attempts
          .filter((a) => !a.correct)
          .reduce((sum, a) => sum + a.question.decision.margin, 0),
        coaching,
      })
      setFinished(true)
      return
    }
    setChosen(null)
    setQuestion(draw())
  }

  const restart = () => {
    setAttempts([])
    setFinished(false)
    setChosen(null)
    setQuestion(draw())
  }

  if (finished) {
    return <SessionSummary attempts={attempts} onRestart={restart} coaching={coaching} />
  }

  const done = attempts.length
  const correct = attempts.filter((a) => a.correct).length

  return (
    <>
      <div className="panel">
        <div className="row" style={{ paddingTop: 0 }}>
          <span className="k">
            Main {Math.min(done + (chosen ? 0 : 1), handsPerSession)} sur {handsPerSession}
          </span>
          <span className="v">
            {done > 0 ? `${correct}/${done} justes` : 'Nouvelle session'}
          </span>
        </div>
        <div className="progress">
          <span style={{ width: `${(done / handsPerSession) * 100}%` }} />
        </div>
      </div>

      <div className="felt">
        <HandDisplay
          cards={[question.dealerCard]}
          label="Croupier"
          pending
          showTotal={false}
        />
        <div style={{ height: 22 }} />
        <HandDisplay cards={question.playerCards} label="Ta main" />
      </div>

      {chosen ? (
        <Verdict
          decision={decision}
          chosen={chosen}
          coaching={coaching}
          onNext={next}
          last={attempts.length >= handsPerSession}
        />
      ) : (
        <ActionBar
          available={available}
          onChoose={answer}
          evs={coaching ? decision.evs : null}
          best={null}
        />
      )}
    </>
  )
}

function Verdict({
  decision,
  chosen,
  coaching,
  onNext,
  last,
}: {
  decision: CellDecision
  chosen: Action
  coaching: boolean
  onNext: () => void
  last: boolean
}) {
  const correct = chosen === decision.action

  return (
    <>
      <div className={`verdict ${correct ? 'good' : 'bad'}`}>
        <div className="head">
          <span>{correct ? '✓' : '✗'}</span>
          <span>
            {correct
              ? ACTION_LABELS[decision.action]
              : `${ACTION_LABELS[chosen]} — il fallait ${ACTION_LABELS[
                  decision.action
                ].toLowerCase()}`}
          </span>
        </div>

        {coaching ? (
          <>
            <div className="why">{explainDecision(decision, correct ? undefined : chosen)}</div>
            {decision.frenchDeviation && (
              <div className="trap">
                Piège français : une table américaine jouerait «{' '}
                {ACTION_LABELS[decision.standardAction].toLowerCase()} » ici.
              </div>
            )}
          </>
        ) : (
          <div className="why faint" style={{ marginTop: 6 }}>
            Explication au bilan de fin de session.
          </div>
        )}
      </div>

      <button className="action primary" style={{ width: '100%' }} onClick={onNext} autoFocus>
        {last ? 'Voir le bilan' : 'Main suivante'}
      </button>
    </>
  )
}

function SessionSummary({
  attempts,
  onRestart,
  coaching,
}: {
  attempts: Attempt[]
  onRestart: () => void
  coaching: boolean
}) {
  const correct = attempts.filter((a) => a.correct).length
  const missed = attempts.filter((a) => !a.correct)
  const evLost = missed.reduce((sum, a) => sum + a.question.decision.margin, 0)
  const accuracy = attempts.length === 0 ? 0 : correct / attempts.length

  return (
    <>
      <div className="panel">
        <h2>Bilan de session</h2>
        <div className="stat-grid">
          <div className="stat">
            <div className={`value ${accuracy >= 0.9 ? 'good' : accuracy < 0.7 ? 'bad' : ''}`}>
              {Math.round(accuracy * 100)} %
            </div>
            <div className="label">
              {correct} justes sur {attempts.length}
            </div>
          </div>
          <div className="stat">
            <div className={`value ${evLost > 0.3 ? 'bad' : ''}`}>
              {evLost.toFixed(2).replace('.', ',')} €
            </div>
            <div className="label">Espérance abandonnée, par euro misé</div>
          </div>
        </div>
        {missed.length === 0 && (
          <p className="muted" style={{ marginBottom: 0, marginTop: 14 }}>
            Session sans faute. La prochaine ira chercher des cases moins bien sues.
          </p>
        )}
      </div>

      {missed.length > 0 && (
        <div className="panel">
          <h2>
            {coaching ? 'Les mains ratées' : 'Ce que tu n’as pas vu pendant la session'}
          </h2>
          <div className="stack">
            {missed.map((attempt, i) => (
              <MissedHand key={i} attempt={attempt} />
            ))}
          </div>
        </div>
      )}

      <button className="action primary" style={{ width: '100%' }} onClick={onRestart}>
        Nouvelle session
      </button>
    </>
  )
}

function MissedHand({ attempt }: { attempt: Attempt }) {
  const { decision } = attempt.question

  return (
    <div style={{ borderTop: '1px solid rgba(255,255,255,.07)', paddingTop: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <HandDisplay cards={attempt.question.playerCards} small showTotal={false} />
        <span className="faint">contre</span>
        <HandDisplay cards={[attempt.question.dealerCard]} small showTotal={false} />
      </div>
      <div style={{ marginTop: 8, fontSize: 13 }}>
        <span className="pill bad">{ACTION_LABELS[attempt.chosen]}</span>{' '}
        <span className="faint">au lieu de</span>{' '}
        <span className="pill good">{ACTION_LABELS[decision.action]}</span>
      </div>
      <div className="why" style={{ marginTop: 8 }}>
        {explainDecision(decision, attempt.chosen)}
      </div>
    </div>
  )
}
