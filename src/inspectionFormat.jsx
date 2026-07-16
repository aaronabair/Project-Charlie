export const STATUS_FILTERS = ['All', 'Active', 'Pass', 'Fail']

const STATUS_STYLES = {
  active: 'bg-blue-50 text-blue-700',
  pass: 'bg-green-50 text-green-700',
  fail: 'bg-red-50 text-red-700',
}

// Columns beyond the default table view — reserved for a future
// "view details" expansion per row. uploaded_at is fetched here but never
// displayed; it's needed internally by computeDaysOpenRaw below.
export const DETAIL_COLUMNS =
  'payment, file_request, address, phone, measure, equipment, quantity, total_incentive, additional_information, purchase_date, uploaded_at'

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

// inspection_type is stored lowercase ('physical'/'call') to match the
// inspection_kind enum; display it capitalized.
export function formatInspectionType(value) {
  if (!value) return '—'
  return value.charAt(0).toUpperCase() + value.slice(1)
}

// An inspection is genuinely open until report_finished_at is actually set —
// a pass/fail disposition alone doesn't close it. report_uploaded_at is a
// separate downstream step and has no bearing on open/closed.
export function isInspectionOpen(row) {
  return row.status === 'active' || !row.report_finished_at
}

// Closed (report_finished_at set) but the report itself hasn't been uploaded yet.
export function isUploadRequired(row) {
  return (row.status === 'pass' || row.status === 'fail') && !!row.report_finished_at && !row.report_uploaded_at
}

// "Days open" = time in the system, not time since the physical inspection.
// Starts at upload; freezes once report_finished_at is set.
function computeDaysOpenRaw(row) {
  const start = row?.uploaded_at
  if (!start) return null

  const startMs = new Date(start).getTime()
  if (Number.isNaN(startMs)) return null

  const endMs = row.report_finished_at ? new Date(row.report_finished_at).getTime() : Date.now()
  if (Number.isNaN(endMs)) return null

  const days = (endMs - startMs) / 86400000
  return days < 0 ? null : days
}

export function daysOpenValue(row) {
  const days = computeDaysOpenRaw(row)
  return days == null ? null : Math.floor(days)
}

export function daysOpen(row) {
  const days = daysOpenValue(row)
  if (days == null) return '—'
  return `${days} day${days === 1 ? '' : 's'}`
}

// <input type="date"> needs a plain YYYY-MM-DD value, not a full ISO timestamp.
export function toDateInputValue(dateStr) {
  if (!dateStr) return ''
  return new Date(dateStr).toISOString().slice(0, 10)
}
