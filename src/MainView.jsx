import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from './supabaseClient'
import { STATUS_FILTERS, DETAIL_COLUMNS, StatusBadge, formatDate, daysOpen } from './inspectionFormat'

export default function MainView() {
  const [inspections, setInspections] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('All')

  const loadInspections = useCallback(async () => {
    const { data, error } = await supabase
      .from('inspections')
      .select(
        `id, invoice, inspection_type, inspection_date, status, report_finished_at, notes, distributor, customer, city, ${DETAIL_COLUMNS}, profiles!inspections_assigned_to_fkey(full_name)`
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

    const channel = supabase
      .channel('main-view-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'inspections' }, loadInspections)
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [loadInspections])

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
                  <th className="px-5 py-3 font-medium">Invoice</th>
                  <th className="px-5 py-3 font-medium">Inspection Type</th>
                  <th className="px-5 py-3 font-medium">Primary Inspector</th>
                  <th className="px-5 py-3 font-medium">Inspection Date</th>
                  <th className="px-5 py-3 font-medium">Days Open</th>
                  <th className="px-5 py-3 font-medium">Inspection Result</th>
                  <th className="px-5 py-3 font-medium">Report Finished</th>
                  <th className="px-5 py-3 font-medium">Inspector Notes</th>
                  <th className="px-5 py-3 font-medium">Distributor</th>
                  <th className="px-5 py-3 font-medium">Customer</th>
                  <th className="px-5 py-3 font-medium">City</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filtered.map((row) => (
                  <tr key={row.id}>
                    <td className="px-5 py-3 text-gray-700">{row.invoice}</td>
                    <td className="px-5 py-3 text-gray-700">{row.inspection_type}</td>
                    <td className="px-5 py-3 text-gray-700">{row.profiles?.full_name ?? 'Unassigned'}</td>
                    <td className="px-5 py-3 text-gray-700">{formatDate(row.inspection_date)}</td>
                    <td className="px-5 py-3 text-gray-700">{daysOpen(row.inspection_date)}</td>
                    <td className="px-5 py-3">
                      <StatusBadge status={row.status} />
                    </td>
                    <td className="px-5 py-3 text-gray-700">{formatDate(row.report_finished_at)}</td>
                    <td className="px-5 py-3 text-gray-500">{row.notes || '—'}</td>
                    <td className="px-5 py-3 text-gray-700">{row.distributor || '—'}</td>
                    <td className="px-5 py-3 text-gray-700">{row.customer || '—'}</td>
                    <td className="px-5 py-3 text-gray-700">{row.city || '—'}</td>
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
