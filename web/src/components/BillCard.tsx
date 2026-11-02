import type { Bill } from '../types'
import { CheckIcon, ReceiptIcon, Spinner } from './Icons'

interface BillCardProps {
  bill: Bill
  memberNames: Record<string, string>
  payState: Record<string, { loading: boolean; error: string | null }>
  onPay: (billId: string, shareId: string) => void
  formatCents: (cents: number) => string
}

export function BillCard({ bill, memberNames, payState, onPay, formatCents }: BillCardProps) {
  const paidSharesCount = bill.shares.filter((s) => s.paidAt !== null).length
  const allPaid = paidSharesCount === bill.shares.length && bill.shares.length > 0

  return (
    <div className={`bill-card ${allPaid ? 'bill-card-settled' : ''}`}>
      <div className="bill-card-header">
        <div className="bill-title">
          <span className="bill-title-icon">
            <ReceiptIcon />
          </span>
          <h3>{bill.title}</h3>
        </div>
        <div className="bill-meta">
          <span className="bill-total">{formatCents(bill.totalCents)}</span>
          <span className={`bill-progress-pill ${allPaid ? 'pill-paid' : 'pill-pending'}`}>
            {allPaid ? 'Fully Paid' : `${paidSharesCount}/${bill.shares.length} paid`}
          </span>
        </div>
      </div>

      <div className="table-responsive">
        <table className="shares-table">
          <thead>
            <tr>
              <th>Member</th>
              <th>Amount</th>
              <th>Status</th>
              <th className="action-col">Action</th>
            </tr>
          </thead>
          <tbody>
            {bill.shares.map((share) => {
              const state = payState[share.id] ?? { loading: false, error: null }
              const isPaid = share.paidAt !== null
              const memberName = memberNames[share.memberId] ?? share.memberId

              return (
                <tr key={share.id} className={isPaid ? 'row-paid' : 'row-unpaid'}>
                  <td>
                    <span className="member-name">{memberName}</span>
                  </td>
                  <td>
                    <span className="share-amount">{formatCents(share.amountCents)}</span>
                  </td>
                  <td>
                    {isPaid ? (
                      <span className="status-badge paid">
                        <CheckIcon /> Paid
                      </span>
                    ) : (
                      <span className="status-badge unpaid">Unpaid</span>
                    )}
                  </td>
                  <td className="action-col">
                    {isPaid ? (
                      <span className="paid-timestamp">
                        {share.paidAt
                          ? new Date(share.paidAt).toLocaleTimeString([], {
                              hour: '2-digit',
                              minute: '2-digit',
                            })
                          : 'Paid'}
                      </span>
                    ) : (
                      <div className="pay-action-wrapper">
                        <button
                          type="button"
                          className="btn-pay"
                          disabled={state.loading}
                          onClick={() => onPay(bill.id, share.id)}
                          aria-label={`Pay ${memberName}'s share of ${formatCents(share.amountCents)}`}
                        >
                          {state.loading ? <Spinner size={12} /> : null}
                          {state.loading ? 'Paying…' : 'Pay Share'}
                        </button>
                        {state.error ? (
                          <div className="pay-error-tooltip" role="alert">
                            {state.error}
                          </div>
                        ) : null}
                      </div>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
