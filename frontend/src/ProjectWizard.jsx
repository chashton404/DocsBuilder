/**
 * Minimal setup: Sphinx HTML theme (optional) or skip → editor.
 */

import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'

export default function ProjectWizard() {
  const { projectId } = useParams()
  const navigate = useNavigate()
  const api = `/api/projects/${projectId}`
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [projectName, setProjectName] = useState('')
  const [themes, setThemes] = useState([])
  const [currentTheme, setCurrentTheme] = useState('')
  const [themesLoading, setThemesLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    async function load() {
      const mr = await fetch(`/api/projects/${projectId}`)
      if (!mr.ok) {
        navigate('/projects', { replace: true })
        return
      }
      const meta = await mr.json()
      if (cancelled) {
        return
      }
      setProjectName(typeof meta.name === 'string' ? meta.name : '')
      if (meta.wizard_completed) {
        navigate(`/projects/${projectId}`, { replace: true })
        return
      }
      setLoading(false)
      const tr = await fetch(`${api}/workspace/themes`)
      const tp = await tr.json()
      if (!cancelled && tr.ok) {
        setThemes(Array.isArray(tp.themes) ? tp.themes : [])
        setCurrentTheme(typeof tp.current === 'string' ? tp.current : '')
      }
      setThemesLoading(false)
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [projectId, navigate, api])

  async function applyTheme(themeId) {
    setError('')
    try {
      const r = await fetch(`${api}/workspace/theme`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ theme: themeId }),
      })
      const p = await r.json()
      if (!r.ok) {
        throw new Error(p.error || 'Could not set theme.')
      }
      setCurrentTheme(p.theme)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not set theme.')
    }
  }

  async function finish(skipThemeWrite) {
    setError('')
    try {
      if (!skipThemeWrite && currentTheme) {
        await fetch(`${api}/workspace/theme`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ theme: currentTheme }),
        })
      }
      const pr = await fetch(`/api/projects/${projectId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ wizard_completed: true }),
      })
      if (!pr.ok) {
        const pe = await pr.json()
        throw new Error(pe.error || 'Could not finish setup.')
      }
      navigate(`/projects/${projectId}`, { replace: true })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not finish setup.')
    }
  }

  if (loading) {
    return (
      <div className="app-shell app-shell--loading">
        <p className="app-loading-msg">Loading…</p>
      </div>
    )
  }

  return (
    <div className="app-shell wizard-screen">
      <header className="wizard-header">
        <h1>Set up project</h1>
        <p className="wizard-sub">{projectName}</p>
      </header>

      {error ? (
        <div className="app-banner error" role="alert">
          {error}
        </div>
      ) : null}

      <section className="wizard-section">
        <h2 className="wizard-section-title">HTML theme</h2>
        <p className="wizard-hint">
          Choose how Sphinx previews look. You can change this later under
          Settings in the editor.
        </p>
        {themesLoading ? (
          <p className="projects-muted">Loading themes…</p>
        ) : (
          <ul className="wizard-theme-list">
            {themes.map((t) => (
              <li key={t.id}>
                <label className="wizard-theme-label">
                  <input
                    type="radio"
                    name="wiz-theme"
                    value={t.id}
                    checked={currentTheme === t.id}
                    onChange={() => void applyTheme(t.id)}
                  />
                  <span>{t.label}</span>
                </label>
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="wizard-actions">
        <button
          type="button"
          className="projects-btn-secondary"
          onClick={() => void finish(true)}
        >
          Skip
        </button>
        <button
          type="button"
          className="projects-btn-primary"
          onClick={() => void finish(false)}
        >
          Continue to editor
        </button>
      </div>
    </div>
  )
}
