import { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from './supabaseClient'

const AuthContext = createContext(undefined)

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null)
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      if (!session) setLoading(false)
    })

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
      if (!session) {
        setProfile(null)
        setLoading(false)
      }
    })

    return () => subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (!session) return

    let cancelled = false
    setLoading(true)

    supabase
      .from('profiles')
      .select('id, full_name, role, account_status, email')
      .eq('id', session.user.id)
      .single()
      .then(({ data, error }) => {
        if (cancelled) return
        if (error) console.error('Failed to load profile:', error)
        setProfile(data ?? null)
        setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [session])

  // Watch our own profile row live: an admin revoking access mid-session should
  // sign the user out immediately, not just block them on their next load. An
  // approval or role change should also flip the UI live, without a refresh.
  useEffect(() => {
    const userId = session?.user?.id
    if (!userId || !profile) return

    const channel = supabase
      .channel(`profile-watch-${userId}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'profiles', filter: `id=eq.${userId}` },
        (payload) => {
          if (payload.new.account_status === 'revoked') {
            supabase.auth.signOut()
            return
          }
          setProfile(payload.new)
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
    // Intentionally excludes `profile` so realtime updates don't tear down and
    // resubscribe the channel on every change — only (re)subscribe once loaded.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.user?.id, Boolean(profile)])

  const signOut = () => supabase.auth.signOut()

  const value = { session, profile, loading, signOut }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}
