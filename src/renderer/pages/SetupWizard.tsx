import { useEffect, useState } from 'react'
import { Download, CheckCircle, AlertCircle, Loader2, Terminal, ArrowRight } from 'lucide-react'
import { useAppStore } from '../store'

export default function SetupWizard() {
  const {
    cliAvailable,
    installStatus,
    setCliAvailable,
    setSetupComplete,
    setInstallStatus
  } = useAppStore()

  const [manualCommand, setManualCommand] = useState('curl -fsSL https://omp.sh/install | sh')

  useEffect(() => {
    window.electronAPI.detectCli().then((info) => {
      setCliAvailable(info.available)
      if (info.available) {
        setSetupComplete(true)
      }
    })
  }, [setCliAvailable, setSetupComplete])

  useEffect(() => {
    const unsubscribe = window.electronAPI.onInstallStatus((status) => {
      setInstallStatus(status)
      if (status.type === 'success') {
        window.electronAPI.detectCli().then((info) => {
          setCliAvailable(info.available)
          if (info.available) {
            setSetupComplete(true)
          }
        })
      }
    })
    return () => unsubscribe()
  }, [setInstallStatus, setCliAvailable, setSetupComplete])

  const handleAutoInstall = async () => {
    setInstallStatus({ type: 'downloading', progress: 0, message: 'Starting download...' })
    const success = await window.electronAPI.installOmp()
    if (!success) {
      // error status is already set by the installer events
    }
  }

  const handleManualDone = async () => {
    const info = await window.electronAPI.detectCli()
    setCliAvailable(info.available)
    if (info.available) {
      setSetupComplete(true)
    }
  }

  if (cliAvailable === null) {
    return (
      <div className="flex h-full flex-col items-center justify-center bg-surface-900 text-gray-100">
        <Loader2 className="mb-4 animate-spin text-brand" size={32} />
        <div className="text-sm text-gray-400">Detecting environment...</div>
      </div>
    )
  }

  if (cliAvailable) {
    return (
      <div className="flex h-full flex-col items-center justify-center bg-surface-900 text-gray-100">
        <CheckCircle className="mb-4 text-brand" size={48} />
        <div className="text-xl font-semibold">Oh My Pi is ready</div>
        <div className="mt-2 text-sm text-gray-400">Launching main interface...</div>
      </div>
    )
  }

  const isInstalling = installStatus.type !== 'idle' && installStatus.type !== 'error' && installStatus.type !== 'success'
  const isError = installStatus.type === 'error'

  return (
    <div className="flex h-full flex-col items-center justify-center bg-surface-900 p-8 text-gray-100">
      <div className="w-full max-w-xl rounded-2xl border border-surface-700 bg-surface-800 p-8 shadow-xl">
        <div className="mb-6 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand font-bold text-white">
            π
          </div>
          <div>
            <h1 className="text-xl font-semibold">Welcome to OMP GUI</h1>
            <p className="text-sm text-gray-400">A Codex-style desktop interface for Oh My Pi</p>
          </div>
        </div>

        <div className="mb-6 rounded-lg border border-yellow-900/50 bg-yellow-900/20 p-4">
          <div className="flex items-start gap-3">
            <AlertCircle className="mt-0.5 shrink-0 text-yellow-500" size={18} />
            <div className="text-sm text-yellow-200">
              Oh My Pi (omp) was not found on this Mac. OMP GUI needs it to run the AI coding agent.
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <button
            onClick={handleAutoInstall}
            disabled={isInstalling}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-brand px-4 py-3 text-sm font-medium text-white transition hover:bg-brand-dark disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isInstalling ? (
              <Loader2 size={18} className="animate-spin" />
            ) : (
              <Download size={18} />
            )}
            {isInstalling ? 'Installing...' : 'Auto-install Oh My Pi'}
          </button>

          {installStatus.type === 'downloading' && (
            <div className="space-y-2">
              <div className="h-2 overflow-hidden rounded-full bg-surface-700">
                <div
                  className="h-full bg-brand transition-all"
                  style={{ width: `${installStatus.progress}%` }}
                />
              </div>
              <div className="text-xs text-gray-400">{installStatus.message}</div>
            </div>
          )}

          {(installStatus.type === 'installing' || installStatus.type === 'success') && (
            <div className="rounded-lg bg-surface-900/50 p-3 text-xs text-gray-300">
              <div className="mb-1 flex items-center gap-1.5 text-gray-500">
                <Terminal size={12} />
                Install log
              </div>
              <div className="font-mono">{installStatus.message}</div>
            </div>
          )}

          {isError && (
            <div className="rounded-lg border border-red-900/50 bg-red-900/20 p-3 text-xs text-red-200">
              <div className="mb-1 flex items-center gap-1.5 font-medium">
                <AlertCircle size={12} />
                Installation failed
              </div>
              <pre className="whitespace-pre-wrap font-mono">{installStatus.message}</pre>
            </div>
          )}

          <div className="relative flex items-center py-2">
            <div className="flex-1 border-t border-surface-700" />
            <span className="px-3 text-xs text-gray-500">or install manually</span>
            <div className="flex-1 border-t border-surface-700" />
          </div>

          <div className="space-y-2">
            <label className="text-xs text-gray-500">Terminal command</label>
            <div className="flex gap-2">
              <input
                readOnly
                value={manualCommand}
                className="flex-1 rounded-lg border border-surface-600 bg-surface-900 px-3 py-2 font-mono text-xs text-gray-300 outline-none"
              />
              <button
                onClick={() => navigator.clipboard.writeText(manualCommand)}
                className="rounded-lg border border-surface-600 px-3 py-2 text-xs text-gray-300 hover:bg-surface-700"
              >
                Copy
              </button>
            </div>
            <button
              onClick={handleManualDone}
              className="flex w-full items-center justify-center gap-2 rounded-lg border border-surface-600 px-4 py-2 text-sm text-gray-300 transition hover:bg-surface-700"
            >
              I've installed it
              <ArrowRight size={14} />
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
