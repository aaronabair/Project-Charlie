import { useAuth } from './AuthContext'
import Login from './Login'

function StatusScreen({ message }) {
  const { signOut } = useAuth()

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-gray-50 px-4 text-center">
      <p className="text-sm text-gray-700">{message}</p>
      <button
        type="button"
        onClick={signOut}
        className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50"
      >
        Sign out
      </button>
    </div>
  )
}

export default function RequireAuth({ children }) {
  const { session, profile, loading } = useAuth()

  if (!session) {
    return <Login />
  }

  if (loading || !profile) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <p className="text-sm text-gray-500">Loading your profile...</p>
      </div>
    )
  }

  if (profile.account_status !== 'active') {
    const message =
      profile.account_status === 'revoked'
        ? 'Your access has been revoked. Contact your admin.'
        : 'Your account is awaiting admin approval.'
    return <StatusScreen message={message} />
  }

  return children
}
