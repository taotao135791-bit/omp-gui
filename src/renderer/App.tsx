import { useEffect } from 'react'
import { Routes, Route } from 'react-router-dom'
import { useAppStore } from './store'
import { useT } from './i18n'
import Layout from './components/Layout'
import ChatPage from './pages/ChatPage'
import CustomizePage from './pages/CustomizePage'
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

    const unsubscribe = window.electronAPI.onSessionEvent((event) => {
      applySessionEvent(event)
    })

    return () => {
      unsubscribe()
    }
  }, [setTheme, setLanguage, setCliAvailable, setSetupComplete, applySessionEvent])

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
        <Route path="/customize" element={<CustomizePage />} />
      </Routes>
    </Layout>
  )
}

export default App
