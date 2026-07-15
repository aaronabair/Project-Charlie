import { useCallback, useEffect, useState } from 'react'
import { supabase } from './supabaseClient'

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

export default function Dashboard() {
  const [inspections, setInspections] = useState([])
  const [activity, setActivity] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const loadInspections = useCallback(async () => {
    const { data, error } = await supabase
      .from('inspections')
      .select('id, title, external_id, assigned_to, created_at')
      .eq('status', 'active')

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

  if (loading) {
    return (
      <div className="p-8">
        <p className="text-sm text-gray-500">Loading dashboard...</p>
      </div>
    )
  }

  const total = inspections.length
  const assigned = inspections.filter((i) => i.assigned_to != null).length
  const unassigned = total - assigned

  const longest = inspections.reduce(
    (oldest, i) => (!oldest || new Date(i.created_at) < new Date(oldest.created_at) ? i : oldest),
    null
  )

  const avgOpenMs =
    total > 0
      ? inspections.reduce((sum, i) => sum + (Date.now() - new Date(i.created_at).getTime()), 0) / total
      : null

  return (
    <div className="p-8">
      <h1 className="text-2xl font-semibold text-gray-900">Dashboard</h1>

      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}

      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <MetricCard label="Total open inspections" value={total} />
        <MetricCard label="Assigned" value={assigned} />
        <MetricCard label="Unassigned" value={unassigned} />
        <MetricCard
          label="Longest active inspection"
          value={longest ? longest.title || `#${longest.external_id}` || 'Untitled' : 'No inspections yet'}
          sub={
            longest
              ? `${longest.external_id ? `#${longest.external_id} · ` : ''}open for ${formatDuration(
                  Date.now() - new Date(longest.created_at).getTime()
                )}`
              : null
          }
        />
        <MetricCard
          label="Average time open"
          value={total > 0 ? formatDuration(avgOpenMs) : 'No inspections yet'}
        />
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
    </div>
  )
}
