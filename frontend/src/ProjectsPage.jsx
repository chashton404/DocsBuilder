/**
 * Overleaf-style projects dashboard (sidebar + searchable table).
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { apiFetch } from './api.js'

function relativeTime(iso) {
  if (!iso) {
    return '—'
  }
  const then = new Date(iso).getTime()
  if (Number.isNaN(then)) {
    return '—'
  }
  const s = Math.floor((Date.now() - then) / 1000)
  if (s < 45) {
    return 'just now'
  }
  if (s < 3600) {
    return `${Math.floor(s / 60)} min ago`
  }
  if (s < 86400) {
    return `${Math.floor(s / 3600)} hour${Math.floor(s / 3600) === 1 ? '' : 's'} ago`
  }
  if (s < 604800) {
    return `${Math.floor(s / 86400)} day${Math.floor(s / 86400) === 1 ? '' : 's'} ago`
  }
  return new Date(iso).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

function IconCopy() {
  return (
    <svg width={18} height={18} viewBox="0 0 24 24" aria-hidden fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round">
      <rect x={9} y={9} width={13} height={13} rx={2} ry={2} />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  )
}

function IconDownload() {
  return (
    <svg width={18} height={18} viewBox="0 0 24 24" aria-hidden fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3" />
    </svg>
  )
}

function IconArchive() {
  return (
    <svg width={18} height={18} viewBox="0 0 24 24" aria-hidden fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round">
      <polyline points="21 8 21 21 3 21 3 8" />
      <rect x={1} y={3} width={22} height={5} rx={1} />
      <line x1={10} y1={12} x2={14} y2={12} />
    </svg>
  )
}

function IconOpen() {
  return (
    <svg width={18} height={18} viewBox="0 0 24 24" aria-hidden fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1={16} y1={13} x2={8} y2={13} />
      <line x1={16} y1={17} x2={8} y2={17} />
      <polyline points="10 9 9 9 8 9" />
    </svg>
  )
}

function IconTrash() {
  return (
    <svg width={18} height={18} viewBox="0 0 24 24" aria-hidden fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round">
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
      <line x1={10} y1={11} x2={10} y2={17} />
      <line x1={14} y1={11} x2={14} y2={17} />
    </svg>
  )
}

function IconSearch() {
  return (
    <svg width={18} height={18} viewBox="0 0 24 24" aria-hidden fill="none" stroke="currentColor" strokeWidth={1.85} strokeLinecap="round" strokeLinejoin="round">
      <circle cx={11} cy={11} r={8} />
      <line x1={21} y1={21} x2={16.65} y2={16.65} />
    </svg>
  )
}

async function fetchProjectsFromApi() {
  const r = await apiFetch('/api/projects')
  const d = await r.json()
  if (!r.ok) {
    throw new Error(d.error || 'Failed to load projects.')
  }
  return Array.isArray(d.projects) ? d.projects : []
}

export default function ProjectsPage({ user, onLogout }) {
  const navigate = useNavigate()
  const [projects, setProjects] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [modalOpen, setModalOpen] = useState(false)
  const [newName, setNewName] = useState('')
  const [creating, setCreating] = useState(false)
  const [sidebarNav, setSidebarNav] = useState('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [sortTitleAsc, setSortTitleAsc] = useState(true)
  const [selectedIds, setSelectedIds] = useState(() => new Set())
  const selectAllRef = useRef(null)

  const reloadProjects = useCallback(async () => {
    setError('')
    try {
      const list = await fetchProjectsFromApi()
      setProjects(list)
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Failed to load projects.',
      )
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    async function mountLoad() {
      setLoading(true)
      setError('')
      try {
        const list = await fetchProjectsFromApi()
        if (!cancelled) {
          setProjects(list)
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
    void mountLoad()
    return () => {
      cancelled = true
    }
  }, [])

  const visibleProjects = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    let rows = projects
    if (sidebarNav === 'yours') {
      rows = rows.filter((p) => p.role === 'owner')
    }
    if (q) {
      rows = rows.filter((p) => p.name.toLowerCase().includes(q))
    }
    rows = [...rows].sort((a, b) => {
      const cmp = a.name.localeCompare(b.name, undefined, {
        sensitivity: 'case',
      })
      return sortTitleAsc ? cmp : -cmp
    })
    return rows
  }, [projects, searchQuery, sidebarNav, sortTitleAsc])

  const allFilteredSelected =
    visibleProjects.length > 0
    && visibleProjects.every((p) => selectedIds.has(p.id))

  const someFilteredSelected =
    visibleProjects.some((p) => selectedIds.has(p.id))

  useEffect(() => {
    const el = selectAllRef.current
    if (el) {
      el.indeterminate = someFilteredSelected && !allFilteredSelected
    }
  }, [someFilteredSelected, allFilteredSelected])

  function toggleSelect(id) {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }

  function toggleSelectAllFiltered() {
    if (allFilteredSelected) {
      setSelectedIds((prev) => {
        const next = new Set(prev)
        visibleProjects.forEach((p) => next.delete(p.id))
        return next
      })
    } else {
      setSelectedIds((prev) => {
        const next = new Set(prev)
        visibleProjects.forEach((p) => next.add(p.id))
        return next
      })
    }
  }

  async function handleCreate(e) {
    e.preventDefault()
    if (!newName.trim()) {
      return
    }
    setCreating(true)
    setError('')
    try {
      const r = await apiFetch('/api/projects', {
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

  async function handleDelete(id, name) {
    if (!confirm(`Delete project "${name}"? This cannot be undone.`)) {
      return
    }
    try {
      const r = await apiFetch(`/api/projects/${id}`, { method: 'DELETE' })
      if (!r.ok) {
        const d = await r.json()
        throw new Error(d.error || 'Delete failed.')
      }
      setProjects((prev) => prev.filter((p) => p.id !== id))
      setSelectedIds((prev) => {
        const next = new Set(prev)
        next.delete(id)
        return next
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Delete failed.')
    }
  }

  async function handleBulkDelete() {
    const ids = [...selectedIds]
    if (
      ids.length === 0
      || !confirm(`Delete ${ids.length} project(s)? This cannot be undone.`)
    ) {
      return
    }
    try {
      for (const id of ids) {
        const r = await apiFetch(`/api/projects/${id}`, { method: 'DELETE' })
        if (!r.ok) {
          const d = await r.json()
          throw new Error(d.error || `Delete failed for ${id}.`)
        }
      }
      const removed = new Set(ids)
      setProjects((prev) => prev.filter((p) => !removed.has(p.id)))
      setSelectedIds(new Set())
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Delete failed.')
      void reloadProjects()
    }
  }

  async function duplicateProject(id, ev) {
    ev.stopPropagation()
    setError('')
    try {
      const r = await apiFetch(`/api/projects/${id}/duplicate`, {
        method: 'POST',
      })
      const raw = await r.text()
      let d
      try {
        d = JSON.parse(raw)
      } catch {
        throw new Error('Duplicate failed (invalid response).')
      }
      if (!r.ok) {
        throw new Error(
          typeof d.error === 'string' ? d.error : 'Duplicate failed.',
        )
      }
      await reloadProjects()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Duplicate failed.')
    }
  }

  function downloadProject(id, ev) {
    ev.stopPropagation()
    const a = document.createElement('a')
    a.href = `/api/projects/${id}/download`
    a.rel = 'noopener'
    document.body.appendChild(a)
    a.click()
    a.remove()
  }

  function openProject(p) {
    if (!p.wizard_completed) {
      navigate(`/projects/${p.id}/wizard`)
    } else {
      navigate(`/projects/${p.id}`)
    }
  }

  const mainHeading =
    sidebarNav === 'yours' ? 'Your projects' : 'All projects'

  return (
    <div className="ol-dash-root">
      <aside className="ol-dash-sidebar" aria-label="Projects navigation">
        <div className="ol-dash-brand">DocsBuilder</div>
        <button
          type="button"
          className="ol-dash-new-project"
          onClick={() => setModalOpen(true)}
        >
          New project
        </button>
        <nav className="ol-dash-nav" aria-label="Views">
          <button
            type="button"
            className={`ol-dash-nav-item${sidebarNav === 'all' ? ' ol-dash-nav-item--active' : ''}`}
            onClick={() => setSidebarNav('all')}
          >
            All projects
          </button>
          <button
            type="button"
            className={`ol-dash-nav-item${sidebarNav === 'yours' ? ' ol-dash-nav-item--active' : ''}`}
            onClick={() => setSidebarNav('yours')}
          >
            Your projects
          </button>
        </nav>
        <div className="ol-dash-tags-block">
          <div className="ol-dash-tags-label">ORGANIZE TAGS</div>
          <button
            type="button"
            className="ol-dash-tag-new"
            disabled
            title="Tags are not available yet."
          >
            + New tag
          </button>
        </div>
        <button
          type="button"
          className="ol-dash-sign-out"
          onClick={() => void onLogout()}
        >
          Sign out
          {user?.email ? (
            <span className="visually-hidden">{` (${user.email})`}</span>
          ) : null}
        </button>
        <div className="ol-dash-sidebar-spacer" />
      </aside>

      <main className="ol-dash-main">
        <header className="ol-dash-main-header">
          <h1 className="ol-dash-main-title">{mainHeading}</h1>
        </header>

        {error ? (
          <div className="ol-dash-banner error" role="alert">
            {error}
          </div>
        ) : null}

        <div className="ol-dash-search-wrap">
          <span className="ol-dash-search-icon" aria-hidden>
            <IconSearch />
          </span>
          <input
            type="search"
            className="ol-dash-search-input"
            placeholder="Search in all projects..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            aria-label="Search projects"
          />
        </div>

        {selectedIds.size > 0 ? (
          <div className="ol-dash-selection-bar">
            <span>{selectedIds.size} selected</span>
            <button
              type="button"
              className="ol-dash-selection-delete"
              onClick={() => void handleBulkDelete()}
            >
              Delete
            </button>
          </div>
        ) : null}

        <div className="ol-dash-table-scroll">
          {loading ? (
            <p className="ol-dash-muted ol-dash-loading">Loading projects…</p>
          ) : null}
          {!loading && visibleProjects.length === 0 ? (
            <p className="ol-dash-muted ol-dash-empty">
              {projects.length === 0
                ? 'No projects yet. Use New project to create one.'
                : 'No projects match your search.'}
            </p>
          ) : null}
          {!loading && visibleProjects.length > 0 ? (
            <table className="ol-dash-table">
              <thead>
                <tr>
                  <th className="ol-dash-th-check" scope="col">
                    <input
                      ref={selectAllRef}
                      type="checkbox"
                      className="ol-dash-checkbox"
                      checked={allFilteredSelected}
                      onChange={toggleSelectAllFiltered}
                      aria-label="Select all visible projects"
                    />
                  </th>
                  <th className="ol-dash-th-title" scope="col">
                    <button
                      type="button"
                      className="ol-dash-sort-trigger"
                      onClick={() => setSortTitleAsc((v) => !v)}
                    >
                      Title
                      <span className="ol-dash-sort-arrow" aria-hidden>
                        {sortTitleAsc ? '↑' : '↓'}
                      </span>
                    </button>
                  </th>
                  <th className="ol-dash-th-owner" scope="col">
                    Owner
                  </th>
                  <th className="ol-dash-th-modified" scope="col">
                    Last modified
                  </th>
                  <th className="ol-dash-th-actions" scope="col">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {visibleProjects.map((p) => (
                  <tr
                    key={p.id}
                    className="ol-dash-row"
                    onClick={() => openProject(p)}
                  >
                    <td className="ol-dash-td-check">
                      <input
                        type="checkbox"
                        className="ol-dash-checkbox"
                        checked={selectedIds.has(p.id)}
                        onChange={(e) => {
                          e.stopPropagation()
                          toggleSelect(p.id)
                        }}
                        onClick={(e) => e.stopPropagation()}
                        aria-label={`Select ${p.name}`}
                      />
                    </td>
                    <td className="ol-dash-td-title">
                      <button
                        type="button"
                        className="ol-dash-title-link"
                        onClick={(e) => {
                          e.stopPropagation()
                          openProject(p)
                        }}
                      >
                        {p.name}
                      </button>
                      {!p.wizard_completed ? (
                        <span className="ol-dash-badge">Setup</span>
                      ) : null}
                    </td>
                    <td className="ol-dash-td-owner">
                      {p.owner_email === user?.email
                        ? 'You'
                        : (p.owner_email ?? '—')}
                    </td>
                    <td className="ol-dash-td-modified">
                      {relativeTime(p.updated_at)}{' '}
                      <span className="ol-dash-by">{p.role ?? '—'}</span>
                    </td>
                    <td className="ol-dash-td-actions">
                      <div className="ol-dash-actions">
                        <button
                          type="button"
                          className="ol-dash-action"
                          title="Duplicate project"
                          aria-label={`Duplicate ${p.name}`}
                          onClick={(e) => void duplicateProject(p.id, e)}
                        >
                          <IconCopy />
                        </button>
                        <button
                          type="button"
                          className="ol-dash-action"
                          title="Download ZIP"
                          aria-label={`Download ${p.name}`}
                          onClick={(e) => downloadProject(p.id, e)}
                        >
                          <IconDownload />
                        </button>
                        <button
                          type="button"
                          className="ol-dash-action ol-dash-action--disabled"
                          disabled
                          title="Archive (coming soon)"
                          aria-label="Archive unavailable"
                        >
                          <IconArchive />
                        </button>
                        <button
                          type="button"
                          className="ol-dash-action"
                          title="Open in editor"
                          aria-label={`Open ${p.name}`}
                          onClick={(e) => {
                            e.stopPropagation()
                            openProject(p)
                          }}
                        >
                          <IconOpen />
                        </button>
                        <button
                          type="button"
                          className="ol-dash-action ol-dash-action--danger"
                          title="Delete project"
                          aria-label={`Delete ${p.name}`}
                          onClick={(e) => {
                            e.stopPropagation()
                            void handleDelete(p.id, p.name)
                          }}
                        >
                          <IconTrash />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : null}
        </div>
      </main>

      {modalOpen ? (
        <div
          className="projects-modal-overlay"
          role="dialog"
          aria-modal="true"
          aria-labelledby="projects-modal-title"
        >
          <form className="projects-modal ol-dash-modal" onSubmit={handleCreate}>
            <h2 id="projects-modal-title">New project</h2>
            <p className="projects-modal-hint">
              Titles are unique per account (case-sensitive): <code>Foo</code>{' '}
              and <code>foo</code> can both exist for you.
            </p>
            <label className="projects-label">
              Title
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
