import { createFileRoute } from '@tanstack/react-router'
import { useCallback, useRef, useState } from 'react'
import { BalanceSummary } from '../components/BalanceSummary'
import { BillCard } from '../components/BillCard'
import { AlertIcon, HomeIcon, Spinner } from '../components/Icons'
import type { ApiResponse, Balance, Bill, Member } from '../types'

export const Route = createFileRoute('/')({
  component: HomePage,
})

function formatCents(cents: number): string {
  const dollars = Math.floor(Math.abs(cents) / 100)
  const c = Math.abs(cents) % 100
  return `$${dollars}.${String(c).padStart(2, '0')}`
}

async function apiRequest<T>(url: string, options?: RequestInit): Promise<ApiResponse<T>> {
  try {
    const res = await fetch(url, options)
    const json = await res.json().catch(() => null)

    if (!res.ok) {
      const errorMsg =
        json && typeof json.error === 'string'
          ? json.error
          : `HTTP error ${res.status}: ${res.statusText}`
      return { ok: false, status: res.status, data: null, error: errorMsg }
    }

    return { ok: true, status: res.status, data: json as T, error: null }
  } catch (err) {
    return {
      ok: false,
      status: 0,
      data: null,
      error: err instanceof Error ? err.message : 'Network error occurred',
    }
  }
}

export function HomePage() {
  const [homeIdInput, setHomeIdInput] = useState('')
  const [activeHomeId, setActiveHomeId] = useState<string | null>(null)
  const [homeName, setHomeName] = useState<string | null>(null)
  const [bills, setBills] = useState<Bill[]>([])
  const [balances, setBalances] = useState<Balance[]>([])
  const [memberNames, setMemberNames] = useState<Record<string, string>>({})

  const [loadingHome, setLoadingHome] = useState(false)
  const [topError, setTopError] = useState<string | null>(null)
  const [payState, setPayState] = useState<
    Record<string, { loading: boolean; error: string | null }>
  >({})

  const idempotencyKeysRef = useRef<Map<string, string>>(new Map())

  const loadHome = useCallback(async (homeId: string) => {
    if (!homeId.trim()) return

    setLoadingHome(true)
    setTopError(null)

    const balRes = await apiRequest<{ balances: Balance[] }>(`/api/homes/${homeId}/balances`)
    if (!balRes.ok) {
      setTopError(`Failed to load balances: ${balRes.error}`)
      setLoadingHome(false)
      return
    }

    const nameMap: Record<string, string> = {}
    for (const b of balRes.data.balances) {
      nameMap[b.memberId] = b.name
    }

    setActiveHomeId(homeId)
    setBalances(balRes.data.balances)
    setMemberNames(nameMap)
    setLoadingHome(false)
  }, [])

  const handlePay = useCallback(
    async (billId: string, shareId: string) => {
      setPayState((prev) => ({
        ...prev,
        [shareId]: { loading: true, error: null },
      }))

      let key = idempotencyKeysRef.current.get(shareId)
      if (!key) {
        key = crypto.randomUUID()
        idempotencyKeysRef.current.set(shareId, key)
      }

      const res = await apiRequest<{
        id: string
        memberId: string
        amountCents: number
        paidAt: string
      }>(`/api/bills/${billId}/shares/${shareId}/pay`, {
        method: 'POST',
        headers: {
          'Idempotency-Key': key,
          'Content-Type': 'application/json',
        },
      })

      if (!res.ok) {
        setPayState((prev) => ({
          ...prev,
          [shareId]: { loading: false, error: res.error },
        }))
        return
      }

      setBills((prevBills) =>
        prevBills.map((b) =>
          b.id !== billId
            ? b
            : {
                ...b,
                shares: b.shares.map((s) =>
                  s.id !== shareId ? s : { ...s, paidAt: res.data.paidAt },
                ),
              },
        ),
      )

      setPayState((prev) => ({
        ...prev,
        [shareId]: { loading: false, error: null },
      }))

      if (activeHomeId) {
        const balRes = await apiRequest<{ balances: Balance[] }>(
          `/api/homes/${activeHomeId}/balances`,
        )
        if (balRes.ok) {
          setBalances(balRes.data.balances)
        }
      }
    },
    [activeHomeId],
  )

  const handleCreateDemo = async () => {
    setLoadingHome(true)
    setTopError(null)

    const homeRes = await apiRequest<{ id: string; name: string }>('/api/homes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Shared Apartment 4B' }),
    })

    if (!homeRes.ok) {
      setTopError(`Could not create home: ${homeRes.error}`)
      setLoadingHome(false)
      return
    }

    const home = homeRes.data
    setHomeName(home.name)
    setHomeIdInput(home.id)

    const membersToAdd = ['Alice Chen', 'Bob Miller', 'Charlie Davis']
    const addedMembers: Member[] = []
    const nameMap: Record<string, string> = {}

    for (const name of membersToAdd) {
      const memRes = await apiRequest<Member>(`/api/homes/${home.id}/members`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      })
      if (memRes.ok) {
        addedMembers.push(memRes.data)
        nameMap[memRes.data.id] = name
      }
    }

    const createdBills: Bill[] = []
    const billPresets = [
      { title: 'Gigabit Fiber Internet', totalCents: 8500 },
      { title: 'Weekly Groceries', totalCents: 14750 },
      { title: 'Cleaning Supplies', totalCents: 2199 },
    ]

    for (const b of billPresets) {
      const billRes = await apiRequest<Bill>(`/api/homes/${home.id}/bills`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(b),
      })
      if (billRes.ok) {
        createdBills.push(billRes.data)
      }
    }

    const balRes = await apiRequest<{ balances: Balance[] }>(`/api/homes/${home.id}/balances`)

    setActiveHomeId(home.id)
    setBills(createdBills)
    setMemberNames(nameMap)
    if (balRes.ok) {
      setBalances(balRes.data.balances)
    }
    setLoadingHome(false)
  }

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="app-logo">
          <HomeIcon />
        </div>
        <h1 className="app-title">Shared Bill Splitter</h1>
      </header>

      <main className="app-content">
        <div className="home-bar">
          <div className="home-search">
            <input
              type="text"
              className="input-home-id"
              placeholder="Enter Home ID (UUID)…"
              value={homeIdInput}
              onChange={(e) => setHomeIdInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') loadHome(homeIdInput)
              }}
            />
            <button
              type="button"
              className="btn btn-primary"
              disabled={loadingHome || !homeIdInput.trim()}
              onClick={() => loadHome(homeIdInput)}
            >
              {loadingHome ? <Spinner size={13} /> : null}
              {loadingHome ? 'Loading…' : 'Load Home'}
            </button>
          </div>

          <button
            type="button"
            className="btn btn-secondary"
            disabled={loadingHome}
            onClick={handleCreateDemo}
          >
            Create Sample Home
          </button>
        </div>

        {topError ? (
          <div className="alert-banner error" role="alert">
            <AlertIcon />
            <span>{topError}</span>
            <button
              type="button"
              className="btn-dismiss"
              onClick={() => setTopError(null)}
              aria-label="Dismiss error"
            >
              ×
            </button>
          </div>
        ) : null}

        {!activeHomeId ? (
          <div className="empty-state-card">
            <div className="empty-icon-wrapper">
              <HomeIcon />
            </div>
            <h2>No Home Loaded</h2>
            <p>
              Enter an existing Home ID above or click <strong>Create Sample Home</strong> to
              initialize a shared home with members and bills.
            </p>
          </div>
        ) : (
          <div className="dashboard-content">
            <div className="dashboard-meta">
              <span className="home-name-tag">{homeName ?? 'Active Home'}</span>
              <span className="home-id-code">{activeHomeId}</span>
            </div>

            <BalanceSummary balances={balances} formatCents={formatCents} />

            <div className="bills-section">
              <div className="bills-header">
                <h2>Bills & Shares</h2>
                <span className="bills-count">{bills.length} bills</span>
              </div>

              {bills.length === 0 ? (
                <div className="empty-bills-note">
                  <p>No bills found for this home.</p>
                </div>
              ) : (
                <div className="bills-stack">
                  {bills.map((bill) => (
                    <BillCard
                      key={bill.id}
                      bill={bill}
                      memberNames={memberNames}
                      payState={payState}
                      onPay={handlePay}
                      formatCents={formatCents}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  )
}
