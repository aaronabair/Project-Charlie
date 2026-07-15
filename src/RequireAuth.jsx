import { useAuth } from './AuthContext'
import Login from './Login'

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

  return children
}
