"use client"

import * as React from "react"
import dynamic from "next/dynamic"
import { useTheme } from "next-themes"
import { Check, Copy, Eye, Play, RotateCcw, Terminal, Wrench } from "lucide-react"
import Prism from "prismjs"
import "prismjs/components/prism-java"

import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Spinner } from "@/components/ui/spinner"
import { cn } from "@/lib/utils"
import { useCheerpJ } from "@/components/cheerpj-provider"
import {
  buildProgram,
  compileAndRunJava,
  getCellRole,
  ProgramAssemblyError,
  type CellRoleOverride,
  type JavaRunResult,
} from "@/lib/cheerpj"
import { useNotebook } from "@/components/studio/notebook-provider"
import type { CodeCell as CodeCellType } from "@/types/notebook"

const MonacoEditor = dynamic(
  () => import("@monaco-editor/react").then((m) => m.default),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-48 items-center justify-center bg-muted/40 text-sm text-muted-foreground">
        Loading editor...
      </div>
    ),
  },
)

interface CodeCellProps {
  cell: CodeCellType
  index: number
}

export function CodeCellView({ cell, index }: CodeCellProps) {
  const { status: cheerpjStatus, error: cheerpjError } = useCheerpJ()
  const { resolvedTheme } = useTheme()
  const { cells, roleOverrides, setRoleOverride, updateCode, vizTargetId, setVizTarget, vizActiveLine } = useNotebook()
  const [code, setCode] = React.useState(cell.code)
  const [result, setResult] = React.useState<JavaRunResult | null>(null)
  const [running, setRunning] = React.useState(false)
  const [copied, setCopied] = React.useState(false)

  const editorRef = React.useRef<any>(null)
  const monacoRef = React.useRef<any>(null)
  const decorationsCollectionRef = React.useRef<any>(null)
  const decoratorsRef = React.useRef<string[]>([])
  const cellContainerRef = React.useRef<HTMLDivElement>(null)

  React.useEffect(() => {
    setCode(cell.code)
  }, [cell.code])

  const override = roleOverrides[cell.id]
  const roleInfo = React.useMemo(() => getCellRole(code, override), [code, override])

  const editorHeight = React.useMemo(() => {
    const lines = code.split("\n").length
    return Math.min(Math.max(lines * 20 + 24, 140), 560)
  }, [code])

  React.useEffect(() => {
    // console.log("CodeCell effect running:", { vizTargetId, vizActiveLine, id: cell.id })
    if (editorRef.current && monacoRef.current) {
      if (vizTargetId === cell.id && vizActiveLine !== null) {
        const line = vizActiveLine - (roleInfo.needsWrap ? 2 : 0)
        const valid = line > 0 && line <= editorRef.current.getModel().getLineCount()
        
        console.log(`[CodeCell] Highlighting line ${line} (valid=${valid}) for cell ${cell.id}`)
        
        if (valid) editorRef.current.revealLineInCenterIfOutsideViewport(line)

        // Scroll the notebook panel so this code cell is visible.
        // The Monaco revealLine call only scrolls *within* the editor;
        // this scrolls the outer notebook container to bring the cell
        // into view during step-by-step visualization.
        if (valid && cellContainerRef.current) {
          cellContainerRef.current.scrollIntoView({ behavior: "smooth", block: "nearest" })
        }

        const newDecs = valid ? [{
          range: new monacoRef.current.Range(line, 1, line, 1),
          options: { 
            isWholeLine: true, 
            className: "highlight-line",
            marginClassName: "highlight-line"
          }
        }] : []

        if (decorationsCollectionRef.current) {
          decorationsCollectionRef.current.set(newDecs)
        } else if (editorRef.current.createDecorationsCollection) {
          decorationsCollectionRef.current = editorRef.current.createDecorationsCollection(newDecs)
        } else {
          decoratorsRef.current = editorRef.current.deltaDecorations(decoratorsRef.current, newDecs)
        }
      } else {
        // Clear decorations if not active
        if (decorationsCollectionRef.current) {
          decorationsCollectionRef.current.set([])
        } else if (editorRef.current.deltaDecorations) {
          decoratorsRef.current = editorRef.current.deltaDecorations(decoratorsRef.current, [])
        }
      }
    }
  }, [vizTargetId, vizActiveLine, cell.id, roleInfo.needsWrap])

  const printHighlightedLines = React.useMemo(() => {
    const normalized = code.replace(/\r\n/g, "\n")
    const lines = normalized.split("\n")
    return lines.map((line) => Prism.highlight(line.length > 0 ? line : " ", Prism.languages.java, "java"))
  }, [code])

  const handleRun = async () => {
    if (cheerpjStatus !== "ready") return
    setRunning(true)
    setResult(null)
    try {
      // Compile the whole notebook together so classes from other cells resolve.
      const { entryCode, extraSources } = buildProgram(cells, cell.id, roleOverrides)
      const res = await compileAndRunJava(entryCode, { extraSources, precompileSeparately: true })
      setResult(res)
    } catch (err) {
      setResult({
        stdout: "",
        stderr:
          err instanceof ProgramAssemblyError
            ? err.message
            : err instanceof Error
              ? err.message
              : String(err),
        exitCode: 1,
        durationMs: 0,
      })
    } finally {
      setRunning(false)
    }
  }

  const handleReset = () => {
    setCode(cell.code)
    updateCode(cell.id, cell.code)
    setResult(null)
  }

  const handleVisualize = () => {
    // Show this block in the visualizer panel — no navigation.
    setVizTarget(cell.id)
  }

  const handleCopy = async () => {
    await navigator.clipboard.writeText(code)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const canRun = cheerpjStatus === "ready" && !running && roleInfo.canVisualize

  return (
    <section
      ref={cellContainerRef}
      aria-label={`Code cell ${index + 1}`}
      className="group rounded-lg border border-border bg-card shadow-sm print-break-inside-avoid"
    >
      <header className="no-print flex items-center justify-between gap-2 border-b border-border px-3 py-2">
        <div className="flex items-center gap-2">
          <Badge variant="secondary" className="font-mono text-xs">
            In [{index + 1}]
          </Badge>
          <Badge variant="outline" className="text-xs">
            Java
          </Badge>
          {cell.className ? (
            <span className="font-mono text-xs text-muted-foreground">
              {cell.className}.java
            </span>
          ) : null}
          <RoleSelect
            value={override}
            detected={roleInfo.role}
            onChange={(next) => setRoleOverride(cell.id, next)}
          />
        </div>
        <div className="flex items-center gap-1">
          <Button
            size="sm"
            variant="ghost"
            onClick={handleCopy}
            aria-label="Copy code"
          >
            {copied ? (
              <Check className="size-3.5 text-green-500" />
            ) : (
              <Copy className="size-3.5" />
            )}
            <span className="hidden sm:inline">
              {copied ? "Copied" : "Copy"}
            </span>
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={handleReset}
            disabled={running}
            aria-label="Reset code"
          >
            <RotateCcw className="size-3.5" />
            <span className="hidden sm:inline">Reset</span>
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={handleVisualize}
            disabled={!roleInfo.canVisualize}
            aria-label="Visualize execution"
            title={
              roleInfo.canVisualize
                ? "Step through this block in the visualizer panel"
                : "This block only defines classes (no main). Set its role to Runnable to visualize it."
            }
          >
            <Eye className="size-3.5" />
            <span className="hidden sm:inline">Visualize</span>
          </Button>
          <Button
            size="sm"
            onClick={handleRun}
            disabled={!canRun}
            aria-label="Run code"
          >
            {running ? (
              <>
                <Spinner className="size-3.5" />
                <span>Running</span>
              </>
            ) : (
              <>
                <Play className="size-3.5" />
                <span>Run</span>
              </>
            )}
          </Button>
        </div>
      </header>

      <div className="overflow-hidden print:hidden">
        <MonacoEditor
          height={editorHeight}
          defaultLanguage="java"
          language="java"
          value={code}
          theme={resolvedTheme === "dark" ? "vs-dark" : "vs"}
          onChange={(value) => {
            const next = value ?? ""
            setCode(next)
            updateCode(cell.id, next)
          }}
          onMount={(editor, monaco) => {
            editorRef.current = editor
            monacoRef.current = monaco
          }}
          options={{
            minimap: { enabled: false },
            fontSize: 13,
            fontFamily: "var(--font-geist-mono), ui-monospace, monospace",
            scrollBeyondLastLine: false,
            smoothScrolling: true,
            lineNumbers: "on",
            renderLineHighlight: "all",
            tabSize: 2,
            automaticLayout: true,
            padding: { top: 12, bottom: 12 },
          }}
        />
      </div>

      <div className="hidden print:block border-t border-border px-3 py-3">
        <div className="print-code-grid">
          {printHighlightedLines.map((lineHtml, i) => (
            <div key={i} className="print-code-row">
              <span className="print-code-line-number">{i + 1}</span>
              <code className="print-code-line language-java" dangerouslySetInnerHTML={{ __html: lineHtml }} />
            </div>
          ))}
        </div>
      </div>

      <OutputPanel
        running={running}
        result={result}
        index={index}
        cheerpjStatus={cheerpjStatus}
        cheerpjError={cheerpjError}
      />
    </section>
  )
}

function RoleSelect({
  value,
  detected,
  onChange,
}: {
  value: CellRoleOverride
  detected: "runnable" | "library"
  onChange: (next: CellRoleOverride) => void
}) {
  return (
    <select
      aria-label="Block role"
      title={
        "How this block participates in the program.\n" +
        "Auto: guessed from the code. Runnable: has/gets a main() and can be visualized. " +
        "Library: only shares its classes with other blocks."
      }
      className="no-print h-6 rounded border border-border bg-background px-1 text-[11px] text-muted-foreground"
      value={value ?? "auto"}
      onChange={(e) => {
        const next = e.target.value
        onChange(next === "auto" ? undefined : (next as "runnable" | "library"))
      }}
    >
      <option value="auto">Auto ({detected})</option>
      <option value="runnable">Runnable</option>
      <option value="library">Library</option>
    </select>
  )
}

function OutputPanel({
  running,
  result,
  index,
  cheerpjStatus,
  cheerpjError,
}: {
  running: boolean
  result: JavaRunResult | null
  index: number
  cheerpjStatus: string
  cheerpjError: string | null
}) {
  if (cheerpjStatus === "error") {
    return (
      <div className="border-t border-border bg-destructive/10 px-3 py-2 text-xs text-destructive">
        CheerpJ failed to load: {cheerpjError}
      </div>
    )
  }

  if (!running && !result) {
    return (
      <div className="flex items-center gap-2 border-t border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
        <Terminal className="size-3.5" />
        <span>
          {cheerpjStatus === "ready"
            ? "Ready. Click Run to compile and execute."
            : cheerpjStatus === "loading"
              ? "Initializing CheerpJ JVM..."
              : "Waiting for CheerpJ..."}
        </span>
      </div>
    )
  }

  return (
    <div className="border-t border-border bg-muted/20">
      {/* Auto-fix information banner */}
      {result?.autoFixes && result.autoFixes.length > 0 ? (
        <div className="flex flex-col gap-1 border-b border-border/50 bg-emerald-500/5 px-3 py-2">
          {result.autoFixes.map((fix, i) => (
            <div key={i} className="flex items-start gap-1.5 text-xs text-emerald-600 dark:text-emerald-400">
              <Wrench className="mt-0.5 size-3 shrink-0" />
              <span>{fix}</span>
            </div>
          ))}
        </div>
      ) : null}
      <div className="flex items-center justify-between px-3 py-2 text-xs text-muted-foreground">
        <div className="flex items-center gap-2">
          <Badge variant="secondary" className="font-mono text-xs">
            Out [{index + 1}]
          </Badge>
          {result ? (
            <span>
              exit {result.exitCode} in {Math.round(result.durationMs)}ms
            </span>
          ) : (
            <span>executing...</span>
          )}
        </div>
      </div>
      <pre
        className={cn(
          "overflow-x-auto whitespace-pre-wrap px-3 pb-3 font-mono text-xs leading-relaxed",
          result?.stderr && !result.stdout ? "text-destructive" : "text-foreground",
        )}
      >
        {running && !result ? (
          <span className="text-muted-foreground">…</span>
        ) : (
          <>
            {result?.stdout}
            {result?.stderr ? (
              <span className="text-destructive">
                {result.stdout ? "\n" : ""}
                {result.stderr}
              </span>
            ) : null}
            {!result?.stdout && !result?.stderr ? (
              <span className="text-muted-foreground">(no output)</span>
            ) : null}
          </>
        )}
      </pre>
    </div>
  )
}
