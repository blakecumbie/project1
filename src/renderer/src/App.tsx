import React, { useEffect } from 'react'
import { HashRouter, Routes, Route } from 'react-router-dom'
import { AppShell } from '@/components/layout/AppShell'
import { DashboardPage } from '@/routes/DashboardPage'
import { DocumentPage } from '@/routes/DocumentPage'
import { SettingsPage } from '@/routes/SettingsPage'
import { RecordingOverlay } from '@/components/recording/RecordingOverlay'
import { useProjectStore } from '@/store/projectStore'
import { useSettingsStore } from '@/store/settingsStore'

export function App(): React.ReactElement {
  const loadProjects = useProjectStore((s) => s.loadProjects)
  const loadSettings = useSettingsStore((s) => s.loadSettings)

  useEffect(() => {
    loadProjects()
    loadSettings()
  }, [loadProjects, loadSettings])

  // Determine if this window is the overlay
  const isOverlay = window.location.hash === '#/overlay'

  if (isOverlay) {
    return (
      <div className="w-full h-screen flex items-center justify-center bg-transparent">
        <RecordingOverlay />
      </div>
    )
  }

  return (
    <HashRouter>
      <Routes>
        <Route path="/" element={<AppShell />}>
          <Route index element={<DashboardPage />} />
          <Route path="document/:id" element={<DocumentPage />} />
          <Route path="settings" element={<SettingsPage />} />
        </Route>
      </Routes>
    </HashRouter>
  )
}
