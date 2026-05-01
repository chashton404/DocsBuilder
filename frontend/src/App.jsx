/**
 * Top-level routes: login → projects list → wizard → editor.
 */

import { useEffect, useState } from 'react'
import {
  BrowserRouter,
  Navigate,
  Route,
  Routes,
  useLocation,
  useNavigate,
} from 'react-router-dom'
import { apiFetch } from './api.js'
import LoginPage from './LoginPage.jsx'
import ProjectEditor from './ProjectEditor.jsx'
import ProjectsPage from './ProjectsPage.jsx'
import ProjectWizard from './ProjectWizard.jsx'

function RedirectToLogin() {
  const loc = useLocation()
  return (
    <Navigate
      to="/login"
      replace
      state={{ from: `${loc.pathname}${loc.search}` }}
    />
  )
}

function AuthenticatedRoutes({ user, onLogout }) {
  const navigate = useNavigate()

  async function handleLogout() {
    try {
      await apiFetch('/api/auth/logout', { method: 'POST' })
    } catch {
      /* still clear client session expectation */
    }
    onLogout()
    navigate('/login', { replace: true })
  }

  return (
    <Routes>
      <Route path="/" element={<Navigate to="/projects" replace />} />
      <Route
        path="/projects"
        element={<ProjectsPage user={user} onLogout={handleLogout} />}
      />
      <Route path="/projects/:projectId/wizard" element={<ProjectWizard />} />
      <Route path="/projects/:projectId" element={<ProjectEditor />} />
      <Route path="*" element={<Navigate to="/projects" replace />} />
    </Routes>
  )
}

export default function App() {
  const [session, setSession] = useState({
    loading: true,
    user: null,
  })

  useEffect(() => {
    let cancelled = false
    void apiFetch('/api/auth/me')
      .then((r) => r.json())
      .then((d) => {
        if (!cancelled) {
          setSession({ loading: false, user: d.user ?? null })
        }
      })
      .catch(() => {
        if (!cancelled) {
          setSession({ loading: false, user: null })
        }
      })
    return () => {
      cancelled = true
    }
  }, [])

  if (session.loading) {
    return (
      <div className="app-shell app-shell--loading">
        <p className="app-loading-msg">Loading…</p>
      </div>
    )
  }

  return (
    <BrowserRouter>
      <Routes>
        <Route
          path="/login"
          element={
            session.user ? (
              <Navigate to="/projects" replace />
            ) : (
              <LoginPage
                onLoggedIn={(user) =>
                  setSession({ loading: false, user })}
              />
            )
          }
        />
        <Route
          path="/*"
          element={
            session.user ? (
              <AuthenticatedRoutes
                user={session.user}
                onLogout={() => setSession({ loading: false, user: null })}
              />
            ) : (
              <RedirectToLogin />
            )
          }
        />
      </Routes>
    </BrowserRouter>
  )
}
