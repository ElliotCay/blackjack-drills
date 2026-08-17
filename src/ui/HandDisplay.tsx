import { cardKey, isRed, valueOf, type Card } from '../engine/cards.ts'

export function PlayingCard({ card, small }: { card: Card; small?: boolean }) {
  return (
    <div className={`card${isRed(card) ? ' red' : ''}${small ? ' small' : ''}`}>
      <span className="corner">{card.face}</span>
      <span className="pip">{card.suit}</span>
    </div>
  )
}

/** Dos de carte : la deuxième du croupier, qu'il ne prendra qu'à la fin. */
export function FaceDownCard({ small }: { small?: boolean }) {
  return <div className={`card back${small ? ' small' : ''}`} aria-label="carte à venir" />
}

export function formatTotal(cards: readonly Card[]): string {
  const { total, soft, busted } = valueOf(cards)
  if (busted) return `${total} — sauté`
  if (cards.length === 2 && total === 21) return 'Blackjack'
  return soft ? `${total - 10} ou ${total}` : String(total)
}

interface HandProps {
  cards: readonly Card[]
  label?: string
  /** Affiche un dos de carte pour signaler que le croupier n'a pas fini. */
  pending?: boolean
  small?: boolean
  showTotal?: boolean
}

export function HandDisplay({ cards, label, pending, small, showTotal = true }: HandProps) {
  return (
    <div>
      {(label || showTotal) && (
        <div className="hand-label">
          {label && <span>{label}</span>}
          {showTotal && cards.length > 0 && (
            <span className="total-badge">{formatTotal(cards)}</span>
          )}
        </div>
      )}
      <div className="hand">
        {cards.map((card, i) => (
          <PlayingCard key={`${cardKey(card)}-${i}`} card={card} small={small} />
        ))}
        {pending && <FaceDownCard small={small} />}
      </div>
    </div>
  )
}
