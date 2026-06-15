/**
 * Shareable-URL codec for an entire notebook.
 *
 * The whole notebook (cells + metadata) is compressed with lz-string and parked
 * in the URL hash (`#nb=…`) so a single link restores the full state with no
 * backend. The hash — rather than a query string — keeps the payload client-side
 * (never sent to the server) and sidesteps query-length limits.
 */
import {
  compressToEncodedURIComponent,
  decompressFromEncodedURIComponent,
} from "lz-string"

import type { Notebook } from "@/types/notebook"

/** Hash key under which the encoded notebook lives: `#nb=<encoded>`. */
export const NOTEBOOK_HASH_KEY = "nb"

/** Compress a notebook into a URL-safe string. */
export function encodeNotebook(notebook: Notebook): string {
  return compressToEncodedURIComponent(JSON.stringify(notebook))
}

/** Inverse of {@link encodeNotebook}; returns null on any malformed input. */
export function decodeNotebook(encoded: string): Notebook | null {
  try {
    const json = decompressFromEncodedURIComponent(encoded)
    if (!json) return null
    const parsed = JSON.parse(json) as Notebook
    if (!parsed || !Array.isArray(parsed.cells)) return null
    return parsed
  } catch {
    return null
  }
}

/** Read and decode the notebook embedded in the current `location.hash`, if any. */
export function readNotebookFromHash(): Notebook | null {
  if (typeof window === "undefined") return null
  const hash = window.location.hash.replace(/^#/, "")
  if (!hash) return null
  const params = new URLSearchParams(hash)
  const encoded = params.get(NOTEBOOK_HASH_KEY)
  if (!encoded) return null
  return decodeNotebook(encoded)
}

/** Write the notebook into `location.hash` without adding a history entry. */
export function writeNotebookToHash(notebook: Notebook): void {
  if (typeof window === "undefined") return
  const encoded = encodeNotebook(notebook)
  const newHash = `#${NOTEBOOK_HASH_KEY}=${encoded}`
  // replaceState avoids spamming browser history as the user types.
  history.replaceState(null, "", `${window.location.pathname}${window.location.search}${newHash}`)
}
