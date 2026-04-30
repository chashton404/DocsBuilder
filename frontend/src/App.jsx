/**
 * Top-level routes: projects list → wizard → editor.
 */

import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import ProjectEditor from './ProjectEditor.jsx'
import ProjectsPage from './ProjectsPage.jsx'
import ProjectWizard from './ProjectWizard.jsx'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Navigate to="/projects" replace />} />
        <Route path="/projects" element={<ProjectsPage />} />
        <Route path="/projects/:projectId/wizard" element={<ProjectWizard />} />
        <Route path="/projects/:projectId" element={<ProjectEditor />} />
      </Routes>
    </BrowserRouter>
  )
}
