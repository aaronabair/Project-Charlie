import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from './supabaseClient'
import { useAuth } from './AuthContext'
import {
  STATUS_FILTERS,
  DETAIL_COLUMNS,
  COMPLETED_ROW_BG,
  formatInspectionType,
  formatDate,
  daysOpen,
  daysOpenValue,
  isInspectionOpen,
} from './inspectionFormat'
import { EditableText, EditableDate, EditableStatus, EditableCallStage, EditableCheckbox } from './EditableCells'
import {
  useExceptionRequests,
  buildLatestExceptionMap,
  insertExceptionRequest,
  ExceptionCell,
  ExceptionRequestModal,
} from './exceptionRequests'
import { useStickyScrollbar, StickyScrollbar } from './StickyScrollbar'

// "Active" preserves the existing reminder behavior: a pass/fail row still
// stays visible here until its report is actually finished. "Pass"/"Fail"
// only match genuinely finished rows — otherwise those tabs would show nothing,
// since a completed row is still "Active" until report_finished_at is set.
function matchesStatusFilter(row, filter) {
  if (filter === 'All') return true
  if (filter === 'Active') return isInspectionOpen(row)
  if (filter === 'Pass') return row.status === 'pass' && !isInspectionOpen(row)
  if (filter === 'Fail') return row.status === 'fail' && !isInspectionOpen(row)
  return true
}

const COLUMNS = [
  { key: 'invoice', label: 'Invoice', sortable: true },
  { key: 'file_request', label: 'File Request', sortable: false },
  { key: 'exception', label: 'Exception', sortable: false },
  { key: 'inspection_type', label: 'Inspection Type', sortable: true },
  { key: 'call_stage', label: 'Pre/Post', sortable: false },
  { key: 'inspector', label: 'Primary Inspector', sortable: false },
  { key: 'inspection_date', label: 'Inspection Date', sortable: true },
  { key: 'days_open', label: 'Days Open', sortable: true },
  { key: 'status', label: 'Inspection Result', sortable: true },
  { key: 'report_finished_at', label: 'Report Finished', sortable: true },
  { key: 'notes', label: 'Inspector Notes', sortable: false },
  { key: 'distributor', label: 'Distributor', sortable: true },
  { key: 'customer', label: 'Customer', sortable: true },
  { key: 'phone', label: 'Phone', sortable: false },
  { key: 'measure', label: 'Measure', sortable: false },
  { key: 'equipment', label: 'Equipment', sortable: false },
  { key: 'quantity', label: 'Quantity', sortable: false },
  { key: 'total_incentive', label: 'Total Incentive', sortable: false },
  { key: 'additional_information', label: 'Additional Information', sortable: false },
  { key: 'purchase_date', label: 'Purchase Date', sortable: false },
]

export default function MyWorkspace() {
  const { session, profile } = useAuth()
  const userId = session?.user?.id

  const [inspections, setInspections] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('Active')
  const [sortColumn, setSortColumn] = useState(null)
  const [sortDirection, setSortDirection] = useState('asc')

  const [savedViewId, setSavedViewId] = useState(null)
  const [viewLoaded, setViewLoaded] = useState(false)

  const { requests: exceptionRequests, refetch: refetchExceptionRequests } = useExceptionRequests()
  const exceptionMap = useMemo(() => buildLatestExceptionMap(exceptionRequests), [exceptionRequests])

  const [exceptionTarget, setExceptionTarget] = useState(null)
  const [exceptionReason, setExceptionReason] = useState('')
  const [exceptionError, setExceptionError] = useState(null)
  const [exceptionSubmitting, setExceptionSubmitting] = useState(false)

  const scrollSync = useStickyScrollbar()

  const loadInspections = useCallback(async () => {
    if (!userId) return
    const { data, error } = await supabase
      .from('inspections')
      .select(
        `id, invoice, inspection_type, call_stage, inspection_date, status, report_finished_at, report_uploaded_at, notes, distributor, customer, ${DETAIL_COLUMNS}`
      )
      .eq('assigned_to', userId)
      .order('created_at', { ascending: false })

    if (error) {
      setError(error.message)
      return
    }
    setInspections(data ?? [])
  }, [userId])

  useEffect(() => {
    if (!userId) return
    setLoading(true)
    loadInspections().finally(() => setLoading(false))
  }, [userId, loadInspections])

  // Load this user's saved filters/sort once, then persist changes (debounced).
  useEffect(() => {
    if (!userId) return
    let cancelled = false

    supabase
      .from('saved_views')
      .select('id, filters, sort')
      .eq('user_id', userId)
      .maybeSingle()
      .then(({ data, error }) => {
        if (cancelled) return
        if (error) {
          console.error('Failed to load saved view:', error)
        } else if (data) {
          setSavedViewId(data.id)
          if (data.filters) {
            setSearch(data.filters.search ?? '')
            setStatusFilter(data.filters.status ?? 'Active')
          }
          if (data.sort) {
            setSortColumn(data.sort.column ?? null)
            setSortDirection(data.sort.direction ?? 'asc')
          }
        }
        setViewLoaded(true)
      })

    return () => {
      cancelled = true
    }
  }, [userId])

  useEffect(() => {
    if (!viewLoaded || !userId) return

    const timeout = setTimeout(async () => {
      const payload = {
        user_id: userId,
        filters: { search, status: statusFilter },
        sort: { column: sortColumn, direction: sortDirection },
      }

      if (savedViewId) {
        const { error } = await supabase.from('saved_views').update(payload).eq('id', savedViewId)
        if (error) console.error('Failed to save view:', error)
      } else {
        const { data, error } = await supabase.from('saved_views').insert(payload).select('id').single()
        if (error) console.error('Failed to save view:', error)
        else setSavedViewId(data.id)
      }
    }, 600)

    return () => clearTimeout(timeout)
  }, [viewLoaded, userId, search, statusFilter, sortColumn, sortDirection, savedViewId])

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

  function openExceptionModal(row) {
    setExceptionTarget({ id: row.id, invoice: row.invoice })
    setExceptionReason('')
    setExceptionError(null)
  }

  function closeExceptionModal() {
    setExceptionTarget(null)
    setExceptionReason('')
    setExceptionError(null)
  }

  async function handleExceptionConfirm() {
    const reason = exceptionReason.trim()
    if (!reason) {
      setExceptionError('A reason is required.')
      return
    }

    setExceptionSubmitting(true)
    setExceptionError(null)

    const { error } = await insertExceptionRequest({
      inspectionId: exceptionTarget.id,
      requestedBy: userId,
      reason,
    })

    setExceptionSubmitting(false)

    if (error) {
      setExceptionError(error.message)
      return
    }

    // Don't wait on the realtime channel to reflect our own insert — refetch now.
    refetchExceptionRequests()
    closeExceptionModal()
  }

  function toggleSort(column) {
    if (sortColumn === column) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc')
    } else {
      setSortColumn(column)
      setSortDirection('asc')
    }
  }

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase()

    return inspections.filter((row) => {
      if (!matchesStatusFilter(row, statusFilter)) return false
      if (!query) return true

      return (
        row.invoice?.toLowerCase().includes(query) ||
        row.inspection_type?.toLowerCase().includes(query) ||
        row.customer?.toLowerCase().includes(query)
      )
    })
  }, [inspections, search, statusFilter])

  const sorted = useMemo(() => {
    if (!sortColumn) return filtered
    const dir = sortDirection === 'asc' ? 1 : -1
    return [...filtered].sort((a, b) => {
      const av = sortColumn === 'days_open' ? daysOpenValue(a) ?? -1 : a[sortColumn] ?? ''
      const bv = sortColumn === 'days_open' ? daysOpenValue(b) ?? -1 : b[sortColumn] ?? ''
      if (av < bv) return -1 * dir
      if (av > bv) return 1 * dir
      return 0
    })
  }, [filtered, sortColumn, sortDirection])

  if (loading) {
    return (
      <div className="p-8">
        <p className="text-sm text-gray-500">Loading your inspections...</p>
      </div>
    )
  }

  return (
    <div className="p-8">
      <h1 className="text-2xl font-semibold text-gray-900">My Workspace</h1>
      <p className="mt-1 text-sm text-gray-500">
        Inspections assigned to you. Notes, result, inspection date, and report finished are editable.
      </p>

      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}

      <div className="mt-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <input
          type="text"
          placeholder="Search by invoice, inspection type, or customer..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full max-w-sm rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-gray-500 focus:outline-none focus:ring-1 focus:ring-gray-500"
        />

        <div className="flex gap-2">
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
      </div>

      <div className="mt-6 overflow-hidden rounded-lg border border-gray-200 bg-white">
        {inspections.length === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-gray-500">You have no assigned inspections</p>
        ) : sorted.length === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-gray-500">No inspections match your filters</p>
        ) : (
          <div ref={scrollSync.contentRef} onScroll={scrollSync.onContentScroll} className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-gray-200 bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
                <tr>
                  {COLUMNS.map((col) => (
                    <th key={col.key} className="px-5 py-3 font-medium">
                      {col.sortable ? (
                        <button
                          type="button"
                          onClick={() => toggleSort(col.sortKey ?? col.key)}
                          className="flex items-center gap-1"
                        >
                          {col.label}
                          {sortColumn === (col.sortKey ?? col.key) && (sortDirection === 'asc' ? '▲' : '▼')}
                        </button>
                      ) : (
                        col.label
                      )}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {sorted.map((row) => (
                  <tr
                    key={row.id}
                    style={row.report_uploaded_at ? { backgroundColor: COMPLETED_ROW_BG } : undefined}
                  >
                    <td className="px-5 py-3 text-gray-700">{row.invoice}</td>
                    <td className="px-5 py-3 text-gray-700">{row.file_request ?? '—'}</td>
                    <td className="px-5 py-3">
                      <ExceptionCell request={exceptionMap[row.id]} onCheck={() => openExceptionModal(row)} />
                    </td>
                    <td className="px-5 py-3 text-gray-700">{formatInspectionType(row.inspection_type)}</td>
                    <td className="px-5 py-3">
                      <EditableCallStage
                        key={`${row.id}-call_stage-${row.call_stage}`}
                        rowId={row.id}
                        value={row.call_stage}
                        onSave={handleFieldSave}
                      />
                    </td>
                    <td className="px-5 py-3 text-gray-700">{profile?.full_name ?? '—'}</td>
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
                    <td className="px-5 py-3 text-gray-700">{row.phone || '—'}</td>
                    <td className="px-5 py-3 text-gray-700">{row.measure || '—'}</td>
                    <td className="px-5 py-3 text-gray-700">{row.equipment || '—'}</td>
                    <td className="px-5 py-3 text-gray-700">{row.quantity ?? '—'}</td>
                    <td className="px-5 py-3 text-gray-700">{row.total_incentive ?? '—'}</td>
                    <td className="px-5 py-3">
                      <EditableCheckbox
                        key={`${row.id}-additional_information-${row.additional_information}`}
                        rowId={row.id}
                        field="additional_information"
                        value={row.additional_information}
                        onSave={handleFieldSave}
                      />
                    </td>
                    <td className="px-5 py-3 text-gray-700">{formatDate(row.purchase_date)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <StickyScrollbar
        trackRef={scrollSync.trackRef}
        onScroll={scrollSync.onTrackScroll}
        scrollWidth={scrollSync.scrollWidth}
        visible={scrollSync.visible}
      />

      <ExceptionRequestModal
        target={exceptionTarget}
        reason={exceptionReason}
        setReason={setExceptionReason}
        error={exceptionError}
        submitting={exceptionSubmitting}
        onCancel={closeExceptionModal}
        onConfirm={handleExceptionConfirm}
      />
    </div>
  )
}
