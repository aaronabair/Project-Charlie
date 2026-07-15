export const STATUS_FILTERS = ['All', 'Active', 'Pass', 'Fail']

const STATUS_STYLES = {
  active: 'bg-blue-50 text-blue-700',
  pass: 'bg-green-50 text-green-700',
  fail: 'bg-red-50 text-red-700',
}

// Columns beyond the default table view — reserved for a future
// "view details" expansion per row.
export const DETAIL_COLUMNS =
  'external_id, due_date, payment, file_request, address, phone, measure, equipment, quantity, total_incentive, additional_information, purchase_date, uploaded_at'

export function StatusBadge({ status }) {
  const style = STATUS_STYLES[status] ?? 'bg-gray-50 text-gray-700'
  return (
    <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ${style}`}>
      {status}
    </span>
  )
}

export function formatDate(dateStr) {
  if (!dateStr) return '—'
  return new Date(dateStr).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

export function daysOpen(inspectionDate) {
  if (!inspectionDate) return '—'
  const days = Math.floor((Date.now() - new Date(inspectionDate).getTime()) / 86400000)
  if (days < 0) return '—'
  return `${days} day${days === 1 ? '' : 's'}`
}

// <input type="date"> needs a plain YYYY-MM-DD value, not a full ISO timestamp.
export function toDateInputValue(dateStr) {
  if (!dateStr) return ''
  return new Date(dateStr).toISOString().slice(0, 10)
}
