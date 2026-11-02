import { Hono } from 'hono'

const app = new Hono<{ Bindings: Env }>()

app.get('/api/health', (c) => c.json({ status: 'ok' }))

// Create a new home
app.post('/api/homes', async (c) => {
  let body: { name?: unknown }
  try {
    body = await c.req.json()
  } catch {
    return c.json({ error: 'invalid JSON body' }, 422)
  }

  if (typeof body.name !== 'string' || body.name.trim() === '') {
    return c.json({ error: 'name must be a non-empty string' }, 422)
  }

  const id = crypto.randomUUID()
  const name = body.name.trim()

  await c.env.DB.prepare('INSERT INTO homes (id, name) VALUES (?, ?)').bind(id, name).run()

  return c.json({ id, name }, 201)
})

// Add a member to a home (order_index preserves insertion order for remainder splits)
app.post('/api/homes/:homeId/members', async (c) => {
  const homeId = c.req.param('homeId')

  const home = await c.env.DB.prepare('SELECT id FROM homes WHERE id = ?').bind(homeId).first()
  if (!home) {
    return c.json({ error: 'home not found' }, 404)
  }

  let body: { name?: unknown }
  try {
    body = await c.req.json()
  } catch {
    return c.json({ error: 'invalid JSON body' }, 422)
  }

  if (typeof body.name !== 'string' || body.name.trim() === '') {
    return c.json({ error: 'name must be a non-empty string' }, 422)
  }

  const name = body.name.trim()

  const countRow = await c.env.DB.prepare('SELECT COUNT(*) AS count FROM members WHERE home_id = ?')
    .bind(homeId)
    .first<{ count: number }>()
  const orderIndex = countRow?.count ?? 0

  const id = crypto.randomUUID()

  await c.env.DB.prepare('INSERT INTO members (id, home_id, name, order_index) VALUES (?, ?, ?, ?)')
    .bind(id, homeId, name, orderIndex)
    .run()

  return c.json({ id, homeId, name }, 201)
})

export default app
