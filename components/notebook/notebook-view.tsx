"use client"

import * as React from "react"
import { BookOpen, User, Hash, Shield, Plus, Trash2, FileCode2, ScrollText, Pencil, Check, X } from "lucide-react"

import { Separator } from "@/components/ui/separator"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { CodeCellView } from "./code-cell"
import { MarkdownCellView } from "./markdown-cell"
import { useNotebook } from "@/components/studio/notebook-provider"

export function NotebookView() {
  const {
    metadata,
    title,
    setTitle,
    description,
    setDescription,
    cells,
    addCellAfter,
    deleteCell,
    updateMarkdown,
  } = useNotebook()

  const [editingTitle, setEditingTitle] = React.useState(false)
  const [editingDescription, setEditingDescription] = React.useState(false)
  const textareaRef = React.useRef<HTMLTextAreaElement>(null)

  const autoExpandTextarea = React.useCallback(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto"
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`
    }
  }, [])

  let codeIndex = -1

  return (
    <div className="space-y-6">
      <header className="rounded-lg border border-border bg-card p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-start gap-3 w-full">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
              <BookOpen className="size-5" />
            </div>
            <div className="space-y-3 flex-1">
              {editingTitle ? (
                <div className="flex items-center gap-2">
                  <Input
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    className="text-lg font-semibold"
                    autoFocus
                  />
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setEditingTitle(false)}
                    className="h-auto p-1"
                  >
                    <Check className="size-4" />
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setTitle(metadata.title ?? "Untitled Lab")
                      setEditingTitle(false)
                    }}
                    className="h-auto p-1"
                  >
                    <X className="size-4" />
                  </Button>
                </div>
              ) : (
                <div className="flex items-center gap-2 group">
                  <h2 className="text-xl font-semibold leading-tight text-balance">
                    {title}
                  </h2>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setEditingTitle(true)}
                    className="no-print h-auto p-1 opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <Pencil className="size-4" />
                  </Button>
                </div>
              )}
              {editingDescription ? (
                <div className="flex flex-col items-start gap-2 w-full">
                  <Textarea
                    ref={textareaRef}
                    value={description}
                    onChange={(e) => {
                      setDescription(e.target.value)
                      autoExpandTextarea()
                    }}
                    onFocus={autoExpandTextarea}
                    className="text-sm resize-none min-h-15 w-full"
                    autoFocus
                  />
                  <div className="flex gap-1">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setEditingDescription(false)}
                      className="h-auto p-1"
                    >
                      <Check className="size-4" />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        setDescription(
                          metadata.sourceFileName
                            ? `Parsed from ${metadata.sourceFileName}`
                            : "Interactive Java notebook running in your browser."
                        )
                        setEditingDescription(false)
                      }}
                      className="h-auto p-1"
                    >
                      <X className="size-4" />
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="flex items-start gap-2 group w-full">
                  <p className="text-sm text-muted-foreground flex-1">
                    {description}
                  </p>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setEditingDescription(true)}
                    className="no-print h-auto p-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                  >
                    <Pencil className="size-4" />
                  </Button>
                </div>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Shield className="size-3.5" />
            <span>Sandboxed - no network</span>
          </div>
        </div>

        {(metadata.studentName || metadata.studentId) && (
          <div className="mt-4 flex flex-wrap items-center gap-3 text-sm">
            {metadata.studentName && (
              <div className="flex items-center gap-1.5 text-muted-foreground">
                <User className="size-3.5" />
                <span className="text-foreground">{metadata.studentName}</span>
              </div>
            )}
            {metadata.studentId && (
              <div className="flex items-center gap-1.5 text-muted-foreground">
                <Hash className="size-3.5" />
                <span className="font-mono text-foreground">{metadata.studentId}</span>
              </div>
            )}
          </div>
        )}

        <Separator className="my-4" />
      </header>

      <div className="space-y-4">
        {cells.length === 0 ? (
          <div className="space-y-3 rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
            <p>No blocks yet. Create your first markdown or code block.</p>
            <div className="flex items-center justify-center gap-2">
              <Button size="sm" onClick={() => addCellAfter(-1, "markdown")}>
                <ScrollText className="size-4" />
                Add markdown block
              </Button>
              <Button size="sm" variant="outline" onClick={() => addCellAfter(-1, "code")}>
                <FileCode2 className="size-4" />
                Add code block
              </Button>
            </div>
          </div>
        ) : (
          cells.map((cell, i) => {
            if (cell.kind === "code") {
              codeIndex += 1
              return (
                <section key={cell.id} className="space-y-2 print-break-inside-avoid">
                  <CodeCellView cell={cell} index={codeIndex} />
                  <CellActions
                    onAddMarkdown={() => addCellAfter(i, "markdown")}
                    onAddCode={() => addCellAfter(i, "code")}
                    onDelete={() => deleteCell(cell.id)}
                  />
                </section>
              )
            }
            return (
              <section key={cell.id} className="space-y-2 rounded-lg border border-border bg-card p-4 shadow-sm print-break-inside-avoid">
                <MarkdownCellView
                  cell={cell}
                  onChange={(content) => updateMarkdown(cell.id, content)}
                />
                <CellActions
                  onAddMarkdown={() => addCellAfter(i, "markdown")}
                  onAddCode={() => addCellAfter(i, "code")}
                  onDelete={() => deleteCell(cell.id)}
                />
              </section>
            )
          })
        )}
      </div>
    </div>
  )
}

function CellActions({
  onAddMarkdown,
  onAddCode,
  onDelete,
}: {
  onAddMarkdown: () => void
  onAddCode: () => void
  onDelete: () => void
}) {
  return (
    <div className="no-print flex items-center justify-end gap-1">
      <Button type="button" size="sm" variant="ghost" onClick={onAddMarkdown}>
        <Plus className="size-4" />
        <ScrollText className="size-4" />
      </Button>
      <Button type="button" size="sm" variant="ghost" onClick={onAddCode}>
        <Plus className="size-4" />
        <FileCode2 className="size-4" />
      </Button>
      <Button type="button" size="sm" variant="ghost" onClick={onDelete}>
        <Trash2 className="size-4" />
      </Button>
    </div>
  )
}
