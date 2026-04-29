/**
 * Thin wrapper around CodeMirror 6 for Markdown editing (dark theme, wraps lines).
 */

import CodeMirror from '@uiw/react-codemirror'
import { markdown } from '@codemirror/lang-markdown'
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
  { tag: [t.link, t.url], color: '#5bb880', textDecoration: 'underline' },
  { tag: t.emphasis, color: '#d4d4d4', fontStyle: 'italic' },
  { tag: t.strong, color: '#d4d4d4', fontWeight: 'bold' },
  { tag: [t.monospace, t.meta], color: '#ce9178' },
])

const editorChrome = EditorView.theme({
  '.cm-editor': {
    height: '100%',
    flex: 1,
    minHeight: 0,
    fontSize: '13px',
    display: 'flex',
    flexDirection: 'column',
    backgroundColor: '#1e1e1e',
    outline: 'none',
  },
  '.cm-scroller': {
    flex: 1,
    minHeight: 0,
    overflow: 'auto',
    fontFamily:
      "'JetBrains Mono', 'Fira Code', ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
    lineHeight: '1.55',
    backgroundColor: '#1e1e1e',
  },
  '.cm-content': {
    caretColor: '#ffffff',
    color: '#d4d4d4',
    padding: '12px 0 48px',
  },
  '.cm-line': {
    color: '#d4d4d4',
  },
  '.cm-cursor': {
    borderLeftColor: '#ffffff',
    borderLeftWidth: '2px',
  },
  '.cm-dropcursor': {
    borderLeftColor: '#ffffff',
  },
  '.cm-fat-cursor': {
    backgroundColor: '#ffffff',
    opacity: '0.85',
  },
  '.cm-gutters': {
    backgroundColor: '#1e1e1e',
    color: '#858585',
    borderRight: '1px solid #404040',
    fontFamily:
      "'JetBrains Mono', 'Fira Code', ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
  },
  '.cm-activeLineGutter': {
    backgroundColor: '#252526',
    color: '#858585',
  },
  '.cm-activeLine': {
    backgroundColor: '#252526',
  },
})

export function MarkdownEditor({ value, onChange }) {
  return (
    <CodeMirror
      value={value}
      height="100%"
      theme="none"
      extensions={[
        markdown(),
        syntaxHighlighting(markdownDarkHighlight),
        EditorView.lineWrapping,
        editorChrome,
      ]}
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
