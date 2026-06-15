"use client"

import * as React from "react"

import type { Notebook, NotebookCell, NotebookMetadata } from "@/types/notebook"
import type { CellRoleOverride } from "@/lib/cheerpj"

interface NotebookContextValue {
  metadata: NotebookMetadata
  title: string
  setTitle: (value: string) => void
  description: string
  setDescription: (value: string) => void

  cells: NotebookCell[]
  setCells: React.Dispatch<React.SetStateAction<NotebookCell[]>>
  addCellAfter: (index: number, kind: "markdown" | "code") => void
  deleteCell: (id: string) => void
  updateMarkdown: (id: string, content: string) => void
  updateCode: (id: string, code: string) => void

  /** Manual per-cell role overrides ("runnable" | "library"); undefined = auto. */
  roleOverrides: Record<string, CellRoleOverride>
  setRoleOverride: (id: string, role: CellRoleOverride) => void

  /** Which cell the visualizer panel is currently showing. */
  vizTargetId: string | null
  setVizTarget: (id: string | null) => void

  /** The current executing line in the visualizer, relative to the visualized code. */
  vizActiveLine: number | null
  setVizActiveLine: (line: number | null) => void

  /** Live notebook snapshot (cells + metadata.title) for export / URL sharing. */
  notebook: Notebook
}

const NotebookContext = React.createContext<NotebookContextValue | null>(null)

export function useNotebook(): NotebookContextValue {
  const ctx = React.useContext(NotebookContext)
  if (!ctx) throw new Error("useNotebook must be used within <NotebookProvider>")
  return ctx
}

function makeId(prefix: "md" | "code"): string {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`
}

function createMarkdownCell(): NotebookCell {
  return {
    id: makeId("md"),
    kind: "markdown",
    content: "## New Section\n\nWrite your notes here.",
  }
}

let blockCounter = 0
function createCodeCell(): NotebookCell {
  // Unique class name per new cell so cells compile together as one program.
  blockCounter += 1
  const name = `Block${blockCounter}`
  return {
    id: makeId("code"),
    kind: "code",
    language: "java",
    className: name,
    code: `public class ${name} {\n\tpublic static void main(String[] args) {\n\t\tSystem.out.println("Hello from ${name}");\n\t}\n}`,
  }
}

export function NotebookProvider({
  initialNotebook,
  children,
}: {
  initialNotebook: Notebook
  children: React.ReactNode
}) {
  const { metadata } = initialNotebook
  const [cells, setCells] = React.useState<NotebookCell[]>(initialNotebook.cells)
  const [title, setTitle] = React.useState(metadata.title ?? "Untitled Lab")
  const [description, setDescription] = React.useState(
    metadata.sourceFileName
      ? `Parsed from ${metadata.sourceFileName}`
      : "Interactive Java notebook running in your browser.",
  )
  const [roleOverrides, setRoleOverrides] = React.useState<Record<string, CellRoleOverride>>({})
  const [vizTargetId, setVizTarget] = React.useState<string | null>(null)
  const [vizActiveLine, setVizActiveLine] = React.useState<number | null>(null)

  // Reset all state when a different notebook is loaded.
  React.useEffect(() => {
    setCells(initialNotebook.cells)
    setTitle(initialNotebook.metadata.title ?? "Untitled Lab")
    setDescription(
      initialNotebook.metadata.sourceFileName
        ? `Parsed from ${initialNotebook.metadata.sourceFileName}`
        : "Interactive Java notebook running in your browser.",
    )
    setRoleOverrides({})
    setVizTarget(null)
    setVizActiveLine(null)
  }, [initialNotebook])

  const addCellAfter = React.useCallback((index: number, kind: "markdown" | "code") => {
    setCells((prev) => {
      const clone = [...prev]
      clone.splice(index + 1, 0, kind === "code" ? createCodeCell() : createMarkdownCell())
      return clone
    })
  }, [])

  const deleteCell = React.useCallback((id: string) => {
    setCells((prev) => prev.filter((cell) => cell.id !== id))
    setRoleOverrides((prev) => {
      if (!(id in prev)) return prev
      const next = { ...prev }
      delete next[id]
      return next
    })
    setVizTarget((prev) => (prev === id ? null : prev))
  }, [])

  const updateMarkdown = React.useCallback((id: string, content: string) => {
    setCells((prev) =>
      prev.map((cell) => (cell.id === id && cell.kind === "markdown" ? { ...cell, content } : cell)),
    )
  }, [])

  const updateCode = React.useCallback((id: string, code: string) => {
    setCells((prev) =>
      prev.map((cell) => (cell.id === id && cell.kind === "code" ? { ...cell, code } : cell)),
    )
  }, [])

  const setRoleOverride = React.useCallback((id: string, role: CellRoleOverride) => {
    setRoleOverrides((prev) => {
      const next = { ...prev }
      if (role === undefined) delete next[id]
      else next[id] = role
      return next
    })
  }, [])

  const notebook = React.useMemo<Notebook>(
    () => ({ metadata: { ...metadata, title }, cells }),
    [metadata, title, cells],
  )

  const value = React.useMemo<NotebookContextValue>(
    () => ({
      metadata,
      title,
      setTitle,
      description,
      setDescription,
      cells,
      setCells,
      addCellAfter,
      deleteCell,
      updateMarkdown,
      updateCode,
      roleOverrides,
      setRoleOverride,
      vizTargetId,
      setVizTarget,
      vizActiveLine,
      setVizActiveLine,
      notebook,
    }),
    [
      metadata,
      title,
      description,
      cells,
      addCellAfter,
      deleteCell,
      updateMarkdown,
      updateCode,
      roleOverrides,
      setRoleOverride,
      vizTargetId,
      vizActiveLine,
      notebook,
    ],
  )

  return <NotebookContext.Provider value={value}>{children}</NotebookContext.Provider>
}
