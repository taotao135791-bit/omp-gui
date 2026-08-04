import { useEffect } from 'react'
import { FileText, X, Eye } from 'lucide-react'
import { useAppStore } from '../store'
import { useT, translate } from '../i18n'
import FileTree from './FileTree'
import CodePreview from './CodePreview'

export default function RightPanel() {
  const {
    activeRightTab,
    selectedFile,
    previewContent,
    setActiveRightTab,
    setRightPanelOpen,
    setPreviewContent
  } = useAppStore()
  const t = useT()

  useEffect(() => {
    if (selectedFile && activeRightTab === 'preview') {
      window.electronAPI.readFile(selectedFile).then((result) => {
        setPreviewContent(
          result.ok
            ? result.content
            : translate(useAppStore.getState().language, 'panel.cannotPreview', { error: result.error })
        )
      })
    }
  }, [selectedFile, activeRightTab, setPreviewContent])

  return (
    <aside className="flex w-72 shrink-0 flex-col border-l border-white/[0.06] bg-ink-900">
      <div className="flex h-11 items-center justify-between border-b border-white/[0.06] px-3">
        <div className="flex gap-1">
          <button
            onClick={() => setActiveRightTab('files')}
            className={`flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium transition ${
              activeRightTab === 'files'
                ? 'bg-white/[0.08] text-cream'
                : 'text-cream-dim hover:bg-white/[0.04]'
            }`}
          >
            <FileText size={12} />
            {t('panel.files')}
          </button>
          <button
            onClick={() => setActiveRightTab('preview')}
            className={`flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium transition ${
              activeRightTab === 'preview'
                ? 'bg-white/[0.08] text-cream'
                : 'text-cream-dim hover:bg-white/[0.04]'
            }`}
          >
            <Eye size={12} />
            {t('panel.preview')}
          </button>
        </div>
        <button
          onClick={() => setRightPanelOpen(false)}
          className="rounded-md p-1 text-cream-faint transition hover:bg-white/[0.06] hover:text-cream"
        >
          <X size={14} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        {activeRightTab === 'files' ? (
          <FileTree />
        ) : (
          <CodePreview filePath={selectedFile} content={previewContent} />
        )}
      </div>
    </aside>
  )
}
