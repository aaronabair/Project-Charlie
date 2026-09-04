import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from './supabaseClient'
import { useAuth } from './AuthContext'
import { STATUS_FILTERS, DETAIL_COLUMNS, StatusBadge, formatDate, formatInspectionType, daysOpen } from './inspectionFormat'
import { useExceptionRequests, buildLatestExceptionMap, ExceptionCellReadOnly } from './exceptionRequests'
import { useStickyScrollbar, StickyScrollbar } from './StickyScrollbar'

export default function MainView() {
  const { session } = useAuth()
  const userId = session?.user?.id

  const [inspections, setInspections] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('Active')

  // The one interactive exception to this page's otherwise strict read-only
  // rule: claiming unassigned rows for yourself.
  const [selectedIds, setSelectedIds] = useState(() => new Set())
  const [assigning, setAssigning] = useState(false)
  const [assignError, setAssignError] = useState(null)

  const { requests: exceptionRequests } = useExceptionRequests()
  const exceptionMap = useMemo(() => buildLatestExceptionMap(exceptionRequests), [exceptionRequests])

  const scrollSync = useStickyScrollbar()

  const loadInspections = useCallback(async () => {
    const { data, error } = await supabase
      .from('inspections')
      .select(
        `id, invoice, inspection_type, inspection_date, status, report_finished_at, report_uploaded_at, notes, distributor, customer, data_year, batch_number, assigned_to, ${DETAIL_COLUMNS}, profiles!inspections_assigned_to_fkey(full_name)`
      )
      .order('created_at', { ascending: false })

    if (error) {
      setError(error.message)
      return
    }
    setInspections(data ?? [])
  }, [])

  useEffect(() => {
    setLoading(true)
    loadInspections().finally(() => setLoading(false))
  }, [loadInspections])

  // A stale selection shouldn't reference rows that are no longer visible.
  useEffect(() => {
    setSelectedIds(new Set())
  }, [search, statusFilter])

  function toggleSelected(id) {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function handleAssignToMe() {
    if (selectedIds.size === 0 || !userId) return

    setAssigning(true)
    setAssignError(null)

    const { error } = await supabase
      .from('inspections')
      .update({ assigned_to: userId })
      .in('id', [...selectedIds])

    setAssigning(false)

    if (error) {
      setAssignError(error.message)
      return
    }

    // No realtime auto-refresh anymore — refetch explicitly, then clear the selection.
    await loadInspections()
    setSelectedIds(new Set())
  }

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase()

    return inspections.filter((row) => {
      if (statusFilter !== 'All' && row.status !== statusFilter.toLowerCase()) return false
      if (!query) return true

      const inspectorName = row.profiles?.full_name ?? ''
      return (
        row.invoice?.toLowerCase().includes(query) ||
        row.inspection_type?.toLowerCase().includes(query) ||
        inspectorName.toLowerCase().includes(query)
      )
    })
  }, [inspections, search, statusFilter])

  // Under "All" specifically, sink fully-completed rows (report uploaded) to the
  // bottom rather than mixing them in with everything still needing attention.
  const displayRows = useMemo(() => {
    if (statusFilter !== 'All') return filtered
    const notCompleted = filtered.filter((row) => !row.report_uploaded_at)
    const completed = filtered.filter((row) => row.report_uploaded_at)
    return [...notCompleted, ...completed]
  }, [filtered, statusFilter])

  if (loading) {
    return (
      <div className="p-8">
        <p className="text-sm text-gray-500">Loading inspections...</p>
      </div>
    )
  }

  return (
    <div className="p-8">
      <h1 className="text-2xl font-semibold text-gray-900">Main View</h1>
      <p className="mt-1 text-sm text-gray-500">Read-only. All inspections, every status.</p>

      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}

      <div className="mt-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <input
          type="text"
          placeholder="Search by invoice, inspection type, or inspector..."
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

      <div className="mt-4 flex items-center gap-3">
        <button
          type="button"
          onClick={handleAssignToMe}
          disabled={selectedIds.size === 0 || assigning}
          className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {assigning ? 'Assigning...' : `Assign to me${selectedIds.size > 0 ? ` (${selectedIds.size})` : ''}`}
        </button>
        {assignError && <p className="text-sm text-red-600">{assignError}</p>}
      </div>

      <div className="mt-6 overflow-hidden rounded-lg border border-gray-200 bg-white">
        {inspections.length === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-gray-500">No inspections yet</p>
        ) : displayRows.length === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-gray-500">No inspections match your filters</p>
        ) : (
          <div ref={scrollSync.contentRef} onScroll={scrollSync.onContentScroll} className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-gray-200 bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
                <tr>
                  <th className="px-5 py-3 font-medium"></th>
                  <th className="px-5 py-3 font-medium">Invoice</th>
                  <th className="px-5 py-3 font-medium">Exception</th>
                  <th className="px-5 py-3 font-medium">Inspection Type</th>
                  <th className="px-5 py-3 font-medium">Primary Inspector</th>
                  <th className="px-5 py-3 font-medium">Inspection Date</th>
                  <th className="px-5 py-3 font-medium">Days Open</th>
                  <th className="px-5 py-3 font-medium">Inspection Result</th>
                  <th className="px-5 py-3 font-medium">Report Finished</th>
                  <th className="px-5 py-3 font-medium">Inspector Notes</th>
                  <th className="px-5 py-3 font-medium">Distributor</th>
                  <th className="px-5 py-3 font-medium">Customer</th>
                  <th className="px-5 py-3 font-medium">File Request</th>
                  <th className="px-5 py-3 font-medium">Phone</th>
                  <th className="px-5 py-3 font-medium">Measure</th>
                  <th className="px-5 py-3 font-medium">Equipment</th>
                  <th className="px-5 py-3 font-medium">Quantity</th>
                  <th className="px-5 py-3 font-medium">Total Incentive</th>
                  <th className="px-5 py-3 font-medium">Additional Information</th>
                  <th className="px-5 py-3 font-medium">Purchase Date</th>
                  <th className="px-5 py-3 font-medium">Data Year</th>
                  <th className="px-5 py-3 font-medium">Batch #</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {displayRows.map((row) => (
                  <tr key={row.id}>
                    <td className="px-5 py-3">
                      {row.assigned_to == null && (
                        <input
                          type="checkbox"
                          checked={selectedIds.has(row.id)}
                          onChange={() => toggleSelected(row.id)}
                          className="h-4 w-4 rounded border-gray-300 text-gray-900 focus:ring-gray-500"
                        />
                      )}
                    </td>
                    <td className="px-5 py-3 text-gray-700">{row.invoice}</td>
                    <td className="px-5 py-3">
                      <ExceptionCellReadOnly request={exceptionMap[row.id]} />
                    </td>
                    <td className="px-5 py-3 text-gray-700">{formatInspectionType(row.inspection_type)}</td>
                    <td className="px-5 py-3 text-gray-700">{row.profiles?.full_name ?? 'Unassigned'}</td>
                    <td className="px-5 py-3 text-gray-700">{formatDate(row.inspection_date)}</td>
                    <td className="px-5 py-3 text-gray-700">{daysOpen(row)}</td>
                    <td className="px-5 py-3">
                      <StatusBadge status={row.status} />
                    </td>
                    <td className="px-5 py-3 text-gray-700">{formatDate(row.report_finished_at)}</td>
                    <td className="min-w-64 whitespace-normal break-words px-5 py-3 text-gray-500">
                      {row.notes || '—'}
                    </td>
                    <td className="px-5 py-3 text-gray-700">{row.distributor || '—'}</td>
                    <td className="px-5 py-3 text-gray-700">{row.customer || '—'}</td>
                    <td className="px-5 py-3 text-gray-700">{row.file_request ?? '—'}</td>
                    <td className="px-5 py-3 text-gray-700">{row.phone || '—'}</td>
                    <td className="px-5 py-3 text-gray-700">{row.measure || '—'}</td>
                    <td className="px-5 py-3 text-gray-700">{row.equipment || '—'}</td>
                    <td className="px-5 py-3 text-gray-700">{row.quantity ?? '—'}</td>
                    <td className="px-5 py-3 text-gray-700">{row.total_incentive ?? '—'}</td>
                    <td className="px-5 py-3">
                      <input
                        type="checkbox"
                        checked={!!row.additional_information}
                        disabled
                        className="h-4 w-4 rounded border-gray-300 text-gray-900"
                      />
                    </td>
                    <td className="px-5 py-3 text-gray-700">{formatDate(row.purchase_date)}</td>
                    <td className="px-5 py-3 text-gray-700">{row.data_year ?? '—'}</td>
                    <td className="px-5 py-3 text-gray-700">{row.batch_number ?? '—'}</td>
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
    </div>
  )
}
