import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from './supabaseClient'
import { isInspectionOpen, isUploadRequired, daysOpen, daysOpenValue, formatDate } from './inspectionFormat'

const TABS = ['Overview', 'Team Stats', 'Batch Data']

function formatDuration(ms) {
  if (ms == null || Number.isNaN(ms) || ms < 0) return '—'
  const minutes = Math.floor(ms / 60000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes} min${minutes === 1 ? '' : 's'}`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'}`
  const days = Math.floor(hours / 24)
  return `${days} day${days === 1 ? '' : 's'}`
}

function formatTimeAgo(dateStr) {
  const duration = formatDuration(Date.now() - new Date(dateStr).getTime())
  return duration === 'just now' ? duration : `${duration} ago`
}

function formatActivity(row) {
  const name = row.profiles?.full_name ?? 'Someone'
  const externalId = row.inspections?.external_id
  const ref = externalId ? `#${externalId}` : 'an inspection'

  switch (row.action) {
    case 'status_change':
      return `${name} marked ${ref} as ${row.new_value ? row.new_value.toUpperCase() : 'updated'}`
    case 'field_edit':
      return `${name} updated ${row.field_name ?? 'a field'} on ${ref}`
    case 'reopen':
      return `${name} reopened ${ref}`
    case 'upload':
      return `${name} uploaded a file to ${ref}`
    case 'login':
      return `${name} logged in`
    default:
      return `${name} updated ${ref}`
  }
}

function MetricCard({ label, value, sub }) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-5">
      <p className="text-sm text-gray-500">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-gray-900">{value}</p>
      {sub && <p className="mt-1 text-sm text-gray-500">{sub}</p>}
    </div>
  )
}

// One row per user currently carrying at least one assigned inspection.
// Active/longest-open/avg-open are all scoped to only their open inspections;
// completed just counts everything else (closed, regardless of upload status).
function computeTeamStats(inspections) {
  const byUser = {}

  for (const row of inspections) {
    if (!row.assigned_to) continue

    if (!byUser[row.assigned_to]) {
      byUser[row.assigned_to] = {
        id: row.assigned_to,
        fullName: row.profiles?.full_name ?? 'Unknown',
        activeCount: 0,
        completedCount: 0,
        openDaysSum: 0,
        openDaysCount: 0,
        longestOpenDays: null,
      }
    }

    const stat = byUser[row.assigned_to]

    if (isInspectionOpen(row)) {
      stat.activeCount += 1
      const days = daysOpenValue(row)
      if (days != null) {
        stat.openDaysSum += days
        stat.openDaysCount += 1
        if (stat.longestOpenDays == null || days > stat.longestOpenDays) {
          stat.longestOpenDays = days
        }
      }
    } else {
      stat.completedCount += 1
    }
  }

  return Object.values(byUser)
    .map((s) => ({
      ...s,
      avgOpenDays: s.openDaysCount > 0 ? s.openDaysSum / s.openDaysCount : null,
    }))
    .sort((a, b) => a.fullName.localeCompare(b.fullName))
}

// One row per distinct (data_year, batch_number). "Active" here means still
// needs any further work (inspection or upload) — report_uploaded_at is null.
function computeBatchStats(inspections) {
  const byBatch = {}

  for (const row of inspections) {
    const key = `${row.data_year ?? 'none'}-${row.batch_number ?? 'none'}`
    if (!byBatch[key]) {
      byBatch[key] = {
        key,
        dataYear: row.data_year,
        batchNumber: row.batch_number,
        total: 0,
        activeCount: 0,
        completedCount: 0,
        maxUploadedAt: null,
      }
    }

    const batch = byBatch[key]
    batch.total += 1

    if (row.report_uploaded_at) {
      batch.completedCount += 1
      if (!batch.maxUploadedAt || new Date(row.report_uploaded_at) > new Date(batch.maxUploadedAt)) {
        batch.maxUploadedAt = row.report_uploaded_at
      }
    } else {
      batch.activeCount += 1
    }
  }

  return Object.values(byBatch).sort((a, b) => {
    if (a.dataYear !== b.dataYear) return (b.dataYear ?? -Infinity) - (a.dataYear ?? -Infinity)
    return (b.batchNumber ?? -Infinity) - (a.batchNumber ?? -Infinity)
  })
}

export default function Dashboard() {
  const [tab, setTab] = useState('Overview')
  const [inspections, setInspections] = useState([])
  const [activity, setActivity] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const loadInspections = useCallback(async () => {
    const { data, error } = await supabase
      .from('inspections')
      .select(
        'id, invoice, assigned_to, status, uploaded_at, report_finished_at, report_uploaded_at, data_year, batch_number, profiles!inspections_assigned_to_fkey(full_name)'
      )

    if (error) {
      setError(error.message)
      return
    }
    setInspections(data ?? [])
  }, [])

  const loadActivity = useCallback(async () => {
    const { data, error } = await supabase
      .from('audit_log')
      .select(
        'id, action, field_name, new_value, created_at, profiles(full_name), inspections(external_id)'
      )
      .order('created_at', { ascending: false })
      .limit(10)

    if (error) {
      setError(error.message)
      return
    }
    setActivity(data ?? [])
  }, [])

  useEffect(() => {
    setLoading(true)
    Promise.all([loadInspections(), loadActivity()]).finally(() => setLoading(false))

    const channel = supabase
      .channel('dashboard-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'inspections' }, loadInspections)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'audit_log' }, loadActivity)
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [loadInspections, loadActivity])

  const openInspections = useMemo(() => inspections.filter(isInspectionOpen), [inspections])

  const total = openInspections.length
  const assigned = openInspections.filter((i) => i.assigned_to != null).length
  const unassigned = total - assigned

  const longest = openInspections.reduce((best, i) => {
    const bestDays = best ? daysOpenValue(best) ?? -1 : -1
    const days = daysOpenValue(i) ?? -1
    return days > bestDays ? i : best
  }, null)

  const daysValues = openInspections.map((i) => daysOpenValue(i)).filter((d) => d != null)
  const avgDaysOpen =
    daysValues.length > 0 ? daysValues.reduce((sum, d) => sum + d, 0) / daysValues.length : null

  const pendingUpload = useMemo(() => inspections.filter(isUploadRequired).length, [inspections])

  const teamStats = useMemo(() => computeTeamStats(inspections), [inspections])
  const batchStats = useMemo(() => computeBatchStats(inspections), [inspections])

  if (loading) {
    return (
      <div className="p-8">
        <p className="text-sm text-gray-500">Loading dashboard...</p>
      </div>
    )
  }

  return (
    <div className="p-8">
      <h1 className="text-2xl font-semibold text-gray-900">Dashboard</h1>

      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}

      <div className="mt-6 flex gap-2">
        {TABS.map((option) => (
          <button
            key={option}
            type="button"
            onClick={() => setTab(option)}
            className={`rounded-md px-3 py-1.5 text-sm font-medium ${
              tab === option ? 'bg-gray-900 text-white' : 'border border-gray-300 bg-white text-gray-600'
            }`}
          >
            {option}
          </button>
        ))}
      </div>

      {tab === 'Overview' && (
        <>
          <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <MetricCard label="Total open inspections" value={total} />
            <MetricCard label="Assigned" value={assigned} />
            <MetricCard label="Unassigned" value={unassigned} />
            <MetricCard
              label="Longest open inspection"
              value={longest ? longest.invoice || 'Untitled' : 'No inspections yet'}
              sub={longest ? `open for ${daysOpen(longest)}` : null}
            />
            <MetricCard
              label="Average time open"
              value={avgDaysOpen != null ? `${avgDaysOpen.toFixed(1)} days` : 'No inspections yet'}
            />
            <MetricCard label="Pending Upload" value={pendingUpload} />
          </div>

          <div className="mt-8 rounded-lg border border-gray-200 bg-white">
            <div className="border-b border-gray-200 px-5 py-4">
              <h2 className="text-lg font-semibold text-gray-900">Recent activity</h2>
            </div>
            {activity.length === 0 ? (
              <p className="px-5 py-4 text-sm text-gray-500">No activity yet</p>
            ) : (
              <ul className="divide-y divide-gray-100">
                {activity.map((row) => (
                  <li key={row.id} className="px-5 py-3 text-sm text-gray-700">
                    {formatActivity(row)}{' '}
                    <span className="text-gray-400">— {formatTimeAgo(row.created_at)}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}

      {tab === 'Team Stats' && (
        <div className="mt-6 overflow-hidden rounded-lg border border-gray-200 bg-white">
          {teamStats.length === 0 ? (
            <p className="px-5 py-8 text-center text-sm text-gray-500">
              No one has any assigned inspections yet
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-gray-200 bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
                  <tr>
                    <th className="px-5 py-3 font-medium">Name</th>
                    <th className="px-5 py-3 font-medium">Active</th>
                    <th className="px-5 py-3 font-medium">Completed</th>
                    <th className="px-5 py-3 font-medium">Longest Open</th>
                    <th className="px-5 py-3 font-medium">Avg Time Open</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {teamStats.map((s) => (
                    <tr key={s.id}>
                      <td className="px-5 py-3 text-gray-700">{s.fullName}</td>
                      <td className="px-5 py-3 text-gray-700">{s.activeCount}</td>
                      <td className="px-5 py-3 text-gray-700">{s.completedCount}</td>
                      <td className="px-5 py-3 text-gray-700">
                        {s.longestOpenDays != null
                          ? `${s.longestOpenDays} day${s.longestOpenDays === 1 ? '' : 's'}`
                          : '—'}
                      </td>
                      <td className="px-5 py-3 text-gray-700">
                        {s.avgOpenDays != null ? `${s.avgOpenDays.toFixed(1)} days` : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {tab === 'Batch Data' && (
        <div className="mt-6 overflow-hidden rounded-lg border border-gray-200 bg-white">
          {batchStats.length === 0 ? (
            <p className="px-5 py-8 text-center text-sm text-gray-500">No batches yet</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-gray-200 bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
                  <tr>
                    <th className="px-5 py-3 font-medium">Data Year</th>
                    <th className="px-5 py-3 font-medium">Batch #</th>
                    <th className="px-5 py-3 font-medium">Total</th>
                    <th className="px-5 py-3 font-medium">Active</th>
                    <th className="px-5 py-3 font-medium">Completed</th>
                    <th className="px-5 py-3 font-medium">Completed On</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {batchStats.map((b) => (
                    <tr key={b.key}>
                      <td className="px-5 py-3 text-gray-700">{b.dataYear ?? '—'}</td>
                      <td className="px-5 py-3 text-gray-700">{b.batchNumber ?? '—'}</td>
                      <td className="px-5 py-3 text-gray-700">{b.total}</td>
                      <td className="px-5 py-3 text-gray-700">{b.activeCount}</td>
                      <td className="px-5 py-3 text-gray-700">{b.completedCount}</td>
                      <td className="px-5 py-3 text-gray-700">
                        {b.activeCount === 0 ? formatDate(b.maxUploadedAt) : 'In progress'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
