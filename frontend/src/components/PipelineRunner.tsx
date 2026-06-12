import { useEffect, useState } from 'react'
import { usePipelineSession } from '../hooks/usePipelineSession'
import { SessionSummary, geoIdFromTitle } from '../types/pipeline'
import { AgentLog } from './AgentLog'
import { ArtifactList } from './ArtifactList'
import { FindingsPanel } from './FindingsPanel'
import { ProgressTracker } from './ProgressTracker'

interface Props {
  existing?: SessionSummary
  combineWith?: SessionSummary[]
  onBack: () => void
}

const STATUS_BADGE: Record<string, { label: string; classes: string }> = {
  idle: { label: 'Idle', classes: 'bg-slate-700 text-slate-300' },
  running: { label: 'Running', classes: 'bg-blue-600 text-white' },
  complete: { label: 'Complete', classes: 'bg-emerald-600 text-white' },
  terminated: { label: 'Terminated', classes: 'bg-orange-600 text-white' },
  error: { label: 'Error', classes: 'bg-red-600 text-white' },
}

async function createSession(body: Record<string, unknown>): Promise<{ sessionId: string }> {
  const res = await fetch('/api/sessions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const err = (await res.json()) as { error?: string }
    throw new Error(err.error ?? 'Failed to create session')
  }
  return res.json()
}

export function PipelineRunner({ existing, combineWith, onBack }: Props) {
  const [geoInput, setGeoInput] = useState('')
  const [criteriaInput, setCriteriaInput] = useState('')

  const { sessionId, status, stages, metrics, artifacts, agentEvents, error, startPipeline, loadSession, reset } =
    usePipelineSession()

  // Load existing session on mount
  useEffect(() => {
    if (existing) loadSession(existing.id)
  }, [existing]) // eslint-disable-line react-hooks/exhaustive-deps

  const isActive = status === 'running'
  const badge = STATUS_BADGE[status] ?? STATUS_BADGE['idle']

  const combineGeoIds = combineWith?.map((s) => geoIdFromTitle(s.title)) ?? []
  const displayTitle = existing
    ? geoIdFromTitle(existing.title)
    : combineWith
      ? `Combined: ${combineGeoIds.join(' + ')}`
      : geoInput.toUpperCase() || 'New pipeline run'

  const handleSingleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!geoInput.trim()) return
    startPipeline(geoInput.trim().toUpperCase(), criteriaInput.trim() || undefined)
  }

  const handleCombineStart = async () => {
    if (!combineWith || combineWith.length < 2) return
    try {
      const { sessionId: sid } = await createSession({ geoIds: combineGeoIds })
      await loadSession(sid)
    } catch (err) {
      // error surfaced via hook state
      console.error(err)
    }
  }

  const handleBack = () => {
    reset()
    onBack()
  }

  const showSingleForm = !existing && !combineWith && status === 'idle'
  const showCombineForm = !!combineWith && status === 'idle'

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100">
      {/* Header */}
      <div className="border-b border-slate-800 px-6 py-4 flex items-center gap-4">
        <button
          onClick={handleBack}
          className="text-slate-400 hover:text-slate-200 transition-colors flex items-center gap-1.5 text-sm shrink-0"
        >
          ← Back
        </button>
        <div className="h-4 w-px bg-slate-700 shrink-0" />
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <h1 className="font-bold text-lg tracking-tight truncate">{displayTitle}</h1>
          {!showSingleForm && !showCombineForm && (
            <span
              className={`shrink-0 text-xs font-semibold px-2.5 py-1 rounded-full flex items-center gap-1.5 ${badge.classes}`}
            >
              {isActive && <span className="w-1.5 h-1.5 rounded-full bg-white/70 animate-pulse-fast" />}
              {badge.label}
            </span>
          )}
        </div>
        {sessionId && (
          <span className="hidden sm:block text-xs text-slate-600 font-mono truncate max-w-48" title={sessionId}>
            {sessionId}
          </span>
        )}
      </div>

      <div className="max-w-6xl mx-auto px-6 py-6">
        {/* Single dataset new-run form */}
        {showSingleForm && (
          <form
            onSubmit={handleSingleSubmit}
            className="bg-slate-800 border border-slate-700 rounded-xl p-6 space-y-4 max-w-2xl"
          >
            <h2 className="text-sm font-semibold uppercase tracking-widest text-slate-400">
              Configure pipeline run
            </h2>
            <div>
              <label className="block text-xs text-slate-400 mb-1">GEO Accession ID</label>
              <input
                type="text"
                value={geoInput}
                onChange={(e) => setGeoInput(e.target.value)}
                placeholder="e.g. GSE12345"
                className="w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 placeholder:text-slate-600"
                required
                autoFocus
              />
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">
                Paper criteria <span className="text-slate-600">(optional)</span>
              </label>
              <input
                type="text"
                value={criteriaInput}
                onChange={(e) => setCriteriaInput(e.target.value)}
                placeholder="e.g. Reproduce Table 2 from Smith et al. 2024"
                className="w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 placeholder:text-slate-600"
              />
            </div>
            <button
              type="submit"
              className="bg-blue-600 hover:bg-blue-500 active:bg-blue-700 text-white text-sm font-semibold px-5 py-2 rounded-lg transition-colors"
            >
              Run pipeline
            </button>
          </form>
        )}

        {/* Combined dataset alignment form */}
        {showCombineForm && combineWith && (
          <div className="bg-slate-800 border border-slate-700 rounded-xl p-6 space-y-5 max-w-2xl">
            <div>
              <h2 className="text-sm font-semibold uppercase tracking-widest text-slate-400 mb-1">
                Cross-dataset alignment
              </h2>
              <p className="text-xs text-slate-500">
                The agent will align the processed feature matrices from these datasets and build a
                combined model using artifacts already in the memory store.
              </p>
            </div>
            <div className="space-y-2">
              {combineWith.map((s) => (
                <div
                  key={s.id}
                  className="flex items-center gap-3 bg-slate-900 border border-slate-700 rounded-lg px-4 py-3"
                >
                  <span className="font-mono font-semibold text-slate-200 text-sm">
                    {geoIdFromTitle(s.title)}
                  </span>
                  <span
                    className={`text-xs px-2 py-0.5 rounded-full ${
                      s.status === 'running'
                        ? 'bg-blue-600/30 text-blue-300'
                        : s.status === 'terminated'
                          ? 'bg-orange-600/30 text-orange-300'
                          : 'bg-emerald-600/30 text-emerald-300'
                    }`}
                  >
                    {s.status === 'idle' ? 'complete' : s.status}
                  </span>
                  <span className="text-xs text-slate-600 font-mono ml-auto truncate max-w-40" title={s.id}>
                    {s.id}
                  </span>
                </div>
              ))}
            </div>
            <button
              onClick={handleCombineStart}
              className="bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 text-white text-sm font-semibold px-5 py-2 rounded-lg transition-colors flex items-center gap-2"
            >
              Start alignment
              <span className="opacity-70">→</span>
            </button>
          </div>
        )}

        {/* Error banner */}
        {error && (
          <div className="mb-4 bg-red-900/40 border border-red-700 rounded-lg px-4 py-3 text-sm text-red-300 flex items-start gap-2">
            <span className="text-red-400 font-bold shrink-0">✗</span>
            <span className="font-mono text-xs break-all">{error}</span>
          </div>
        )}

        {/* Dashboard */}
        {!showSingleForm && !showCombineForm && (
          <div className="space-y-4">
            {/* Top row: progress + findings + artifacts */}
            <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-4">
              <div className="bg-slate-800 border border-slate-700 rounded-xl p-5 self-start">
                <h2 className="text-xs font-semibold uppercase tracking-widest text-slate-400 mb-4">
                  Progress
                </h2>
                <ProgressTracker stages={stages} />
              </div>
              <div className="space-y-4">
                <div className="bg-slate-800 border border-slate-700 rounded-xl p-5">
                  <h2 className="text-xs font-semibold uppercase tracking-widest text-slate-400 mb-4">
                    Findings
                  </h2>
                  <FindingsPanel metrics={metrics} />
                </div>
                <div className="bg-slate-800 border border-slate-700 rounded-xl p-5">
                  <h2 className="text-xs font-semibold uppercase tracking-widest text-slate-400 mb-4">
                    Artifacts
                  </h2>
                  <ArtifactList artifacts={artifacts} />
                </div>
              </div>
            </div>

            {/* Agent event log */}
            <div className="bg-slate-800 border border-slate-700 rounded-xl p-5">
              <h2 className="text-xs font-semibold uppercase tracking-widest text-slate-400 mb-4">
                Agent events
              </h2>
              <div className="max-h-[600px] overflow-y-auto pr-1">
                <AgentLog events={agentEvents} />
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
