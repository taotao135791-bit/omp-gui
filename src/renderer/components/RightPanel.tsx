import { useEffect } from 'react'
import { FileText, X, Eye, FileDiff } from 'lucide-react'
import { useAppStore } from '../store'
import { useT, translate } from '../i18n'
import FileTree from './FileTree'
import CodePreview from './CodePreview'
import ChangesPanel from './ChangesPanel'

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
    <aside className="flex w-72 shrink-0 flex-col border-l border-line bg-ink-900">
      <div className="flex h-11 items-center justify-between border-b border-line px-3">
        <div className="flex gap-1">
          <button
            onClick={() => setActiveRightTab('files')}
            className={`flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium transition ${
              activeRightTab === 'files'
                ? 'bg-overlay-strong text-cream'
                : 'text-cream-dim hover:bg-overlay'
            }`}
          >
            <FileText size={12} />
            {t('panel.files')}
          </button>
          <button
            onClick={() => setActiveRightTab('preview')}
            className={`flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium transition ${
              activeRightTab === 'preview'
                ? 'bg-overlay-strong text-cream'
                : 'text-cream-dim hover:bg-overlay'
            }`}
          >
            <Eye size={12} />
            {t('panel.preview')}
          </button>
          <button
            onClick={() => setActiveRightTab('changes')}
            className={`flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium transition ${
              activeRightTab === 'changes'
                ? 'bg-overlay-strong text-cream'
                : 'text-cream-dim hover:bg-overlay'
            }`}
          >
            <FileDiff size={12} />
            {t('panel.changes')}
          </button>
        </div>
        <button
          onClick={() => setRightPanelOpen(false)}
          className="rounded-md p-1 text-cream-faint transition hover:bg-overlay-strong hover:text-cream"
        >
          <X size={14} />
        </button>
      </div>

      <div
        className={
          activeRightTab === 'changes' ? 'flex min-h-0 flex-1 flex-col' : 'flex-1 overflow-y-auto'
        }
      >
        {activeRightTab === 'files' ? (
          <FileTree />
        ) : activeRightTab === 'changes' ? (
          <ChangesPanel />
        ) : (
          <CodePreview filePath={selectedFile} content={previewContent} />
        )}
      </div>
    </aside>
  )
}
