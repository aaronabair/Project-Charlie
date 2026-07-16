import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from './supabaseClient'
import { useAuth } from './AuthContext'
import {
  STATUS_FILTERS,
  DETAIL_COLUMNS,
  formatInspectionType,
  formatDate,
  daysOpen,
  daysOpenValue,
} from './inspectionFormat'
import { EditableText, EditableDate, EditableStatus } from './EditableCells'

const COLUMNS = [
  { key: 'invoice', label: 'Invoice', sortable: true },
  { key: 'inspection_type', label: 'Inspection Type', sortable: true },
  { key: 'inspector', label: 'Primary Inspector', sortable: false },
  { key: 'inspection_date', label: 'Inspection Date', sortable: true },
  { key: 'days_open', label: 'Days Open', sortable: true },
  { key: 'status', label: 'Inspection Result', sortable: true },
  { key: 'report_finished_at', label: 'Report Finished', sortable: true },
  { key: 'notes', label: 'Inspector Notes', sortable: false },
  { key: 'distributor', label: 'Distributor', sortable: true },
  { key: 'customer', label: 'Customer', sortable: true },
  { key: 'city', label: 'City', sortable: true },
  { key: 'payment', label: 'Payment', sortable: false },
  { key: 'file_request', label: 'File Request', sortable: false },
  { key: 'address', label: 'Address', sortable: false },
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
  const [statusFilter, setStatusFilter] = useState('All')
  const [sortColumn, setSortColumn] = useState(null)
  const [sortDirection, setSortDirection] = useState('asc')

  const [savedViewId, setSavedViewId] = useState(null)
  const [viewLoaded, setViewLoaded] = useState(false)

  const loadInspections = useCallback(async () => {
    if (!userId) return
    const { data, error } = await supabase
      .from('inspections')
      .select(
        `id, invoice, inspection_type, inspection_date, status, report_finished_at, notes, distributor, customer, city, ${DETAIL_COLUMNS}`
      )
      .eq('assigned_to', userId)
      // Once dispositioned (pass/fail) AND the report is finished, it's off the
      // inspector's plate — it moves to Data Admin's Upload Required queue.
      .or('status.eq.active,report_finished_at.is.null')
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

    const channel = supabase
      .channel(`my-workspace-changes-${userId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'inspections', filter: `assigned_to=eq.${userId}` },
        loadInspections
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
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
            setStatusFilter(data.filters.status ?? 'All')
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
      if (statusFilter !== 'All' && row.status !== statusFilter.toLowerCase()) return false
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
          <div className="overflow-x-auto">
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
                  <tr key={row.id}>
                    <td className="px-5 py-3 text-gray-700">{row.invoice}</td>
                    <td className="px-5 py-3 text-gray-700">{formatInspectionType(row.inspection_type)}</td>
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
                    <td className="px-5 py-3 text-gray-700">{row.city || '—'}</td>
                    <td className="px-5 py-3 text-gray-700">{row.payment ?? '—'}</td>
                    <td className="px-5 py-3 text-gray-700">{row.file_request || '—'}</td>
                    <td className="px-5 py-3 text-gray-700">{row.address || '—'}</td>
                    <td className="px-5 py-3 text-gray-700">{row.phone || '—'}</td>
                    <td className="px-5 py-3 text-gray-700">{row.measure || '—'}</td>
                    <td className="px-5 py-3 text-gray-700">{row.equipment || '—'}</td>
                    <td className="px-5 py-3 text-gray-700">{row.quantity ?? '—'}</td>
                    <td className="px-5 py-3 text-gray-700">{row.total_incentive ?? '—'}</td>
                    <td className="px-5 py-3 text-gray-700">{row.additional_information || '—'}</td>
                    <td className="px-5 py-3 text-gray-700">{formatDate(row.purchase_date)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
