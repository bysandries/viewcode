/**
 * Snapshot model + parser for the execution visualizer.
 *
 * The instrumented user program (see lib/instrument.ts) and the TreeVisualizer.java
 * reflection helper emit one JSON line per executed statement, each prefixed with
 * the @@TREEVIZ@@ marker. In the standalone visualizer these were streamed out of a
 * hidden DOM console via a MutationObserver; in the merged app the shared runtime
 * (lib/cheerpj.ts → compileAndRunJava) returns the full stdout string, and we parse
 * the marker lines out of it here.
 */

export interface StackVar {
  type: "primitive" | "ref"
  value?: string
  /** null is represented by the variable being present with no value/ref */
  ref?: number
}

export interface HeapObj {
  type: string
  label: string
  fields?: Record<string, string>
  pointers: Record<string, number | null>
}

export interface Snapshot {
  line: number
  /** null = variable currently holds null */
  stack: Record<string, StackVar | null>
  heap: Record<string, HeapObj>
  /** length of program output when this snapshot was captured (for the output scrubber) */
  outChars?: number
}

export interface ParsedViz {
  snapshots: Snapshot[]
  /** program stdout with the @@TREEVIZ@@ frames removed (real print output preserved) */
  output: string
}

export const TREEVIZ_MARKER = "@@TREEVIZ@@"

/**
 * Split a captured stdout string into program output + visualization snapshots.
 * Malformed frames are skipped rather than throwing, so one bad line never blanks
 * the whole timeline.
 */
export function parseTreevizSnapshots(stdout: string): ParsedViz {
  const snapshots: Snapshot[] = []
  let output = ""

  // Normalize Windows newlines so we don't end up with stranded \r creating blank lines
  const normalizedStdout = stdout.replace(/\r\n/g, "\n")
  for (const line of normalizedStdout.split("\n")) {
    const idx = line.indexOf(TREEVIZ_MARKER)
    if (idx === -1) {
      output += line + "\n"
      continue
    }
    // Text before the marker is real program output (System.out.print without a
    // newline lands as a prefix on the marker line).
    const prefix = line.slice(0, idx)
    if (prefix) output += prefix
    try {
      const snap = JSON.parse(line.slice(idx + TREEVIZ_MARKER.length).trim()) as Snapshot
      snap.outChars = output.length
      snapshots.push(snap)
    } catch {
      // ignore a single malformed frame
    }
  }

  // Drop the trailing newline introduced by the per-line reconstruction above.
  return { snapshots, output: output.replace(/\n$/, "") }
}
