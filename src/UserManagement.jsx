import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from './supabaseClient'
import { useAuth } from './AuthContext'
import { SaveStatus } from './EditableCells'

const ROLES = ['admin', 'data_master', 'inspector']

function roleLabel(role) {
  if (!role) return '—'
  return role
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')
}

function RoleSelect({ value, onChange, disabled }) {
  return (
    <select
      value={value}
      onChange={onChange}
      disabled={disabled}
      className="rounded-md border border-gray-300 px-2 py-1 text-sm focus:border-gray-500 focus:outline-none focus:ring-1 focus:ring-gray-500 disabled:opacity-50"
    >
      {ROLES.map((r) => (
        <option key={r} value={r}>
          {roleLabel(r)}
        </option>
      ))}
    </select>
  )
}

// Used for both Pending and Revoked sections — "Approve" and "Reactivate" are
// the same action (set role + account_status: 'active'), just different labels.
function ApprovalRow({ user, isSelf, onApprove }) {
  const [role, setRole] = useState(user.role ?? 'inspector')
  const [status, setStatus] = useState(null)

  return (
    <div className="flex flex-col gap-2 border-b border-gray-100 px-5 py-3 last:border-b-0 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <p className="text-sm font-medium text-gray-900">
          {user.full_name} {isSelf && <span className="text-gray-400">(you)</span>}
        </p>
        <p className="text-sm text-gray-500">{user.email}</p>
      </div>
      <div className="flex items-center gap-3">
        <RoleSelect value={role} onChange={(e) => setRole(e.target.value)} disabled={isSelf} />
        <button
          type="button"
          onClick={() => onApprove(user.id, role, setStatus)}
          disabled={isSelf}
          className="rounded-md bg-gray-900 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
        >
          {user.account_status === 'revoked' ? 'Reactivate' : 'Approve'}
        </button>
        <SaveStatus status={status} />
      </div>
    </div>
  )
}

function ActiveRow({ user, isSelf, onRoleChange, onRevoke }) {
  const [role, setRole] = useState(user.role ?? 'inspector')
  const [status, setStatus] = useState(null)

  return (
    <div className="flex flex-col gap-2 border-b border-gray-100 px-5 py-3 last:border-b-0 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <p className="text-sm font-medium text-gray-900">
          {user.full_name} {isSelf && <span className="text-gray-400">(you)</span>}
        </p>
        <p className="text-sm text-gray-500">{user.email}</p>
      </div>
      <div className="flex items-center gap-3">
        <RoleSelect
          value={role}
          disabled={isSelf}
          onChange={(e) => {
            const next = e.target.value
            setRole(next)
            onRoleChange(user.id, next, setStatus)
          }}
        />
        <button
          type="button"
          onClick={() => onRevoke(user.id, setStatus)}
          disabled={isSelf}
          className="rounded-md border border-red-300 bg-white px-3 py-1.5 text-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
        >
          Revoke access
        </button>
        <SaveStatus status={status} />
      </div>
    </div>
  )
}

function Section({ title, count, emptyText, children }) {
  return (
    <section>
      <h2 className="text-lg font-semibold text-gray-900">
        {title} ({count})
      </h2>
      <div className="mt-3 overflow-hidden rounded-lg border border-gray-200 bg-white">
        {count === 0 ? <p className="px-5 py-6 text-sm text-gray-500">{emptyText}</p> : children}
      </div>
    </section>
  )
}

export default function UserManagement() {
  const { session, profile } = useAuth()
  const isAdmin = profile?.role === 'admin'
  const currentUserId = session?.user?.id

  const [profiles, setProfiles] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const loadProfiles = useCallback(async () => {
    const { data, error } = await supabase
      .from('profiles')
      .select('id, full_name, email, role, account_status')
      .order('full_name')

    if (error) {
      setError(error.message)
      return
    }
    setProfiles(data ?? [])
  }, [])

  useEffect(() => {
    if (!isAdmin) return

    setLoading(true)
    loadProfiles().finally(() => setLoading(false))

    const channel = supabase
      .channel('user-management-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, loadProfiles)
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [isAdmin, loadProfiles])

  async function handleApprove(userId, role, setStatus) {
    setStatus('saving')
    const { error } = await supabase
      .from('profiles')
      .update({ role, account_status: 'active' })
      .eq('id', userId)
    if (error) {
      setStatus(error.message)
      return
    }
    setStatus('saved')
    setTimeout(() => setStatus(null), 2000)
  }

  async function handleRoleChange(userId, role, setStatus) {
    setStatus('saving')
    const { error } = await supabase.from('profiles').update({ role }).eq('id', userId)
    if (error) {
      setStatus(error.message)
      return
    }
    setStatus('saved')
    setTimeout(() => setStatus(null), 2000)
  }

  async function handleRevoke(userId, setStatus) {
    setStatus('saving')
    const { error } = await supabase
      .from('profiles')
      .update({ account_status: 'revoked' })
      .eq('id', userId)
    if (error) {
      setStatus(error.message)
      return
    }
    setStatus('saved')
    setTimeout(() => setStatus(null), 2000)
  }

  const pending = useMemo(() => profiles.filter((p) => p.account_status === 'pending'), [profiles])
  const active = useMemo(() => profiles.filter((p) => p.account_status === 'active'), [profiles])
  const revoked = useMemo(() => profiles.filter((p) => p.account_status === 'revoked'), [profiles])

  if (!isAdmin) {
    return (
      <div className="p-8">
        <h1 className="text-2xl font-semibold text-gray-900">User Management</h1>
        <p className="mt-2 text-sm text-gray-500">
          You don't have access to this page. User management is limited to Admins.
        </p>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="p-8">
        <p className="text-sm text-gray-500">Loading users...</p>
      </div>
    )
  }

  return (
    <div className="p-8">
      <h1 className="text-2xl font-semibold text-gray-900">User Management</h1>
      <p className="mt-1 text-sm text-gray-500">Approve new accounts, manage roles, and revoke access.</p>

      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}

      <div className="mt-6 space-y-8">
        <Section title="Pending approval" count={pending.length} emptyText="No accounts awaiting approval.">
          {pending.map((user) => (
            <ApprovalRow
              key={`${user.id}-${user.role}-${user.account_status}`}
              user={user}
              isSelf={user.id === currentUserId}
              onApprove={handleApprove}
            />
          ))}
        </Section>

        <Section title="Active" count={active.length} emptyText="No active users.">
          {active.map((user) => (
            <ActiveRow
              key={`${user.id}-${user.role}-${user.account_status}`}
              user={user}
              isSelf={user.id === currentUserId}
              onRoleChange={handleRoleChange}
              onRevoke={handleRevoke}
            />
          ))}
        </Section>

        <Section title="Revoked" count={revoked.length} emptyText="No revoked users.">
          {revoked.map((user) => (
            <ApprovalRow
              key={`${user.id}-${user.role}-${user.account_status}`}
              user={user}
              isSelf={user.id === currentUserId}
              onApprove={handleApprove}
            />
          ))}
        </Section>
      </div>
    </div>
  )
}
