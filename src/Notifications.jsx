import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from './supabaseClient'
import { useAuth } from './AuthContext'
import { formatTimeAgo } from './timeFormat'

const NOTIFICATION_LIMIT = 20

function BellIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-5 w-5"
    >
      <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.73 21a2 2 0 0 1-3.46 0" />
    </svg>
  )
}

export default function Notifications() {
  const { session } = useAuth()
  const userId = session?.user?.id

  const [open, setOpen] = useState(false)
  const [notifications, setNotifications] = useState([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const containerRef = useRef(null)

  const loadNotifications = useCallback(async () => {
    if (!userId) return
    const { data, error } = await supabase
      .from('notifications')
      .select('id, type, message, read, created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(NOTIFICATION_LIMIT)

    if (error) {
      setError(error.message)
      return
    }
    setNotifications(data ?? [])
  }, [userId])

  const loadUnreadCount = useCallback(async () => {
    if (!userId) return
    const { count, error } = await supabase
      .from('notifications')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('read', false)

    if (error) {
      setError(error.message)
      return
    }
    setUnreadCount(count ?? 0)
  }, [userId])

  useEffect(() => {
    if (!userId) return

    setLoading(true)
    Promise.all([loadNotifications(), loadUnreadCount()]).finally(() => setLoading(false))

    const channel = supabase
      .channel(`notifications-${userId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${userId}` },
        () => {
          loadNotifications()
          loadUnreadCount()
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [userId, loadNotifications, loadUnreadCount])

  // Close the dropdown on outside click.
  useEffect(() => {
    if (!open) return

    function handleClick(e) {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setOpen(false)
      }
    }

    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [open])

  async function handleMarkRead(notification) {
    if (notification.read) return

    setNotifications((prev) => prev.map((n) => (n.id === notification.id ? { ...n, read: true } : n)))
    setUnreadCount((prev) => Math.max(0, prev - 1))

    const { error } = await supabase.from('notifications').update({ read: true }).eq('id', notification.id)
    if (error) setError(error.message)
  }

  async function handleMarkAllRead() {
    if (!userId || unreadCount === 0) return

    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })))
    setUnreadCount(0)

    const { error } = await supabase
      .from('notifications')
      .update({ read: true })
      .eq('user_id', userId)
      .eq('read', false)
    if (error) setError(error.message)
  }

  if (!userId) return null

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="relative rounded-md p-2 text-gray-500 hover:bg-gray-100 hover:text-gray-900"
        aria-label="Notifications"
      >
        <BellIcon />
        {unreadCount > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-medium text-white">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full z-50 mt-2 w-80 rounded-lg border border-gray-200 bg-white shadow-lg">
          <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
            <h2 className="text-sm font-semibold text-gray-900">Notifications</h2>
            <button
              type="button"
              onClick={handleMarkAllRead}
              disabled={unreadCount === 0}
              className="text-xs font-medium text-gray-500 hover:text-gray-900 disabled:opacity-40"
            >
              Mark all read
            </button>
          </div>

          {error && <p className="px-4 py-2 text-xs text-red-600">{error}</p>}

          <div className="max-h-96 overflow-y-auto">
            {loading ? (
              <p className="px-4 py-6 text-center text-sm text-gray-500">Loading...</p>
            ) : notifications.length === 0 ? (
              <p className="px-4 py-6 text-center text-sm text-gray-500">No notifications yet</p>
            ) : (
              <ul className="divide-y divide-gray-100">
                {notifications.map((n) => (
                  <li key={n.id}>
                    <button
                      type="button"
                      onClick={() => handleMarkRead(n)}
                      className="flex w-full items-start gap-2 px-4 py-3 text-left hover:bg-gray-50"
                    >
                      {!n.read && <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-blue-600" />}
                      <div className={n.read ? 'ml-4' : ''}>
                        <p className={`text-sm ${n.read ? 'text-gray-600' : 'font-semibold text-gray-900'}`}>
                          {n.message}
                        </p>
                        <p className="mt-0.5 text-xs text-gray-400">{formatTimeAgo(n.created_at)}</p>
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
