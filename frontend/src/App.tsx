import { useState } from 'react'
import { PipelineRunner } from './components/PipelineRunner'
import { SessionList } from './components/SessionList'
import { SessionSummary } from './types/pipeline'

type View =
  | { screen: 'list' }
  | { screen: 'detail'; session: SessionSummary }
  | { screen: 'new'; combineWith?: SessionSummary[] }

export default function App() {
  const [view, setView] = useState<View>({ screen: 'list' })

  if (view.screen === 'list') {
    return (
      <SessionList
        onSelect={(session) => setView({ screen: 'detail', session })}
        onNew={() => setView({ screen: 'new' })}
        onCombine={(sessions) => setView({ screen: 'new', combineWith: sessions })}
      />
    )
  }

  return (
    <PipelineRunner
      existing={view.screen === 'detail' ? view.session : undefined}
      combineWith={view.screen === 'new' ? view.combineWith : undefined}
      onBack={() => setView({ screen: 'list' })}
    />
  )
}
