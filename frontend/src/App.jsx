import { useMemo, useState } from 'react'
import './App.css'

function App() {
  const [uploads, setUploads] = useState([])
  const [activeUploadId, setActiveUploadId] = useState(null)
  const [selectedFile, setSelectedFile] = useState(null)
  const [isDragging, setIsDragging] = useState(false)
  const [isConverting, setIsConverting] = useState(false)
  const [error, setError] = useState('')
  const [previewMode, setPreviewMode] = useState('markdown')
  const [leftPaneWidth, setLeftPaneWidth] = useState(40)
  const [stripJupytextHeader, setStripJupytextHeader] = useState(true)

  const activeUpload = useMemo(
    () => uploads.find((upload) => upload.id === activeUploadId) ?? null,
    [activeUploadId, uploads],
  )

  const canConvert = useMemo(
    () => selectedFile !== null && !isConverting,
    [isConverting, selectedFile],
  )

  const onResizeStart = (event) => {
    event.preventDefault()
    const startX = event.clientX
    const startWidth = leftPaneWidth
    const appElement = document.querySelector('.split-layout')
    if (!appElement) {
      return
    }
    const layoutWidth = appElement.getBoundingClientRect().width

    const onMouseMove = (moveEvent) => {
      const delta = moveEvent.clientX - startX
      const nextWidth = startWidth + (delta / layoutWidth) * 100
      setLeftPaneWidth(Math.min(75, Math.max(25, nextWidth)))
    }

    const onMouseUp = () => {
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
    }

    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)
  }

  const onFileSelected = (file) => {
    if (!file) {
      return
    }

    if (!file.name.toLowerCase().endsWith('.ipynb')) {
      setError('Please select a valid .ipynb notebook file.')
      return
    }

    setSelectedFile(file)
    setError('')
  }

  const onDrop = (event) => {
    event.preventDefault()
    setIsDragging(false)
    onFileSelected(event.dataTransfer.files?.[0] ?? null)
  }

  const onConvert = async () => {
    if (!selectedFile) {
      return
    }

    setIsConverting(true)
    setError('')

    const formData = new FormData()
    formData.append('file', selectedFile)
    formData.append('strip_jupytext', String(stripJupytextHeader))

    try {
      const response = await fetch('/api/convert', {
        method: 'POST',
        body: formData,
      })

      const payload = await response.json()
      if (!response.ok) {
        throw new Error(payload.error || 'Conversion failed.')
      }

      const newUpload = {
        id: `${Date.now()}-${selectedFile.name}`,
        sourceName: selectedFile.name,
        filename: payload.filename,
        content: payload.content,
        sphinxHtml: payload.sphinx_html || '',
        sphinxPreviewUrl: payload.sphinx_preview_url || '',
      }
      setUploads((current) => [newUpload, ...current])
      setActiveUploadId(newUpload.id)
      setPreviewMode('markdown')
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : 'Conversion failed.',
      )
    } finally {
      setIsConverting(false)
    }
  }

  const onDownload = () => {
    if (!activeUpload?.content || !activeUpload.filename) {
      return
    }

    const blob = new Blob([activeUpload.content], { type: 'text/markdown' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = activeUpload.filename
    document.body.appendChild(anchor)
    anchor.click()
    anchor.remove()
    URL.revokeObjectURL(url)
  }

  return (
    <main className="app">
      <header className="page-header">
        <h1>Notebook to Myst Converter</h1>
      </header>
      <section
        className="split-layout"
        style={{
          gridTemplateColumns: `${leftPaneWidth}% 8px ${100 - leftPaneWidth}%`,
        }}
      >
        <section className="pane left-pane">
        <header className="header">
          <p>Upload and convert notebooks. Keep adding files as needed.</p>
        </header>

        <section
          className={`dropzone ${isDragging ? 'dragging' : ''}`}
          onDragOver={(event) => {
            event.preventDefault()
            setIsDragging(true)
          }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={onDrop}
        >
          <input
            id="file-input"
            type="file"
            accept=".ipynb"
            onChange={(event) => onFileSelected(event.target.files?.[0] ?? null)}
          />
          <label htmlFor="file-input">
            Drag and drop your <code>.ipynb</code> file here, or click to browse.
          </label>
          {selectedFile && (
            <p className="selected-file">Selected file: {selectedFile.name}</p>
          )}
        </section>

        <section className="format-row">
          <label htmlFor="format">Output format</label>
          <select id="format" disabled value="myst">
            <option value="myst">MyST Markdown</option>
          </select>
        </section>
        <section className="metadata-row">
          <label htmlFor="strip-jupytext">
            <input
              id="strip-jupytext"
              type="checkbox"
              checked={stripJupytextHeader}
              onChange={(event) => setStripJupytextHeader(event.target.checked)}
            />
            Strip jupytext header metadata
          </label>
        </section>

        <section className="actions">
          <button
            type="button"
            className="primary"
            disabled={!canConvert}
            onClick={onConvert}
          >
            {isConverting ? 'Converting...' : 'Convert'}
          </button>
          {activeUpload && (
            <button type="button" className="secondary" onClick={onDownload}>
              Download
            </button>
          )}
        </section>

        {error && <p className="error">{error}</p>}

        <section className="uploads">
          <h2>Converted Files</h2>
          {uploads.length === 0 ? (
            <p className="empty-state">No converted files yet.</p>
          ) : (
            <ul>
              {uploads.map((upload) => (
                <li key={upload.id}>
                  <button
                    type="button"
                    className={`upload-item ${upload.id === activeUploadId ? 'active' : ''}`}
                    onClick={() => setActiveUploadId(upload.id)}
                  >
                    <span>{upload.sourceName}</span>
                    <small>{upload.filename}</small>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
        </section>
        <div
          className="pane-divider"
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize panels"
          onMouseDown={onResizeStart}
        />

        <section className="pane right-pane">
        <section className="preview-toolbar">
          <h2>Output Preview</h2>
          <div className="toggle-group">
            <button
              type="button"
              className={previewMode === 'markdown' ? 'toggle active' : 'toggle'}
              onClick={() => setPreviewMode('markdown')}
            >
              Markdown
            </button>
            <button
              type="button"
              className={previewMode === 'sphinx' ? 'toggle active' : 'toggle'}
              onClick={() => setPreviewMode('sphinx')}
              disabled={!activeUpload?.sphinxPreviewUrl}
            >
              Sphinx
            </button>
          </div>
        </section>

        {!activeUpload && (
          <p className="empty-state">
            Convert a notebook to view markdown and Sphinx output.
          </p>
        )}

        {activeUpload && previewMode === 'markdown' && (
          <textarea
            className="preview"
            readOnly
            value={activeUpload.content}
            placeholder="Converted MyST markdown will appear here."
          />
        )}

        {activeUpload &&
          previewMode === 'sphinx' &&
          activeUpload.sphinxPreviewUrl && (
          <iframe
            title="Sphinx preview"
            className="sphinx-frame"
            src={activeUpload.sphinxPreviewUrl}
          />
        )}

        {activeUpload &&
          previewMode === 'sphinx' &&
          !activeUpload.sphinxPreviewUrl && (
          <p className="empty-state">
            Sphinx output is not available for this conversion.
          </p>
        )}
      </section>
      </section>
    </main>
  )
}

export default App
