/**
 * Main UI shell for Notebook-to-Myst.
 *
 * Layout: header (DocsBuilder + Import / Download) → workspace (sidebar | editor | preview).
 */

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { MarkdownEditor } from './MarkdownEditor'
import './App.css'

function nextId() {
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`
}

const SPLIT_DIVIDER_PX = 12

/** Initial editor vs preview column ratio (`fr` weights). */
const INITIAL_SPLIT_EDITOR_FR = 52

export default function App() {
  const [documents, setDocuments] = useState(() => [
    {
      id: 'welcome',
      name: 'Untitled.md',
      content:
        '# Draft\n\nUse **Import** for Markdown, plain notebook cells, or **.ipynb → MyST** (Jupytext). Open **Recompile** to preview — choose whether code cells execute.',
    },
  ])
  const [activeDocId, setActiveDocId] = useState('welcome')

  const [previewUrl, setPreviewUrl] = useState('')
  const [isImporting, setIsImporting] = useState(false)
  const [isCompiling, setIsCompiling] = useState(false)
  const [error, setError] = useState('')

  const [includeCodeAsFenced, setIncludeCodeAsFenced] = useState(false)

  /** Relative `fr` weight for editor vs preview columns (not literal % after divider px). */
  const [splitPct, setSplitPct] = useState(INITIAL_SPLIT_EDITOR_FR)
  const [splitDragging, setSplitDragging] = useState(false)

  /** Which `.ipynb` import mode applies when the notebook file input fires. */
  const ipynbImportKindRef = useRef('plain')

  const mdInputRef = useRef(null)
  const ipynbInputRef = useRef(null)
  const importWrapRef = useRef(null)
  const recompileWrapRef = useRef(null)
  const splitContainerRef = useRef(null)

  const [importMenuOpen, setImportMenuOpen] = useState(false)
  const [recompileMenuOpen, setRecompileMenuOpen] = useState(false)

  const activeDoc = useMemo(
    () => documents.find((d) => d.id === activeDocId) ?? null,
    [activeDocId, documents],
  )

  const editorValue = activeDoc?.content ?? ''

  const updateActiveContent = useCallback(
    (value) => {
      setDocuments((prev) =>
        prev.map((d) =>
          d.id === activeDocId ? { ...d, content: value } : d,
        ),
      )
    },
    [activeDocId],
  )

  const readMarkdownFileAsText = (file) =>
    new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(String(reader.result ?? ''))
      reader.onerror = () =>
        reject(new Error('Could not read the Markdown file.'))
      reader.readAsText(file)
    })

  const handleImportMarkdownFile = async (file) => {
    if (!file) {
      return
    }
    const lower = file.name.toLowerCase()
    if (!lower.endsWith('.md') && !lower.endsWith('.markdown')) {
      setError('Please choose a .md or .markdown file.')
      return
    }

    setIsImporting(true)
    setError('')
    try {
      const text = await readMarkdownFileAsText(file)
      const id = nextId()
      const base =
        file.name.replace(/\.(md|markdown)$/i, '') || 'document'
      const name = `${base}.md`
      const newDoc = { id, name, content: text }
      setDocuments((prev) => [newDoc, ...prev])
      setActiveDocId(id)
      setPreviewUrl('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Import failed.')
    } finally {
      setIsImporting(false)
    }
  }

  /** Stitch markdown/code cells only (no Jupytext). */
  const handleImportNotebookPlain = async (file) => {
    if (!file) {
      return
    }
    if (!file.name.toLowerCase().endsWith('.ipynb')) {
      setError('Please choose a valid .ipynb notebook file.')
      return
    }

    setIsImporting(true)
    setError('')

    const formData = new FormData()
    formData.append('file', file)
    formData.append(
      'include_code_as_fenced',
      String(includeCodeAsFenced),
    )

    try {
      const response = await fetch('/api/import-notebook', {
        method: 'POST',
        body: formData,
      })
      const payload = await response.json()
      if (!response.ok) {
        throw new Error(payload.error || 'Import failed.')
      }

      const id = nextId()
      const name =
        payload.suggested_filename ||
        `${file.name.replace(/\.ipynb$/i, '')}.md`
      const newDoc = {
        id,
        name,
        content: payload.markdown ?? '',
      }
      setDocuments((prev) => [newDoc, ...prev])
      setActiveDocId(id)
      setPreviewUrl('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Import failed.')
    } finally {
      setIsImporting(false)
    }
  }

  /** Full notebook → MyST via Jupytext (`/api/convert`). */
  const handleConvertNotebookToMyst = async (file) => {
    if (!file) {
      return
    }
    if (!file.name.toLowerCase().endsWith('.ipynb')) {
      setError('Please choose a valid .ipynb notebook file.')
      return
    }

    setIsImporting(true)
    setError('')

    const formData = new FormData()
    formData.append('file', file)

    try {
      const response = await fetch('/api/convert', {
        method: 'POST',
        body: formData,
      })
      const payload = await response.json()
      if (!response.ok) {
        throw new Error(payload.error || 'Conversion failed.')
      }

      const id = nextId()
      const name =
        payload.filename ||
        `${file.name.replace(/\.ipynb$/i, '')}.md`
      const content = payload.content ?? ''
      const newDoc = { id, name, content }
      setDocuments((prev) => [newDoc, ...prev])
      setActiveDocId(id)

      const preview = payload.sphinx_preview_url
      setPreviewUrl(typeof preview === 'string' ? preview : '')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Conversion failed.')
    } finally {
      setIsImporting(false)
    }
  }

  const onIpynbInputChange = (e) => {
    const file = e.target.files?.[0] ?? null
    e.target.value = ''
    const kind = ipynbImportKindRef.current
    if (kind === 'myst') {
      void handleConvertNotebookToMyst(file)
    } else {
      void handleImportNotebookPlain(file)
    }
  }

  useEffect(() => {
    if (!importMenuOpen) {
      return undefined
    }
    const onDocPointerDown = (event) => {
      const wrap = importWrapRef.current
      if (wrap && !wrap.contains(event.target)) {
        setImportMenuOpen(false)
      }
    }
    const onKeyDown = (event) => {
      if (event.key === 'Escape') {
        setImportMenuOpen(false)
      }
    }
    document.addEventListener('pointerdown', onDocPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onDocPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [importMenuOpen])

  useEffect(() => {
    if (!recompileMenuOpen) {
      return undefined
    }
    const onDocPointerDown = (event) => {
      const wrap = recompileWrapRef.current
      if (wrap && !wrap.contains(event.target)) {
        setRecompileMenuOpen(false)
      }
    }
    const onKeyDown = (event) => {
      if (event.key === 'Escape') {
        setRecompileMenuOpen(false)
      }
    }
    document.addEventListener('pointerdown', onDocPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onDocPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [recompileMenuOpen])

  const openMarkdownPicker = () => {
    setImportMenuOpen(false)
    mdInputRef.current?.click()
  }

  const openIpynbPicker = (kind) => {
    ipynbImportKindRef.current = kind
    setImportMenuOpen(false)
    ipynbInputRef.current?.click()
  }

  const onDropWorkspace = (event) => {
    event.preventDefault()
    event.stopPropagation()
    const file = event.dataTransfer.files?.[0] ?? null
    if (!file) {
      return
    }
    const lower = file.name.toLowerCase()
    if (lower.endsWith('.md') || lower.endsWith('.markdown')) {
      void handleImportMarkdownFile(file)
      return
    }
    if (lower.endsWith('.ipynb')) {
      void handleImportNotebookPlain(file)
      return
    }
    setError('Drop a .md or .ipynb file.')
  }

  /** @param {'off' | 'force'} executionMode myst-nb `nb_execution_mode` */
  const onRecompile = async (executionMode = 'off') => {
    if (!activeDoc) {
      return
    }

    setRecompileMenuOpen(false)
    setIsCompiling(true)
    setError('')

    try {
      const response = await fetch('/api/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          markdown: activeDoc.content,
          execution_mode: executionMode,
        }),
      })
      const payload = await response.json()
      if (!response.ok) {
        throw new Error(payload.error || 'Sphinx preview failed.')
      }
      const url = payload.sphinx_preview_url
      if (!url) {
        throw new Error('No preview URL returned.')
      }
      setPreviewUrl(url)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sphinx preview failed.')
    } finally {
      setIsCompiling(false)
    }
  }

  const onDownload = () => {
    if (!activeDoc) {
      return
    }
    const blob = new Blob([activeDoc.content], { type: 'text/markdown' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = activeDoc.name.endsWith('.md')
      ? activeDoc.name
      : `${activeDoc.name}.md`
    document.body.appendChild(anchor)
    anchor.click()
    anchor.remove()
    URL.revokeObjectURL(url)
  }

  const onSplitPointerDown = (event) => {
    if (event.button !== 0) {
      return
    }
    event.preventDefault()
    const grip = event.currentTarget
    grip.setPointerCapture(event.pointerId)

    const root = splitContainerRef.current
    if (!root) {
      return
    }
    const rect = root.getBoundingClientRect()
    const startX = event.clientX
    const startPct = splitPct

    setSplitDragging(true)
    const prevCursor = document.body.style.cursor
    const prevUserSelect = document.body.style.userSelect
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'

    const onMove = (moveEvent) => {
      const dx = moveEvent.clientX - startX
      const deltaPct = (dx / rect.width) * 100
      setSplitPct(Math.min(72, Math.max(28, startPct + deltaPct)))
    }

    const onUp = (upEvent) => {
      if (grip.hasPointerCapture(upEvent.pointerId)) {
        grip.releasePointerCapture(upEvent.pointerId)
      }
      setSplitDragging(false)
      document.body.style.cursor = prevCursor
      document.body.style.userSelect = prevUserSelect
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onUp)
    }

    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onUp)
  }

  const canRecompile = Boolean(activeDoc) && !isCompiling

  return (
    <div className="app-shell">
      <header className="toolbar-nav">
        <div className="toolbar-brand-stack">
          <div className="toolbar-brand">
            <span className="toolbar-title">DocsBuilder</span>
            <span className="toolbar-sub">Sphinx preview</span>
          </div>
          <div className="toolbar-under-title">
            <input
              ref={mdInputRef}
              type="file"
              accept=".md,.markdown,text/markdown"
              className="visually-hidden"
              onChange={(e) => {
                const f = e.target.files?.[0] ?? null
                e.target.value = ''
                void handleImportMarkdownFile(f)
              }}
            />
            <input
              ref={ipynbInputRef}
              type="file"
              accept=".ipynb,application/x-ipynb+json"
              className="visually-hidden"
              onChange={onIpynbInputChange}
            />
            <div className="toolbar-import-wrap" ref={importWrapRef}>
              <button
                type="button"
                className="toolbar-btn toolbar-import-trigger"
                disabled={isImporting}
                aria-expanded={importMenuOpen}
                aria-haspopup="menu"
                onClick={() => setImportMenuOpen((o) => !o)}
              >
                <span className="toolbar-import-label">
                  {isImporting ? 'Importing…' : 'Import'}
                </span>
                <span className="toolbar-import-chevron" aria-hidden>
                  ▾
                </span>
              </button>
              {importMenuOpen ? (
                <div className="toolbar-dropdown" role="menu">
                  <button
                    type="button"
                    className="toolbar-dropdown-item"
                    role="menuitem"
                    disabled={isImporting}
                    onClick={openMarkdownPicker}
                  >
                    Markdown file (.md)
                  </button>
                  <button
                    type="button"
                    className="toolbar-dropdown-item"
                    role="menuitem"
                    disabled={isImporting}
                    onClick={() => openIpynbPicker('myst')}
                  >
                    .ipynb → MyST (Jupytext)
                  </button>
                  <button
                    type="button"
                    className="toolbar-dropdown-item"
                    role="menuitem"
                    disabled={isImporting}
                    onClick={() => openIpynbPicker('plain')}
                  >
                    Notebook (.ipynb, plain)
                  </button>
                </div>
              ) : null}
            </div>
            <button
              type="button"
              className="toolbar-btn"
              onClick={onDownload}
              disabled={!activeDoc}
            >
              Download
            </button>
          </div>
        </div>
      </header>

      {error ? (
        <div className="app-banner error" role="alert">
          {error}
        </div>
      ) : null}

      <div
        className="workspace"
        onDragOver={(e) => {
          e.preventDefault()
          e.dataTransfer.dropEffect = 'copy'
        }}
        onDrop={onDropWorkspace}
      >
        <aside className="file-sidebar">
          <div className="sidebar-section">
            <div className="sidebar-heading">Files</div>
            <ul className="file-list">
              {documents.map((doc) => (
                <li key={doc.id}>
                  <button
                    type="button"
                    className={`file-row ${doc.id === activeDocId ? 'active' : ''}`}
                    onClick={() => setActiveDocId(doc.id)}
                  >
                    <span className="file-name">{doc.name}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
          <div className="sidebar-section muted">
            <label className="sidebar-check">
              <input
                type="checkbox"
                checked={includeCodeAsFenced}
                onChange={(e) =>
                  setIncludeCodeAsFenced(e.target.checked)
                }
              />
              Include code cells as fenced blocks on import
            </label>
          </div>
        </aside>

        <div className="main-editor-column">
          <div className="file-tabs" role="tablist" aria-label="Open files">
            {documents.map((doc) => (
              <button
                key={doc.id}
                type="button"
                role="tab"
                aria-selected={doc.id === activeDocId}
                className={`file-tab ${doc.id === activeDocId ? 'active' : ''}`}
                onClick={() => setActiveDocId(doc.id)}
              >
                <span className="file-tab-label">{doc.name}</span>
              </button>
            ))}
          </div>

          <div
            className="editor-preview"
            ref={splitContainerRef}
            style={{
              gridTemplateColumns: `minmax(0, ${splitPct}fr) ${SPLIT_DIVIDER_PX}px minmax(0, ${100 - splitPct}fr)`,
            }}
          >
            <section className="editor-pane">
              <div className="pane-label">Editor</div>
              <div className="editor-mount">
                <MarkdownEditor
                  value={editorValue}
                  onChange={updateActiveContent}
                />
              </div>
            </section>

            <div
              className={`pane-divider${splitDragging ? ' is-dragging' : ''}`}
              role="separator"
              aria-orientation="vertical"
              aria-label="Resize editor and preview"
              onPointerDown={onSplitPointerDown}
            />

            <section className="preview-pane">
              <div className="pane-label pane-label-preview pane-label-preview-row">
                <span className="pane-label-title">Preview</span>
                <div
                  className="preview-recompile-wrap"
                  ref={recompileWrapRef}
                >
                  <button
                    type="button"
                    className="preview-recompile-btn preview-recompile-trigger"
                    disabled={!canRecompile}
                    aria-expanded={recompileMenuOpen}
                    aria-haspopup="menu"
                    onClick={() => setRecompileMenuOpen((o) => !o)}
                  >
                    <span>
                      {isCompiling ? 'Compiling…' : 'Recompile'}
                    </span>
                    <span className="preview-recompile-chevron" aria-hidden>
                      ▾
                    </span>
                  </button>
                  {recompileMenuOpen ? (
                    <div
                      className="toolbar-dropdown toolbar-dropdown-end"
                      role="menu"
                    >
                      <button
                        type="button"
                        className="toolbar-dropdown-item"
                        role="menuitem"
                        disabled={!canRecompile}
                        onClick={() => void onRecompile('off')}
                      >
                        Recompile without running code cells
                      </button>
                      <button
                        type="button"
                        className="toolbar-dropdown-item"
                        role="menuitem"
                        disabled={!canRecompile}
                        onClick={() => void onRecompile('force')}
                      >
                        Recompile and rerun code cells
                      </button>
                    </div>
                  ) : null}
                </div>
              </div>
              <div className="preview-body">
                <div className="preview-paper">
                  {previewUrl ? (
                    <div className="sphinx-frame-wrap">
                      <iframe
                        title="Sphinx HTML preview"
                        className={`sphinx-frame ${isCompiling ? 'is-compiling' : ''}`}
                        src={previewUrl}
                      />
                    </div>
                  ) : (
                    <div className="preview-placeholder">
                      <p>
                        Preview appears after you choose an option under{' '}
                        <strong>Recompile</strong>.
                      </p>
                      <p className="hint">
                        Updates only when you recompile — not on every keystroke.
                      </p>
                    </div>
                  )}
                  {isCompiling ? (
                    <div className="preview-loading" aria-busy="true">
                      <span className="spinner" aria-hidden />
                      <p>Running Sphinx…</p>
                    </div>
                  ) : null}
                </div>
              </div>
            </section>
          </div>
        </div>
      </div>
    </div>
  )
}
