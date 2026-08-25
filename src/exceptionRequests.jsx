import { useCallback, useEffect, useState } from 'react'
import { supabase } from './supabaseClient'

const REQUEST_COLUMNS =
  'id, inspection_id, requested_by, reason, requested_at, status, reviewed_by, reviewed_at, admin_signature_name, approval_response, rejection_note, pdf_url'

// Shared by MainView, MyWorkspace, and DataAdmin — each fetches inspections on
// its own, then layers this in as a second query and joins client-side rather
// than fighting three different inspection queries into one shape.
export function useExceptionRequests(enabled = true) {
  const [requests, setRequests] = useState([])
  const [loading, setLoading] = useState(true)

  const loadRequests = useCallback(async () => {
    if (!enabled) return
    const { data, error } = await supabase
      .from('exception_requests')
      .select(REQUEST_COLUMNS)
      .order('requested_at', { ascending: false })

    if (error) {
      console.error('Failed to load exception requests:', error)
      return
    }
    setRequests(data ?? [])
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled])

  useEffect(() => {
    if (!enabled) return

    setLoading(true)
    loadRequests().finally(() => setLoading(false))
  }, [enabled, loadRequests])

  return { requests, loading, refetch: loadRequests }
}

// inspection_id -> most recent request (by requested_at). Requests already
// come back newest-first, but this doesn't assume that ordering holds.
export function buildLatestExceptionMap(requests) {
  const map = {}
  for (const request of requests) {
    const existing = map[request.inspection_id]
    if (!existing || new Date(request.requested_at) > new Date(existing.requested_at)) {
      map[request.inspection_id] = request
    }
  }
  return map
}

export function insertExceptionRequest({ inspectionId, requestedBy, reason }) {
  return supabase.from('exception_requests').insert({
    inspection_id: inspectionId,
    requested_by: requestedBy,
    reason,
    status: 'pending',
  })
}

export function ExceptionBadge({ request }) {
  if (!request) return null

  if (request.status === 'pending') {
    return (
      <span className="inline-block rounded-full bg-amber-50 px-2.5 py-0.5 text-xs font-medium text-amber-700">
        Pending
      </span>
    )
  }

  if (request.status === 'approved') {
    return (
      <a
        href={request.pdf_url}
        target="_blank"
        rel="noreferrer"
        className="inline-block rounded-full bg-green-50 px-2.5 py-0.5 text-xs font-medium text-green-700 hover:bg-green-100"
      >
        Approved
      </a>
    )
  }

  if (request.status === 'rejected') {
    return (
      <span className="inline-block rounded-full bg-red-50 px-2.5 py-0.5 text-xs font-medium text-red-700">
        Rejected
      </span>
    )
  }

  return null
}

// Read-only cell for Main View: badge if a request exists, dash otherwise.
export function ExceptionCellReadOnly({ request }) {
  if (!request) return <span className="text-gray-700">—</span>
  return <ExceptionBadge request={request} />
}

// Editable cell for My Workspace / Data Admin: a real checkbox when there's no
// active request (none yet, or the last one was rejected), the badge otherwise.
export function ExceptionCell({ request, onCheck }) {
  const canRequest = !request || request.status === 'rejected'

  if (canRequest) {
    return (
      <input
        type="checkbox"
        checked={false}
        onChange={onCheck}
        className="h-4 w-4 rounded border-gray-300 text-gray-900 focus:ring-gray-500"
      />
    )
  }

  return <ExceptionBadge request={request} />
}

export function ExceptionRequestModal({ target, reason, setReason, error, submitting, onCancel, onConfirm }) {
  if (!target) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="w-full max-w-sm rounded-lg bg-white p-6 shadow-lg">
        <h2 className="text-lg font-semibold text-gray-900">Request exception</h2>
        <p className="mt-1 text-sm text-gray-500">
          {target.invoice ? `Invoice ${target.invoice}` : 'This inspection'} will be flagged for admin review.
        </p>

        <label className="mt-4 block text-sm font-medium text-gray-700" htmlFor="exception-reason">
          Request Reason
        </label>
        <textarea
          id="exception-reason"
          rows={3}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Why does this inspection need an exception?"
          className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-gray-500 focus:outline-none focus:ring-1 focus:ring-gray-500"
        />

        {error && <p className="mt-2 text-sm text-red-600">{error}</p>}

        <div className="mt-4 flex justify-end gap-3">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-600"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={submitting || !reason.trim()}
            className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            {submitting ? 'Submitting...' : 'Submit request'}
          </button>
        </div>
      </div>
    </div>
  )
}

// Nav badge count for Admins — mirrors the notification bell's unread count.
export function usePendingExceptionCount(enabled) {
  const [count, setCount] = useState(0)

  const loadCount = useCallback(async () => {
    if (!enabled) return
    const { count: pendingCount, error } = await supabase
      .from('exception_requests')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'pending')

    if (error) {
      console.error('Failed to load pending exception count:', error)
      return
    }
    setCount(pendingCount ?? 0)
  }, [enabled])

  useEffect(() => {
    if (!enabled) return
    loadCount()
  }, [enabled, loadCount])

  return count
}
