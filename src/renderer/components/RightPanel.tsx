import { useEffect } from 'react'
import { FileText, X, Eye } from 'lucide-react'
import { useAppStore } from '../store'
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

  useEffect(() => {
    if (selectedFile && activeRightTab === 'preview') {
      window.electronAPI.readFile(selectedFile).then((result) => {
        setPreviewContent(result.ok ? result.content : `Cannot preview: ${result.error}`)
      })
    }
  }, [selectedFile, activeRightTab, setPreviewContent])

  return (
    <aside className="flex w-72 flex-col border-l border-surface-700 bg-surface-800">
      <div className="flex h-10 items-center justify-between border-b border-surface-700 px-3">
        <div className="flex gap-1">
          <button
            onClick={() => setActiveRightTab('files')}
            className={`flex items-center gap-1.5 rounded px-2 py-1 text-xs font-medium ${
              activeRightTab === 'files' ? 'bg-surface-700 text-white' : 'text-gray-400 hover:bg-surface-700'
            }`}
          >
            <FileText size={12} />
            Files
          </button>
          <button
            onClick={() => setActiveRightTab('preview')}
            className={`flex items-center gap-1.5 rounded px-2 py-1 text-xs font-medium ${
              activeRightTab === 'preview' ? 'bg-surface-700 text-white' : 'text-gray-400 hover:bg-surface-700'
            }`}
          >
            <Eye size={12} />
            Preview
          </button>
        </div>
        <button
          onClick={() => setRightPanelOpen(false)}
          className="rounded p-1 text-gray-500 hover:bg-surface-700 hover:text-gray-300"
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
