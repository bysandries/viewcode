"use client"

import * as React from "react"
import { Upload, FileText, Sparkles } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import { cn } from "@/lib/utils"
import { parsePdfToNotebook } from "@/lib/pdf-parser"
import type { Notebook } from "@/types/notebook"

interface PdfUploaderProps {
  onNotebook: (notebook: Notebook) => void
  onLoadDemo: () => void
  onNewBlank: () => void
}

export function PdfUploader({ onNotebook, onLoadDemo, onNewBlank }: PdfUploaderProps) {
  const [isParsing, setIsParsing] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [dragOver, setDragOver] = React.useState(false)
  const inputRef = React.useRef<HTMLInputElement>(null)

  /**
   * Validate PDF by checking magic bytes (%PDF)
   * Also enforce a reasonable file size limit (100 MB) to prevent memory exhaustion
   */
  const isPdfValid = React.useCallback(async (file: File): Promise<boolean> => {
    const MAX_SIZE_MB = 100
    if (file.size > MAX_SIZE_MB * 1024 * 1024) {
      console.warn(`[v0] PdfUploader: File exceeds ${MAX_SIZE_MB}MB limit`)
      return false
    }
    
    // Check magic bytes: PDF files start with %PDF
    const header = await file.slice(0, 4).arrayBuffer()
    const bytes = new Uint8Array(header)
    const magic = String.fromCharCode(...bytes)
    return magic === "%PDF"
  }, [])

  const handleFile = React.useCallback(
    async (file: File) => {
      console.log(`[v0] PdfUploader.handleFile: File selected - "${file.name}", size: ${(file.size / 1024).toFixed(1)} KB, type: "${file.type}"`)
      setError(null)
      
      // Quick check: extension/mime type first
      if (!file.type.includes("pdf") && !file.name.toLowerCase().endsWith(".pdf")) {
        console.log("[v0] PdfUploader.handleFile: Invalid extension/MIME type, rejecting")
        setError("Please upload a PDF file.")
        return
      }
      
      // Strong check: verify PDF magic bytes and file size
      const isValid = await isPdfValid(file)
      if (!isValid) {
        console.log("[v0] PdfUploader.handleFile: Invalid PDF magic bytes or size too large, rejecting")
        setError("Invalid PDF file or file too large (max 100 MB).")
        return
      }
      console.log("[v0] PdfUploader.handleFile: Valid PDF, starting parse...")
      setIsParsing(true)
      const startTime = performance.now()
      try {
        const notebook = await parsePdfToNotebook(file)
        const elapsed = (performance.now() - startTime).toFixed(0)
        console.log(`[v0] PdfUploader.handleFile: Parse SUCCESS in ${elapsed}ms, cells: ${notebook.cells.length}`)
        onNotebook(notebook)
      } catch (err) {
        const elapsed = (performance.now() - startTime).toFixed(0)
        console.error(`[v0] PdfUploader.handleFile: Parse FAILED after ${elapsed}ms:`, err)
        setError(
          err instanceof Error
            ? err.message
            : "Something went wrong while parsing the PDF.",
        )
      } finally {
        setIsParsing(false)
        console.log("[v0] PdfUploader.handleFile: Parse complete, isParsing set to false")
      }
    },
    [onNotebook],
  )

  return (
    <div className="space-y-4">
      <div
        onDragOver={(e) => {
          e.preventDefault()
          setDragOver(true)
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault()
          setDragOver(false)
          const file = e.dataTransfer.files?.[0]
          if (file) void handleFile(file)
        }}
        className={cn(
          "flex flex-col items-center justify-center gap-4 rounded-lg border-2 border-dashed border-border bg-card px-6 py-12 text-center transition-colors",
          dragOver && "border-primary bg-primary/5",
        )}
      >
        <div className="flex size-12 items-center justify-center rounded-full bg-primary/10 text-primary">
          <Upload className="size-5" />
        </div>
        <div className="space-y-1">
          <h3 className="text-base font-semibold">Upload a CS lab PDF</h3>
          <p className="max-w-md text-sm text-muted-foreground text-pretty">
            Convert your lab PDF into an interactive notebook with an
            in-browser JVM.
          </p>
        </div>

        <div className="flex flex-col items-center gap-2 sm:flex-row">
          <Button
            onClick={() => inputRef.current?.click()}
            disabled={isParsing}
          >
            {isParsing ? (
              <>
                <Spinner className="size-4" />
                Parsing PDF
              </>
            ) : (
              <>
                <FileText className="size-4" />
                Choose PDF
              </>
            )}
          </Button>
          <Button variant="ghost" onClick={onLoadDemo} disabled={isParsing}>
            <Sparkles className="size-4" />
            Try the demo lab
          </Button>
          <Button variant="outline" onClick={onNewBlank} disabled={isParsing}>
            New Blank Page
          </Button>
        </div>

        <input
          ref={inputRef}
          type="file"
          accept="application/pdf,.pdf"
          className="sr-only"
          aria-label="Choose PDF file"
          onChange={(e) => {
            const file = e.target.files?.[0]
            if (file) void handleFile(file)
            e.target.value = ""
          }}
        />
      </div>

      {error ? (
        <div
          role="alert"
          className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          {error}
        </div>
      ) : null}
    </div>
  )
}
