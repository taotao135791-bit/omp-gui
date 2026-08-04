interface CodePreviewProps {
  filePath: string | null
  content: string | null
}

export default function CodePreview({ filePath, content }: CodePreviewProps) {
  if (!filePath) {
    return (
      <div className="flex h-full items-center justify-center p-4 text-xs text-gray-500">
        Select a file from the file tree to preview.
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-surface-700 px-3 py-2 text-xs font-medium text-gray-400">
        {filePath.split('/').pop()}
      </div>
      <pre className="flex-1 overflow-auto p-3 text-xs leading-relaxed text-gray-300">
        <code>{content ?? 'Loading...'}</code>
      </pre>
    </div>
  )
}
