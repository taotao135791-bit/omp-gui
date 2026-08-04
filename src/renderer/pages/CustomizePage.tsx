import { useEffect, useState } from 'react'
import { Puzzle, Plus, RotateCcw, Cpu, Package, Layers } from 'lucide-react'
import { ModuleInfo } from '@shared/types'
import { useAppStore } from '../store'

export default function CustomizePage() {
  const { currentProject, modules, setModules, updateModuleEnabled } = useAppStore()
  const [installUrl, setInstallUrl] = useState('')

  useEffect(() => {
    window.electronAPI.scanModules(currentProject || undefined).then((scanned) => {
      setModules(scanned)
    })
  }, [currentProject, setModules])

  const handleToggle = async (mod: ModuleInfo) => {
    const next = !mod.enabled
    updateModuleEnabled(mod.id, next)
    await window.electronAPI.setModuleEnabled(mod.id, next)
  }

  const handleInstall = async () => {
    if (!installUrl.trim()) return
    // Placeholder: real implementation would call omp install
    alert(`Install command would run: omp install ${installUrl}`)
    setInstallUrl('')
  }

  const enabledModules = modules.filter((m) => m.enabled)
  const availableModules = modules.filter((m) => !m.enabled)

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <header className="flex h-14 shrink-0 items-center justify-between border-b border-surface-700 bg-surface-800/50 px-6">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand/20 text-brand">
            <Puzzle size={18} />
          </div>
          <div>
            <div className="text-sm font-medium text-white">Assemble your Pi</div>
            <div className="text-xs text-gray-500">Enable, disable, and arrange modules.</div>
          </div>
        </div>
        <button
          onClick={() => window.electronAPI.scanModules(currentProject || undefined).then(setModules)}
          className="flex items-center gap-1.5 rounded-lg border border-surface-600 px-3 py-1.5 text-xs font-medium text-gray-300 transition hover:bg-surface-700"
        >
          <RotateCcw size={12} />
          Refresh
        </button>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* Available modules */}
        <div className="flex w-1/2 flex-col border-r border-surface-700">
          <div className="flex items-center gap-2 border-b border-surface-700 px-4 py-3">
            <Package size={16} className="text-gray-400" />
            <span className="text-sm font-medium text-gray-200">Available Modules</span>
            <span className="ml-auto rounded-full bg-surface-700 px-2 py-0.5 text-xs text-gray-400">
              {availableModules.length}
            </span>
          </div>
          <div className="flex-1 overflow-y-auto p-4">
            <div className="mb-4 flex gap-2">
              <input
                type="text"
                value={installUrl}
                onChange={(e) => setInstallUrl(e.target.value)}
                placeholder="npm:package or git:repo"
                className="flex-1 rounded-md border border-surface-600 bg-surface-900 px-3 py-2 text-xs text-gray-100 outline-none focus:border-brand"
              />
              <button
                onClick={handleInstall}
                className="flex items-center gap-1.5 rounded-md bg-brand px-3 py-2 text-xs font-medium text-white hover:bg-brand-dark"
              >
                <Plus size={12} />
                Install
              </button>
            </div>
            <div className="grid gap-3">
              {availableModules.map((mod) => (
                <ModuleCard key={mod.id} mod={mod} onToggle={() => handleToggle(mod)} />
              ))}
              {availableModules.length === 0 && (
                <div className="rounded-lg border border-dashed border-surface-600 p-6 text-center text-xs text-gray-500">
                  All discovered modules are already enabled.
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Assembled Pi */}
        <div className="flex w-1/2 flex-col bg-surface-800/30">
          <div className="flex items-center gap-2 border-b border-surface-700 px-4 py-3">
            <Layers size={16} className="text-gray-400" />
            <span className="text-sm font-medium text-gray-200">Assembled Pi</span>
            <span className="ml-auto rounded-full bg-brand/20 px-2 py-0.5 text-xs text-brand-light">
              {enabledModules.length}
            </span>
          </div>
          <div className="flex flex-1 flex-col items-center justify-center overflow-y-auto p-6">
            <div className="relative flex flex-col items-center gap-6">
              <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-brand font-bold text-3xl text-white shadow-lg shadow-brand/20">
                <Cpu size={36} />
              </div>
              <div className="text-center">
                <div className="text-sm font-medium text-white">Pi Core</div>
                <div className="text-xs text-gray-500">{enabledModules.length} modules attached</div>
              </div>
              <div className="grid w-full max-w-sm gap-3">
                {enabledModules.map((mod) => (
                  <div
                    key={mod.id}
                    className="flex items-center justify-between rounded-lg border border-brand/30 bg-surface-800 px-3 py-2 shadow-sm"
                  >
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium text-gray-200">{mod.name}</div>
                      <div className="truncate text-xs text-gray-500">{mod.source}</div>
                    </div>
                    <button
                      onClick={() => handleToggle(mod)}
                      className="ml-2 rounded-md bg-red-900/30 px-2 py-1 text-xs font-medium text-red-400 hover:bg-red-900/50"
                    >
                      Remove
                    </button>
                  </div>
                ))}
                {enabledModules.length === 0 && (
                  <div className="text-center text-xs text-gray-500">
                    No modules attached. Enable modules from the left to assemble your Pi.
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function ModuleCard({ mod, onToggle }: { mod: ModuleInfo; onToggle: () => void }) {
  return (
    <div className="flex items-start justify-between rounded-lg border border-surface-600 bg-surface-800 p-3 transition hover:border-surface-500">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-gray-200">{mod.name}</span>
          {mod.version && (
            <span className="rounded-full bg-surface-700 px-1.5 py-0.5 text-[10px] text-gray-400">
              {mod.version}
            </span>
          )}
        </div>
        <div className="mt-1 text-xs text-gray-500">{mod.description}</div>
        <div className="mt-2 flex items-center gap-2 text-[10px] text-gray-600">
          <span className="uppercase">{mod.source}</span>
          {mod.author && <span>· {mod.author}</span>}
        </div>
      </div>
      <button
        onClick={onToggle}
        className="ml-3 shrink-0 rounded-md bg-brand/20 px-2.5 py-1.5 text-xs font-medium text-brand transition hover:bg-brand hover:text-white"
      >
        Enable
      </button>
    </div>
  )
}
