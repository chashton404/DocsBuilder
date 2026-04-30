/**
 * Per-project editor: Import / Preview / conf.py — backed by ``/api/projects/:id``.
 */

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { MarkdownEditor } from './MarkdownEditor'

function uiStorageKey(projectId) {
  return `docsbuilder-ui-${projectId}`
}

function nextId() {
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`
}

const SPLIT_DIVIDER_PX = 12

/** Initial editor vs preview column ratio (`fr` weights). */
const INITIAL_SPLIT_EDITOR_FR = 52

const DEFAULT_SIDEBAR_WIDTH_PX = 220
const MIN_SIDEBAR_WIDTH_PX = 140
const MAX_SIDEBAR_WIDTH_PX = 520
/** Dragging the sidebar narrower than this collapses the panel (icons stay) on release. */
const SIDEBAR_DRAG_CLOSE_BELOW_PX = 72

/** Synthetic editor tab for workspace Sphinx `conf.py` (not listed under Files). */
const CONF_PY_DOC_ID = 'workspace-conf-py'
/** Pip requirements for executed notebook/code cells (not listed under Files). */
const NOTEBOOK_REQ_DOC_ID = 'workspace-notebook-req'

function isSyntheticWorkspaceDoc(id) {
  return id === CONF_PY_DOC_ID || id === NOTEBOOK_REQ_DOC_ID
}

function ActivityIconFiles() {
  return (
    <svg
      width={22}
      height={22}
      viewBox="0 0 24 24"
      aria-hidden
      fill="none"
      stroke="currentColor"
      strokeWidth={1.65}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M4 7h7l2 2h7v11a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2z" />
    </svg>
  )
}

function ActivityIconAssets() {
  return (
    <svg
      width={22}
      height={22}
      viewBox="0 0 24 24"
      aria-hidden
      fill="none"
      stroke="currentColor"
      strokeWidth={1.65}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="3" y="5" width="18" height="14" rx="2" ry="2" />
      <circle cx="9" cy="11" r="2" />
      <path d="m21 15-6-6-4 4-3-3-5 5" />
    </svg>
  )
}

function ActivityIconGear() {
  return (
    <svg
      width={22}
      height={22}
      viewBox="0 0 24 24"
      aria-hidden
      fill="none"
      stroke="currentColor"
      strokeWidth={1.55}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h.09a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51h.09a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82v.09c0 .69.41 1.3 1 1.51h.09a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z" />
    </svg>
  )
}

export default function ProjectEditor() {
  const { projectId } = useParams()
  const navigate = useNavigate()
  const api = `/api/projects/${projectId}`

  const [hydrated, setHydrated] = useState(false)
  const [documents, setDocuments] = useState([])
  /** Doc IDs shown as editor tabs (subset of `documents`; order = tab order). */
  const [openTabIds, setOpenTabIds] = useState([])
  const [activeDocId, setActiveDocId] = useState('')
  const [error, setError] = useState('')

  const confSaveTimerRef = useRef(null)
  const notebookReqSaveTimerRef = useRef(null)

  const documentsRef = useRef(documents)
  useEffect(() => {
    documentsRef.current = documents
  }, [documents])

  useEffect(() => {
    let cancelled = false
    async function init() {
      setHydrated(false)
      const mr = await fetch(`/api/projects/${projectId}`)
      if (cancelled) {
        return
      }
      if (!mr.ok) {
        navigate('/projects', { replace: true })
        return
      }
      const meta = await mr.json()
      if (!meta.wizard_completed) {
        navigate(`/projects/${projectId}/wizard`, { replace: true })
        return
      }
      const dr = await fetch(`${api}/documents`)
      const dp = await dr.json()
      if (cancelled) {
        return
      }
      if (!dr.ok) {
        setError(dp.error || 'Could not load documents.')
        setDocuments([])
        setOpenTabIds([])
        setActiveDocId('')
        setHydrated(true)
        return
      }
      const docsFromServer = Array.isArray(dp.documents) ? dp.documents : []
      let uiOpen = []
      let uiActive = ''
      try {
        const raw = localStorage.getItem(uiStorageKey(projectId))
        if (raw) {
          const ui = JSON.parse(raw)
          if (Array.isArray(ui.openTabIds)) {
            uiOpen = ui.openTabIds
          }
          if (typeof ui.activeDocId === 'string') {
            uiActive = ui.activeDocId
          }
        }
      } catch {
        /* ignore */
      }
      const docIds = new Set(docsFromServer.map((d) => d.id))
      uiOpen = uiOpen.filter(
        (id) => docIds.has(id) || isSyntheticWorkspaceDoc(id),
      )
      let mergedDocs = [...docsFromServer]
      if (uiOpen.includes(CONF_PY_DOC_ID)) {
        try {
          const cr = await fetch(`${api}/workspace/conf`)
          const cp = await cr.json()
          if (cr.ok && typeof cp.content === 'string') {
            mergedDocs = [
              ...mergedDocs.filter((d) => d.id !== CONF_PY_DOC_ID),
              {
                id: CONF_PY_DOC_ID,
                name: 'conf.py',
                content: cp.content,
              },
            ]
          } else {
            uiOpen = uiOpen.filter((id) => id !== CONF_PY_DOC_ID)
          }
        } catch {
          uiOpen = uiOpen.filter((id) => id !== CONF_PY_DOC_ID)
        }
      }
      if (uiOpen.includes(NOTEBOOK_REQ_DOC_ID)) {
        try {
          const nr = await fetch(`${api}/notebook-requirements`)
          const np = await nr.json()
          if (nr.ok && typeof np.content === 'string') {
            mergedDocs = [
              ...mergedDocs.filter((d) => d.id !== NOTEBOOK_REQ_DOC_ID),
              {
                id: NOTEBOOK_REQ_DOC_ID,
                name: 'requirements-notebook.txt',
                content: np.content,
              },
            ]
          } else {
            uiOpen = uiOpen.filter((id) => id !== NOTEBOOK_REQ_DOC_ID)
          }
        } catch {
          uiOpen = uiOpen.filter((id) => id !== NOTEBOOK_REQ_DOC_ID)
        }
      }
      const nonSyntheticDocs = mergedDocs.filter(
        (d) => !isSyntheticWorkspaceDoc(d.id),
      )
      if (nonSyntheticDocs.length === 0) {
        uiOpen = uiOpen.filter((id) => !isSyntheticWorkspaceDoc(id))
        uiActive = uiOpen.length > 0 ? uiOpen[0] : ''
      } else if (uiOpen.length === 0) {
        const first = mergedDocs.find((d) => !isSyntheticWorkspaceDoc(d.id))
        if (first) {
          uiOpen = [first.id]
          uiActive = first.id
        }
      } else if (
        !uiActive
        || (!docIds.has(uiActive) && !isSyntheticWorkspaceDoc(uiActive))
      ) {
        uiActive = uiOpen[0] ?? ''
      }
      setDocuments(mergedDocs)
      setOpenTabIds(uiOpen)
      setActiveDocId(uiActive)
      setHydrated(true)
    }
    if (projectId) {
      void init()
    }
    return () => {
      cancelled = true
    }
  }, [projectId, navigate, api])

  useEffect(() => {
    if (!hydrated || !projectId) {
      return undefined
    }
    const persistable = documents.filter((d) => !isSyntheticWorkspaceDoc(d.id))
    const handle = window.setTimeout(() => {
      void fetch(`${api}/documents`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ documents: persistable }),
      }).catch(() => {})
    }, 800)
    return () => window.clearTimeout(handle)
  }, [documents, hydrated, projectId, api])

  useEffect(() => {
    if (!hydrated || !projectId) {
      return
    }
    try {
      localStorage.setItem(
        uiStorageKey(projectId),
        JSON.stringify({ openTabIds, activeDocId }),
      )
    } catch {
      /* ignore */
    }
  }, [openTabIds, activeDocId, hydrated, projectId])

  const [previewUrl, setPreviewUrl] = useState('')
  const [isImporting, setIsImporting] = useState(false)
  const [isCompiling, setIsCompiling] = useState(false)
  /** During preview: `'packages'` (pip) then `'sphinx'`; unused when idle. */
  const [previewPhase, setPreviewPhase] = useState(null)

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

  /** `{ docId, x, y }` in viewport px when Files row context menu is open. */
  const [fileContextMenu, setFileContextMenu] = useState(null)

  /** Activity bar: which panel fills the column beside the icons. */
  const [leftPanel, setLeftPanel] = useState('files')
  /** Entire left rail visible (activity bar); false hides icons + panel (reveal control). */
  const [leftRailOpen, setLeftRailOpen] = useState(true)
  /** Sidebar content beside icons; false = icons-only strip while rail stays open. */
  const [sidebarPanelCollapsed, setSidebarPanelCollapsed] = useState(false)
  const [sidebarWidthPx, setSidebarWidthPx] = useState(
    DEFAULT_SIDEBAR_WIDTH_PX,
  )
  const [railDragging, setRailDragging] = useState(false)

  const sidebarWidthPxRef = useRef(DEFAULT_SIDEBAR_WIDTH_PX)
  const lastStableSidebarWidthRef = useRef(DEFAULT_SIDEBAR_WIDTH_PX)

  useEffect(() => {
    sidebarWidthPxRef.current = sidebarWidthPx
  }, [sidebarWidthPx])

  const [workspaceAssets, setWorkspaceAssets] = useState([])
  const [assetsLoading, setAssetsLoading] = useState(false)
  const assetUploadRef = useRef(null)

  const [themeChoices, setThemeChoices] = useState([])
  const [workspaceThemeCurrent, setWorkspaceThemeCurrent] = useState('')
  const [themesLoading, setThemesLoading] = useState(false)
  const [themeError, setThemeError] = useState('')

  const activeDoc = useMemo(
    () => documents.find((d) => d.id === activeDocId) ?? null,
    [activeDocId, documents],
  )

  const openTabs = useMemo(() => {
    const byId = new Map(documents.map((d) => [d.id, d]))
    return openTabIds
      .map((id) => byId.get(id))
      .filter((d) => d != null)
  }, [documents, openTabIds])

  /** Sphinx preview always uses Markdown from a real doc, never `conf.py`. */
  const markdownPreviewDoc = useMemo(() => {
    if (activeDoc && !isSyntheticWorkspaceDoc(activeDoc.id)) {
      return activeDoc
    }
    const fromTabs = openTabs.find((d) => !isSyntheticWorkspaceDoc(d.id))
    if (fromTabs) {
      return fromTabs
    }
    return documents.find((d) => !isSyntheticWorkspaceDoc(d.id)) ?? null
  }, [activeDoc, openTabs, documents])

  const editorValue = activeDoc?.content ?? ''

  const flushPendingConfSave = useCallback(async () => {
    if (confSaveTimerRef.current) {
      clearTimeout(confSaveTimerRef.current)
      confSaveTimerRef.current = null
    }
    const confDoc = documentsRef.current.find((d) => d.id === CONF_PY_DOC_ID)
    if (!confDoc) {
      return
    }
    const response = await fetch(`${api}/workspace/conf`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: confDoc.content }),
    })
    const payload = await response.json()
    if (!response.ok) {
      throw new Error(payload.error || 'Could not save conf.py.')
    }
  }, [api])

  const flushPendingNotebookReqSave = useCallback(async () => {
    if (notebookReqSaveTimerRef.current) {
      clearTimeout(notebookReqSaveTimerRef.current)
      notebookReqSaveTimerRef.current = null
    }
    const reqDoc = documentsRef.current.find((d) => d.id === NOTEBOOK_REQ_DOC_ID)
    if (!reqDoc) {
      return
    }
    const response = await fetch(`${api}/notebook-requirements`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: reqDoc.content }),
    })
    const payload = await response.json()
    if (!response.ok) {
      throw new Error(payload.error || 'Could not save notebook requirements.')
    }
  }, [api])

  const updateActiveContent = useCallback(
    (value) => {
      if (activeDocId === CONF_PY_DOC_ID) {
        setDocuments((prev) =>
          prev.map((d) =>
            d.id === CONF_PY_DOC_ID ? { ...d, content: value } : d,
          ),
        )
        if (confSaveTimerRef.current) {
          clearTimeout(confSaveTimerRef.current)
        }
        confSaveTimerRef.current = setTimeout(() => {
          confSaveTimerRef.current = null
          void fetch(`${api}/workspace/conf`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ content: value }),
          }).catch(() => {})
        }, 750)
        return
      }
      if (activeDocId === NOTEBOOK_REQ_DOC_ID) {
        setDocuments((prev) =>
          prev.map((d) =>
            d.id === NOTEBOOK_REQ_DOC_ID ? { ...d, content: value } : d,
          ),
        )
        if (notebookReqSaveTimerRef.current) {
          clearTimeout(notebookReqSaveTimerRef.current)
        }
        notebookReqSaveTimerRef.current = setTimeout(() => {
          notebookReqSaveTimerRef.current = null
          void fetch(`${api}/notebook-requirements`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ content: value }),
          }).catch(() => {})
        }, 750)
        return
      }
      setDocuments((prev) =>
        prev.map((d) =>
          d.id === activeDocId ? { ...d, content: value } : d,
        ),
      )
    },
    [activeDocId, api],
  )

  useEffect(() => {
    return () => {
      if (confSaveTimerRef.current) {
        clearTimeout(confSaveTimerRef.current)
      }
      if (notebookReqSaveTimerRef.current) {
        clearTimeout(notebookReqSaveTimerRef.current)
      }
    }
  }, [])

  const openTabForDoc = useCallback((docId) => {
    setOpenTabIds((prev) => {
      if (prev.includes(docId)) {
        return prev
      }
      const activeIdx = prev.indexOf(activeDocId)
      if (activeIdx >= 0) {
        const next = [...prev]
        next.splice(activeIdx + 1, 0, docId)
        return next
      }
      return [...prev, docId]
    })
    setActiveDocId(docId)
  }, [activeDocId])

  /** Remove tab chrome only; document stays in Files list. */
  const closeTab = useCallback((docId) => {
    if (docId === CONF_PY_DOC_ID) {
      if (confSaveTimerRef.current) {
        clearTimeout(confSaveTimerRef.current)
        confSaveTimerRef.current = null
      }
      const confDoc = documentsRef.current.find((d) => d.id === CONF_PY_DOC_ID)
      if (confDoc) {
        queueMicrotask(() => {
          void fetch(`${api}/workspace/conf`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ content: confDoc.content }),
          })
        })
      }
    }
    if (docId === NOTEBOOK_REQ_DOC_ID) {
      if (notebookReqSaveTimerRef.current) {
        clearTimeout(notebookReqSaveTimerRef.current)
        notebookReqSaveTimerRef.current = null
      }
      const reqDoc = documentsRef.current.find((d) => d.id === NOTEBOOK_REQ_DOC_ID)
      if (reqDoc) {
        queueMicrotask(() => {
          void fetch(`${api}/notebook-requirements`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ content: reqDoc.content }),
          })
        })
      }
    }
    setOpenTabIds((prevOpen) => {
      const nextOpen = prevOpen.filter((id) => id !== docId)
      setActiveDocId((prevActive) => {
        if (prevActive !== docId) {
          return prevActive
        }
        const oldIdx = prevOpen.indexOf(docId)
        return (
          nextOpen[oldIdx] ??
          nextOpen[oldIdx - 1] ??
          ''
        )
      })
      return nextOpen
    })
  }, [api])

  /** Remove document from workspace (sidebar context menu → Delete). */
  const deleteDocument = useCallback((docId) => {
    setDocuments((prevDocs) => {
      const next = prevDocs.filter((doc) => doc.id !== docId)
      if (next.length === 0) {
        queueMicrotask(() => setPreviewUrl(''))
      }
      return next
    })
    setOpenTabIds((prevOpen) => {
      const nextOpen = prevOpen.filter((id) => id !== docId)
      setActiveDocId((prevActive) => {
        if (prevActive !== docId) {
          return prevActive
        }
        const oldIdx = prevOpen.indexOf(docId)
        const pick =
          nextOpen[oldIdx] ??
          nextOpen[oldIdx - 1] ??
          ''
        return pick
      })
      return nextOpen
    })
  }, [])

  const refreshWorkspaceAssets = useCallback(async () => {
    setAssetsLoading(true)
    setError('')
    try {
      const response = await fetch(`${api}/workspace/assets`)
      const payload = await response.json()
      if (!response.ok) {
        throw new Error(payload.error || 'Could not load assets.')
      }
      setWorkspaceAssets(Array.isArray(payload.files) ? payload.files : [])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load assets.')
    } finally {
      setAssetsLoading(false)
    }
  }, [api])

  const fetchWorkspaceThemes = useCallback(async () => {
    setThemesLoading(true)
    setThemeError('')
    try {
      const response = await fetch(`${api}/workspace/themes`)
      const payload = await response.json()
      if (!response.ok) {
        throw new Error(payload.error || 'Could not load themes.')
      }
      setThemeChoices(Array.isArray(payload.themes) ? payload.themes : [])
      setWorkspaceThemeCurrent(
        typeof payload.current === 'string' ? payload.current : '',
      )
    } catch (err) {
      setThemeError(
        err instanceof Error ? err.message : 'Could not load themes.',
      )
    } finally {
      setThemesLoading(false)
    }
  }, [api])

  const applyWorkspaceTheme = useCallback(
    async (themeId) => {
      setThemeError('')
      setError('')
      try {
        await flushPendingNotebookReqSave()
        await flushPendingConfSave()
        const response = await fetch(`${api}/workspace/theme`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ theme: themeId }),
        })
        const payload = await response.json()
        if (!response.ok) {
          throw new Error(payload.error || 'Could not update theme.')
        }
        setWorkspaceThemeCurrent(payload.theme)
        if (typeof payload.content === 'string') {
          setDocuments((prev) =>
            prev.some((d) => d.id === CONF_PY_DOC_ID)
              ? prev.map((d) =>
                  d.id === CONF_PY_DOC_ID
                    ? { ...d, content: payload.content }
                    : d,
                )
              : prev,
          )
        }
      } catch (err) {
        setThemeError(
          err instanceof Error ? err.message : 'Could not update theme.',
        )
      }
    },
    [flushPendingNotebookReqSave, flushPendingConfSave, api],
  )

  const openConfPyInEditor = useCallback(async () => {
    setError('')
    try {
      const response = await fetch(`${api}/workspace/conf`)
      const payload = await response.json()
      if (!response.ok) {
        throw new Error(payload.error || 'Could not load conf.py.')
      }
      const content =
        typeof payload.content === 'string' ? payload.content : ''
      setDocuments((prev) => {
        const without = prev.filter((d) => d.id !== CONF_PY_DOC_ID)
        return [...without, { id: CONF_PY_DOC_ID, name: 'conf.py', content }]
      })
      queueMicrotask(() => {
        openTabForDoc(CONF_PY_DOC_ID)
      })
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Could not load conf.py.',
      )
    }
  }, [openTabForDoc, api])

  const openNotebookRequirementsInEditor = useCallback(async () => {
    setError('')
    try {
      const response = await fetch(`${api}/notebook-requirements`)
      const payload = await response.json()
      if (!response.ok) {
        throw new Error(payload.error || 'Could not load notebook requirements.')
      }
      const content =
        typeof payload.content === 'string' ? payload.content : ''
      setDocuments((prev) => {
        const without = prev.filter((d) => d.id !== NOTEBOOK_REQ_DOC_ID)
        return [
          ...without,
          {
            id: NOTEBOOK_REQ_DOC_ID,
            name: 'requirements-notebook.txt',
            content,
          },
        ]
      })
      queueMicrotask(() => {
        openTabForDoc(NOTEBOOK_REQ_DOC_ID)
      })
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Could not load notebook requirements.',
      )
    }
  }, [openTabForDoc, api])

  const uploadWorkspaceAsset = async (file) => {
    if (!file) {
      return
    }
    setError('')
    const formData = new FormData()
    formData.append('file', file)
    try {
      const response = await fetch(`${api}/workspace/assets`, {
        method: 'POST',
        body: formData,
      })
      const payload = await response.json()
      if (!response.ok) {
        throw new Error(payload.error || 'Upload failed.')
      }
      await refreshWorkspaceAssets()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed.')
    }
  }

  const deleteWorkspaceAsset = async (name) => {
    setError('')
    try {
      const response = await fetch(
        `${api}/workspace/assets/${encodeURIComponent(name)}`,
        { method: 'DELETE' },
      )
      const payload = await response.json()
      if (!response.ok) {
        throw new Error(payload.error || 'Delete failed.')
      }
      await refreshWorkspaceAssets()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Delete failed.')
    }
  }

  useEffect(() => {
    if (leftPanel !== 'assets') {
      return undefined
    }
    queueMicrotask(() => {
      void refreshWorkspaceAssets()
    })
    return undefined
  }, [leftPanel, refreshWorkspaceAssets])

  useEffect(() => {
    if (leftPanel !== 'settings') {
      return undefined
    }
    queueMicrotask(() => {
      void fetchWorkspaceThemes()
    })
    return undefined
  }, [leftPanel, fetchWorkspaceThemes])

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
      setOpenTabIds((prev) => [id, ...prev.filter((x) => x !== id)])
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
      const response = await fetch(`${api}/import-notebook`, {
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
      setOpenTabIds((prev) => [id, ...prev.filter((x) => x !== id)])
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
      const response = await fetch(`${api}/convert`, {
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
      setOpenTabIds((prev) => [id, ...prev.filter((x) => x !== id)])
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

  useEffect(() => {
    if (!fileContextMenu) {
      return undefined
    }
    const close = () => setFileContextMenu(null)
    const onPointerDown = (event) => {
      if (event.target.closest?.('.file-context-menu')) {
        return
      }
      close()
    }
    const onKeyDown = (event) => {
      if (event.key === 'Escape') {
        close()
      }
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [fileContextMenu])

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
    const source = markdownPreviewDoc
    if (!source) {
      return
    }

    setRecompileMenuOpen(false)
    setIsCompiling(true)
    setPreviewPhase(executionMode === 'force' ? 'packages' : 'sphinx')
    setError('')

    try {
      if (executionMode === 'force') {
        const syncResponse = await fetch(`${api}/notebook-env/sync`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ execution_mode: 'force' }),
        })
        const syncPayload = await syncResponse.json()
        if (!syncResponse.ok) {
          throw new Error(
            syncPayload.error || 'Notebook package install failed.',
          )
        }
        setPreviewPhase('sphinx')
      }

      const response = await fetch(`${api}/preview`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          markdown: source.content,
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
      setPreviewPhase(null)
      setIsCompiling(false)
    }
  }

  const onDownload = () => {
    if (!activeDoc) {
      return
    }
    if (activeDoc.id === NOTEBOOK_REQ_DOC_ID) {
      const blob = new Blob([activeDoc.content], {
        type: 'text/plain;charset=utf-8',
      })
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = 'requirements-notebook.txt'
      document.body.appendChild(anchor)
      anchor.click()
      anchor.remove()
      URL.revokeObjectURL(url)
      return
    }
    if (activeDoc.id === CONF_PY_DOC_ID) {
      const blob = new Blob([activeDoc.content], {
        type: 'text/x-python;charset=utf-8',
      })
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = 'conf.py'
      document.body.appendChild(anchor)
      anchor.click()
      anchor.remove()
      URL.revokeObjectURL(url)
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

  const handleActivitySelect = useCallback(
    (panel) => {
      if (leftRailOpen && leftPanel === panel) {
        setSidebarPanelCollapsed((prev) => !prev)
        return
      }
      setLeftPanel(panel)
      setLeftRailOpen(true)
      setSidebarPanelCollapsed(false)
    },
    [leftRailOpen, leftPanel],
  )

  const onRailSplitterPointerDown = useCallback(
    (event) => {
      if (event.button !== 0 || !leftRailOpen) {
        return
      }
      event.preventDefault()
      const grip = event.currentTarget
      grip.setPointerCapture(event.pointerId)

      const startX = event.clientX
      const startW = sidebarWidthPxRef.current

      setRailDragging(true)
      const prevCursor = document.body.style.cursor
      const prevUserSelect = document.body.style.userSelect
      document.body.style.cursor = 'col-resize'
      document.body.style.userSelect = 'none'

      const onMove = (moveEvent) => {
        const dx = moveEvent.clientX - startX
        const raw = startW + dx
        const clamped = Math.min(
          MAX_SIDEBAR_WIDTH_PX,
          Math.max(48, raw),
        )
        setSidebarWidthPx(clamped)
      }

      const onUp = (upEvent) => {
        if (grip.hasPointerCapture(upEvent.pointerId)) {
          grip.releasePointerCapture(upEvent.pointerId)
        }
        setRailDragging(false)
        document.body.style.cursor = prevCursor
        document.body.style.userSelect = prevUserSelect
        window.removeEventListener('pointermove', onMove)
        window.removeEventListener('pointerup', onUp)
        window.removeEventListener('pointercancel', onUp)

        const finalW = sidebarWidthPxRef.current
        if (finalW < SIDEBAR_DRAG_CLOSE_BELOW_PX) {
          setSidebarPanelCollapsed(true)
          setSidebarWidthPx(lastStableSidebarWidthRef.current)
        } else if (finalW < MIN_SIDEBAR_WIDTH_PX) {
          setSidebarWidthPx(MIN_SIDEBAR_WIDTH_PX)
          lastStableSidebarWidthRef.current = MIN_SIDEBAR_WIDTH_PX
        } else {
          lastStableSidebarWidthRef.current = finalW
        }
      }

      window.addEventListener('pointermove', onMove)
      window.addEventListener('pointerup', onUp)
      window.addEventListener('pointercancel', onUp)
    },
    [leftRailOpen],
  )

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

  const canRecompile = Boolean(markdownPreviewDoc) && !isCompiling

  if (!hydrated) {
    return (
      <div className="app-shell app-shell--loading">
        <p className="app-loading-msg">Loading project…</p>
      </div>
    )
  }

  return (
    <div className="app-shell">
      <header className="toolbar-nav">
        <div className="toolbar-brand-stack">
          <div className="toolbar-brand">
            <span className="toolbar-title">DocsBuilder</span>
            <span className="toolbar-sub">Sphinx preview</span>
          </div>
          <div className="toolbar-under-title">
            <Link
              className="toolbar-btn toolbar-home-btn"
              to="/projects"
              aria-label="Projects (home)"
              title="Projects"
            >
              <svg
                width={20}
                height={20}
                viewBox="0 0 24 24"
                aria-hidden
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
                <polyline points="9 22 9 12 15 12 15 22" />
              </svg>
            </Link>
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
        {!leftRailOpen ? (
          <button
            type="button"
            className="rail-reveal-btn"
            aria-label="Show sidebar"
            title="Show sidebar"
            onClick={() => {
              setLeftRailOpen(true)
              setSidebarPanelCollapsed(false)
            }}
          >
            ›
          </button>
        ) : null}

        <div
          className={`left-rail ${!leftRailOpen ? 'left-rail--collapsed' : ''}`}
        >
          <nav
            className="activity-bar"
            aria-label="Sidebar panels"
          >
            <button
              type="button"
              className={`activity-bar-btn ${leftPanel === 'files' ? 'active' : ''}`}
              aria-label="Files"
              aria-current={leftPanel === 'files' ? true : undefined}
              title="Files"
              onClick={() => handleActivitySelect('files')}
            >
              <ActivityIconFiles />
            </button>
            <button
              type="button"
              className={`activity-bar-btn ${leftPanel === 'assets' ? 'active' : ''}`}
              aria-label="Assets"
              aria-current={leftPanel === 'assets' ? true : undefined}
              title="Assets (_static)"
              onClick={() => handleActivitySelect('assets')}
            >
              <ActivityIconAssets />
            </button>
            <button
              type="button"
              className={`activity-bar-btn ${leftPanel === 'settings' ? 'active' : ''}`}
              aria-label="Settings"
              aria-current={leftPanel === 'settings' ? true : undefined}
              title="Settings"
              onClick={() => handleActivitySelect('settings')}
            >
              <ActivityIconGear />
            </button>
          </nav>

          <aside
            className={`left-panel${sidebarPanelCollapsed ? ' left-panel--collapsed' : ''}`}
            style={
              leftRailOpen && !sidebarPanelCollapsed
                ? { width: sidebarWidthPx, flexShrink: 0 }
                : undefined
            }
          >
            {leftPanel === 'files' ? (
              <>
                <div className="sidebar-section">
                  <div className="sidebar-heading">Files</div>
                  <ul className="file-list">
                    {documents
                      .filter((doc) => !isSyntheticWorkspaceDoc(doc.id))
                      .map((doc) => (
                      <li key={doc.id} className="file-row">
                        <button
                          type="button"
                          className={`file-open-btn ${doc.id === activeDocId ? 'active' : ''}`}
                          onClick={() => openTabForDoc(doc.id)}
                          onContextMenu={(event) => {
                            event.preventDefault()
                            setFileContextMenu({
                              docId: doc.id,
                              x: event.clientX,
                              y: event.clientY,
                            })
                          }}
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
              </>
            ) : null}

            {leftPanel === 'assets' ? (
              <div className="sidebar-panel-stack assets-panel">
                <div className="sidebar-heading-row">
                  <div className="sidebar-heading">Assets</div>
                  <button
                    type="button"
                    className="files-collapse-btn"
                    disabled={assetsLoading}
                    onClick={() => void refreshWorkspaceAssets()}
                  >
                    Refresh
                  </button>
                </div>
                <p className="sidebar-panel-hint">
                  Upload logos and images here. They are copied into Sphinx{' '}
                  <code className="inline-code">_static</code> when you
                  recompile.
                </p>
                <input
                  ref={assetUploadRef}
                  type="file"
                  className="visually-hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0] ?? null
                    e.target.value = ''
                    void uploadWorkspaceAsset(f)
                  }}
                />
                <button
                  type="button"
                  className="sidebar-primary-btn"
                  disabled={assetsLoading}
                  onClick={() => assetUploadRef.current?.click()}
                >
                  Upload file…
                </button>
                {assetsLoading ? (
                  <p className="sidebar-muted-msg">Loading…</p>
                ) : null}
                <ul className="asset-list">
                  {workspaceAssets.map((a) => (
                    <li key={a.name} className="asset-row">
                      <div className="asset-thumb-wrap">
                        {/\.(png|jpe?g|gif|webp|svg)$/i.test(
                          a.name,
                        ) ? (
                          <img
                            className="asset-thumb"
                            alt=""
                            src={`${api}/workspace/assets/${encodeURIComponent(a.name)}`}
                          />
                        ) : (
                          <span className="asset-thumb-fallback" aria-hidden>
                            ◆
                          </span>
                        )}
                      </div>
                      <div className="asset-meta">
                        <span className="asset-name" title={a.name}>
                          {a.name}
                        </span>
                        <span className="asset-size">
                          {typeof a.size === 'number'
                            ? `${a.size >= 1024 ? `${Math.round(a.size / 1024)} KB` : `${a.size} B`}`
                            : ''}
                        </span>
                      </div>
                      <button
                        type="button"
                        className="asset-delete-btn"
                        aria-label={`Delete ${a.name}`}
                        onClick={() => void deleteWorkspaceAsset(a.name)}
                      >
                        ×
                      </button>
                    </li>
                  ))}
                </ul>
                {!assetsLoading && workspaceAssets.length === 0 ? (
                  <p className="sidebar-muted-msg">No assets yet.</p>
                ) : null}
              </div>
            ) : null}

            {leftPanel === 'settings' ? (
              <div className="sidebar-panel-stack settings-panel">
                <div className="sidebar-heading">Settings</div>
                <p className="sidebar-panel-hint">
                  Open <strong>conf.py</strong> in the main editor. Changes apply
                  on the next <strong>Recompile</strong>; execution mode still
                  comes from the Recompile menu.
                </p>
                <button
                  type="button"
                  className="sidebar-primary-btn"
                  onClick={() => void openConfPyInEditor()}
                >
                  Edit conf.py
                </button>
                <p className="sidebar-panel-hint">
                  For <strong>Recompile and rerun code cells</strong>, list pip
                  packages in{' '}
                  <strong>requirements-notebook.txt</strong> (project virtualenv).
                </p>
                <button
                  type="button"
                  className="sidebar-primary-btn"
                  onClick={() => void openNotebookRequirementsInEditor()}
                >
                  Edit notebook packages
                </button>
                <div className="sidebar-heading theme-picker-heading">
                  HTML theme
                </div>
                <p className="sidebar-panel-hint">
                  Sphinx Book (default), PyData, Read the Docs, or Shibuya.
                  Install backend deps:{' '}
                  <code className="inline-code">pip install -r requirements.txt</code>
                  .
                </p>
                {themeError ? (
                  <p className="sidebar-panel-error" role="alert">
                    {themeError}
                  </p>
                ) : null}
                {themesLoading ? (
                  <p className="sidebar-muted-msg">Loading themes…</p>
                ) : (
                  <ul className="theme-picker-list" role="listbox" aria-label="Sphinx HTML theme">
                    {themeChoices.map((t) => (
                      <li key={t.id} className="theme-picker-item">
                        <label className="theme-picker-label">
                          <input
                            type="radio"
                            name="sphinx-html-theme"
                            value={t.id}
                            checked={workspaceThemeCurrent === t.id}
                            onChange={() => void applyWorkspaceTheme(t.id)}
                          />
                          <span>{t.label}</span>
                        </label>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ) : null}
          </aside>
        </div>

        {leftRailOpen && !sidebarPanelCollapsed ? (
          <div
            className={`rail-splitter${railDragging ? ' is-dragging' : ''}`}
            role="separator"
            aria-orientation="vertical"
            aria-label="Resize sidebar"
            onPointerDown={onRailSplitterPointerDown}
          />
        ) : null}

        <div className="main-editor-column">
          <div className="file-tabs" role="tablist" aria-label="Open files">
            {openTabs.map((doc) => (
              <div
                key={doc.id}
                className={`file-tab ${doc.id === activeDocId ? 'active' : ''}`}
              >
                <button
                  type="button"
                  role="tab"
                  aria-selected={doc.id === activeDocId}
                  className={`file-tab-trigger ${doc.id === activeDocId ? 'active' : ''}`}
                  onClick={() => setActiveDocId(doc.id)}
                >
                  <span className="file-tab-label">{doc.name}</span>
                </button>
                <button
                  type="button"
                  className="file-tab-close"
                  aria-label={`Close tab ${doc.name}`}
                  onClick={() => closeTab(doc.id)}
                >
                  ×
                </button>
              </div>
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
              <div className="pane-label">
                {activeDocId === CONF_PY_DOC_ID
                  ? 'conf.py'
                  : activeDocId === NOTEBOOK_REQ_DOC_ID
                    ? 'requirements-notebook.txt'
                    : 'Editor'}
              </div>
              <div className="editor-mount">
                <MarkdownEditor
                  value={editorValue}
                  onChange={updateActiveContent}
                  language={
                    activeDocId === CONF_PY_DOC_ID
                      ? 'python'
                      : activeDocId === NOTEBOOK_REQ_DOC_ID
                        ? 'plaintext'
                        : 'markdown'
                  }
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
                      <p>
                        {previewPhase === 'packages'
                          ? 'Installing notebook packages…'
                          : 'Building Sphinx preview…'}
                      </p>
                    </div>
                  ) : null}
                </div>
              </div>
            </section>
          </div>
        </div>
      </div>

      {fileContextMenu ? (
        <div
          className="file-context-menu"
          role="menu"
          style={{
            left: fileContextMenu.x,
            top: fileContextMenu.y,
          }}
        >
          <button
            type="button"
            className="file-context-menu-item danger"
            role="menuitem"
            onClick={() => {
              deleteDocument(fileContextMenu.docId)
              setFileContextMenu(null)
            }}
          >
            Delete
          </button>
        </div>
      ) : null}
    </div>
  )
}
