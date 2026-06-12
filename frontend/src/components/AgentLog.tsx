import { useEffect, useRef, useState } from 'react'
import { RawAgentEvent } from '../types/pipeline'

interface Props {
  events: RawAgentEvent[]
}

function isPipelineEventLine(line: string) {
  return line.trimStart().startsWith('{"pipeline_event":')
}

function textFromContent(content: { type: string; text?: string }[]): string {
  return content
    .filter((c) => c.type === 'text')
    .map((c) => c.text ?? '')
    .join('')
}

function filterAgentText(raw: string): string {
  return raw
    .split('\n')
    .filter((l) => !isPipelineEventLine(l))
    .join('\n')
    .trim()
}

// Truncate long strings, showing first N + toggle
function Truncatable({ text, maxLines = 20 }: { text: string; maxLines?: number }) {
  const lines = text.split('\n')
  const [expanded, setExpanded] = useState(false)
  if (lines.length <= maxLines) {
    return <span>{text}</span>
  }
  const visible = expanded ? text : lines.slice(0, maxLines).join('\n')
  return (
    <>
      {visible}
      {!expanded && <span className="text-slate-600"> …</span>}
      <button
        onClick={() => setExpanded((v) => !v)}
        className="ml-2 text-xs text-slate-500 hover:text-slate-300 underline underline-offset-2"
      >
        {expanded ? 'show less' : `+${lines.length - maxLines} more lines`}
      </button>
    </>
  )
}

function UserMessage({ event }: { event: Extract<RawAgentEvent, { type: 'user.message' }> }) {
  const text = textFromContent(event.content)
  if (!text) return null
  return (
    <div className="flex gap-3">
      <div className="shrink-0 w-6 h-6 rounded-full bg-slate-600 flex items-center justify-center text-xs font-bold text-slate-300 mt-0.5">
        U
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-xs font-semibold text-slate-400 mb-1">User</div>
        <p className="text-sm text-slate-200">{text}</p>
      </div>
    </div>
  )
}

function AgentMessage({ event }: { event: Extract<RawAgentEvent, { type: 'agent.message' }> }) {
  const raw = textFromContent(event.content)
  const text = filterAgentText(raw)
  if (!text) return null
  return (
    <div className="flex gap-3">
      <div className="shrink-0 w-6 h-6 rounded-full bg-indigo-700 flex items-center justify-center text-xs font-bold text-indigo-200 mt-0.5">
        A
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-xs font-semibold text-slate-400 mb-1">Agent</div>
        <p className="text-sm text-slate-300 whitespace-pre-wrap">{text}</p>
      </div>
    </div>
  )
}

function ThinkingBlock({ event }: { event: Extract<RawAgentEvent, { type: 'agent.thinking' }> }) {
  const text = textFromContent(event.content)
  const [open, setOpen] = useState(false)
  if (!text) return null
  return (
    <div className="flex gap-3">
      <div className="shrink-0 w-6 h-6 rounded-full bg-slate-700 flex items-center justify-center text-xs text-slate-400 mt-0.5">
        💭
      </div>
      <div className="flex-1 min-w-0">
        <button
          onClick={() => setOpen((v) => !v)}
          className="text-xs font-semibold text-slate-500 hover:text-slate-400 transition-colors flex items-center gap-1"
        >
          <span>{open ? '▾' : '▸'}</span>
          Thinking
        </button>
        {open && (
          <p className="mt-1 text-xs text-slate-500 italic whitespace-pre-wrap">{text}</p>
        )}
      </div>
    </div>
  )
}

function ToolUse({ event }: { event: Extract<RawAgentEvent, { type: 'agent.tool_use' }> }) {
  const [open, setOpen] = useState(true)
  const inputStr =
    typeof event.input === 'object' && event.input !== null
      ? (event.input.command as string | undefined) ??
        (event.input.url as string | undefined) ??
        JSON.stringify(event.input, null, 2)
      : String(event.input)
  return (
    <div className="flex gap-3">
      <div className="shrink-0 w-6 h-6 rounded-full bg-amber-900/60 flex items-center justify-center text-xs text-amber-400 mt-0.5">
        ⚙
      </div>
      <div className="flex-1 min-w-0">
        <button
          onClick={() => setOpen((v) => !v)}
          className="text-xs font-semibold text-amber-400/80 hover:text-amber-300 transition-colors flex items-center gap-1.5"
        >
          <span>{open ? '▾' : '▸'}</span>
          <span className="font-mono">{event.name}</span>
        </button>
        {open && (
          <pre className="mt-1.5 text-xs text-slate-300 bg-slate-900 rounded-md px-3 py-2 overflow-x-auto whitespace-pre-wrap break-all">
            <Truncatable text={inputStr} maxLines={10} />
          </pre>
        )}
      </div>
    </div>
  )
}

function ToolResult({ event }: { event: Extract<RawAgentEvent, { type: 'agent.tool_result' }> }) {
  const [open, setOpen] = useState(false)
  const text = textFromContent(event.content)
  if (!text) return null
  return (
    <div className="flex gap-3 pl-9">
      <div className="flex-1 min-w-0 border-l-2 border-slate-700 pl-3">
        <button
          onClick={() => setOpen((v) => !v)}
          className={`text-xs font-semibold flex items-center gap-1 transition-colors ${
            event.is_error ? 'text-red-400 hover:text-red-300' : 'text-slate-500 hover:text-slate-400'
          }`}
        >
          <span>{open ? '▾' : '▸'}</span>
          {event.is_error ? 'Error output' : 'Output'}
        </button>
        {open && (
          <pre
            className={`mt-1.5 text-xs rounded-md px-3 py-2 overflow-x-auto whitespace-pre-wrap break-all ${
              event.is_error
                ? 'text-red-300 bg-red-950/40'
                : 'text-slate-400 bg-slate-900'
            }`}
          >
            <Truncatable text={text} maxLines={30} />
          </pre>
        )}
      </div>
    </div>
  )
}

function StatusLine({ type }: { type: string }) {
  const label =
    type === 'session.status_running'
      ? 'Pipeline started'
      : type === 'session.status_idle'
        ? 'Pipeline finished'
        : type === 'session.status_terminated'
          ? 'Session terminated'
          : type
  return (
    <div className="flex items-center gap-2 text-xs text-slate-600">
      <div className="flex-1 h-px bg-slate-800" />
      <span>{label}</span>
      <div className="flex-1 h-px bg-slate-800" />
    </div>
  )
}

export function AgentLog({ events }: Props) {
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [events.length])

  if (events.length === 0) {
    return (
      <div className="flex items-center justify-center h-24 text-slate-600 text-sm">
        Agent events will appear here
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {events.map((evt) => {
        switch (evt.type) {
          case 'user.message':
            return <UserMessage key={evt.id} event={evt} />
          case 'agent.message':
            return <AgentMessage key={evt.id} event={evt} />
          case 'agent.thinking':
            return <ThinkingBlock key={evt.id} event={evt} />
          case 'agent.tool_use':
            return <ToolUse key={evt.id} event={evt} />
          case 'agent.tool_result':
            return <ToolResult key={evt.id} event={evt} />
          case 'session.status_running':
          case 'session.status_idle':
          case 'session.status_terminated':
            return <StatusLine key={evt.id} type={evt.type} />
          default:
            return null
        }
      })}
      <div ref={bottomRef} />
    </div>
  )
}
