"use client"

import * as React from "react"
import Script from "next/script"
import { ECJ_JAR_URL, markEcjLoaded } from "@/lib/cheerpj"

type CheerpJStatus = "idle" | "loading" | "ready" | "error"

interface CheerpJContextValue {
  status: CheerpJStatus
  progress: number
  error: string | null
}

const CheerpJContext = React.createContext<CheerpJContextValue>({
  status: "idle",
  progress: 0,
  error: null,
})

export function useCheerpJ() {
  return React.useContext(CheerpJContext)
}

interface CheerpJProviderProps {
  children: React.ReactNode
}

export function CheerpJProvider({ children }: CheerpJProviderProps) {
  const [status, setStatus] = React.useState<CheerpJStatus>("idle")
  const [progress, setProgress] = React.useState(0)
  const [error, setError] = React.useState<string | null>(null)

  const handleLoad = React.useCallback(async () => {
    setStatus("loading")
    setProgress(10)
    console.log("[v0] CheerpJProvider: Script loaded, initializing runtime...")

    try {
      // Step 1: Initialize CheerpJ (Java 8 mode — ECJ 3.21 runs here, and this
      // CheerpJ build can't expose a Java 11 JRT module image for newer ECJ).
      await window.cheerpjInit({
        version: 8,
        status: "none",
      })
      setProgress(30)
      console.log("[v0] CheerpJProvider: CheerpJ runtime initialized")

      // Step 2: Preload PDF.js worker (to make parsing ready)
      try {
        console.log("[v0] CheerpJProvider: Preloading PDF.js worker...")
        const pdfjs = await import("pdfjs-dist")
        const workerUrl = `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`
        // We don't need to do much else, the import and URL resolution is the main part.
        // The worker will be fetched by pdfjs-dist when needed, but pre-importing the lib helps.
        setProgress(40)
      } catch (pdfErr) {
        console.warn("[v0] CheerpJProvider: PDF.js preload failed:", pdfErr)
      }

      // Step 3: Preload ECJ compiler JAR with progress tracking
      console.log("[v0] CheerpJProvider: Preloading ECJ compiler from:", ECJ_JAR_URL)
      try {
        const response = await fetch(ECJ_JAR_URL)
        if (response.ok) {
          const contentLength = response.headers.get("content-length")
          const total = contentLength ? parseInt(contentLength, 10) : 0
          
          if (total > 0 && response.body) {
            const reader = response.body.getReader()
            let loaded = 0
            const chunks = []
            
            while (true) {
              const { done, value } = await reader.read()
              if (done) break
              chunks.push(value)
              loaded += value.length
              // Map 40-90% to download progress
              const downloadProgress = Math.round(40 + (loaded / total) * 50)
              setProgress(downloadProgress)
            }
            
            const uint8Array = new Uint8Array(loaded)
            let offset = 0
            for (const chunk of chunks) {
              uint8Array.set(chunk, offset)
              offset += chunk.length
            }
            
            window.cheerpOSAddStringFile("/str/ecj.jar", uint8Array)
            markEcjLoaded()
            console.log(`[v0] CheerpJProvider: ECJ loaded (${(uint8Array.length / 1024 / 1024).toFixed(2)} MB)`)
          } else {
            // Fallback for no content-length or no stream
            const arrayBuffer = await response.arrayBuffer()
            const uint8Array = new Uint8Array(arrayBuffer)
            window.cheerpOSAddStringFile("/str/ecj.jar", uint8Array)
            markEcjLoaded()
            setProgress(90)
          }
        } else {
          console.warn("[v0] CheerpJProvider: ECJ preload failed with status:", response.status)
          setProgress(90)
        }
      } catch (ecjErr) {
        console.warn("[v0] CheerpJProvider: ECJ preload failed (will load on first compile):", ecjErr)
        setProgress(90)
      }

      console.log("[v0] CheerpJProvider: Runtime ready")
      setProgress(100)
      setTimeout(() => setStatus("ready"), 500) // Small delay to let user see 100%
    } catch (err) {
      console.error("[v0] CheerpJProvider: Initialization failed:", err)
      setError(err instanceof Error ? err.message : String(err))
      setStatus("error")
    }
  }, [])

  const handleError = React.useCallback(() => {
    console.error("[v0] CheerpJProvider: Failed to load CheerpJ script")
    setError("Failed to load CheerpJ runtime")
    setStatus("error")
  }, [])

  return (
    <CheerpJContext.Provider value={{ status, progress, error }}>
      <Script
        src="https://cjrtnc.leaningtech.com/4.2/loader.js"
        strategy="afterInteractive"
        onLoad={handleLoad}
        onError={handleError}
        integrity="sha384-uKhK9NUHrSpoCfjhgnQkV7vDjOB6IhQZY1esOxD+TF1yvLbbJS/DRhX7g6ATh/wX"
        crossOrigin="anonymous"
      />
      {children}
    </CheerpJContext.Provider>
  )
}
