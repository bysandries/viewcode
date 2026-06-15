export type CellKind = "markdown" | "code"

export interface MarkdownCell {
  id: string
  kind: "markdown"
  content: string
  heading?: {
    level: number
    text: string
    number?: string
  }
}

export interface CodeCell {
  id: string
  kind: "code"
  language: "java"
  code: string
  className?: string
}

export type NotebookCell = MarkdownCell | CodeCell

export interface NotebookMetadata {
  title?: string
  studentName?: string
  studentId?: string
  sourceFileName?: string
  detectedPatterns: {
    hasInheritance: boolean
    hasStatic: boolean
    hasInterface: boolean
    hasOverride: boolean
    hasArrayComparison: boolean
  }
}

export interface Notebook {
  metadata: NotebookMetadata
  cells: NotebookCell[]
}
