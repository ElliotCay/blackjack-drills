import { useState } from 'react'
import { useStore } from './state.tsx'
import { DrillScreen } from './ui/DrillScreen.tsx'
import { TableScreen } from './ui/TableScreen.tsx'
import { StatsScreen } from './ui/StatsScreen.tsx'
import { RulesScreen } from './ui/RulesScreen.tsx'

type Tab = 'drill' | 'table' | 'stats' | 'rules'

const TABS: { id: Tab; label: string; subtitle: string }[] = [
  { id: 'drill', label: 'Drill', subtitle: 'Stratégie de base, répétition ciblée' },
  { id: 'table', label: 'Partie', subtitle: 'Sabot de 6 jeux, bankroll réelle' },
  { id: 'stats', label: 'Stats', subtitle: 'Où tu en es, et ce que ça coûte' },
  { id: 'rules', label: 'Règles', subtitle: 'Casinos français, table complète' },
]

export function App() {
  const [tab, setTab] = useState<Tab>('drill')
  const { state, setSettings } = useStore()
  const coaching = state.settings.coaching
  const current = TABS.find((t) => t.id === tab)!

  return (
    <div className="app">
      <header className="topbar">
        <div>
          <h1>{current.label === 'Drill' ? 'Blackjack Drills' : current.label}</h1>
          <div className="sub">{current.subtitle}</div>
        </div>
        <button
          className="coach-toggle"
          data-on={coaching}
          onClick={() => setSettings({ coaching: !coaching })}
          title={
            coaching
              ? 'Les espérances sont affichées avant ta décision'
              : 'Aucune aide avant la décision, comme à la table'
          }
        >
          <span className="led" />
          <span>{coaching ? 'Conseils' : 'Sans aide'}</span>
        </button>
      </header>

      <main>
        {tab === 'drill' && <DrillScreen />}
        {tab === 'table' && <TableScreen />}
        {tab === 'stats' && <StatsScreen />}
        {tab === 'rules' && <RulesScreen />}
      </main>

      <nav className="tabbar">
        {TABS.map((t) => (
          <button key={t.id} data-active={t.id === tab} onClick={() => setTab(t.id)}>
            {t.label}
          </button>
        ))}
      </nav>
    </div>
  )
}
