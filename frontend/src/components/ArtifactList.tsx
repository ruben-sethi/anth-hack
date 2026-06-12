import { Artifact } from '../types/pipeline'

interface Props {
  artifacts: Artifact[]
}

const TYPE_ICON: Record<Artifact['type'], string> = {
  csv: '📄',
  model: '🤖',
  plot: '📊',
  json: '{}',
}

const TYPE_LABEL: Record<Artifact['type'], string> = {
  csv: 'CSV',
  model: 'Model',
  plot: 'Plot',
  json: 'JSON',
}

function filename(path: string) {
  return path.split('/').pop() ?? path
}

export function ArtifactList({ artifacts }: Props) {
  if (artifacts.length === 0) {
    return (
      <div className="flex items-center justify-center h-24 text-slate-500 text-sm">
        Output files will appear here
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {artifacts.map((a) => (
        <div
          key={a.id}
          className="flex items-start gap-3 bg-slate-800 rounded-lg p-3 border border-slate-700"
        >
          <span className="text-xl leading-none mt-0.5">{TYPE_ICON[a.type]}</span>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-slate-200 truncate">{filename(a.path)}</span>
              <span className="shrink-0 text-xs bg-slate-700 text-slate-400 rounded px-1.5 py-0.5">
                {TYPE_LABEL[a.type]}
              </span>
            </div>
            <div className="text-xs text-slate-500 truncate mt-0.5">{a.path}</div>
            {a.summary && <div className="text-xs text-slate-400 mt-1">{a.summary}</div>}
          </div>
        </div>
      ))}
    </div>
  )
}
