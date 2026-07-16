import { useCallback, useEffect, useMemo, useState } from 'react'
import * as XLSX from 'xlsx'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import { supabase } from './supabaseClient'
import { useAuth } from './AuthContext'
import { formatDate, daysOpen, daysOpenValue } from './inspectionFormat'

function rangeLabel(startDate, endDate) {
  if (!startDate && !endDate) return 'All time'
  return `${startDate || 'Start'} – ${endDate || 'Present'}`
}

function rangeSuffix(startDate, endDate) {
  return `${startDate || 'all'}_${endDate || 'all'}`
}

function computeInspectorStats(inspections) {
  const byInspector = {}

  for (const row of inspections) {
    if (row.status !== 'pass' && row.status !== 'fail') continue // only completed inspections count
    if (!row.assigned_to) continue // can't attribute an unassigned row to an inspector

    if (!byInspector[row.assigned_to]) {
      byInspector[row.assigned_to] = {
        id: row.assigned_to,
        fullName: row.profiles?.full_name ?? 'Unknown',
        total: 0,
        pass: 0,
        fail: 0,
        daysSum: 0,
        daysCount: 0,
      }
    }

    const stat = byInspector[row.assigned_to]
    stat.total += 1
    if (row.status === 'pass') stat.pass += 1
    else stat.fail += 1

    const days = daysOpenValue(row)
    if (days != null) {
      stat.daysSum += days
      stat.daysCount += 1
    }
  }

  return Object.values(byInspector)
    .map((s) => ({
      ...s,
      passRate: s.total > 0 ? (s.pass / s.total) * 100 : 0,
      avgDaysOpen: s.daysCount > 0 ? s.daysSum / s.daysCount : null,
    }))
    .sort((a, b) => a.fullName.localeCompare(b.fullName))
}

export default function Reports() {
  const { profile } = useAuth()
  const canManage = profile?.role === 'admin' || profile?.role === 'data_master'

  const [inspections, setInspections] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')

  const loadInspections = useCallback(async () => {
    let query = supabase
      .from('inspections')
      .select(
        'id, invoice, inspection_type, inspection_date, status, report_finished_at, uploaded_at, notes, distributor, customer, city, assigned_to, profiles!inspections_assigned_to_fkey(full_name)'
      )
      .order('inspection_date', { ascending: false })

    if (startDate) query = query.gte('inspection_date', startDate)
    if (endDate) query = query.lte('inspection_date', endDate)

    const { data, error } = await query

    if (error) {
      setError(error.message)
      return
    }
    setInspections(data ?? [])
  }, [startDate, endDate])

  useEffect(() => {
    if (!canManage) return
    setLoading(true)
    loadInspections().finally(() => setLoading(false))
  }, [canManage, loadInspections])

  const stats = useMemo(() => computeInspectorStats(inspections), [inspections])

  function exportPerformanceExcel() {
    const rows = stats.map((s) => ({
      Inspector: s.fullName,
      'Total Completions': s.total,
      Pass: s.pass,
      Fail: s.fail,
      'Pass Rate': `${s.passRate.toFixed(1)}%`,
      'Avg Days Open': s.avgDaysOpen != null ? s.avgDaysOpen.toFixed(1) : '—',
    }))

    const sheet = XLSX.utils.json_to_sheet(rows)
    const workbook = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(workbook, sheet, 'Inspector Performance')
    XLSX.writeFile(workbook, `inspector-performance-${rangeSuffix(startDate, endDate)}.xlsx`)
  }

  function exportPerformancePdf() {
    const doc = new jsPDF()

    doc.setFontSize(14)
    doc.text('Inspector Performance Report', 14, 16)
    doc.setFontSize(10)
    doc.setTextColor(100)
    doc.text(`Date range: ${rangeLabel(startDate, endDate)}`, 14, 23)
    doc.text(`Generated: ${new Date().toLocaleString()}`, 14, 28)

    autoTable(doc, {
      startY: 34,
      head: [['Inspector', 'Total', 'Pass', 'Fail', 'Pass Rate', 'Avg Days Open']],
      body: stats.map((s) => [
        s.fullName,
        s.total,
        s.pass,
        s.fail,
        `${s.passRate.toFixed(1)}%`,
        s.avgDaysOpen != null ? s.avgDaysOpen.toFixed(1) : '—',
      ]),
    })

    doc.save(`inspector-performance-${rangeSuffix(startDate, endDate)}.pdf`)
  }

  function exportRawInspections() {
    const rows = inspections.map((row) => ({
      Invoice: row.invoice ?? '',
      'Inspection Type': row.inspection_type ?? '',
      'Primary Inspector': row.profiles?.full_name ?? 'Unassigned',
      'Inspection Date': formatDate(row.inspection_date),
      'Days Open': daysOpen(row),
      'Inspection Result': row.status ?? '',
      'Report Finished': formatDate(row.report_finished_at),
      'Inspector Notes': row.notes ?? '',
      Distributor: row.distributor ?? '',
      Customer: row.customer ?? '',
      City: row.city ?? '',
    }))

    const sheet = XLSX.utils.json_to_sheet(rows)
    const workbook = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(workbook, sheet, 'Inspections')
    XLSX.writeFile(workbook, `inspections-${rangeSuffix(startDate, endDate)}.xlsx`)
  }

  if (!canManage) {
    return (
      <div className="p-8">
        <h1 className="text-2xl font-semibold text-gray-900">Reports</h1>
        <p className="mt-2 text-sm text-gray-500">
          You don't have access to this page. Reports are limited to Data Masters and Admins.
        </p>
      </div>
    )
  }

  return (
    <div className="p-8">
      <h1 className="text-2xl font-semibold text-gray-900">Reports</h1>
      <p className="mt-1 text-sm text-gray-500">Inspector performance and data export.</p>

      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}

      <div className="mt-6 flex flex-col gap-4 rounded-lg border border-gray-200 bg-white p-5 sm:flex-row sm:items-end sm:gap-6">
        <div>
          <label htmlFor="start-date" className="block text-sm font-medium text-gray-700">
            Start date
          </label>
          <input
            id="start-date"
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="mt-1 rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-gray-500 focus:outline-none focus:ring-1 focus:ring-gray-500"
          />
        </div>
        <div>
          <label htmlFor="end-date" className="block text-sm font-medium text-gray-700">
            End date
          </label>
          <input
            id="end-date"
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className="mt-1 rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-gray-500 focus:outline-none focus:ring-1 focus:ring-gray-500"
          />
        </div>
        {(startDate || endDate) && (
          <button
            type="button"
            onClick={() => {
              setStartDate('')
              setEndDate('')
            }}
            className="text-sm text-gray-500 hover:text-gray-900"
          >
            Clear range
          </button>
        )}
        <p className="text-sm text-gray-500 sm:ml-auto">
          Filtering by inspection date: <span className="text-gray-700">{rangeLabel(startDate, endDate)}</span>
        </p>
      </div>

      {loading ? (
        <p className="mt-6 text-sm text-gray-500">Loading report data...</p>
      ) : (
        <>
          <div className="mt-6 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={exportPerformanceExcel}
              disabled={stats.length === 0}
              className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
            >
              Export performance (Excel)
            </button>
            <button
              type="button"
              onClick={exportPerformancePdf}
              disabled={stats.length === 0}
              className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
            >
              Export performance (PDF)
            </button>
            <button
              type="button"
              onClick={exportRawInspections}
              disabled={inspections.length === 0}
              className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-600 disabled:opacity-50"
            >
              Export all inspections in range (Excel)
            </button>
          </div>

          <div className="mt-6 overflow-hidden rounded-lg border border-gray-200 bg-white">
            {stats.length === 0 ? (
              <p className="px-5 py-8 text-center text-sm text-gray-500">
                No completed inspections in this range
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="border-b border-gray-200 bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
                    <tr>
                      <th className="px-5 py-3 font-medium">Inspector</th>
                      <th className="px-5 py-3 font-medium">Total Completions</th>
                      <th className="px-5 py-3 font-medium">Pass</th>
                      <th className="px-5 py-3 font-medium">Fail</th>
                      <th className="px-5 py-3 font-medium">Pass Rate</th>
                      <th className="px-5 py-3 font-medium">Avg Days Open</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {stats.map((s) => (
                      <tr key={s.id}>
                        <td className="px-5 py-3 text-gray-700">{s.fullName}</td>
                        <td className="px-5 py-3 text-gray-700">{s.total}</td>
                        <td className="px-5 py-3 text-gray-700">{s.pass}</td>
                        <td className="px-5 py-3 text-gray-700">{s.fail}</td>
                        <td className="px-5 py-3 text-gray-700">{s.passRate.toFixed(1)}%</td>
                        <td className="px-5 py-3 text-gray-700">
                          {s.avgDaysOpen != null ? `${s.avgDaysOpen.toFixed(1)} days` : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}
