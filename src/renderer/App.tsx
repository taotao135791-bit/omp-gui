import { useEffect } from 'react'
import { Routes, Route, useNavigate } from 'react-router-dom'
import { useAppStore } from './store'
import { useT } from './i18n'
import { createSessionForCurrentProject } from './lib/session'
import Layout from './components/Layout'
import ChatPage from './pages/ChatPage'
import PackagesPage from './pages/PackagesPage'
import SettingsPage from './pages/SettingsPage'
import SetupWizard from './pages/SetupWizard'

function App() {
  const {
    setupComplete,
    setTheme,
    setLanguage,
    setCliAvailable,
    setSetupComplete,
    applySessionEvent
  } = useAppStore()
  const t = useT()
  const navigate = useNavigate()

  useEffect(() => {
    window.electronAPI.getStore('theme').then((theme) => {
      setTheme(theme)
    })
    window.electronAPI.getStore('language').then((language) => {
      setLanguage(language)
    })
    window.electronAPI.getStore('setupComplete').then((complete) => {
      setSetupComplete(complete)
    })
    window.electronAPI.detectCli().then((info) => {
      setCliAvailable(info.available)
    })
    // Runtime-reported settings/auth/model state (profile-aware adapters).
    useAppStore.getState().loadRuntimeOverview()
    useAppStore.getState().loadRuntimeModels()
    window.electronAPI.listPackages().then((packages) => {
      useAppStore.getState().setPackages(packages)
    })
    window.electronAPI.getStore('pinnedSessionIds').then((ids) => {
      useAppStore.getState().setPinnedSessionIds(ids ?? [])
    })
    window.electronAPI.getStore('archivedSessionIds').then((ids) => {
      useAppStore.getState().setArchivedSessionIds(ids ?? [])
    })

    const unsubscribe = window.electronAPI.onSessionEvent((event) => {
      applySessionEvent(event)
    })

    // Native login flow state (Settings → Authentication)
    const unsubscribeLogin = window.electronAPI.onLoginState((loginState) => {
      useAppStore.setState({ loginState })
      if (
        loginState.status === 'connected' ||
        loginState.status === 'failed' ||
        loginState.status === 'cancelled'
      ) {
        // The flow settled: auth state and model availability may have
        // changed — refresh everything the runtime reports.
        void useAppStore.getState().loadRuntimeOverview(true)
        void useAppStore.getState().loadRuntimeModels()
        void useAppStore.getState().loadModelState()
      }
    })

    // Clicking a completion notification focuses that session's chat
    const unsubscribeNotify = window.electronAPI.onNotifySelectSession((sessionId) => {
      const state = useAppStore.getState()
      if (state.sessions.some((s) => s.id === sessionId)) {
        state.setCurrentSessionId(sessionId)
        navigate('/')
      }
    })

    return () => {
      unsubscribe()
      unsubscribeNotify()
      unsubscribeLogin()
    }
  }, [setTheme, setLanguage, setCliAvailable, setSetupComplete, applySessionEvent, navigate])

  // ⌘N starts a new chat from anywhere
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.metaKey && !e.shiftKey && !e.ctrlKey && e.key.toLowerCase() === 'n') {
        e.preventDefault()
        createSessionForCurrentProject().then((id) => {
          if (id) navigate('/')
        })
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [navigate])

  if (setupComplete === null) {
    // Settings not loaded yet — avoid flashing the setup wizard
    return (
      <div className="flex h-full items-center justify-center bg-ink-950 text-sm text-cream-faint">
        {t('app.loading')}
      </div>
    )
  }

  if (!setupComplete) {
    return <SetupWizard />
  }

  return (
    <Layout>
      <Routes>
        <Route path="/" element={<ChatPage />} />
        <Route path="/plugins" element={<PackagesPage />} />
        <Route path="/settings" element={<SettingsPage />} />
      </Routes>
    </Layout>
  )
}

export default App
