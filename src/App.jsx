import { Suspense, lazy, useEffect, useState } from 'react'
import { BrowserRouter, Routes, Route, Link } from 'react-router-dom'
import { supabase } from './supabaseClient'
import { AuthProvider, useAuth } from './AuthContext'
import RequireAuth from './RequireAuth'
import Dashboard from './Dashboard'
import MainView from './MainView'
import MyWorkspace from './MyWorkspace'

// Pulls in the (large) xlsx parser — code-split so inspectors/data viewers
// never download it, since only admin/data_master can reach this page.
const DataUpload = lazy(() => import('./DataUpload'))
const DataAdmin = lazy(() => import('./DataAdmin'))
const Reports = lazy(() => import('./Reports'))
const UserManagement = lazy(() => import('./UserManagement'))

function Nav() {
  const { profile, signOut } = useAuth()
  const canManage = profile?.role === 'admin' || profile?.role === 'data_master'
  const isAdmin = profile?.role === 'admin'

  return (
    <nav className="flex items-center justify-between border-b border-gray-200 px-8 py-4">
      <div className="flex gap-6">
        <Link to="/" className="font-medium text-gray-700 hover:text-gray-900">Dashboard</Link>
        <Link to="/main-view" className="font-medium text-gray-700 hover:text-gray-900">Main View</Link>
        <Link to="/my-workspace" className="font-medium text-gray-700 hover:text-gray-900">My Workspace</Link>
        {canManage && (
          <>
            <Link to="/data-upload" className="font-medium text-gray-700 hover:text-gray-900">Data Upload</Link>
            <Link to="/data-admin" className="font-medium text-gray-700 hover:text-gray-900">Data Admin</Link>
            <Link to="/reports" className="font-medium text-gray-700 hover:text-gray-900">Reports</Link>
          </>
        )}
        {isAdmin && (
          <Link to="/user-management" className="font-medium text-gray-700 hover:text-gray-900">User Management</Link>
        )}
      </div>
      <div className="flex items-center gap-4 text-sm">
        <span className="text-gray-500">
          {profile?.full_name} <span className="text-gray-400">({profile?.role})</span>
        </span>
        <button onClick={signOut} className="text-gray-500 hover:text-gray-900">
          Sign out
        </button>
      </div>
    </nav>
  )
}

function ConnectionBanner() {
  const [status, setStatus] = useState('checking')

  useEffect(() => {
    supabase
      .from('profiles')
      .select('id', { count: 'exact', head: true })
      .then(({ error }) => setStatus(error ? 'error' : 'connected'))
  }, [])

  if (status === 'connected') return null // don't nag once it's working

  return (
    <div
      className={`px-8 py-2 text-sm ${
        status === 'error' ? 'bg-red-50 text-red-700' : 'bg-amber-50 text-amber-700'
      }`}
    >
      {status === 'checking'
        ? 'Checking Supabase connection...'
        : 'Could not reach Supabase. Check your .env / Netlify environment variables.'}
    </div>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <RequireAuth>
          <ConnectionBanner />
          <Nav />
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/main-view" element={<MainView />} />
            <Route path="/my-workspace" element={<MyWorkspace />} />
            <Route
              path="/data-upload"
              element={
                <Suspense fallback={<div className="p-8 text-sm text-gray-500">Loading...</div>}>
                  <DataUpload />
                </Suspense>
              }
            />
            <Route
              path="/data-admin"
              element={
                <Suspense fallback={<div className="p-8 text-sm text-gray-500">Loading...</div>}>
                  <DataAdmin />
                </Suspense>
              }
            />
            <Route
              path="/reports"
              element={
                <Suspense fallback={<div className="p-8 text-sm text-gray-500">Loading...</div>}>
                  <Reports />
                </Suspense>
              }
            />
            <Route
              path="/user-management"
              element={
                <Suspense fallback={<div className="p-8 text-sm text-gray-500">Loading...</div>}>
                  <UserManagement />
                </Suspense>
              }
            />
          </Routes>
        </RequireAuth>
      </AuthProvider>
    </BrowserRouter>
  )
}