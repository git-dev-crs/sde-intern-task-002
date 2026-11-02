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

// Create a bill and split it evenly among members; earliest members receive remainder cents
app.post('/api/homes/:homeId/bills', async (c) => {
  const homeId = c.req.param('homeId')

  const home = await c.env.DB.prepare('SELECT id FROM homes WHERE id = ?').bind(homeId).first()
  if (!home) {
    return c.json({ error: 'home not found' }, 404)
  }

  let body: { title?: unknown; totalCents?: unknown }
  try {
    body = await c.req.json()
  } catch {
    return c.json({ error: 'invalid JSON body' }, 422)
  }

  const { totalCents } = body
  if (typeof totalCents !== 'number' || !Number.isInteger(totalCents) || totalCents <= 0) {
    return c.json({ error: 'totalCents must be a positive integer (whole cents)' }, 422)
  }

  const membersResult = await c.env.DB.prepare(
    'SELECT id FROM members WHERE home_id = ? ORDER BY order_index ASC',
  )
    .bind(homeId)
    .all<{ id: string }>()

  if (membersResult.results.length === 0) {
    return c.json({ error: 'the home has no members; add members before creating a bill' }, 422)
  }

  const title =
    typeof body.title === 'string' && body.title.trim() !== '' ? body.title.trim() : 'Untitled'
  const billId = crypto.randomUUID()

  await c.env.DB.prepare('INSERT INTO bills (id, home_id, title, total_cents) VALUES (?, ?, ?, ?)')
    .bind(billId, homeId, title, totalCents)
    .run()

  const memberIds = membersResult.results.map((r) => r.id)
  const count = memberIds.length
  const base = Math.floor(totalCents / count)
  const remainder = totalCents % count

  const shares: Array<{
    id: string
    memberId: string
    amountCents: number
    paidAt: null
  }> = []

  for (let i = 0; i < memberIds.length; i++) {
    const memberId = memberIds[i] as string
    const amountCents = i < remainder ? base + 1 : base
    const shareId = crypto.randomUUID()

    await c.env.DB.prepare(
      'INSERT INTO shares (id, bill_id, member_id, amount_cents) VALUES (?, ?, ?, ?)',
    )
      .bind(shareId, billId, memberId, amountCents)
      .run()

    shares.push({ id: shareId, memberId, amountCents, paidAt: null })
  }

  return c.json({ id: billId, homeId, title, totalCents, shares }, 201)
})

// Pay a share with Idempotency-Key support and atomic concurrency protection
app.post('/api/bills/:billId/shares/:shareId/pay', async (c) => {
  const billId = c.req.param('billId')
  const shareId = c.req.param('shareId')
  const idempotencyKey = c.req.header('Idempotency-Key')

  if (!idempotencyKey || idempotencyKey.trim() === '') {
    return c.json({ error: 'Idempotency-Key header is required' }, 400)
  }

  const bill = await c.env.DB.prepare('SELECT id FROM bills WHERE id = ?').bind(billId).first()
  if (!bill) {
    return c.json({ error: 'bill not found' }, 404)
  }

  type ShareRow = {
    id: string
    member_id: string
    amount_cents: number
    paid_at: string | null
    idempotency_key: string | null
  }

  const share = await c.env.DB.prepare(
    'SELECT id, member_id, amount_cents, paid_at, idempotency_key FROM shares WHERE id = ? AND bill_id = ?',
  )
    .bind(shareId, billId)
    .first<ShareRow>()

  if (!share) {
    return c.json({ error: 'share not found' }, 404)
  }

  if (share.paid_at !== null) {
    if (share.idempotency_key === idempotencyKey) {
      return c.json({
        id: share.id,
        memberId: share.member_id,
        amountCents: share.amount_cents,
        paidAt: share.paid_at,
      })
    }
    return c.json({ error: 'share already paid with a different key' }, 409)
  }

  const paidAt = new Date().toISOString()

  // Atomic conditional update locks against concurrent requests
  const result = await c.env.DB.prepare(
    'UPDATE shares SET paid_at = ?, idempotency_key = ? WHERE id = ? AND paid_at IS NULL',
  )
    .bind(paidAt, idempotencyKey, shareId)
    .run()

  if (result.meta.changes === 1) {
    return c.json({
      id: share.id,
      memberId: share.member_id,
      amountCents: share.amount_cents,
      paidAt,
    })
  }

  // If update did not affect 1 row, resolve whether it's an idempotent duplicate or conflict
  const updated = await c.env.DB.prepare(
    'SELECT id, member_id, amount_cents, paid_at, idempotency_key FROM shares WHERE id = ?',
  )
    .bind(shareId)
    .first<ShareRow>()

  if (!updated) {
    return c.json({ error: 'share not found' }, 404)
  }

  if (updated.idempotency_key === idempotencyKey) {
    return c.json({
      id: updated.id,
      memberId: updated.member_id,
      amountCents: updated.amount_cents,
      paidAt: updated.paid_at,
    })
  }

  return c.json({ error: 'share already paid with a different key' }, 409)
})

// Calculate outstanding unpaid balances grouped per member
app.get('/api/homes/:homeId/balances', async (c) => {
  const homeId = c.req.param('homeId')

  const home = await c.env.DB.prepare('SELECT id FROM homes WHERE id = ?').bind(homeId).first()
  if (!home) {
    return c.json({ error: 'home not found' }, 404)
  }

  type BalanceRow = { memberId: string; name: string; outstandingCents: number }

  const rows = await c.env.DB.prepare(
    `SELECT
         m.id   AS memberId,
         m.name AS name,
         COALESCE(
           SUM(CASE WHEN s.paid_at IS NULL THEN s.amount_cents ELSE 0 END),
           0
         ) AS outstandingCents
       FROM members m
       LEFT JOIN shares s  ON s.member_id = m.id
       LEFT JOIN bills  b  ON b.id = s.bill_id AND b.home_id = ?
       WHERE m.home_id = ?
       GROUP BY m.id, m.name, m.order_index
       ORDER BY m.order_index ASC`,
  )
    .bind(homeId, homeId)
    .all<BalanceRow>()

  return c.json({ balances: rows.results })
})

export default app
