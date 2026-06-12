import { useEffect, useRef, useState } from 'react'
import { SessionSummary, geoIdFromTitle } from '../types/pipeline'

interface Props {
  onSelect: (session: SessionSummary) => void
  onNew: () => void
  onCombine: (sessions: SessionSummary[]) => void
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.floor(hours / 24)}d ago`
}

function StatusBadge({ status }: { status: SessionSummary['status'] }) {
  if (status === 'running') {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-blue-300">
        <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse-fast" />
        Running
      </span>
    )
  }
  if (status === 'terminated') {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-orange-400">
        <span className="w-1.5 h-1.5 rounded-full bg-orange-400" />
        Terminated
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-400">
      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
      Complete
    </span>
  )
}

export function SessionList({ onSelect, onNew, onCombine }: Props) {
  const [sessions, setSessions] = useState<SessionSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const load = async () => {
    try {
      const res = await fetch('/api/sessions')
      if (!res.ok) throw new Error('Failed to load sessions')
      const body = (await res.json()) as { data: SessionSummary[] }
      setSessions(body.data ?? [])
      setError(null)
    } catch (e) {
      setError(String(e))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
    timerRef.current = setInterval(load, 5000)
    return () => { if (timerRef.current) clearInterval(timerRef.current) }
  }, [])

  const toggleSelect = (id: string, e: React.MouseEvent) => {
    e.stopPropagation()
    setSelected((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const clearSelection = () => setSelected(new Set())

  const handleCombine = () => {
    const chosen = sessions.filter((s) => selected.has(s.id))
    onCombine(chosen)
  }

  const running = sessions.filter((s) => s.status === 'running')
  const rest = sessions.filter((s) => s.status !== 'running')
  const sorted = [...running, ...rest]
  const anySelected = selected.size > 0
  const canCombine = selected.size >= 2

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 pb-24">
      {/* Header */}
      <div className="border-b border-slate-800 px-6 py-4 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight">Bio Scaffold</h1>
          <p className="text-xs text-slate-500 mt-0.5">Biomedical dataset pipeline runs</p>
        </div>
        <button
          onClick={onNew}
          className="bg-blue-600 hover:bg-blue-500 active:bg-blue-700 text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors flex items-center gap-2"
        >
          <span className="text-base leading-none">+</span>
          New pipeline run
        </button>
      </div>

      <div className="max-w-4xl mx-auto px-6 py-6">
        {loading && (
          <div className="flex items-center justify-center py-16 text-slate-500 text-sm">
            Loading runs…
          </div>
        )}

        {error && (
          <div className="bg-red-900/40 border border-red-700 rounded-lg px-4 py-3 text-sm text-red-300">
            {error}
          </div>
        )}

        {!loading && !error && sorted.length === 0 && (
          <div className="flex flex-col items-center justify-center py-20 gap-4 text-slate-500">
            <span className="text-4xl">🧬</span>
            <p className="text-sm">No pipeline runs yet.</p>
            <button
              onClick={onNew}
              className="text-blue-400 hover:text-blue-300 text-sm underline underline-offset-2"
            >
              Start your first run
            </button>
          </div>
        )}

        {sorted.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs uppercase tracking-widest text-slate-500">
                {sorted.length} run{sorted.length !== 1 ? 's' : ''}
              </p>
              {anySelected && (
                <button
                  onClick={clearSelection}
                  className="text-xs text-slate-500 hover:text-slate-300 transition-colors"
                >
                  Clear selection
                </button>
              )}
            </div>

            {sorted.map((session) => {
              const geoId = geoIdFromTitle(session.title)
              const isSelected = selected.has(session.id)
              return (
                <div
                  key={session.id}
                  onClick={() => !anySelected && onSelect(session)}
                  className={`flex items-center gap-3 bg-slate-800 border rounded-xl px-4 py-4 transition-colors group ${
                    isSelected
                      ? 'border-blue-500/60 bg-slate-800'
                      : anySelected
                        ? 'border-slate-700 cursor-default'
                        : 'border-slate-700 hover:border-slate-600 cursor-pointer'
                  }`}
                >
                  {/* Checkbox */}
                  <div
                    onClick={(e) => toggleSelect(session.id, e)}
                    className="shrink-0 cursor-pointer"
                  >
                    <div
                      className={`w-4 h-4 rounded border-2 flex items-center justify-center transition-colors ${
                        isSelected
                          ? 'bg-blue-500 border-blue-500'
                          : 'border-slate-600 hover:border-slate-400'
                      }`}
                    >
                      {isSelected && (
                        <svg className="w-2.5 h-2.5 text-white" viewBox="0 0 10 8" fill="none">
                          <path d="M1 4l3 3 5-6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      )}
                    </div>
                  </div>

                  {/* Row content */}
                  <div
                    className="flex items-center justify-between gap-4 flex-1 min-w-0"
                    onClick={() => anySelected ? toggleSelect(session.id, { stopPropagation: () => {} } as React.MouseEvent) : onSelect(session)}
                  >
                    <div className="flex items-center gap-4 min-w-0">
                      <span className="font-mono font-semibold text-slate-100 text-base shrink-0">
                        {geoId}
                      </span>
                      <StatusBadge status={session.status} />
                    </div>
                    <div className="flex items-center gap-4 text-xs text-slate-500 shrink-0">
                      <span>{timeAgo(session.created_at)}</span>
                      {!anySelected && (
                        <span className="text-slate-600 group-hover:text-slate-400 transition-colors">→</span>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Fixed floating action bar */}
      {canCombine && (
        <div className="fixed bottom-0 left-0 right-0 bg-slate-800/95 backdrop-blur border-t border-slate-600 px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-sm font-semibold text-slate-200">
              {selected.size} datasets selected
            </span>
            <span className="text-slate-600">·</span>
            <span className="text-xs text-slate-400">
              {sessions
                .filter((s) => selected.has(s.id))
                .map((s) => geoIdFromTitle(s.title))
                .join(', ')}
            </span>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={clearSelection}
              className="text-sm text-slate-400 hover:text-slate-200 transition-colors px-3 py-1.5"
            >
              Clear
            </button>
            <button
              onClick={handleCombine}
              className="bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 text-white text-sm font-semibold px-5 py-2 rounded-lg transition-colors flex items-center gap-2"
            >
              Align datasets
              <span className="opacity-70">→</span>
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
