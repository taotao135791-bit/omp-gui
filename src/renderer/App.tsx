import { useEffect } from 'react'
import { Routes, Route } from 'react-router-dom'
import { useAppStore } from './store'
import Layout from './components/Layout'
import ChatPage from './pages/ChatPage'
import CustomizePage from './pages/CustomizePage'
import SetupWizard from './pages/SetupWizard'

function App() {
  const {
    setupComplete,
    setTheme,
    setCliAvailable,
    setSetupComplete,
    applySessionEvent
  } = useAppStore()

  useEffect(() => {
    window.electronAPI.getStore('theme').then((theme) => {
      setTheme(theme)
    })
    window.electronAPI.getStore('setupComplete').then((complete) => {
      setSetupComplete(complete)
    })
    window.electronAPI.detectCli().then((info) => {
      setCliAvailable(info.available)
      if (!info.available && !setupComplete) {
        // Will show setup wizard
      }
    })

    const unsubscribe = window.electronAPI.onSessionEvent((event) => {
      applySessionEvent(event)
    })

    return () => {
      unsubscribe()
    }
  }, [setTheme, setCliAvailable, setSetupComplete, applySessionEvent])

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
