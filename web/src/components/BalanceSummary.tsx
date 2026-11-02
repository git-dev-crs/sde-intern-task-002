import type { Balance } from '../types'

interface BalanceSummaryProps {
  balances: Balance[]
  formatCents: (cents: number) => string
}

function getInitials(name: string): string {
  return name
    .split(' ')
    .map((w) => w[0] ?? '')
    .join('')
    .toUpperCase()
    .slice(0, 2)
}

export function BalanceSummary({ balances, formatCents }: BalanceSummaryProps) {
  if (balances.length === 0) {
    return null
  }

  const totalOutstanding = balances.reduce((sum, b) => sum + b.outstandingCents, 0)

  return (
    <div className="balances-panel">
      <div className="balances-panel-header">
        <h2 className="balances-title">Outstanding Balances</h2>
        <span className="balances-badge">Total Unpaid: {formatCents(totalOutstanding)}</span>
      </div>

      <div className="balances-grid">
        {balances.map((b) => {
          const isSettled = b.outstandingCents === 0
          return (
            <div key={b.memberId} className={`balance-card ${isSettled ? 'balance-settled' : ''}`}>
              <div className="balance-card-avatar" aria-hidden="true">
                {getInitials(b.name)}
              </div>
              <div className="balance-info">
                <span className="balance-name">{b.name}</span>
                <span className={`balance-amount ${isSettled ? 'zero' : 'owed'}`}>
                  {formatCents(b.outstandingCents)}
                </span>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
