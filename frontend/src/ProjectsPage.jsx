/**
 * Lists projects; create (unique name, case-sensitive) → wizard.
 */

import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import './App.css'

export default function ProjectsPage() {
  const navigate = useNavigate()
  const [projects, setProjects] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [modalOpen, setModalOpen] = useState(false)
  const [newName, setNewName] = useState('')
  const [creating, setCreating] = useState(false)

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      setError('')
      try {
        const r = await fetch('/api/projects')
        const d = await r.json()
        if (!r.ok) {
          throw new Error(d.error || 'Failed to load projects.')
        }
        if (!cancelled) {
          setProjects(Array.isArray(d.projects) ? d.projects : [])
        }
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error ? err.message : 'Failed to load projects.',
          )
        }
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [])

  async function handleCreate(e) {
    e.preventDefault()
    if (!newName.trim()) {
      return
    }
    setCreating(true)
    setError('')
    try {
      const r = await fetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newName.trim() }),
      })
      const raw = await r.text()
      let d
      try {
        d = JSON.parse(raw)
      } catch {
        throw new Error(
          r.status === 413
            ? 'Upload too large for the server (e.g. big .ipynb).'
            : 'Server did not return JSON (check the API or proxy).',
        )
      }
      if (!r.ok) {
        throw new Error(d.error || 'Could not create project.')
      }
      if (typeof d.id !== 'string' || !d.id) {
        throw new Error('Server did not return a project id.')
      }
      setModalOpen(false)
      setNewName('')
      navigate(`/projects/${d.id}/wizard`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create project.')
    } finally {
      setCreating(false)
    }
  }

  async function handleDelete(id, name, ev) {
    ev.preventDefault()
    ev.stopPropagation()
    if (
      !confirm(`Delete project "${name}"? This cannot be undone.`)
    ) {
      return
    }
    try {
      const r = await fetch(`/api/projects/${id}`, { method: 'DELETE' })
      if (!r.ok) {
        const d = await r.json()
        throw new Error(d.error || 'Delete failed.')
      }
      setProjects((prev) => prev.filter((p) => p.id !== id))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Delete failed.')
    }
  }

  function openProject(p) {
    if (!p.wizard_completed) {
      navigate(`/projects/${p.id}/wizard`)
    } else {
      navigate(`/projects/${p.id}`)
    }
  }

  return (
    <div className="app-shell projects-screen">
      <header className="projects-header">
        <div>
          <h1 className="projects-title">DocsBuilder</h1>
          <p className="projects-tagline">Sphinx preview · projects</p>
        </div>
        <button
          type="button"
          className="projects-add-btn"
          onClick={() => setModalOpen(true)}
        >
          Add project
        </button>
      </header>

      {error ? (
        <div className="app-banner error" role="alert">
          {error}
        </div>
      ) : null}

      {loading ? <p className="projects-muted">Loading…</p> : null}

      {!loading && projects.length === 0 ? (
        <p className="projects-empty">
          No projects yet. Create one to get started.
        </p>
      ) : null}

      <ul className="projects-list">
        {projects.map((p) => (
          <li key={p.id} className="projects-row-wrap">
            <button
              type="button"
              className="projects-row-main"
              onClick={() => openProject(p)}
            >
              <span className="projects-row-name">{p.name}</span>
              {!p.wizard_completed ? (
                <span className="projects-row-meta">Setup pending</span>
              ) : null}
            </button>
            <button
              type="button"
              className="projects-delete-btn"
              onClick={(ev) => void handleDelete(p.id, p.name, ev)}
            >
              Delete
            </button>
          </li>
        ))}
      </ul>

      {modalOpen ? (
        <div
          className="projects-modal-overlay"
          role="dialog"
          aria-modal="true"
          aria-labelledby="projects-modal-title"
        >
          <form className="projects-modal" onSubmit={handleCreate}>
            <h2 id="projects-modal-title">New project</h2>
            <p className="projects-modal-hint">
              Names are unique (case-sensitive): <code>Foo</code> and{' '}
              <code>foo</code> can both exist.
            </p>
            <label className="projects-label">
              Name
              <input
                className="projects-input"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                autoFocus
                required
              />
            </label>
            <div className="projects-modal-actions">
              <button
                type="button"
                className="projects-btn-secondary"
                onClick={() => setModalOpen(false)}
              >
                Cancel
              </button>
              <button type="submit" className="projects-btn-primary" disabled={creating}>
                {creating ? 'Creating…' : 'Create'}
              </button>
            </div>
          </form>
        </div>
      ) : null}
    </div>
  )
}
