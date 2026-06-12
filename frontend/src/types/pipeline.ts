export type PipelineEventStatus = 'started' | 'completed' | 'failed' | 'skipped'

export type PipelineEventType =
  | 'stage_start'
  | 'stage_complete'
  | 'stage_failed'
  | 'step_start'
  | 'step_complete'
  | 'step_failed'
  | 'metric'
  | 'artifact_ready'

export interface MetricPayload {
  metric_name: string
  value: number | Record<string, number>
  unit?: string
}

export interface ArtifactPayload {
  path: string
  type: 'csv' | 'model' | 'plot' | 'json'
}

export interface ErrorPayload {
  error: string
  traceback_snippet: string
}

export interface StepPayload {
  [key: string]: unknown
}

export type EventPayload = MetricPayload | ArtifactPayload | ErrorPayload | StepPayload

export interface PipelineEvent {
  pipeline_event: PipelineEventType
  geo_id: string
  stage: string
  step: string
  status: PipelineEventStatus
  summary: string
  payload: EventPayload
}

export type SessionStatus = 'idle' | 'running' | 'complete' | 'terminated' | 'error'

export interface StageInfo {
  name: string
  steps: StepInfo[]
}

export interface StepInfo {
  key: string
  label: string
  status: 'pending' | 'running' | 'completed' | 'failed' | 'skipped'
}

export interface Metric {
  id: string
  stage: string
  step: string
  metric_name: string
  value: number | Record<string, number>
  unit?: string
  summary: string
}

export interface Artifact {
  id: string
  path: string
  type: 'csv' | 'model' | 'plot' | 'json'
  summary: string
  stage: string
  step: string
}

export interface AgentEventContent {
  type: string
  text?: string
}

export type RawAgentEvent =
  | { id: string; type: 'user.message'; content: AgentEventContent[] }
  | { id: string; type: 'agent.message'; content: AgentEventContent[] }
  | { id: string; type: 'agent.thinking'; content: AgentEventContent[] }
  | { id: string; type: 'agent.tool_use'; name: string; input: Record<string, unknown> }
  | { id: string; type: 'agent.tool_result'; content: AgentEventContent[]; is_error: boolean; tool_use_id: string }
  | { id: string; type: 'session.status_running' | 'session.status_idle' | 'session.status_terminated' | 'session.error' }

export interface SessionSummary {
  id: string
  title: string | null
  status: 'idle' | 'running' | 'terminated'
  created_at: string
  updated_at: string
}

export function geoIdFromTitle(title: string | null | undefined): string {
  if (!title) return 'Unknown'
  return title.replace(/ pipeline run$/i, '').trim() || 'Unknown'
}

// Pipeline stage/step structure from the dev-log
export const PIPELINE_STAGES: StageInfo[] = [
  {
    name: 'Data Acquisition',
    steps: [
      { key: 'resolve_accession', label: 'Resolve accession', status: 'pending' },
      { key: 'download_series', label: 'Download series', status: 'pending' },
      { key: 'download_supplementary', label: 'Download supplementary', status: 'pending' },
      { key: 'verify_checksums', label: 'Verify checksums', status: 'pending' },
    ],
  },
  {
    name: 'ETL',
    steps: [
      { key: 'parse_metadata', label: 'Parse metadata', status: 'pending' },
      { key: 'parse_expression_matrix', label: 'Parse expression matrix', status: 'pending' },
      { key: 'quality_filter', label: 'Quality filter', status: 'pending' },
      { key: 'normalize', label: 'Normalize', status: 'pending' },
      { key: 'feature_selection', label: 'Feature selection', status: 'pending' },
    ],
  },
  {
    name: 'Statistical Analysis',
    steps: [
      { key: 'differential_expression', label: 'Differential expression', status: 'pending' },
      { key: 'enrichment_or_correlation', label: 'Enrichment / correlation', status: 'pending' },
      { key: 'visualize_statistics', label: 'Visualize statistics', status: 'pending' },
    ],
  },
  {
    name: 'Modeling',
    steps: [
      { key: 'prepare_splits', label: 'Prepare splits', status: 'pending' },
      { key: 'train_model', label: 'Train model', status: 'pending' },
      { key: 'evaluate_model', label: 'Evaluate model', status: 'pending' },
      { key: 'save_model', label: 'Save model', status: 'pending' },
      { key: 'generate_model_plots', label: 'Generate model plots', status: 'pending' },
    ],
  },
]
