import { StageInfo } from '../types/pipeline'

interface Props {
  stages: StageInfo[]
}

function stepIcon(status: StageInfo['steps'][number]['status']) {
  switch (status) {
    case 'completed':
      return <span className="text-emerald-400">✓</span>
    case 'running':
      return <span className="animate-spin-slow inline-block text-blue-400">⟳</span>
    case 'failed':
      return <span className="text-red-400">✗</span>
    case 'skipped':
      return <span className="text-slate-500">—</span>
    default:
      return <span className="text-slate-600">○</span>
  }
}

function stageStatus(stage: StageInfo): 'pending' | 'running' | 'completed' | 'failed' {
  const statuses = stage.steps.map((s) => s.status)
  if (statuses.every((s) => s === 'pending')) return 'pending'
  if (statuses.some((s) => s === 'failed')) return 'failed'
  if (statuses.every((s) => s === 'completed' || s === 'skipped')) return 'completed'
  return 'running'
}

function stageIcon(status: ReturnType<typeof stageStatus>) {
  switch (status) {
    case 'completed':
      return <span className="text-emerald-400 font-bold">✓</span>
    case 'running':
      return <span className="animate-pulse-fast text-blue-400 font-bold">●</span>
    case 'failed':
      return <span className="text-red-400 font-bold">✗</span>
    default:
      return <span className="text-slate-600 font-bold">○</span>
  }
}

export function ProgressTracker({ stages }: Props) {
  return (
    <div className="space-y-4">
      {stages.map((stage, i) => {
        const ss = stageStatus(stage)
        return (
          <div key={stage.name}>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-sm font-semibold text-slate-300 w-4">{stageIcon(ss)}</span>
              <span
                className={`text-sm font-semibold tracking-wide ${
                  ss === 'completed'
                    ? 'text-emerald-300'
                    : ss === 'running'
                      ? 'text-blue-300'
                      : ss === 'failed'
                        ? 'text-red-300'
                        : 'text-slate-400'
                }`}
              >
                Stage {i + 1} — {stage.name}
              </span>
            </div>
            <div className="ml-6 space-y-1">
              {stage.steps.map((step) => (
                <div key={step.key} className="flex items-center gap-2 text-xs">
                  <span className="w-4 text-center">{stepIcon(step.status)}</span>
                  <span
                    className={
                      step.status === 'completed'
                        ? 'text-slate-300'
                        : step.status === 'running'
                          ? 'text-blue-300 font-medium'
                          : step.status === 'failed'
                            ? 'text-red-300'
                            : 'text-slate-500'
                    }
                  >
                    {step.label}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}
