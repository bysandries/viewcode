"use client"

import { useEffect } from "react"

/**
 * Registers the Service Worker (public/sw.js) that caches the CheerpJ runtime +
 * ECJ jar for offline-after-first-load. Production only, so it never interferes
 * with the Next.js dev HMR pipeline.
 */
export function ServiceWorkerRegister() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return
    navigator.serviceWorker.register("/sw.js").catch((err) => {
      console.warn("[lcm] Service Worker registration failed:", err)
    })
  }, [])

  return null
}
