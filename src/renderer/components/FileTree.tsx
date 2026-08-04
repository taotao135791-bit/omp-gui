import { useEffect, useState } from 'react'
import { ChevronRight, ChevronDown, Folder, File } from 'lucide-react'
import { useAppStore } from '../store'

interface TreeNode {
  name: string
  path: string
  isDirectory: boolean
  children?: TreeNode[]
  expanded: boolean
}

export default function FileTree() {
  const { currentProject, selectedFile, setSelectedFile, setActiveRightTab } = useAppStore()
  const [tree, setTree] = useState<TreeNode[]>([])

  useEffect(() => {
    if (!currentProject) {
      setTree([])
      return
    }
    loadDir(currentProject).then((children) => {
      setTree([
        {
          name: currentProject.split('/').pop() || currentProject,
          path: currentProject,
          isDirectory: true,
          children,
          expanded: true
        }
      ])
    })
  }, [currentProject])

  const loadDir = async (dirPath: string): Promise<TreeNode[]> => {
    const entries = await window.electronAPI.listDir(dirPath)
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
      setSelectedFile(node.path)
      setActiveRightTab('preview')
      return
    }

    if (node.expanded) {
      const updated = parentList.map((n) => (n.path === node.path ? { ...n, expanded: false, children: undefined } : n))
      setParentList(updated)
      return
    }

    const children = await loadDir(node.path)
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
          className={`flex cursor-pointer items-center gap-1 py-1 pr-2 text-xs ${
            isSelected ? 'bg-brand/20 text-brand-light' : 'text-gray-400 hover:bg-surface-700 hover:text-gray-200'
          }`}
          style={{ paddingLeft: `${depth * 12 + 8}px` }}
        >
          {node.isDirectory ? (
            node.expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />
          ) : (
            <span className="w-3" />
          )}
          {node.isDirectory ? (
            <Folder size={12} className="text-yellow-600" />
          ) : (
            <File size={12} className="text-blue-400" />
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

  if (!currentProject) {
    return (
      <div className="p-4 text-xs text-gray-500">Select a project to browse files.</div>
    )
  }

  return (
    <div className="py-2">
      {tree.map((node) => renderNode(node, tree, setTree))}
    </div>
  )
}
