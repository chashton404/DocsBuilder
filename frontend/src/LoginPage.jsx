/**
 * Email / password login (session cookie). Optional register when allowed by server.
 */

import { useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { apiFetch } from './api.js'

export default function LoginPage({ onLoggedIn }) {
  const navigate = useNavigate()
  const location = useLocation()
  const from =
    typeof location.state?.from === 'string'
      ? location.state.from
      : '/projects'

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [registerEmail, setRegisterEmail] = useState('')
  const [registerPassword, setRegisterPassword] = useState('')
  const [mode, setMode] = useState('login')
  const [registrationAllowed, setRegistrationAllowed] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let cancelled = false
    void apiFetch('/api/auth/status')
      .then((r) => r.json())
      .then((d) => {
        if (!cancelled && d.registration_allowed) {
          setRegistrationAllowed(true)
        }
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [])

  async function submitLogin(e) {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      const r = await apiFetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      })
      const d = await r.json()
      if (!r.ok) {
        throw new Error(d.error || 'Login failed.')
      }
      if (!d.user) {
        throw new Error('Unexpected server response.')
      }
      onLoggedIn(d.user)
      navigate(from, { replace: true })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed.')
    } finally {
      setBusy(false)
    }
  }

  async function submitRegister(e) {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      const r = await apiFetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: registerEmail,
          password: registerPassword,
        }),
      })
      const d = await r.json()
      if (!r.ok) {
        throw new Error(d.error || 'Registration failed.')
      }
      if (!d.user) {
        throw new Error('Unexpected server response.')
      }
      onLoggedIn(d.user)
      navigate(from, { replace: true })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Registration failed.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="app-shell login-screen">
      <header className="wizard-header">
        <h1>DocsBuilder</h1>
        <p className="wizard-sub">Sign in to manage projects.</p>
      </header>

      {error ? (
        <div className="app-banner error" role="alert">
          {error}
        </div>
      ) : null}

      {registrationAllowed ? (
        <div className="login-tabs" role="tablist">
          <button
            type="button"
            className={`login-tab${mode === 'login' ? ' login-tab--active' : ''}`}
            role="tab"
            aria-selected={mode === 'login'}
            onClick={() => setMode('login')}
          >
            Sign in
          </button>
          <button
            type="button"
            className={`login-tab${mode === 'register' ? ' login-tab--active' : ''}`}
            role="tab"
            aria-selected={mode === 'register'}
            onClick={() => setMode('register')}
          >
            Register
          </button>
        </div>
      ) : null}

      {mode === 'login' ? (
        <form className="login-form" onSubmit={(e) => void submitLogin(e)}>
          <label className="projects-label">
            Email
            <input
              className="projects-input"
              type="email"
              autoComplete="username"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </label>
          <label className="projects-label">
            Password
            <input
              className="projects-input"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </label>
          <button
            type="submit"
            className="projects-btn-primary login-submit"
            disabled={busy}
          >
            {busy ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
      ) : (
        <form className="login-form" onSubmit={(e) => void submitRegister(e)}>
          <label className="projects-label">
            Email
            <input
              className="projects-input"
              type="email"
              autoComplete="username"
              value={registerEmail}
              onChange={(e) => setRegisterEmail(e.target.value)}
              required
            />
          </label>
          <label className="projects-label">
            Password (min 8 characters)
            <input
              className="projects-input"
              type="password"
              autoComplete="new-password"
              value={registerPassword}
              onChange={(e) => setRegisterPassword(e.target.value)}
              minLength={8}
              required
            />
          </label>
          <button
            type="submit"
            className="projects-btn-primary login-submit"
            disabled={busy}
          >
            {busy ? 'Creating account…' : 'Create account'}
          </button>
        </form>
      )}
    </div>
  )
}
