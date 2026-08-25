import { useCallback, useEffect, useMemo, useState } from 'react'
import jsPDF from 'jspdf'
import { supabase } from './supabaseClient'
import { useAuth } from './AuthContext'
import { formatDate, formatInspectionType } from './inspectionFormat'
import { formatTimeAgo } from './timeFormat'

const STATUS_FILTERS = ['Pending', 'Approved', 'Rejected', 'All']

const STATUS_STYLES = {
  pending: 'bg-amber-50 text-amber-700',
  approved: 'bg-green-50 text-green-700',
  rejected: 'bg-red-50 text-red-700',
}

function StatusPill({ status }) {
  const style = STATUS_STYLES[status] ?? 'bg-gray-50 text-gray-700'
  return (
    <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ${style}`}>
      {status}
    </span>
  )
}

function ApproveModal({
  target,
  name,
  setName,
  response,
  setResponse,
  error,
  submitting,
  onCancel,
  onConfirm,
}) {
  if (!target) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="w-full max-w-sm rounded-lg bg-white p-6 shadow-lg">
        <h2 className="text-lg font-semibold text-gray-900">Approve exception</h2>
        <p className="mt-1 text-sm text-gray-500">
          Type your name to confirm. This will generate a signed PDF and mark the request approved.
        </p>

        <label className="mt-4 block text-sm font-medium text-gray-700" htmlFor="approve-response">
          Approval Response
        </label>
        <textarea
          id="approve-response"
          rows={3}
          value={response}
          onChange={(e) => setResponse(e.target.value)}
          placeholder="Explain the basis for this approval"
          className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-gray-500 focus:outline-none focus:ring-1 focus:ring-gray-500"
        />

        <label className="mt-4 block text-sm font-medium text-gray-700" htmlFor="approve-name">
          Your name
        </label>
        <input
          id="approve-name"
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Full name"
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
            disabled={submitting || !name.trim() || !response.trim()}
            className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            {submitting ? 'Approving...' : 'Approve'}
          </button>
        </div>
      </div>
    </div>
  )
}

function RejectModal({ target, note, setNote, error, submitting, onCancel, onConfirm }) {
  if (!target) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="w-full max-w-sm rounded-lg bg-white p-6 shadow-lg">
        <h2 className="text-lg font-semibold text-gray-900">Reject exception</h2>
        <p className="mt-1 text-sm text-gray-500">An explanation is optional but helpful for the requester.</p>

        <label className="mt-4 block text-sm font-medium text-gray-700" htmlFor="reject-note">
          Rejection note
        </label>
        <textarea
          id="reject-note"
          rows={3}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Optional"
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
            disabled={submitting}
            className="rounded-md border border-red-300 bg-white px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
          >
            {submitting ? 'Rejecting...' : 'Reject'}
          </button>
        </div>
      </div>
    </div>
  )
}

function RequestRow({ request, inspection, requesterName, reviewerName, onApprove, onReject }) {
  return (
    <div className="flex flex-col gap-3 border-b border-gray-100 px-5 py-4 last:border-b-0 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-sm font-medium text-gray-900">{inspection?.invoice ?? 'Unknown invoice'}</p>
          <StatusPill status={request.status} />
        </div>
        <p className="mt-1 text-sm text-gray-500">
          {inspection?.customer || '—'} · {formatInspectionType(inspection?.inspection_type)}
        </p>
        <p className="mt-2 text-sm text-gray-700">{request.reason}</p>
        <p className="mt-2 text-xs text-gray-400">
          Requested by {requesterName} · {formatTimeAgo(request.requested_at)}
        </p>
        {request.status === 'rejected' && request.rejection_note && (
          <p className="mt-1 text-xs text-red-600">Note: {request.rejection_note}</p>
        )}
        {request.status === 'approved' && request.approval_response && (
          <p className="mt-1 text-xs text-gray-500">Response: {request.approval_response}</p>
        )}
        {request.status !== 'pending' && (
          <p className="mt-1 text-xs text-gray-400">
            Reviewed by {reviewerName} · {formatDate(request.reviewed_at)}
          </p>
        )}
        {request.status === 'approved' && request.pdf_url && (
          <a
            href={request.pdf_url}
            target="_blank"
            rel="noreferrer"
            className="mt-2 inline-block text-xs font-medium text-gray-700 underline hover:text-gray-900"
          >
            View signed PDF
          </a>
        )}
      </div>

      {request.status === 'pending' && (
        <div className="flex shrink-0 gap-2">
          <button
            type="button"
            onClick={() => onApprove(request)}
            className="rounded-md bg-gray-900 px-3 py-1.5 text-sm font-medium text-white"
          >
            Approve
          </button>
          <button
            type="button"
            onClick={() => onReject(request)}
            className="rounded-md border border-red-300 bg-white px-3 py-1.5 text-sm font-medium text-red-600 hover:bg-red-50"
          >
            Reject
          </button>
        </div>
      )}
    </div>
  )
}

export default function Exceptions() {
  const { session, profile } = useAuth()
  const isAdmin = profile?.role === 'admin'
  const adminId = session?.user?.id

  const [requests, setRequests] = useState([])
  const [inspections, setInspections] = useState([])
  const [profiles, setProfiles] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [statusFilter, setStatusFilter] = useState('Pending')

  const [approveTarget, setApproveTarget] = useState(null)
  const [approveName, setApproveName] = useState('')
  const [approveResponse, setApproveResponse] = useState('')
  const [approveError, setApproveError] = useState(null)
  const [approveSubmitting, setApproveSubmitting] = useState(false)

  const [rejectTarget, setRejectTarget] = useState(null)
  const [rejectNote, setRejectNote] = useState('')
  const [rejectError, setRejectError] = useState(null)
  const [rejectSubmitting, setRejectSubmitting] = useState(false)

  const loadRequests = useCallback(async () => {
    const { data, error } = await supabase
      .from('exception_requests')
      .select(
        'id, inspection_id, requested_by, reason, requested_at, status, reviewed_by, reviewed_at, admin_signature_name, approval_response, rejection_note, pdf_url'
      )
      .order('requested_at', { ascending: false })

    if (error) {
      setError(error.message)
      return
    }
    setRequests(data ?? [])
  }, [])

  useEffect(() => {
    if (!isAdmin) return

    setLoading(true)
    Promise.all([
      loadRequests(),
      supabase
        .from('inspections')
        .select('id, invoice, customer, distributor, inspection_type, inspection_date, assigned_to')
        .then(({ data, error }) => {
          if (error) {
            setError(error.message)
            return
          }
          setInspections(data ?? [])
        }),
      supabase
        .from('profiles')
        .select('id, full_name')
        .then(({ data, error }) => {
          if (error) {
            setError(error.message)
            return
          }
          setProfiles(data ?? [])
        }),
    ]).finally(() => setLoading(false))
  }, [isAdmin, loadRequests])

  const inspectionsById = useMemo(() => {
    const map = {}
    for (const i of inspections) map[i.id] = i
    return map
  }, [inspections])

  const profilesById = useMemo(() => {
    const map = {}
    for (const p of profiles) map[p.id] = p.full_name
    return map
  }, [profiles])

  const filtered = useMemo(() => {
    if (statusFilter === 'All') return requests
    return requests.filter((r) => r.status === statusFilter.toLowerCase())
  }, [requests, statusFilter])

  function openApproveModal(request) {
    setApproveTarget(request)
    setApproveName('')
    setApproveResponse('')
    setApproveError(null)
  }

  function closeApproveModal() {
    setApproveTarget(null)
    setApproveName('')
    setApproveResponse('')
    setApproveError(null)
  }

  async function handleApproveConfirm() {
    const name = approveName.trim()
    const response = approveResponse.trim()
    if (!name) {
      setApproveError('Please type your name to confirm.')
      return
    }
    if (!response) {
      setApproveError('An approval response is required.')
      return
    }

    setApproveSubmitting(true)
    setApproveError(null)

    const inspection = inspectionsById[approveTarget.inspection_id]
    const inspectorName = inspection ? profilesById[inspection.assigned_to] ?? 'Unassigned' : 'Unknown'

    const doc = new jsPDF()
    doc.setFontSize(14)
    doc.text('Exception Approval', 14, 16)

    doc.setFontSize(10)
    doc.setTextColor(100)
    const details = [
      `Invoice: ${inspection?.invoice ?? '—'}`,
      `Customer: ${inspection?.customer ?? '—'}`,
      `Distributor: ${inspection?.distributor ?? '—'}`,
      `Inspection Type: ${formatInspectionType(inspection?.inspection_type)}`,
      `Inspector: ${inspectorName}`,
      `Inspection Date: ${formatDate(inspection?.inspection_date)}`,
    ]

    let y = 28
    for (const line of details) {
      doc.text(line, 14, y)
      y += 6
    }

    y += 4
    doc.text('Request Reason:', 14, y)
    y += 6
    const reasonLines = doc.splitTextToSize(approveTarget.reason ?? '', 180)
    doc.text(reasonLines, 14, y)
    y += reasonLines.length * 6 + 8

    doc.text('Approval Response:', 14, y)
    y += 6
    const responseLines = doc.splitTextToSize(response, 180)
    doc.text(responseLines, 14, y)
    y += responseLines.length * 6 + 8

    doc.text(`Approved by: ${name}`, 14, y)
    y += 6
    doc.text(`Approved at: ${new Date().toLocaleString()}`, 14, y)

    const pdfBlob = doc.output('blob')
    const path = `${approveTarget.inspection_id}/${approveTarget.id}.pdf`

    const { error: uploadError } = await supabase.storage
      .from('exception-forms')
      .upload(path, pdfBlob, { contentType: 'application/pdf', upsert: true })

    if (uploadError) {
      setApproveSubmitting(false)
      setApproveError(uploadError.message)
      return
    }

    const {
      data: { publicUrl },
    } = supabase.storage.from('exception-forms').getPublicUrl(path)

    const { error: updateError } = await supabase
      .from('exception_requests')
      .update({
        status: 'approved',
        reviewed_by: adminId,
        reviewed_at: new Date().toISOString(),
        admin_signature_name: name,
        approval_response: response,
        pdf_url: publicUrl,
      })
      .eq('id', approveTarget.id)

    setApproveSubmitting(false)

    if (updateError) {
      setApproveError(updateError.message)
      return
    }

    // Don't wait on the realtime channel to reflect our own update — refetch now.
    loadRequests()
    closeApproveModal()
  }

  function openRejectModal(request) {
    setRejectTarget(request)
    setRejectNote('')
    setRejectError(null)
  }

  function closeRejectModal() {
    setRejectTarget(null)
    setRejectNote('')
    setRejectError(null)
  }

  async function handleRejectConfirm() {
    setRejectSubmitting(true)
    setRejectError(null)

    const { error } = await supabase
      .from('exception_requests')
      .update({
        status: 'rejected',
        reviewed_by: adminId,
        reviewed_at: new Date().toISOString(),
        rejection_note: rejectNote.trim() || null,
      })
      .eq('id', rejectTarget.id)

    setRejectSubmitting(false)

    if (error) {
      setRejectError(error.message)
      return
    }

    // Don't wait on the realtime channel to reflect our own update — refetch now.
    loadRequests()
    closeRejectModal()
  }

  if (!isAdmin) {
    return (
      <div className="p-8">
        <h1 className="text-2xl font-semibold text-gray-900">Exceptions</h1>
        <p className="mt-2 text-sm text-gray-500">
          You don't have access to this page. Exceptions are limited to Admins.
        </p>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="p-8">
        <p className="text-sm text-gray-500">Loading exception requests...</p>
      </div>
    )
  }

  return (
    <div className="p-8">
      <h1 className="text-2xl font-semibold text-gray-900">Exceptions</h1>
      <p className="mt-1 text-sm text-gray-500">Review and act on exception requests submitted for inspections.</p>

      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}

      <div className="mt-6 flex gap-2">
        {STATUS_FILTERS.map((option) => (
          <button
            key={option}
            type="button"
            onClick={() => setStatusFilter(option)}
            className={`rounded-md px-3 py-1.5 text-sm font-medium ${
              statusFilter === option
                ? 'bg-gray-900 text-white'
                : 'border border-gray-300 bg-white text-gray-600'
            }`}
          >
            {option}
          </button>
        ))}
      </div>

      <div className="mt-6 overflow-hidden rounded-lg border border-gray-200 bg-white">
        {filtered.length === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-gray-500">No exception requests here</p>
        ) : (
          filtered.map((request) => (
            <RequestRow
              key={request.id}
              request={request}
              inspection={inspectionsById[request.inspection_id]}
              requesterName={profilesById[request.requested_by] ?? 'Unknown'}
              reviewerName={profilesById[request.reviewed_by] ?? '—'}
              onApprove={openApproveModal}
              onReject={openRejectModal}
            />
          ))
        )}
      </div>

      <ApproveModal
        target={approveTarget}
        name={approveName}
        setName={setApproveName}
        response={approveResponse}
        setResponse={setApproveResponse}
        error={approveError}
        submitting={approveSubmitting}
        onCancel={closeApproveModal}
        onConfirm={handleApproveConfirm}
      />

      <RejectModal
        target={rejectTarget}
        note={rejectNote}
        setNote={setRejectNote}
        error={rejectError}
        submitting={rejectSubmitting}
        onCancel={closeRejectModal}
        onConfirm={handleRejectConfirm}
      />
    </div>
  )
}
