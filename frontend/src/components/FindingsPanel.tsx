import { Metric } from '../types/pipeline'

interface Props {
  metrics: Metric[]
}

function MetricCard({ metric }: { metric: Metric }) {
  const isDict = typeof metric.value === 'object' && metric.value !== null

  return (
    <div className="bg-slate-800 rounded-lg p-3 border border-slate-700">
      <div className="text-xs text-slate-400 uppercase tracking-wider mb-1">{metric.metric_name.replace(/_/g, ' ')}</div>
      {isDict ? (
        <table className="w-full text-xs">
          <tbody>
            {Object.entries(metric.value as Record<string, number>).map(([k, v]) => (
              <tr key={k} className="border-t border-slate-700 first:border-0">
                <td className="py-0.5 text-slate-300 pr-4">{k}</td>
                <td className="py-0.5 text-right font-mono text-slate-100">
                  {typeof v === 'number' ? v.toLocaleString() : String(v)}
                  {metric.unit ? ` ${metric.unit}` : ''}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <div className="text-lg font-mono font-semibold text-slate-100">
          {typeof metric.value === 'number' ? metric.value.toLocaleString() : String(metric.value)}
          {metric.unit && <span className="text-xs text-slate-400 ml-1">{metric.unit}</span>}
        </div>
      )}
      <div className="text-xs text-slate-500 mt-1">{metric.summary}</div>
    </div>
  )
}

// Group metrics by stage
function groupByStage(metrics: Metric[]) {
  const groups: Record<string, Metric[]> = {}
  for (const m of metrics) {
    if (!groups[m.stage]) groups[m.stage] = []
    groups[m.stage].push(m)
  }
  return groups
}

export function FindingsPanel({ metrics }: Props) {
  if (metrics.length === 0) {
    return (
      <div className="flex items-center justify-center h-32 text-slate-500 text-sm">
        Metrics will appear here as the pipeline runs
      </div>
    )
  }

  const groups = groupByStage(metrics)

  return (
    <div className="space-y-4">
      {Object.entries(groups).map(([stage, stageMetrics]) => (
        <div key={stage}>
          <h3 className="text-xs font-semibold uppercase tracking-widest text-slate-400 mb-2">{stage}</h3>
          <div className="space-y-2">
            {stageMetrics.map((m) => (
              <MetricCard key={m.id} metric={m} />
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
