import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from './supabaseClient'
import { useAuth } from './AuthContext'
import { STATUS_FILTERS, DETAIL_COLUMNS, formatDate, daysOpen, isUploadRequired } from './inspectionFormat'
import { SaveStatus, EditableText, EditableDate, EditableStatus } from './EditableCells'

const FILTERS = [...STATUS_FILTERS, 'Upload Required']

const COLUMNS = [
  { key: 'invoice', label: 'Invoice' },
  { key: 'inspection_type', label: 'Inspection Type' },
  { key: 'quantity', label: 'Quantity' },
  { key: 'total_incentive', label: 'Total Incentive' },
  { key: 'inspector', label: 'Primary Inspector' },
  { key: 'inspection_date', label: 'Inspection Date' },
  { key: 'days_open', label: 'Days Open' },
  { key: 'status', label: 'Inspection Result' },
  { key: 'report_finished_at', label: 'Report Finished' },
  { key: 'notes', label: 'Inspector Notes' },
  { key: 'distributor', label: 'Distributor' },
  { key: 'customer', label: 'Customer' },
  { key: 'city', label: 'City' },
  { key: 'payment', label: 'Payment' },
  { key: 'file_request', label: 'File Request' },
  { key: 'address', label: 'Address' },
  { key: 'phone', label: 'Phone' },
  { key: 'measure', label: 'Measure' },
  { key: 'equipment', label: 'Equipment' },
  { key: 'additional_information', label: 'Additional Information' },
  { key: 'purchase_date', label: 'Purchase Date' },
  { key: 'data_year', label: 'Data Year' },
  { key: 'batch_number', label: 'Batch #' },
]

function EditableAssignee({ rowId, value, profiles, onSave }) {
  const [current, setCurrent] = useState(value ?? '')
  const [status, setStatus] = useState(null)

  return (
    <div>
      <select
        value={current}
        onChange={(e) => {
          const next = e.target.value
          setCurrent(next)
          onSave(rowId, 'assigned_to', next || null, setStatus)
        }}
        className="rounded-md border border-gray-300 px-2 py-1 text-sm focus:border-gray-500 focus:outline-none focus:ring-1 focus:ring-gray-500"
      >
        <option value="">Unassigned</option>
        {profiles.map((p) => (
          <option key={p.id} value={p.id}>
            {p.full_name}
          </option>
        ))}
      </select>
      <SaveStatus status={status} />
    </div>
  )
}

function EditableInspectionType({ rowId, value, overridden, onSave, onReset }) {
  const [current, setCurrent] = useState(value ?? '')
  const [status, setStatus] = useState(null)

  return (
    <div>
      <select
        value={current}
        onChange={(e) => {
          const next = e.target.value
          setCurrent(next)
          onSave(rowId, next, setStatus)
        }}
        className="rounded-md border border-gray-300 px-2 py-1 text-sm focus:border-gray-500 focus:outline-none focus:ring-1 focus:ring-gray-500"
      >
        <option value="physical">Physical</option>
        <option value="call">Call</option>
      </select>
      <div className="mt-1 flex items-center gap-2">
        <span className={overridden ? 'text-xs text-amber-600' : 'text-xs text-gray-400'}>
          {overridden ? 'Overridden' : 'Auto'}
        </span>
        {overridden && (
          <button
            type="button"
            onClick={() => onReset(rowId, setStatus)}
            className="text-xs text-gray-500 underline hover:text-gray-900"
          >
            Reset to auto
          </button>
        )}
      </div>
      <SaveStatus status={status} />
    </div>
  )
}

function EditableNumber({ rowId, field, value, onSave }) {
  const initial = value ?? ''
  const [text, setText] = useState(String(initial))
  const [status, setStatus] = useState(null)

  return (
    <div>
      <input
        type="number"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={() => {
          if (text === String(initial)) return
          const next = text === '' ? null : Number(text)
          onSave(rowId, field, next, setStatus)
        }}
        className="w-24 rounded-md border border-gray-300 px-2 py-1 text-sm focus:border-gray-500 focus:outline-none focus:ring-1 focus:ring-gray-500"
      />
      <SaveStatus status={status} />
    </div>
  )
}

function MarkUploadedButton({ rowId, onSave }) {
  const [status, setStatus] = useState(null)

  return (
    <div>
      <button
        type="button"
        onClick={() => onSave(rowId, setStatus)}
        disabled={status === 'saving'}
        className="rounded-md border border-gray-300 bg-white px-3 py-1 text-sm font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-50"
      >
        Mark uploaded
      </button>
      <SaveStatus status={status} />
    </div>
  )
}

function ReopenModal({ target, reason, setReason, error, submitting, onCancel, onConfirm }) {
  if (!target) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="w-full max-w-sm rounded-lg bg-white p-6 shadow-lg">
        <h2 className="text-lg font-semibold text-gray-900">Reopen inspection</h2>
        <p className="mt-1 text-sm text-gray-500">
          {target.invoice ? `Invoice ${target.invoice}` : 'This inspection'} will be set back to active.
        </p>

        <label className="mt-4 block text-sm font-medium text-gray-700" htmlFor="reopen-reason">
          Reason
        </label>
        <textarea
          id="reopen-reason"
          rows={3}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Why is this being reopened?"
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
            {submitting ? 'Reopening...' : 'Reopen'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default function DataAdmin() {
  const { profile } = useAuth()
  const canManage = profile?.role === 'admin' || profile?.role === 'data_master'

  const [inspections, setInspections] = useState([])
  const [profiles, setProfiles] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('All')

  const [reopenTarget, setReopenTarget] = useState(null)
  const [reopenReason, setReopenReason] = useState('')
  const [reopenError, setReopenError] = useState(null)
  const [reopenSubmitting, setReopenSubmitting] = useState(false)

  const loadInspections = useCallback(async () => {
    const { data, error } = await supabase
      .from('inspections')
      .select(
        `id, invoice, inspection_type, inspection_type_overridden, inspection_date, status, report_finished_at, report_uploaded_at, notes, distributor, customer, city, data_year, batch_number, assigned_to, ${DETAIL_COLUMNS}`
      )
      .order('created_at', { ascending: false })

    if (error) {
      setError(error.message)
      return
    }
    setInspections(data ?? [])
  }, [])

  useEffect(() => {
    if (!canManage) return

    setLoading(true)
    Promise.all([
      loadInspections(),
      supabase
        .from('profiles')
        .select('id, full_name')
        .order('full_name')
        .then(({ data, error }) => {
          if (error) {
            setError(error.message)
            return
          }
          setProfiles(data ?? [])
        }),
    ]).finally(() => setLoading(false))

    const channel = supabase
      .channel('data-admin-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'inspections' }, loadInspections)
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [canManage, loadInspections])

  async function handleFieldSave(rowId, field, value, setStatus) {
    setStatus('saving')
    const { error } = await supabase.from('inspections').update({ [field]: value }).eq('id', rowId)
    if (error) {
      setStatus(error.message)
      return
    }
    setStatus('saved')
    setTimeout(() => setStatus(null), 2000)
  }

  async function handleInspectionTypeSave(rowId, value, setStatus) {
    setStatus('saving')
    const { error } = await supabase
      .from('inspections')
      .update({ inspection_type: value, inspection_type_overridden: true })
      .eq('id', rowId)
    if (error) {
      setStatus(error.message)
      return
    }
    setStatus('saved')
    setTimeout(() => setStatus(null), 2000)
  }

  async function handleInspectionTypeReset(rowId, setStatus) {
    setStatus('saving')
    const { error } = await supabase
      .from('inspections')
      .update({ inspection_type_overridden: false })
      .eq('id', rowId)
    if (error) {
      setStatus(error.message)
      return
    }
    setStatus('saved')
    setTimeout(() => setStatus(null), 2000)
  }

  async function handleMarkUploaded(rowId, setStatus) {
    setStatus('saving')
    const { error } = await supabase
      .from('inspections')
      .update({ report_uploaded_at: new Date().toISOString() })
      .eq('id', rowId)
    if (error) {
      setStatus(error.message)
      return
    }
    setStatus('saved')
    setTimeout(() => setStatus(null), 2000)
  }

  function openReopenModal(row) {
    setReopenTarget({ id: row.id, invoice: row.invoice })
    setReopenReason('')
    setReopenError(null)
  }

  function closeReopenModal() {
    setReopenTarget(null)
    setReopenReason('')
    setReopenError(null)
  }

  async function handleReopenConfirm() {
    const reason = reopenReason.trim()
    if (!reason) {
      setReopenError('A reason is required.')
      return
    }

    setReopenSubmitting(true)
    setReopenError(null)

    const { error } = await supabase.rpc('reopen_inspection', {
      inspection_id: reopenTarget.id,
      reason,
    })

    setReopenSubmitting(false)

    if (error) {
      setReopenError(error.message)
      return
    }

    closeReopenModal()
  }

  const profilesById = useMemo(() => {
    const map = {}
    for (const p of profiles) map[p.id] = p.full_name
    return map
  }, [profiles])

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase()

    return inspections.filter((row) => {
      if (statusFilter === 'Upload Required') {
        if (!isUploadRequired(row)) return false
      } else if (statusFilter !== 'All' && row.status !== statusFilter.toLowerCase()) {
        return false
      }
      if (!query) return true

      const assigneeName = profilesById[row.assigned_to] ?? ''
      return (
        row.invoice?.toLowerCase().includes(query) ||
        row.inspection_type?.toLowerCase().includes(query) ||
        assigneeName.toLowerCase().includes(query)
      )
    })
  }, [inspections, search, statusFilter, profilesById])

  if (!canManage) {
    return (
      <div className="p-8">
        <h1 className="text-2xl font-semibold text-gray-900">Data Admin</h1>
        <p className="mt-2 text-sm text-gray-500">
          You don't have access to this page. Data Admin is limited to Data Masters and Admins.
        </p>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="p-8">
        <p className="text-sm text-gray-500">Loading inspections...</p>
      </div>
    )
  }

  return (
    <div className="p-8">
      <h1 className="text-2xl font-semibold text-gray-900">Data Admin</h1>
      <p className="mt-1 text-sm text-gray-500">
        All inspections. Notes, result, inspection date, report finished, primary inspector, quantity,
        and total incentive are editable. Closed inspections can be reopened below.
      </p>

      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}

      <div className="mt-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <input
          type="text"
          placeholder="Search by invoice, inspection type, or assignee..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full max-w-sm rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-gray-500 focus:outline-none focus:ring-1 focus:ring-gray-500"
        />

        <div className="flex gap-2">
          {FILTERS.map((option) => (
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
      </div>

      <div className="mt-6 overflow-hidden rounded-lg border border-gray-200 bg-white">
        {inspections.length === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-gray-500">No inspections yet</p>
        ) : filtered.length === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-gray-500">No inspections match your filters</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-gray-200 bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
                <tr>
                  {COLUMNS.map((col) => (
                    <th key={col.key} className="px-5 py-3 font-medium">
                      {col.label}
                    </th>
                  ))}
                  <th className="px-5 py-3 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filtered.map((row) => (
                  <tr key={row.id}>
                    <td className="px-5 py-3 text-gray-700">{row.invoice}</td>
                    <td className="px-5 py-3">
                      <EditableInspectionType
                        key={`${row.id}-inspection_type-${row.inspection_type}-${row.inspection_type_overridden}`}
                        rowId={row.id}
                        value={row.inspection_type}
                        overridden={row.inspection_type_overridden}
                        onSave={handleInspectionTypeSave}
                        onReset={handleInspectionTypeReset}
                      />
                    </td>
                    <td className="px-5 py-3">
                      <EditableNumber
                        key={`${row.id}-quantity-${row.quantity}`}
                        rowId={row.id}
                        field="quantity"
                        value={row.quantity}
                        onSave={handleFieldSave}
                      />
                    </td>
                    <td className="px-5 py-3">
                      <EditableNumber
                        key={`${row.id}-total_incentive-${row.total_incentive}`}
                        rowId={row.id}
                        field="total_incentive"
                        value={row.total_incentive}
                        onSave={handleFieldSave}
                      />
                    </td>
                    <td className="px-5 py-3">
                      <EditableAssignee
                        key={`${row.id}-assigned_to-${row.assigned_to}`}
                        rowId={row.id}
                        value={row.assigned_to}
                        profiles={profiles}
                        onSave={handleFieldSave}
                      />
                    </td>
                    <td className="px-5 py-3">
                      <EditableDate
                        key={`${row.id}-inspection_date-${row.inspection_date}`}
                        rowId={row.id}
                        field="inspection_date"
                        value={row.inspection_date}
                        onSave={handleFieldSave}
                      />
                    </td>
                    <td className="px-5 py-3 text-gray-700">{daysOpen(row)}</td>
                    <td className="px-5 py-3">
                      <EditableStatus
                        key={`${row.id}-status-${row.status}`}
                        rowId={row.id}
                        value={row.status}
                        onSave={handleFieldSave}
                      />
                    </td>
                    <td className="px-5 py-3">
                      <EditableDate
                        key={`${row.id}-report_finished_at-${row.report_finished_at}`}
                        rowId={row.id}
                        field="report_finished_at"
                        value={row.report_finished_at}
                        onSave={handleFieldSave}
                      />
                    </td>
                    <td className="px-5 py-3">
                      <EditableText
                        key={`${row.id}-notes-${row.notes}`}
                        rowId={row.id}
                        field="notes"
                        value={row.notes}
                        onSave={handleFieldSave}
                      />
                    </td>
                    <td className="px-5 py-3 text-gray-700">{row.distributor || '—'}</td>
                    <td className="px-5 py-3 text-gray-700">{row.customer || '—'}</td>
                    <td className="px-5 py-3 text-gray-700">{row.city || '—'}</td>
                    <td className="px-5 py-3 text-gray-700">{row.payment ?? '—'}</td>
                    <td className="px-5 py-3 text-gray-700">{row.file_request || '—'}</td>
                    <td className="px-5 py-3 text-gray-700">{row.address || '—'}</td>
                    <td className="px-5 py-3 text-gray-700">{row.phone || '—'}</td>
                    <td className="px-5 py-3 text-gray-700">{row.measure || '—'}</td>
                    <td className="px-5 py-3 text-gray-700">{row.equipment || '—'}</td>
                    <td className="px-5 py-3 text-gray-700">{row.additional_information || '—'}</td>
                    <td className="px-5 py-3 text-gray-700">{formatDate(row.purchase_date)}</td>
                    <td className="px-5 py-3 text-gray-700">{row.data_year ?? '—'}</td>
                    <td className="px-5 py-3 text-gray-700">{row.batch_number ?? '—'}</td>
                    <td className="px-5 py-3">
                      <div className="flex flex-col items-start gap-2">
                        {(row.status === 'pass' || row.status === 'fail') && (
                          <button
                            type="button"
                            onClick={() => openReopenModal(row)}
                            className="rounded-md border border-gray-300 bg-white px-3 py-1 text-sm font-medium text-gray-600 hover:bg-gray-50"
                          >
                            Reopen
                          </button>
                        )}
                        {isUploadRequired(row) && (
                          <MarkUploadedButton
                            key={`${row.id}-report_uploaded_at-${row.report_uploaded_at}`}
                            rowId={row.id}
                            onSave={handleMarkUploaded}
                          />
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <ReopenModal
        target={reopenTarget}
        reason={reopenReason}
        setReason={setReopenReason}
        error={reopenError}
        submitting={reopenSubmitting}
        onCancel={closeReopenModal}
        onConfirm={handleReopenConfirm}
      />
    </div>
  )
}
