import { useEffect, useState } from 'react'
import { BrowserRouter, Routes, Route, Link } from 'react-router-dom'
import { supabase } from './supabaseClient'

// Placeholder pages — these get built out in later steps
// (Step 5: Dashboard, Step 6: Main View, Step 7: My Workspace).
// For now they just confirm routing works.

function Dashboard() {
  return <PagePlaceholder title="Dashboard" note="Real-time metrics + activity feed land in Step 5." />
}

function MainView() {
  return <PagePlaceholder title="Main View" note="Read-only inspection table lands in Step 6." />
}

function MyWorkspace() {
  return <PagePlaceholder title="My Workspace" note="Personal filtered view + editable fields land in Step 7." />
}

function PagePlaceholder({ title, note }) {
  return (
    <div className="p-8">
      <h1 className="text-2xl font-semibold text-gray-900">{title}</h1>
      <p className="mt-2 text-gray-500">{note}</p>
    </div>
  )
}

function Nav() {
  return (
    <nav className="flex gap-6 border-b border-gray-200 px-8 py-4">
      <Link to="/" className="font-medium text-gray-700 hover:text-gray-900">Dashboard</Link>
      <Link to="/main-view" className="font-medium text-gray-700 hover:text-gray-900">Main View</Link>
      <Link to="/my-workspace" className="font-medium text-gray-700 hover:text-gray-900">My Workspace</Link>
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
      <ConnectionBanner />
      <Nav />
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/main-view" element={<MainView />} />
        <Route path="/my-workspace" element={<MyWorkspace />} />
      </Routes>
    </BrowserRouter>
  )
}
