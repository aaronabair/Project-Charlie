import { Suspense, lazy, useEffect, useState } from 'react'
import { BrowserRouter, Routes, Route, Link } from 'react-router-dom'
import { supabase } from './supabaseClient'
import { AuthProvider, useAuth } from './AuthContext'
import RequireAuth from './RequireAuth'
import Dashboard from './Dashboard'
import MainView from './MainView'
import MyWorkspace from './MyWorkspace'
import Notifications from './Notifications'
import { usePendingExceptionCount } from './exceptionRequests'

// Pulls in the (large) xlsx parser — code-split so inspectors/data viewers
// never download it, since only admin/data_master can reach this page.
const DataUpload = lazy(() => import('./DataUpload'))
const DataAdmin = lazy(() => import('./DataAdmin'))
const Reports = lazy(() => import('./Reports'))
const UserManagement = lazy(() => import('./UserManagement'))
const Exceptions = lazy(() => import('./Exceptions'))

function RefreshIcon() {
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
      <path d="M21 12a9 9 0 1 1-3-6.7" />
      <path d="M21 3v6h-6" />
    </svg>
  )
}

function Nav() {
  const { profile, signOut } = useAuth()
  const canManage = profile?.role === 'admin' || profile?.role === 'data_master'
  const isAdmin = profile?.role === 'admin'
  const pendingExceptionCount = usePendingExceptionCount(isAdmin)

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
          <>
            <Link to="/user-management" className="font-medium text-gray-700 hover:text-gray-900">User Management</Link>
            <Link to="/exceptions" className="relative font-medium text-gray-700 hover:text-gray-900">
              Exceptions
              {pendingExceptionCount > 0 && (
                <span className="absolute -right-3 -top-2 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-medium text-white">
                  {pendingExceptionCount > 99 ? '99+' : pendingExceptionCount}
                </span>
              )}
            </Link>
          </>
        )}
      </div>
      <div className="flex items-center gap-4 text-sm">
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="rounded-md p-2 text-gray-500 hover:bg-gray-100 hover:text-gray-900"
          aria-label="Refresh"
          title="Refresh"
        >
          <RefreshIcon />
        </button>
        <Notifications />
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
            <Route
              path="/exceptions"
              element={
                <Suspense fallback={<div className="p-8 text-sm text-gray-500">Loading...</div>}>
                  <Exceptions />
                </Suspense>
              }
            />
          </Routes>
        </RequireAuth>
      </AuthProvider>
    </BrowserRouter>
  )
}