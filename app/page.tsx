"use client"

import * as React from "react"
import { Check, Cpu, Download, FileCode, FileDown, Share2, Sparkles } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import { ThemeToggle } from "@/components/theme-toggle"
import { PdfUploader } from "@/components/notebook/pdf-uploader"
import { NotebookProvider, useNotebook } from "@/components/studio/notebook-provider"
import { StudioView } from "@/components/studio/studio-view"
import { useCheerpJ } from "@/components/cheerpj-provider"
import { createBlankNotebook, createDemoNotebook } from "@/lib/pdf-parser"
import { readNotebookFromHash, writeNotebookToHash } from "@/lib/notebook-url"
import type { Notebook } from "@/types/notebook"

export default function HomePage() {
  const [notebook, setNotebook] = React.useState<Notebook | null>(null)
  const { status: cheerpjStatus, progress: cheerpjProgress } = useCheerpJ()

  // Restore a shared notebook from the URL hash on first load.
  React.useEffect(() => {
    const shared = readNotebookFromHash()
    if (shared) setNotebook(shared)
  }, [])

  const handleReset = () => {
    setNotebook(null)
    if (typeof window !== "undefined") {
      history.replaceState(null, "", window.location.pathname + window.location.search)
    }
  }
  const handleLoadDemo = () => setNotebook(createDemoNotebook())
  const handleLoadBlank = () => setNotebook(createBlankNotebook())
  const handleNotebookLoaded = React.useCallback((nextNotebook: Notebook) => {
    setNotebook(nextNotebook)
  }, [])

  if (!notebook) {
    return (
      <main className="min-h-screen bg-background">
        <header className="no-print sticky top-0 z-30 border-b border-border bg-background/80 backdrop-blur">
          <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
            <BrandMark />
            <div className="flex items-center gap-2">
              <CheerpJStatusBadge status={cheerpjStatus} progress={cheerpjProgress} />
              <ThemeToggle />
            </div>
          </div>
        </header>

        <div className="mx-auto max-w-5xl px-4 py-8">
          <LandingHero />
          <div className="mt-6">
            <PdfUploader
              onNotebook={handleNotebookLoaded}
              onLoadDemo={handleLoadDemo}
              onNewBlank={handleLoadBlank}
            />
          </div>
          <footer className="no-print mt-16 border-t border-border pt-6 text-xs text-muted-foreground">
            <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
              <span>Powered by CheerpJ 4.x, pdf.js, Monaco, and KaTeX. No server execution.</span>
              <span>Built for any CS lab with Instruction-to-Code structure.</span>
            </div>
          </footer>
        </div>
      </main>
    )
  }

  return (
    <NotebookProvider initialNotebook={notebook}>
      <StudioShell
        cheerpjStatus={cheerpjStatus}
        cheerpjProgress={cheerpjProgress}
        onReset={handleReset}
      />
    </NotebookProvider>
  )
}

function StudioShell({
  cheerpjStatus,
  cheerpjProgress,
  onReset,
}: {
  cheerpjStatus: string
  cheerpjProgress: number
  onReset: () => void
}) {
  const { notebook } = useNotebook()
  const [shared, setShared] = React.useState(false)

  // Keep the shareable URL in sync with the live notebook (debounced).
  React.useEffect(() => {
    const id = setTimeout(() => writeNotebookToHash(notebook), 500)
    return () => clearTimeout(id)
  }, [notebook])

  const toNotebookSourceLines = React.useCallback((value: string): string[] => {
    const normalized = value.replace(/\r\n/g, "\n")
    if (normalized.length === 0) return ["\n"]
    return normalized.split("\n").map((line) => `${line}\n`)
  }, [])

  const exportAsIpynb = React.useCallback(() => {
    const cells = notebook.cells.map((cell) => {
      if (cell.kind === "markdown") {
        return {
          cell_type: "markdown" as const,
          metadata: {},
          source: toNotebookSourceLines(cell.content),
        }
      }
      return {
        cell_type: "code" as const,
        execution_count: null,
        metadata: {},
        outputs: [],
        source: toNotebookSourceLines(cell.code),
      }
    })

    const payload = {
      cells,
      metadata: {
        kernelspec: { display_name: "Java", language: "java", name: "java" },
        language_info: {
          name: "java",
          mimetype: "text/x-java",
          file_extension: ".java",
          pygments_lexer: "java",
          codemirror_mode: "text/x-java",
        },
      },
      nbformat: 4,
      nbformat_minor: 5,
    }

    const fileNameBase =
      (notebook.metadata.title ?? "notebook")
        .trim()
        .replace(/[^a-zA-Z0-9._-]+/g, "-")
        .replace(/-+/g, "-")
        .replace(/^-|-$/g, "") || "notebook"

    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: "application/x-ipynb+json",
    })
    const url = URL.createObjectURL(blob)
    const link = document.createElement("a")
    link.href = url
    link.download = `${fileNameBase}.ipynb`
    document.body.appendChild(link)
    link.click()
    link.remove()
    URL.revokeObjectURL(url)
  }, [notebook, toNotebookSourceLines])

  const handleShare = React.useCallback(async () => {
    writeNotebookToHash(notebook)
    try {
      await navigator.clipboard.writeText(window.location.href)
      setShared(true)
      setTimeout(() => setShared(false), 2000)
    } catch {
      // Clipboard may be unavailable; the URL is updated regardless.
    }
  }, [notebook])

  return (
    <main className="flex h-screen flex-col bg-background">
      <header className="no-print z-30 border-b border-border bg-background/80 backdrop-blur">
        <div className="flex items-center justify-between gap-2 px-4 py-3">
          <BrandMark />
          <div className="flex items-center gap-2">
            <CheerpJStatusBadge status={cheerpjStatus} progress={cheerpjProgress} />
            <Button variant="outline" size="sm" onClick={handleShare}>
              {shared ? <Check className="size-4 text-green-500" /> : <Share2 className="size-4" />}
              <span className="hidden sm:inline">{shared ? "Copied link" : "Share"}</span>
            </Button>
            <Button variant="default" size="sm" onClick={exportAsIpynb}>
              <Download className="size-4" />
              <span className="hidden sm:inline">Save</span>
            </Button>
            <Button variant="secondary" size="sm" onClick={() => window.print()}>
              <FileDown className="size-4" />
              <span className="hidden sm:inline">PDF</span>
            </Button>
            <Button variant="ghost" size="sm" onClick={onReset}>
              New
            </Button>
            <ThemeToggle />
          </div>
        </div>
      </header>

      <div className="min-h-0 flex-1">
        <StudioView />
      </div>
    </main>
  )
}

function BrandMark() {
  return (
    <div className="flex items-center gap-2">
      <div className="flex size-8 items-center justify-center rounded-md bg-primary text-primary-foreground">
        <FileCode className="size-4" />
      </div>
      <div className="leading-tight">
        <div className="text-sm font-semibold">Java Notebooks - @BySandries</div>
        <div className="text-[11px] text-muted-foreground">
          Notebook + execution visualizer, one shared program
        </div>
      </div>
    </div>
  )
}

function LandingHero() {
  return (
    <section className="space-y-6 text-center">
      <Badge variant="secondary" className="mx-auto">
        <Sparkles className="size-3" />
        Upload any CS lab PDF
      </Badge>
      <h1 className="text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
        Turn a Java lab handout into a runnable notebook.
      </h1>
      <p className="mx-auto max-w-2xl text-sm text-muted-foreground leading-relaxed text-pretty sm:text-base">
        The adaptive parser structures your content into clear notebook cells,
        including math formulas. Every code cell compiles and executes in a WebAssembly
        JVM, side by side with a step-by-step execution visualizer.
      </p>
      <div className="mx-auto grid max-w-3xl grid-cols-1 gap-3 text-left sm:grid-cols-3">
        <FeatureCard
          title="Side-by-side studio"
          description="The notebook and the execution visualizer share one screen, so you can step through any block in place."
        />
        <FeatureCard
          title="One shared program"
          description="Every code block compiles together — a class defined in one block is usable from any other."
        />
        <FeatureCard
          title="Shareable links"
          description="The whole notebook is encoded into the URL, so a single link restores everything. No account needed."
        />
      </div>
    </section>
  )
}

function FeatureCard({ title, description }: { title: string; description: string }) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <h3 className="text-sm font-semibold">{title}</h3>
      <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{description}</p>
    </div>
  )
}

function CheerpJStatusBadge({ status, progress }: { status: string; progress: number }) {
  const label =
    status === "ready"
      ? "JVM Ready"
      : status === "loading"
        ? `Loading JVM (${progress}%)`
        : status === "error"
          ? "JVM error"
          : "Loading JVM…"

  const isReady = status === "ready"
  const isError = status === "error"

  return (
    <Badge
      variant={isError ? "destructive" : "secondary"}
      className={cn(
        "gap-1 text-[11px] min-w-22.5 justify-center transition-colors duration-500",
        isReady && "border-transparent bg-green-600 text-white hover:bg-green-700 dark:bg-green-600 dark:text-white"
      )}
    >
      <Cpu className="size-3" />
      {label}
    </Badge>
  )
}
