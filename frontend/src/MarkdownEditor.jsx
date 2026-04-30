/**
 * CodeMirror wrapper: Markdown (default) or Python for workspace conf.py.
 */

import { useMemo } from 'react'
import CodeMirror from '@uiw/react-codemirror'
import { markdown } from '@codemirror/lang-markdown'
import { python } from '@codemirror/lang-python'
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language'
import { EditorView } from '@codemirror/view'
import { tags as t } from '@lezer/highlight'

const markdownDarkHighlight = HighlightStyle.define([
  { tag: [t.keyword, t.atom, t.bool], color: '#5b9bd5' },
  { tag: [t.labelName, t.tagName], color: '#5b9bd5' },
  {
    tag: [t.heading, t.heading1, t.heading2, t.heading3, t.heading4],
    color: '#5b9bd5',
    fontWeight: '600',
  },
  { tag: [t.comment, t.blockComment, t.lineComment], color: '#6a9955' },
  { tag: [t.string, t.literal], color: '#ce9178' },
  { tag: [t.link, t.url], color: '#48d891', textDecoration: 'underline' },
  { tag: t.emphasis, color: '#d4dbe8', fontStyle: 'italic' },
  { tag: t.strong, color: '#d4dbe8', fontWeight: 'bold' },
  { tag: [t.monospace, t.meta], color: '#ce9178' },
])

/** Matches Markdown pane tone; avoids default red strings (reads as errors). */
const pythonDarkHighlight = HighlightStyle.define([
  {
    tag: [
      t.keyword,
      t.operatorKeyword,
      t.controlKeyword,
      t.definitionKeyword,
      t.moduleKeyword,
      t.atom,
      t.bool,
    ],
    color: '#5b9bd5',
  },
  {
    tag: [
      t.string,
      t.special(t.string),
      t.docString,
      t.literal,
      t.character,
      t.regexp,
    ],
    color: '#ce9178',
  },
  { tag: t.number, color: '#b5cea8' },
  {
    tag: [t.comment, t.blockComment, t.lineComment, t.docComment],
    color: '#6a9955',
  },
  {
    tag: [
      t.variableName,
      t.propertyName,
      t.definition(t.variableName),
      t.local(t.variableName),
    ],
    color: '#d4dbe8',
  },
  {
    tag: [
      t.function(t.variableName),
      t.definition(t.function(t.variableName)),
      t.self,
    ],
    color: '#dcdcaa',
  },
  { tag: [t.operator, t.punctuation, t.bracket], color: '#c8c8c8' },
  { tag: [t.attributeName], color: '#92c5f7' },
])

/** Matches App.css --editor-bg / sidebar-blue-gray chrome */
const OL_EDITOR_SURFACE = '#1a2230'
const OL_EDITOR_ACTIVE_LINE = '#243047'
const OL_GUTTER_MUTED = '#8e97ab'

const editorChrome = EditorView.theme({
  '.cm-editor': {
    height: '100%',
    flex: 1,
    minHeight: 0,
    fontSize: '13px',
    display: 'flex',
    flexDirection: 'column',
    backgroundColor: OL_EDITOR_SURFACE,
    outline: 'none',
  },
  '.cm-scroller': {
    flex: 1,
    minHeight: 0,
    overflow: 'auto',
    fontFamily:
      "'JetBrains Mono', 'Fira Code', ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
    lineHeight: '1.55',
    backgroundColor: OL_EDITOR_SURFACE,
  },
  '.cm-content': {
    caretColor: '#e9eef5',
    color: '#d4dbe8',
    padding: '12px 0 48px',
  },
  '.cm-line': {
    color: '#d4dbe8',
  },
  '.cm-cursor': {
    borderLeftColor: '#34cf7a',
    borderLeftWidth: '2px',
  },
  '.cm-dropcursor': {
    borderLeftColor: '#34cf7a',
  },
  '.cm-fat-cursor': {
    backgroundColor: '#34cf7a',
    opacity: '0.85',
  },
  '.cm-gutters': {
    backgroundColor: OL_EDITOR_SURFACE,
    color: OL_GUTTER_MUTED,
    borderRight: '1px solid rgba(255, 255, 255, 0.08)',
    fontFamily:
      "'JetBrains Mono', 'Fira Code', ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
  },
  '.cm-activeLineGutter': {
    backgroundColor: OL_EDITOR_ACTIVE_LINE,
    color: OL_GUTTER_MUTED,
  },
  '.cm-activeLine': {
    backgroundColor: OL_EDITOR_ACTIVE_LINE,
  },
})

export function MarkdownEditor({ value, onChange, language = 'markdown' }) {
  const extensions = useMemo(() => {
    const chrome = [EditorView.lineWrapping, editorChrome]
    if (language === 'python') {
      return [
        python(),
        syntaxHighlighting(pythonDarkHighlight),
        ...chrome,
      ]
    }
    return [markdown(), syntaxHighlighting(markdownDarkHighlight), ...chrome]
  }, [language])

  return (
    <CodeMirror
      value={value}
      height="100%"
      theme="none"
      extensions={extensions}
      onChange={onChange}
      basicSetup={{
        lineNumbers: true,
        foldGutter: true,
        highlightActiveLine: true,
        highlightSelectionMatches: false,
      }}
    />
  )
}
