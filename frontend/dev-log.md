# GEO Pipeline Reproducer — Frontend Integration Guide

## Overview

The GEO Pipeline Reproducer is a Claude-powered agent that runs a multi-stage biomedical data pipeline and streams structured progress events in real time. This guide covers how to connect to the event stream, parse pipeline events, and build the live dashboard UI.

---

## Architecture
Anthropic Managed Agents API
│
│  SSE event stream
▼
React Frontend
├── Progress Tracker     ← stage/step status
├── Findings Panel       ← live metrics (sample counts, AUC, p-values…)
└── Artifact List        ← files written to memory store
Copy
The agent runs inside a managed session. Your app opens a Server-Sent Events (SSE) connection to the session's event stream and processes events as they arrive.

---

## Connecting to the Stream

### 1. Create a Session (backend/server-side)

Session creation must happen server-side (your API key must never be exposed to the browser).

```http
POST https://api.anthropic.com/v1/sessions
x-api-key: <YOUR_API_KEY>
anthropic-version: 2023-06-01
anthropic-beta: managed-agents-2026-04-01
Content-Type: application/json

{
  "agent": "<AGENT_ID>",
  "environment_id": "<ENVIRONMENT_ID>",
  "title": "GSE12345 pipeline run"
}
Return the session.id to the frontend.
2. Send the Initial Message (backend/server-side)
httpCopyPOST https://api.anthropic.com/v1/sessions/{session_id}/events
x-api-key: <YOUR_API_KEY>
anthropic-beta: managed-agents-2026-04-01
Content-Type: application/json

{
  "events": [
    {
      "type": "user.message",
      "content": [{ "type": "text", "text": "Run pipeline for GSE12345. Paper criteria: ..." }]
    }
  ]
}
3. Open the SSE Stream (frontend)
typescriptCopyconst stream = new EventSource(
  `/api/sessions/${sessionId}/stream` // your backend proxy
);

stream.onmessage = (event) => {
  const data = JSON.parse(event.data);
  handleAgentEvent(data);
};

Important: Never connect to the Anthropic API directly from the browser. Proxy the SSE stream through your backend to keep the API key secret.


Event Stream Structure
All events from the stream share this envelope:
jsonCopy{
  "id": "sevt_abc123",
  "type": "<event_type>",
  "processed_at": "2026-06-12T14:00:00Z",
  ...event-specific fields
}
The events you care about most are agent.message — these contain the agent's text output, which is where pipeline events are embedded.
Relevant SSE Event Types
typeWhat it meanssession.status_runningPipeline has startedagent.messageAgent output — scan for pipeline_event JSON linesagent.tool_useAgent is running a tool (bash, web_fetch, etc.)agent.tool_resultTool finishedsession.status_idleAgent is waiting or finishedsession.status_terminatedSession endedsession.errorAn error occurred

Parsing Pipeline Events
The agent embeds structured events as individual lines inside agent.message content. Each pipeline event line starts with {"pipeline_event": and is self-contained JSON.
Detection Logic
typescriptCopyfunction extractPipelineEvents(messageContent: string): PipelineEvent[] {
  return messageContent
    .split('\n')
    .filter(line => line.trimStart().startsWith('{"pipeline_event":'))
    .map(line => {
      try {
        return JSON.parse(line.trim()) as PipelineEvent;
      } catch {
        return null;
      }
    })
    .filter(Boolean);
}
Pipeline Event Schema
typescriptCopytype PipelineEventStatus = 'started' | 'completed' | 'failed' | 'skipped';

type PipelineEventType =
  | 'stage_start' | 'stage_complete' | 'stage_failed'
  | 'step_start'  | 'step_complete'  | 'step_failed'
  | 'metric'
  | 'artifact_ready';

interface PipelineEvent {
  pipeline_event: PipelineEventType;
  geo_id:         string;           // e.g. "GSE12345"
  stage:          string;           // e.g. "ETL"
  step:           string;           // e.g. "parse_metadata"
  status:         PipelineEventStatus;
  summary:        string;           // human-readable one-liner for display
  payload:        MetricPayload | ArtifactPayload | StepPayload | ErrorPayload;
}

// payload shapes by event type
interface MetricPayload {
  metric_name: string;   // e.g. "sample_count_per_disease"
  value:       number | Record<string, number>;
  unit?:       string;
}

interface ArtifactPayload {
  path: string;          // e.g. "/mnt/memory/geo-pipeline/GSE12345/volcano.png"
  type: 'csv' | 'model' | 'plot' | 'json';
}

interface ErrorPayload {
  error:             string;
  traceback_snippet: string;
}

interface StepPayload {
  [key: string]: unknown; // stage/step-specific summary stats
}

Pipeline Stages and Steps Reference
Use this to build your progress tracker UI. Steps fire in this order:
StageStep keyEmits metric?1 — Data Acquisitionresolve_accessiondownload_seriesdownload_supplementaryverify_checksums2 — ETLparse_metadata✅ sample count per disease labelparse_expression_matrix✅ matrix shape (genes × samples)quality_filter✅ genes/samples removednormalize✅ normalization method + post-normalization rangefeature_selection✅ final feature count3 — Statistical Analysisdifferential_expression✅ significant DEG countenrichment_or_correlation✅ top hitsvisualize_statistics→ artifact_ready4 — Modelingprepare_splits✅ train/test split sizestrain_model✅ hyperparameters usedevaluate_model✅ accuracy, AUC, F1 (fires per metric)save_model→ artifact_readygenerate_model_plots→ artifact_ready per file

Suggested UI Layout
Copy┌─────────────────────────────────────────────────────────┐
│  GEO Pipeline: GSE12345          ● Running              │
├────────────────────┬────────────────────────────────────┤
│  PROGRESS          │  FINDINGS                          │
│                    │                                    │
│  ✅ Stage 1        │  Sample counts (disease label)     │
│     ✅ resolve     │  ┌──────────────────────────────┐  │
│     ✅ download    │  │ Healthy:       42             │  │
│     ✅ checksums   │  │ Alzheimer's:   38             │  │
│                    │  │ MCI:           21             │  │
│  🔄 Stage 2        │  └──────────────────────────────┘  │
│     ✅ parse_meta  │                                    │
│     🔄 normalize   │  Matrix: 20,412 genes × 101 samples│
│     ○  feat_select │  Removed: 1,204 low-variance genes │
│                    │                                    │
│  ○  Stage 3        ├────────────────────────────────────┤
│  ○  Stage 4        │  ARTIFACTS                         │
│                    │  📄 processed_matrix.csv           │
│                    │  📊 volcano_plot.png               │
└────────────────────┴────────────────────────────────────┘
Dispatch Logic
typescriptCopyfunction handlePipelineEvent(event: PipelineEvent) {
  switch (event.pipeline_event) {
    case 'stage_start':
    case 'stage_complete':
    case 'stage_failed':
    case 'step_start':
    case 'step_complete':
    case 'step_failed':
      updateProgressTracker(event);
      break;

    case 'metric':
      updateFindingsPanel(event);
      break;

    case 'artifact_ready':
      updateArtifactList(event);
      break;
  }
}

Reconnection and Reliability
The SSE stream does not replay past events on reconnect. Implement consolidation:

On (re)connect, open the SSE stream.
Immediately fetch the full event history: GET /api/sessions/{session_id}/events.
Replay history first (dedupe by event id), then continue from the live stream.

typescriptCopyconst seen = new Set<string>();

async function connectWithConsolidation(sessionId: string) {
  // 1. open stream
  const stream = openStream(sessionId);

  // 2. fetch history
  const history = await fetch(`/api/sessions/${sessionId}/events`).then(r => r.json());

  // 3. replay history, then stream — dedupe by id
  for (const event of history.data) {
    if (!seen.has(event.id)) {
      seen.add(event.id);
      handleAgentEvent(event);
    }
  }

  stream.onmessage = (e) => {
    const event = JSON.parse(e.data);
    if (!seen.has(event.id)) {
      seen.add(event.id);
      handleAgentEvent(event);
    }
  };
}

Session Lifecycle
session.status_* eventUI actionsession.status_runningShow spinner / "Running" badgesession.status_idleIf pipeline is done: show "Complete". If waiting for input: prompt user.session.status_terminatedShow terminal error statesession.errorSurface error message to user
Check stop_reason on session.status_idle events to distinguish "pipeline finished" from "waiting for user input".

Security Notes

Never expose your Anthropic API key to the browser. All API calls must be proxied through your backend.
The session ID is not sensitive and can be passed to the frontend.
Artifact paths (e.g. /mnt/memory/...) are internal to the agent container. To serve artifact files to the browser, download them via the Files API on your backend and proxy them.


Quick Reference
TaskHowDetect a pipeline eventLine starts with {"pipeline_event": inside agent.message contentShow live sample countsmetric event, step: "parse_metadata"Show model performancemetric events from step: "evaluate_model"List output filesartifact_ready eventsKnow when pipeline is donesession.status_idle with stop_reason.type !== "requires_action"Handle reconnectsFetch /events history + dedupe by event id
Copy
---

A few things worth flagging to your devs:

- **The proxy requirement** is the most important architectural constraint — the API key can't touch the browser, so all stream proxying and session creation happens server-side.
- **`agent.message` content arrives incrementally** as the agent streams text. Depending on your SSE handling, you may need to buffer partial lines and only attempt JSON parsing once you see a newline.
- **Artifact serving** requires a separate step — the `/mnt/memory/` paths are container-internal, so y