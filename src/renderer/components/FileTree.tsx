import { useEffect, useState } from 'react'
import { ChevronRight, ChevronDown, Folder, File } from 'lucide-react'
import { useAppStore } from '../store'
import { useT } from '../i18n'

interface TreeNode {
  name: string
  path: string
  isDirectory: boolean
  children?: TreeNode[]
  expanded: boolean
}

export default function FileTree() {
  const { currentWorkspace, selectedFile, setSelectedFile, setActiveRightTab } = useAppStore()
  const [tree, setTree] = useState<TreeNode[]>([])
  const t = useT()

  useEffect(() => {
    if (!currentWorkspace) {
      setTree([])
      return
    }
    loadDir(currentWorkspace.id, '').then((children) => {
      setTree([
        {
          name: currentWorkspace.displayPath.split('/').pop() || currentWorkspace.displayPath,
          path: '',
          isDirectory: true,
          children,
          expanded: true
        }
      ])
    })
  }, [currentWorkspace])

  const loadDir = async (grantId: string, relativePath: string): Promise<TreeNode[]> => {
    const entries = await window.electronAPI.listDir(grantId, relativePath || undefined)
    return entries
      .filter((e) => !e.name.startsWith('.') && e.name !== 'node_modules')
      .sort((a, b) => (a.isDirectory === b.isDirectory ? a.name.localeCompare(b.name) : a.isDirectory ? -1 : 1))
      .map((e) => ({
        name: e.name,
        path: e.path,
        isDirectory: e.isDirectory,
        expanded: false
      }))
  }

  const toggleNode = async (node: TreeNode, parentList: TreeNode[], setParentList: (list: TreeNode[]) => void) => {
    if (!node.isDirectory) {
      if (!currentWorkspace) return
      setSelectedFile(node.path)
      setActiveRightTab('preview')
      return
    }

    if (node.expanded) {
      const updated = parentList.map((n) => (n.path === node.path ? { ...n, expanded: false, children: undefined } : n))
      setParentList(updated)
      return
    }

    if (!currentWorkspace) return
    const children = await loadDir(currentWorkspace.id, node.path)
    const updated = parentList.map((n) => (n.path === node.path ? { ...n, expanded: true, children } : n))
    setParentList(updated)
  }

  const renderNode = (
    node: TreeNode,
    parentList: TreeNode[],
    setParentList: (list: TreeNode[]) => void,
    depth = 0
  ) => {
    const isSelected = selectedFile === node.path

    return (
      <div key={node.path}>
        <div
          onClick={() => toggleNode(node, parentList, setParentList)}
          className={`flex h-7 cursor-pointer items-center gap-1.5 rounded-md pr-2 font-mono text-[12px] transition ${
            isSelected ? 'bg-accent/10 text-accent' : 'text-cream-dim hover:bg-overlay hover:text-cream'
          }`}
          style={{ paddingLeft: `${depth * 12 + 8}px` }}
        >
          {node.isDirectory ? (
            node.expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />
          ) : (
            <span className="w-3" />
          )}
          {node.isDirectory ? (
            <Folder size={13} className="text-accent/70" />
          ) : (
            <File size={13} className="text-cream-faint" />
          )}
          <span className="truncate">{node.name}</span>
        </div>
        {node.isDirectory && node.expanded && node.children && (
          <div>
            {node.children.map((child) =>
              renderNode(child, node.children!, (newChildren) => {
                const updated = parentList.map((n) =>
                  n.path === node.path ? { ...n, children: newChildren } : n
                )
                setParentList(updated)
              }, depth + 1)
            )}
          </div>
        )}
      </div>
    )
  }

  if (!currentWorkspace) {
    return (
      <div className="p-4 text-xs text-cream-faint">{t('panel.selectProject')}</div>
    )
  }

  return (
    <div className="px-1.5 py-2">
      {tree.map((node) => renderNode(node, tree, setTree))}
    </div>
  )
}
