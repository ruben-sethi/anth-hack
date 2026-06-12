import dotenv from 'dotenv'
dotenv.config({ override: true })
import express from 'express'
import cors from 'cors'

const app = express()
app.use(cors())
app.use(express.json())

const PORT = process.env.PORT ?? 3001
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY ?? ''
const AGENT_ID = process.env.AGENT_ID ?? ''
const ENVIRONMENT_ID = process.env.ENVIRONMENT_ID ?? ''
const MEMORY_STORE_ID = process.env.MEMORY_STORE_ID ?? ''
const ANTHROPIC_BASE = 'https://api.anthropic.com/v1'

const BASE_HEADERS = {
  'x-api-key': ANTHROPIC_API_KEY,
  'anthropic-version': '2023-06-01',
  'anthropic-beta': 'managed-agents-2026-04-01',
  'Content-Type': 'application/json',
}

// POST /api/sessions — create session + send initial message
app.post('/api/sessions', async (req, res) => {
  const { geoId, geoIds, paperCriteria } = req.body as {
    geoId?: string
    geoIds?: string[]
    paperCriteria?: string
  }
  const isCombined = Array.isArray(geoIds) && geoIds.length > 1
  if (!geoId && !isCombined) {
    res.status(400).json({ error: 'geoId or geoIds is required' })
    return
  }

  const sessionTitle = isCombined
    ? `Combined: ${geoIds!.join(' + ')}`
    : `${geoId} pipeline run`

  const userText = isCombined
    ? `Perform cross-dataset combined analysis for GEO datasets: ${geoIds!.join(', ')}. ` +
      `These datasets have been individually processed and their artifacts are available in ` +
      `the memory store under /mnt/memory/geo-pipeline/. ` +
      `Align the processed feature matrices, perform comparative statistical analysis across ` +
      `all datasets, and build a combined predictive model.`
    : paperCriteria
      ? `Run pipeline for ${geoId}. Paper criteria: ${paperCriteria}`
      : `Run pipeline for ${geoId}.`

  try {
    // 1. Create managed session
    const sessionBody: Record<string, unknown> = {
      agent: AGENT_ID,
      environment_id: ENVIRONMENT_ID,
      title: sessionTitle,
    }
    if (MEMORY_STORE_ID) {
      sessionBody.resources = [
        {
          type: 'memory_store',
          memory_store_id: MEMORY_STORE_ID,
          access: 'read_write',
          instructions:
            'GEO pipeline artifacts and reports, organized by GEO ID under /mnt/memory/geo-pipeline/',
        },
      ]
    }

    const sessionRes = await fetch(`${ANTHROPIC_BASE}/sessions`, {
      method: 'POST',
      headers: BASE_HEADERS,
      body: JSON.stringify(sessionBody),
    })

    if (!sessionRes.ok) {
      const body = await sessionRes.text()
      res.status(sessionRes.status).json({ error: body })
      return
    }

    const session = (await sessionRes.json()) as { id: string }

    // 2. Send initial user message to kick off the pipeline
    const eventsRes = await fetch(`${ANTHROPIC_BASE}/sessions/${session.id}/events`, {
      method: 'POST',
      headers: BASE_HEADERS,
      body: JSON.stringify({
        events: [
          {
            type: 'user.message',
            content: [{ type: 'text', text: userText }],
          },
        ],
      }),
    })

    if (!eventsRes.ok) {
      const body = await eventsRes.text()
      res.status(eventsRes.status).json({ error: body })
      return
    }

    res.json({ sessionId: session.id })
  } catch (err) {
    console.error('Error creating session:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// GET /api/sessions — list sessions
app.get('/api/sessions', async (req, res) => {
  try {
    const upstream = await fetch(`${ANTHROPIC_BASE}/sessions?limit=50`, { headers: BASE_HEADERS })
    const data = await upstream.json()
    res.status(upstream.status).json(data)
  } catch (err) {
    console.error('Error listing sessions:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// GET /api/sessions/:id/events — fetch full event history
app.get('/api/sessions/:id/events', async (req, res) => {
  try {
    const upstream = await fetch(`${ANTHROPIC_BASE}/sessions/${req.params.id}/events`, {
      headers: BASE_HEADERS,
    })
    const data = await upstream.json()
    res.status(upstream.status).json(data)
  } catch (err) {
    console.error('Error fetching events:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// GET /api/sessions/:id/stream — poll /events and emit as SSE
app.get('/api/sessions/:id/stream', async (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')
  res.flushHeaders()

  const sessionId = req.params.id
  const seen = new Set<string>()
  let done = false

  const emit = (evt: unknown) => {
    if (!res.writableEnded) res.write(`data: ${JSON.stringify(evt)}\n\n`)
  }

  const poll = async () => {
    try {
      const r = await fetch(`${ANTHROPIC_BASE}/sessions/${sessionId}/events`, { headers: BASE_HEADERS })
      if (!r.ok) return
      const body = (await r.json()) as { data?: Array<Record<string, unknown>> }
      for (const evt of body.data ?? []) {
        const id = evt.id as string
        if (id && seen.has(id)) continue
        if (id) seen.add(id)
        emit(evt)
        const type = evt.type as string
        if (type === 'session.status_terminated' || type === 'session.error') {
          done = true
        }
        if (type === 'session.status_idle') {
          const stop = evt.stop_reason as Record<string, unknown> | undefined
          if (stop?.type !== 'requires_action') done = true
        }
      }
    } catch (err) {
      console.error('Poll error:', err)
    }
  }

  // Poll immediately, then every 2 s
  await poll()

  const timer = setInterval(async () => {
    if (done || res.writableEnded) {
      clearInterval(timer)
      if (!res.writableEnded) res.end()
      return
    }
    await poll()
    if (done && !res.writableEnded) {
      clearInterval(timer)
      res.end()
    }
  }, 2000)

  // Max runtime: 30 min
  const timeout = setTimeout(() => {
    clearInterval(timer)
    if (!res.writableEnded) res.end()
  }, 30 * 60 * 1000)

  req.on('close', () => {
    clearInterval(timer)
    clearTimeout(timeout)
    done = true
  })
})

const server = app.listen(PORT, () => {
  console.log(`API proxy listening on http://localhost:${PORT}`)
})

const shutdown = () => {
  server.close(() => process.exit(0))
  setTimeout(() => process.exit(0), 1000).unref()
}
process.on('SIGTERM', shutdown)
process.on('SIGINT', shutdown)
