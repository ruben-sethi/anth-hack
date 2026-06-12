import { useCallback, useEffect, useRef, useState } from 'react'
import {
  Artifact,
  ArtifactPayload,
  Metric,
  MetricPayload,
  PIPELINE_STAGES,
  PipelineEvent,
  RawAgentEvent,
  SessionStatus,
  StageInfo,
} from '../types/pipeline'

function extractPipelineEvents(messageContent: string): PipelineEvent[] {
  return messageContent
    .split('\n')
    .filter((line) => line.trimStart().startsWith('{"pipeline_event":'))
    .map((line) => {
      try {
        return JSON.parse(line.trim()) as PipelineEvent
      } catch {
        return null
      }
    })
    .filter(Boolean) as PipelineEvent[]
}

function deepCloneStages(): StageInfo[] {
  return PIPELINE_STAGES.map((s) => ({
    ...s,
    steps: s.steps.map((st) => ({ ...st })),
  }))
}

interface PipelineState {
  sessionId: string | null
  status: SessionStatus
  stages: StageInfo[]
  metrics: Metric[]
  artifacts: Artifact[]
  agentEvents: RawAgentEvent[]
  error: string | null
}

interface UsePipelineSessionReturn extends PipelineState {
  startPipeline: (geoId: string, paperCriteria?: string) => Promise<void>
  loadSession: (sessionId: string) => Promise<void>
  reset: () => void
}

const INITIAL_STATE: PipelineState = {
  sessionId: null,
  status: 'idle',
  stages: deepCloneStages(),
  metrics: [],
  artifacts: [],
  agentEvents: [],
  error: null,
}

export function usePipelineSession(): UsePipelineSessionReturn {
  const [state, setState] = useState<PipelineState>(INITIAL_STATE)
  const seenEvents = useRef(new Set<string>())
  const streamRef = useRef<EventSource | null>(null)
  const messageBufferRef = useRef<string>('')

  const applyPipelineEvent = useCallback((evt: PipelineEvent) => {
    setState((prev) => {
      const stages = prev.stages.map((s) => ({ ...s, steps: s.steps.map((st) => ({ ...st })) }))
      const metrics = [...prev.metrics]
      const artifacts = [...prev.artifacts]

      switch (evt.pipeline_event) {
        case 'stage_start':
        case 'stage_complete':
        case 'stage_failed': {
          // Stage-level events don't directly map to a step; just used for status badge
          break
        }
        case 'step_start':
        case 'step_complete':
        case 'step_failed': {
          for (const stage of stages) {
            const step = stage.steps.find((s) => s.key === evt.step)
            if (step) {
              step.status =
                evt.pipeline_event === 'step_start'
                  ? 'running'
                  : evt.pipeline_event === 'step_complete'
                    ? 'completed'
                    : 'failed'
              break
            }
          }
          break
        }
        case 'metric': {
          const p = evt.payload as MetricPayload
          metrics.push({
            id: `${evt.stage}-${evt.step}-${p.metric_name}-${Date.now()}`,
            stage: evt.stage,
            step: evt.step,
            metric_name: p.metric_name,
            value: p.value,
            unit: p.unit,
            summary: evt.summary,
          })
          break
        }
        case 'artifact_ready': {
          const p = evt.payload as ArtifactPayload
          artifacts.push({
            id: `${p.path}-${Date.now()}`,
            path: p.path,
            type: p.type,
            summary: evt.summary,
            stage: evt.stage,
            step: evt.step,
          })
          break
        }
      }

      return { ...prev, stages, metrics, artifacts }
    })
  }, [])

  const handleAgentEvent = useCallback(
    (raw: unknown) => {
      const data = raw as Record<string, unknown>
      const id = data.id as string | undefined

      if (id) {
        if (seenEvents.current.has(id)) return
        seenEvents.current.add(id)
      }

      const pushEvent = (evt: RawAgentEvent) =>
        setState((p) => ({ ...p, agentEvents: [...p.agentEvents, evt] }))

      switch (data.type) {
        case 'session.status_running':
          setState((p) => ({ ...p, status: 'running' }))
          pushEvent({ id: id ?? `status-running-${Date.now()}`, type: 'session.status_running' })
          break
        case 'session.status_idle': {
          const stop = data.stop_reason as Record<string, unknown> | undefined
          if (stop?.type !== 'requires_action') {
            setState((p) => ({ ...p, status: 'complete' }))
          }
          pushEvent({ id: id ?? `status-idle-${Date.now()}`, type: 'session.status_idle' })
          break
        }
        case 'session.status_terminated':
          setState((p) => ({ ...p, status: 'terminated' }))
          pushEvent({ id: id ?? `status-terminated-${Date.now()}`, type: 'session.status_terminated' })
          break
        case 'session.error':
          setState((p) => ({ ...p, status: 'error', error: String(data.error ?? 'Unknown error') }))
          break
        case 'user.message':
          pushEvent({ id: id ?? `user-${Date.now()}`, type: 'user.message', content: (data.content as RawAgentEvent extends { content: infer C } ? C : never) ?? [] })
          break
        case 'agent.thinking':
          pushEvent({ id: id ?? `thinking-${Date.now()}`, type: 'agent.thinking', content: (data.content as { type: string; text?: string }[]) ?? [] })
          break
        case 'agent.tool_use':
          pushEvent({
            id: id ?? `tool-use-${Date.now()}`,
            type: 'agent.tool_use',
            name: String(data.name ?? ''),
            input: (data.input as Record<string, unknown>) ?? {},
          })
          break
        case 'agent.tool_result':
          pushEvent({
            id: id ?? `tool-result-${Date.now()}`,
            type: 'agent.tool_result',
            content: (data.content as { type: string; text?: string }[]) ?? [],
            is_error: Boolean(data.is_error),
            tool_use_id: String(data.tool_use_id ?? ''),
          })
          break
        case 'agent.message': {
          const rawContent = Array.isArray(data.content)
            ? (data.content as { type: string; text?: string }[])
            : []
          pushEvent({ id: id ?? `msg-${Date.now()}`, type: 'agent.message', content: rawContent })

          // Also extract pipeline events from text content
          const text = rawContent
            .filter((c) => c.type === 'text')
            .map((c) => c.text ?? '')
            .join('')

          messageBufferRef.current += text
          const lines = messageBufferRef.current.split('\n')
          messageBufferRef.current = lines.pop() ?? ''
          for (const line of lines) {
            extractPipelineEvents(line).forEach(applyPipelineEvent)
          }
          break
        }
      }
    },
    [applyPipelineEvent],
  )

  const connectStream = useCallback(
    async (sessionId: string) => {
      // Fetch event history first
      try {
        const historyRes = await fetch(`/api/sessions/${sessionId}/events`)
        if (historyRes.ok) {
          const history = (await historyRes.json()) as { data: unknown[] }
          for (const evt of history.data ?? []) {
            handleAgentEvent(evt)
          }
        }
      } catch {
        // non-fatal
      }

      // Open live SSE stream
      const es = new EventSource(`/api/sessions/${sessionId}/stream`)
      streamRef.current = es

      es.onmessage = (e) => {
        try {
          handleAgentEvent(JSON.parse(e.data))
        } catch {
          // ignore parse errors
        }
      }

      es.onerror = () => {
        setState((p) => ({ ...p, status: 'error', error: 'SSE stream disconnected' }))
      }
    },
    [handleAgentEvent],
  )

  const startPipeline = useCallback(
    async (geoId: string, paperCriteria?: string) => {
      setState({ ...INITIAL_STATE, status: 'running', stages: deepCloneStages() })
      seenEvents.current = new Set()
      messageBufferRef.current = ''

      try {
        const res = await fetch('/api/sessions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ geoId, paperCriteria }),
        })

        if (!res.ok) {
          const err = (await res.json()) as { error?: string }
          setState((p) => ({ ...p, status: 'error', error: err.error ?? 'Failed to create session' }))
          return
        }

        const { sessionId } = (await res.json()) as { sessionId: string }
        setState((p) => ({ ...p, sessionId }))
        await connectStream(sessionId)
      } catch (err) {
        setState((p) => ({ ...p, status: 'error', error: String(err) }))
      }
    },
    [connectStream],
  )

  const loadSession = useCallback(
    async (sessionId: string) => {
      streamRef.current?.close()
      setState({ ...INITIAL_STATE, sessionId, status: 'running', stages: deepCloneStages() })
      seenEvents.current = new Set()
      messageBufferRef.current = ''
      await connectStream(sessionId)
    },
    [connectStream],
  )

  const reset = useCallback(() => {
    streamRef.current?.close()
    streamRef.current = null
    seenEvents.current = new Set()
    messageBufferRef.current = ''
    setState(INITIAL_STATE)
  }, [])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      streamRef.current?.close()
    }
  }, [])

  return { ...state, startPipeline, loadSession, reset }
}
