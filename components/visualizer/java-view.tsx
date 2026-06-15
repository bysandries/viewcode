"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { Whiteboard } from "./whiteboard"
import { instrumentJava } from "@/lib/instrument"
import { compileAndRunJava } from "@/lib/cheerpj"
import "./visualize.css"
import { parseTreevizSnapshots, type Snapshot, type StackVar, type HeapObj } from "@/lib/viz-snapshots"
import { useCheerpJ } from "@/components/cheerpj-provider"

const DEFAULT_JAVA_CODE = `public class Main {
    static class Node {
        int value;
        Node left, right;
        Node(int value) { this.value = value; }
    }

    static Node insert(Node root, int value) {
        if (root == null) return new Node(value);
        if (value < root.value)      root.left  = insert(root.left, value);
        else if (value > root.value) root.right = insert(root.right, value);
        return root;
    }

    public static void main(String[] args) {
        int[] values = { 50, 30, 70 };
        Node root = null;

        for (int v : values) {
            root = insert(root, v);
        }
        
        System.out.println("Done building BST.");
    }
}
`

interface HeapSlot {
  kind: "label" | "field" | "ptr"
  key: string
  text: string
  w: number
}

declare global {
  interface Window {
    monaco: any
  }
}

function mainClassName(code: string): string {
  const m = code.match(/public\s+(?:final\s+|abstract\s+)?class\s+([A-Za-z_$][\w$]*)/) || code.match(/class\s+([A-Za-z_$][\w$]*)/)
  return m ? m[1] : "Main"
}

export function JavaView({
  active,
  initialCode,
  programCode,
  extraSources,
  programError,
  onActiveLineChange,
}: {
  active: boolean
  initialCode?: string
  /** Studio mode: the assembled entry source to instrument and run. */
  programCode?: string
  /** Studio mode: sibling notebook cells compiled alongside the entry. */
  extraSources?: { path: string; content: string }[]
  /** Studio mode: assembly failure (e.g. class-name collision) to surface. */
  programError?: string | null
  /** Callback fired when the active execution line changes during visualization. */
  onActiveLineChange?: (line: number | null) => void
}) {
  const { status: cheerpjStatus } = useCheerpJ()

  const editorRef = useRef<any>(null)
  const monacoRef = useRef<any>(null)
  const decorationsCollectionRef = useRef<any>(null)
  const decoratorsRef = useRef<string[]>([])

  const javaOutRef = useRef<HTMLPreElement>(null)
  const jcanvasRef = useRef<HTMLCanvasElement>(null)
  const jcardRef = useRef<HTMLDivElement>(null)

  const outputCharsRef = useRef(0)
  const javaOutBufRef = useRef("")
  
  const jFramesRef = useRef<Snapshot[]>([])
  const runCodeLinesRef = useRef<string[]>([]) // source of the last run; snapshot line numbers index into this
  const jFrameIdxRef = useRef(0)
  const [jFrameIdxState, setJFrameIdxState] = useState(0)

  const transformRef = useRef({ x: 50, y: 50, scale: 1 })
  const isDraggingRef = useRef(false)
  const lastMousePosRef = useRef({ x: 0, y: 0 })

  const [running, setRunning] = useState(false)
  const [fileLabel, setFileLabel] = useState("Main.java")
  const [status, setStatus] = useState<{ msg: string; type: string }>({ msg: "Ready", type: "" })
  const [frameState, setFrameState] = useState({ count: 0, idx: 0 })
  const [activeRightTab, setActiveRightTab] = useState("visualizer")
  const [showClassNodes, setShowClassNodes] = useState(true)
  const [hiddenVars, setHiddenVars] = useState("root, tree, tree2")

  const [editorCode, setEditorCode] = useState(DEFAULT_JAVA_CODE)

  // Studio mode: sibling sources to compile alongside, and the program last run
  // (so we auto-run once per new visualize target without looping).
  const extraSourcesRef = useRef(extraSources)
  extraSourcesRef.current = extraSources
  const lastRunProgramRef = useRef<string | null>(null)
  // The source the visualizer runs. There is no editor anymore — the code comes
  // from the notebook cell via the `programCode` prop.
  const programToRunRef = useRef("")

  const layoutRef = useRef<HTMLDivElement>(null)
  const [splitFrac, setSplitFrac] = useState(0.46)

  useEffect(() => {
    const saved = parseFloat(localStorage.getItem("tv-split") || "")
    if (saved >= 0.2 && saved <= 0.8) setSplitFrac(saved)
  }, [])

  const onResizerPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault()
    const handle = e.currentTarget
    handle.setPointerCapture(e.pointerId)
    let lastFrac = splitFrac
    const onMove = (ev: PointerEvent) => {
      const rect = layoutRef.current?.getBoundingClientRect()
      if (!rect || rect.width === 0) return
      lastFrac = Math.min(0.75, Math.max(0.25, (ev.clientX - rect.left) / rect.width))
      setSplitFrac(lastFrac)
      // Let Monaco, the visualizer canvas, and the whiteboard re-measure.
      requestAnimationFrame(() => window.dispatchEvent(new Event("resize")))
    }
    const onUp = (ev: PointerEvent) => {
      try { handle.releasePointerCapture(ev.pointerId) } catch {}
      handle.removeEventListener("pointermove", onMove)
      handle.removeEventListener("pointerup", onUp)
      handle.removeEventListener("pointercancel", onUp)
      try { localStorage.setItem("tv-split", String(lastFrac)) } catch {}
      window.dispatchEvent(new Event("resize"))
    }
    handle.addEventListener("pointermove", onMove)
    handle.addEventListener("pointerup", onUp)
    handle.addEventListener("pointercancel", onUp)
  }

  // The visualizer has no editor; it runs whatever the notebook hands in.
  useEffect(() => {
    const code = (programCode && programCode.trim()) || (initialCode && initialCode.trim()) || ""
    programToRunRef.current = code
    setFileLabel(mainClassName(code) + ".java")
  }, [initialCode, programCode])

  const jstatus = (msg: string, type: string = "") => setStatus({ msg, type })

  // Canvas colors are drawn in JS, so we read the site's theme tokens at draw
  // time (refreshed each render) to keep the visualization matching the UI in
  // both light and dark mode.
  const paletteRef = useRef({
    bg: "#0f1117", surface: "#1a1d27", surface2: "#1e2235", border: "#2e3352",
    text: "#e2e8f0", muted: "#7f8cb0", accent: "#6c63ff", accentText: "#ffffff", danger: "#ff5c6c",
  })
  const refreshPalette = () => {
    const el = jcardRef.current || jcanvasRef.current
    if (!el) return paletteRef.current
    const cs = getComputedStyle(el)
    const g = (name: string, fb: string) => cs.getPropertyValue(name).trim() || fb
    const p = paletteRef.current
    paletteRef.current = {
      bg: g("--background", p.bg),
      surface: g("--card", p.surface),
      surface2: g("--secondary", p.surface2),
      border: g("--border", p.border),
      text: g("--foreground", p.text),
      muted: g("--muted-foreground", p.muted),
      accent: g("--primary", p.accent),
      accentText: g("--primary-foreground", p.accentText),
      danger: g("--destructive", p.danger),
    }
    return paletteRef.current
  }

  const drawPointerArrow =(ctx: CanvasRenderingContext2D, fromX: number, fromY: number, toX: number, toY: number, targetW: number, targetH: number, color: string = paletteRef.current.accent) => {
    const headlen = 10
    const angle = Math.atan2(toY - fromY, toX - fromX)
    
    const vx = fromX - toX
    const vy = fromY - toY
    
    let targetX = toX
    let targetY = toY
    
    if (vx !== 0 || vy !== 0) {
      const sx = Math.abs(targetW / 2 / vx)
      const sy = Math.abs(targetH / 2 / vy)
      const s = Math.min(sx, sy)
      targetX = toX + s * vx
      targetY = toY + s * vy
    }
    
    targetX -= Math.cos(angle) * 2
    targetY -= Math.sin(angle) * 2

    ctx.beginPath()
    ctx.strokeStyle = color
    ctx.lineWidth = 2
    ctx.moveTo(fromX, fromY)
    ctx.lineTo(targetX, targetY)
    ctx.stroke()
    
    ctx.beginPath()
    ctx.moveTo(targetX, targetY)
    ctx.lineTo(targetX - headlen * Math.cos(angle - Math.PI / 6), targetY - headlen * Math.sin(angle - Math.PI / 6))
    ctx.lineTo(targetX - headlen * Math.cos(angle + Math.PI / 6), targetY - headlen * Math.sin(angle + Math.PI / 6))
    ctx.fillStyle = color
    ctx.fill()
  }

  const renderJFrame = useCallback(() => {
    const jcanvas = jcanvasRef.current
    if (!jcanvas) return
    const ctx = jcanvas.getContext("2d")
    if (!ctx) return
    const P = refreshPalette()
    ctx.clearRect(0, 0, jcanvas.width, jcanvas.height)

    const frames = jFramesRef.current
    const snap = frames[jFrameIdxRef.current]
    if (!snap) return

    try {

    const isHiddenVar = (name: string) => {
      if (showClassNodes) return false;
      const vars = hiddenVars.split(',').map(s => s.trim()).filter(Boolean);
      return vars.includes(name);
    }
    
    const filteredHeap: Record<string, HeapObj> = {}
    const filteredStack: Record<string, StackVar | null> = {}
    
    for (const [name, variable] of Object.entries(snap.stack)) {
        if (!isHiddenVar(name)) {
            filteredStack[name] = variable
        }
    }
    
    for (const [refStr, obj] of Object.entries(snap.heap)) {
        const isBSTNode = "left" in obj.pointers || "right" in obj.pointers
        const isListNode = "next" in obj.pointers && !("prev" in obj.pointers)
        const isDllNode = "prev" in obj.pointers && "next" in obj.pointers
        const isDataNode = isBSTNode || isListNode || isDllNode
        
        if (!showClassNodes && !isDataNode) continue;
        filteredHeap[refStr] = obj
    }

    // Detect adjacency-list graphs: a Map whose values are all collections of
    // primitives that name the map's own keys. Render those as a node-link
    // diagram instead of nested boxes, absorbing the per-vertex lists.
    const stackRefSet = new Set<number>()
    for (const v of Object.values(filteredStack)) {
        if (v && v.type === "ref" && v.ref) stackRefSet.add(v.ref)
    }
    interface GraphPlan {
      vertices: string[]
      edges: [string, string][]
      directed: boolean
      pos: Map<string, { x: number; y: number }> // vertex centers, relative to container
      w: number
      h: number
      box: number // side length of the square vertex boxes
    }
    const graphPlans = new Map<number, GraphPlan>()
    const absorbed = new Set<number>()
    for (const [refStr, obj] of Object.entries(filteredHeap)) {
        if (!obj.type.includes("Map")) continue
        if (Object.keys(obj.fields || {}).length > 0) continue // map has primitive values: not adjacency
        const ptrKeys = Object.keys(obj.pointers)
        if (ptrKeys.length < 2) continue

        const vset = new Set(ptrKeys)
        const lists: number[] = []
        const dirEdges: [string, string][] = []
        let ok = true
        for (const k of ptrKeys) {
            const cref = obj.pointers[k]
            if (cref === null) continue // vertex without a list
            const child = filteredHeap[String(cref)]
            if (!child || Object.keys(child.pointers).length > 0 || stackRefSet.has(cref)) { ok = false; break }
            for (const val of Object.values(child.fields || {})) {
                if (!vset.has(String(val))) { ok = false; break }
                dirEdges.push([k, String(val)])
            }
            if (!ok) break
            lists.push(cref)
        }
        if (!ok) continue

        const vertices = [...ptrKeys]
        if (vertices.every((v) => /^-?\d+$/.test(v))) vertices.sort((a, b) => Number(a) - Number(b))

        const eset = new Set(dirEdges.map(([a, b]) => a + "→" + b))
        const directed = dirEdges.some(([a, b]) => !eset.has(b + "→" + a))
        const edges: [string, string][] = []
        const seenEdges = new Set<string>()
        for (const [a, b] of dirEdges) {
            const id = directed ? a + "→" + b : a < b ? a + "|" + b : b + "|" + a
            if (seenEdges.has(id)) continue
            seenEdges.add(id)
            edges.push([a, b])
        }

        // Layered layout (textbook style): BFS levels become left-to-right
        // columns, vertices stack vertically inside each column.
        const neigh = new Map<string, string[]>()
        for (const v of vertices) neigh.set(v, [])
        for (const [a, b] of edges) {
            neigh.get(a)?.push(b)
            neigh.get(b)?.push(a)
        }
        const level = new Map<string, number>()
        for (const root of vertices) {
            if (level.has(root)) continue
            level.set(root, 0)
            const queue = [root]
            while (queue.length) {
                const v = queue.shift()!
                for (const nb of neigh.get(v) || []) {
                    if (!level.has(nb)) {
                        level.set(nb, level.get(v)! + 1)
                        queue.push(nb)
                    }
                }
            }
        }
        const cols = new Map<number, string[]>()
        for (const v of vertices) {
            const c = level.get(v) || 0
            if (!cols.has(c)) cols.set(c, [])
            cols.get(c)!.push(v)
        }
        ctx.font = "bold 13px 'Segoe UI', sans-serif"
        let box = 34
        for (const v of vertices) {
            const lbl = v.length > 6 ? v.slice(0, 5) + "…" : v
            box = Math.max(box, ctx.measureText(lbl).width + 16)
        }
        const colSpacing = box + 70
        const rowSpacing = box + 30
        const numCols = Math.max(...[...cols.keys()]) + 1
        const maxRows = Math.max(...[...cols.values()].map((c) => c.length))
        const gw = numCols * colSpacing + 16
        const gh = maxRows * rowSpacing + 16
        const pos = new Map<string, { x: number; y: number }>()
        for (const [c, vs] of cols.entries()) {
            const startY = (gh - vs.length * rowSpacing) / 2
            vs.forEach((v, i) => pos.set(v, { x: 8 + c * colSpacing + colSpacing / 2, y: startY + (i + 0.5) * rowSpacing }))
        }

        graphPlans.set(parseInt(refStr), { vertices, edges, directed, pos, w: gw, h: gh, box })
        for (const l of lists) absorbed.add(l)
    }

    const drawableHeap: Record<string, HeapObj> = {}
    for (const [refStr, obj] of Object.entries(filteredHeap)) {
        if (!absorbed.has(parseInt(refStr))) drawableHeap[refStr] = obj
    }

    // Algorithm-state highlights for graph vertices (DFS/BFS style code)
    let currVal: string | null = null
    const currVar = filteredStack["curr"] || filteredStack["current"] || filteredStack["cur"]
    if (currVar && currVar.type === "primitive") currVal = String(currVar.value)
    const visitedVals = new Set<string>()
    for (const [name, v] of Object.entries(filteredStack)) {
        if (v && v.type === "ref" && v.ref && name.toLowerCase().includes("visit")) {
            const o = snap.heap[String(v.ref)]
            if (o && o.fields) for (const val of Object.values(o.fields)) visitedVals.add(String(val))
        }
    }

    const resolveRef = (refStr: string): string | null => {
        if (drawableHeap[refStr]) return refStr;
        const hiddenObj = snap.heap[refStr];
        if (hiddenObj) {
            for (const childRef of Object.values(hiddenObj.pointers)) {
                if (childRef !== null) {
                    const resolved = resolveRef(childRef.toString());
                    if (resolved) return resolved;
                }
            }
        }
        return null;
    }

    const stackWidth = 200
    
    ctx.fillStyle = P.muted
    ctx.font = "bold 14px 'Segoe UI', sans-serif"
    ctx.textAlign = "center"
    ctx.fillText("Frames (Stack)", stackWidth / 2, 20)
    ctx.fillText("Objects (Heap) - Scroll to Zoom/Pan", stackWidth + (jcanvas.width - stackWidth) / 2, 20)

    // Precalculate node widths and slot layout (label / field values / pointers)
    const truncate = (s: string, n = 14) => (s.length > n ? s.slice(0, n - 1) + "…" : s)

    // When a graph is on screen, algorithm bookkeeping (edgeTo[], distTo[],
    // the BFS queue, visited sets, pre/postorder lists…) reads best as
    // textbook tables stacked right below it. Arrays and maps become a
    // node-header + value-cell table whose cells fill in as the algorithm
    // writes them; other flat structures (queues, lists, sets) become a row
    // of cells. Cells written at the current step are highlighted.
    interface AuxPlan {
      name: string
      kind: "table" | "seq"
      cols: string[] // keys into obj.fields, in display order
      labels: string[] // header text per column (table kind)
      filled: Set<string> // columns whose value is shown
      hot: Set<string> // columns written at this exact step
      colW: number
    }
    const AUX_HEADER_H = 20
    const AUX_ROW_H = 26
    const auxPlans = new Map<number, AuxPlan>()
    if (graphPlans.size) {
      const gVerts = [...graphPlans.values()][0].vertices
      const prevHeap = frames[jFrameIdxRef.current - 1]?.heap
      for (const [name, v] of Object.entries(filteredStack)) {
        if (!v || v.type !== "ref" || !v.ref) continue
        const refStr = String(v.ref)
        const obj = drawableHeap[refStr]
        if (!obj || graphPlans.has(v.ref) || auxPlans.has(v.ref)) continue
        if (Object.keys(obj.pointers).length > 0) continue
        const fields = obj.fields || {}
        const prevFields = prevHeap?.[refStr]?.fields
        const isArr = obj.type.endsWith("[]")
        const isMap = obj.type.includes("Map")

        let plan: AuxPlan
        if (isArr || isMap) {
          let cols: string[]
          let labels: string[]
          let filled: Set<string>
          const hotWrites = new Set<string>() // same-value writes detected at the current step
          if (isArr) {
            cols = Object.keys(fields) // "[0]", "[1]", … in index order
            labels = cols.map((c) => c.replace(/^\[|\]$/g, ""))
            // An index counts as written once its value differs from the value
            // it had when the array first appeared; accumulate across frames so
            // a cell that changes back stays filled.
            filled = new Set()
            let initial: Record<string, string> | null = null
            for (let f = 0; f <= jFrameIdxRef.current; f++) {
              const o = frames[f]?.heap[refStr]
              if (!o) continue
              const ff = o.fields || {}
              if (!initial) { initial = ff; continue }
              for (const k of cols) if (ff[k] !== undefined && ff[k] !== initial[k]) filled.add(k)
            }
            // Diffing misses writes that store the value already there (e.g.
            // edgeTo[1] = 0 into a zero-initialized int[]), so also treat an
            // executed "name[idx] = …" source line as filling that index.
            const esc = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
            const writeRe = new RegExp("(?:^|[^\\w$.])" + esc + "\\s*\\[\\s*([\\w$]+)\\s*\\]\\s*(?:[+\\-*/%&|^]|<<|>>>?)?=(?!=)")
            for (let f = 0; f <= jFrameIdxRef.current; f++) {
              const fr = frames[f]
              const src = fr && fr.line > 0 ? runCodeLinesRef.current[fr.line - 1] : undefined
              const m = src?.match(writeRe)
              if (!m) continue
              let idx: string | null = null
              if (/^\d+$/.test(m[1])) idx = m[1]
              else {
                const sv = fr.stack[m[1]]
                if (sv && sv.type === "primitive") idx = String(sv.value)
              }
              if (idx !== null && fields["[" + idx + "]"] !== undefined) {
                filled.add("[" + idx + "]")
                if (f === jFrameIdxRef.current) hotWrites.add("[" + idx + "]")
              }
            }
          } else {
            // Map: one column per graph vertex (plus any stray keys); a cell
            // fills the moment the key is put.
            const extra = Object.keys(fields).filter((k) => !gVerts.includes(k))
            cols = [...gVerts, ...extra]
            labels = cols
            filled = new Set(Object.keys(fields))
          }
          const hot = new Set<string>(hotWrites)
          for (const k of cols) {
            if (fields[k] !== undefined && filled.has(k) && (!prevFields || prevFields[k] !== fields[k])) hot.add(k)
          }
          plan = { name, kind: "table", cols, labels, filled, hot, colW: 0 }
        } else {
          const cols = Object.keys(fields).sort((a, b) => parseInt(a.slice(1)) - parseInt(b.slice(1)))
          // Elements shift cells as a queue drains, so flag new values, not new keys.
          const prevVals = new Set(Object.values(prevFields || {}))
          const hot = new Set<string>()
          for (const k of cols) if (!prevVals.has(fields[k])) hot.add(k)
          plan = { name, kind: "seq", cols, labels: [], filled: new Set(cols), hot, colW: 0 }
        }

        ctx.font = "bold 13px 'Segoe UI', sans-serif"
        let colW = 30
        for (let i = 0; i < plan.cols.length; i++) {
          const valTxt = truncate(String(fields[plan.cols[i]] ?? ""), 6)
          const hdrTxt = plan.kind === "table" ? truncate(plan.labels[i], 6) : ""
          colW = Math.max(colW, ctx.measureText(valTxt).width + 14, ctx.measureText(hdrTxt).width + 14)
        }
        plan.colW = colW
        auxPlans.set(v.ref, plan)
      }
    }

    // Arrays of chained list nodes (separate-chaining hash tables) render like
    // the textbook diagram: a vertical bucket column with index labels and a
    // slash for empty buckets, each chain growing rightward on its row.
    interface BucketPlan {
      slots: string[] // pointer keys "[0]", "[1]", … in index order
      labelW: number
      cellW: number
      rowH: number
    }
    const bucketPlans = new Map<number, BucketPlan>()
    for (const [refStr, obj] of Object.entries(drawableHeap)) {
      if (!obj.type.endsWith("[]")) continue
      if (Object.keys(obj.fields || {}).length) continue // primitive/mixed arrays stay generic
      const keys = Object.keys(obj.pointers)
      if (!keys.length || !keys.every((k) => /^\[\d+\]$/.test(k))) continue
      let ok = true
      for (const k of keys) {
        const c = obj.pointers[k]
        if (c === null) continue
        const child = drawableHeap[String(c)]
        if (!child || !("next" in child.pointers)) { ok = false; break }
      }
      if (!ok) continue
      const slots = [...keys].sort((a, b) => parseInt(a.slice(1)) - parseInt(b.slice(1)))
      bucketPlans.set(parseInt(refStr), { slots, labelW: 24, cellW: 38, rowH: 48 })
    }

    // Logical Maps render as a textbook two-column "key | value" table, one row
    // per entry. This stays compact no matter how many entries there are and
    // keeps each value beside its key (the generic node strip bunches all the
    // values on the left and all the keys on the right). Object keys/values are
    // pointer cells whose arrows leave the row toward their own node, so a key
    // reused by two entries (e.g. a mutated HashMap key) reads as two rows
    // pointing at one node instead of a tangle of slots.
    interface MapRow {
      keyText: string | null // primitive/string key shown inline
      keyPtr: string | null // pointer name for an object key
      valText: string | null // primitive/string value shown inline
      valPtr: string | null // pointer name for an object value
    }
    interface MapPlan { rows: MapRow[]; keyW: number; valW: number; rowH: number; headerH: number }
    const MAP_ROW_H = 26
    const MAP_HEADER_H = 20
    const mapPlans = new Map<number, MapPlan>()
    for (const [refStr, obj] of Object.entries(drawableHeap)) {
      const ref = parseInt(refStr)
      if (!obj.type.includes("Map")) continue
      if (graphPlans.has(ref) || auxPlans.has(ref)) continue // graph / bookkeeping views own these
      const fields = obj.fields || {}
      const pointers = obj.pointers || {}
      const rows: MapRow[] = []
      if (Object.keys(pointers).some((k) => /^key\d+$/.test(k))) {
        // Object keys: the serializer emits key{i} pointers paired with val{i}.
        const idxs = new Set<number>()
        for (const k of Object.keys(pointers)) { const m = k.match(/^key(\d+)$/); if (m) idxs.add(parseInt(m[1])) }
        for (const i of [...idxs].sort((a, b) => a - b)) {
          const keyPtr = pointers["key" + i] !== undefined ? "key" + i : null
          const valPtr = pointers["val" + i] !== undefined ? "val" + i : null
          const valText = valPtr === null && fields["val" + i] !== undefined ? fields["val" + i] : null
          rows.push({ keyText: null, keyPtr, valText, valPtr })
        }
      } else {
        // Primitive/string keys: each field/pointer name is itself the key.
        for (const [k, v] of Object.entries(fields)) rows.push({ keyText: k, keyPtr: null, valText: v, valPtr: null })
        for (const k of Object.keys(pointers)) rows.push({ keyText: k, keyPtr: null, valText: null, valPtr: k })
      }
      if (!rows.length) continue // empty map: fall through to the generic labelled box
      mapPlans.set(ref, { rows, keyW: 0, valW: 0, rowH: MAP_ROW_H, headerH: MAP_HEADER_H })
    }

    const nodeWidths = new Map<number, number>()
    const nodeHeights = new Map<number, number>()
    const slotPlans = new Map<number, HeapSlot[]>()
    for (const [refStr, obj] of Object.entries(drawableHeap)) {
        const ref = parseInt(refStr)

        const gp = graphPlans.get(ref)
        if (gp) {
            nodeWidths.set(ref, gp.w)
            nodeHeights.set(ref, gp.h)
            continue
        }

        const auxPlan = auxPlans.get(ref)
        if (auxPlan) {
            ctx.font = "11px 'Segoe UI', sans-serif"
            const w = auxPlan.cols.length ? auxPlan.cols.length * auxPlan.colW : ctx.measureText("(empty)").width + 24
            nodeWidths.set(ref, w)
            nodeHeights.set(ref, auxPlan.kind === "table" ? AUX_HEADER_H + AUX_ROW_H : AUX_ROW_H)
            continue
        }

        const bucketPlan = bucketPlans.get(ref)
        if (bucketPlan) {
            nodeWidths.set(ref, bucketPlan.labelW + bucketPlan.cellW)
            nodeHeights.set(ref, bucketPlan.slots.length * bucketPlan.rowH)
            continue
        }

        const mapPlan = mapPlans.get(ref)
        if (mapPlan) {
            ctx.font = "bold 12px monospace"
            let kw = ctx.measureText("key").width + 16
            let vw = ctx.measureText("value").width + 16
            for (const row of mapPlan.rows) {
                if (row.keyText != null) kw = Math.max(kw, ctx.measureText(truncate(row.keyText, 12)).width + 16)
                if (row.valText != null) vw = Math.max(vw, ctx.measureText(truncate(row.valText, 12)).width + 16)
            }
            mapPlan.keyW = Math.max(44, kw)
            mapPlan.valW = Math.max(44, vw)
            nodeWidths.set(ref, mapPlan.keyW + mapPlan.valW)
            nodeHeights.set(ref, mapPlan.headerH + mapPlan.rows.length * mapPlan.rowH)
            continue
        }

        const isBST = "left" in obj.pointers || "right" in obj.pointers
        const isList = "next" in obj.pointers && !("prev" in obj.pointers)
        const isDll = "prev" in obj.pointers && "next" in obj.pointers

        ctx.font = "bold 14px 'Segoe UI', sans-serif"
        if (isBST) { nodeWidths.set(ref, Math.max(120, ctx.measureText(obj.label).width * 3 + 24)); continue }
        if (isDll) { nodeWidths.set(ref, Math.max(150, ctx.measureText(obj.label).width * 3 + 24)); continue }
        if (isList) { nodeWidths.set(ref, Math.max(100, ctx.measureText(obj.label).width * 2 + 24)); continue }

        const slots: HeapSlot[] = []
        const fields = obj.fields || {}
        const fieldKeys = Object.keys(fields)
        if (fieldKeys.length === 0) slots.push({ kind: "label", key: "", text: truncate(obj.label), w: 0 })
        for (const k of fieldKeys) slots.push({ kind: "field", key: k, text: truncate(String(fields[k])), w: 0 })
        for (const k of Object.keys(obj.pointers)) slots.push({ kind: "ptr", key: k, text: "", w: 0 })

        let w = 0
        for (const s of slots) {
            ctx.font = "bold 13px 'Segoe UI', sans-serif"
            const tw = ctx.measureText(s.text).width
            ctx.font = "10px sans-serif"
            const kw = ctx.measureText(s.key).width
            s.w = Math.max(36, tw + 14, kw + 10)
            w += s.w
        }
        slotPlans.set(ref, slots)
        nodeWidths.set(ref, Math.max(60, w))
    }

    // DAG Layout Algorithm (Post-order with horizontal bounding)
    const heapLayout = new Map<number, { x: number, y: number, w: number, h: number }>()
    const depthNextX = new Map<number, number>()
    const ptrOrigins = new Map<number, Map<string, { x: number, y: number }>>()

    // Binary trees get the textbook layout: x follows in-order rank, y follows
    // depth, so every node sits between its subtrees and edges never cross.
    // (The generic DAG layout below left-packs each row in traversal order,
    // which scrambles left/right relationships.)
    const isBstRef = (refStr: string) => {
        const o = drawableHeap[refStr]
        return !!o && ("left" in o.pointers || "right" in o.pointers)
    }
    const BST_STEP_X = 70 // same-depth nodes are ≥2 ranks apart, so boxes (120w) never collide
    const BST_STEP_Y = 80
    const layoutBstCluster = (rootStr: string, depth: number): number => {
        const nodes: { ref: number; idx: number; d: number }[] = []
        const seen = new Set<number>()
        let cursor = 0
        let maxD = 0
        const walk = (rs: string, d: number) => {
            const ref = parseInt(rs)
            if (seen.has(ref) || heapLayout.has(ref) || !drawableHeap[rs]) return
            seen.add(ref)
            maxD = Math.max(maxD, d)
            const p = drawableHeap[rs].pointers
            const l = p["left"]
            const r = p["right"]
            if (l != null && isBstRef(String(l))) walk(String(l), d + 1)
            nodes.push({ ref, idx: cursor++, d })
            if (r != null && isBstRef(String(r))) walk(String(r), d + 1)
        }
        walk(rootStr, 0)
        if (!nodes.length) return heapLayout.get(parseInt(rootStr))?.x ?? 0

        // Park the cluster to the right of anything already on the rows it spans.
        let originX = 0
        for (let d = depth; d <= depth + maxD; d++) originX = Math.max(originX, depthNextX.get(d) || 0)
        let clusterEnd = originX
        for (const n of nodes) {
            const w = nodeWidths.get(n.ref) || 120
            const x = originX + n.idx * BST_STEP_X
            heapLayout.set(n.ref, { x, y: (depth + n.d) * BST_STEP_Y + 50, w, h: 40 })
            clusterEnd = Math.max(clusterEnd, x + w)
        }
        for (let d = depth; d <= depth + maxD; d++) depthNextX.set(d, clusterEnd + 50)
        const rootNode = nodes.find((n) => n.ref === parseInt(rootStr))
        return rootNode ? originX + rootNode.idx * BST_STEP_X : originX
    }

    // Place a bucket array as a vertical column with each bucket's chain laid
    // out left-to-right on its own row, then reserve the rows it spans.
    const layoutBucketCluster = (refStr: string, depth: number): number => {
        const ref = parseInt(refStr)
        const plan = bucketPlans.get(ref)!
        const obj = drawableHeap[refStr]
        const arrW = plan.labelW + plan.cellW
        const arrH = plan.slots.length * plan.rowH
        const rows = Math.ceil(arrH / 80)
        let originX = 0
        for (let d = depth; d <= depth + rows; d++) originX = Math.max(originX, depthNextX.get(d) || 0)
        const y0 = depth * 80 + 50
        heapLayout.set(ref, { x: originX, y: y0, w: arrW, h: arrH })
        let clusterEnd = originX + arrW
        plan.slots.forEach((k, i) => {
            let cur = obj.pointers[k]
            let cx = originX + arrW + 60
            while (cur != null) {
                const cref = parseInt(String(cur))
                if (heapLayout.has(cref)) break // shared tail or cycle: stop, the arrow still connects
                const cobj = drawableHeap[String(cur)]
                if (!cobj) break
                const w = nodeWidths.get(cref) || 100
                heapLayout.set(cref, { x: cx, y: y0 + i * plan.rowH + (plan.rowH - 40) / 2, w, h: 40 })
                cx += w + 50
                clusterEnd = Math.max(clusterEnd, cx)
                cur = cobj.pointers["next"] ?? null
            }
        })
        for (let d = depth; d <= depth + rows; d++) depthNextX.set(d, clusterEnd + 50)
        return originX
    }

    // Place a Map table as a unit: the two-column box, then each row's object
    // key/value to the right, vertically centred on the row that points to it.
    // The box can be many rows tall, so reserve every depth band it spans (the
    // generic layout below assumes one 80px band per node and would let
    // children overlap a tall table).
    const layoutMapCluster = (refStr: string, depth: number): number => {
        const ref = parseInt(refStr)
        const plan = mapPlans.get(ref)!
        const obj = drawableHeap[refStr]
        const mapW = nodeWidths.get(ref) || 88
        const mapH = nodeHeights.get(ref) || 40
        const rows = Math.ceil(mapH / 80)
        let originX = 0
        for (let d = depth; d <= depth + rows; d++) originX = Math.max(originX, depthNextX.get(d) || 0)
        const y0 = depth * 80 + 50
        heapLayout.set(ref, { x: originX, y: y0, w: mapW, h: mapH })
        let clusterEnd = originX + mapW
        const childX = originX + mapW + 70
        // Distinct object key/value targets, in first-appearance order. A target
        // reused by several rows (e.g. a mutated key living in two entries) is
        // placed once; its rows just each draw an arrow to it.
        const leaves: number[] = []
        const seenLeaf = new Set<number>()
        for (const row of plan.rows) {
            for (const pk of [row.keyPtr, row.valPtr]) {
                if (!pk) continue
                const cur = obj.pointers[pk]
                if (cur == null) continue
                const cref = parseInt(String(cur))
                if (heapLayout.has(cref) || seenLeaf.has(cref)) continue
                const cobj = drawableHeap[String(cur)]
                if (!cobj) continue
                if (Object.keys(cobj.pointers).length) { postOrder(String(cur), depth + rows); continue } // nested: lay out below
                seenLeaf.add(cref)
                leaves.push(cref)
            }
        }
        // Stack the targets in a column with enough room that neighbours never
        // overlap, centred against the table.
        let cy = y0
        for (const cref of leaves) {
            const cw = nodeWidths.get(cref) || 100
            const ch = nodeHeights.get(cref) || 40
            heapLayout.set(cref, { x: childX, y: cy, w: cw, h: ch })
            clusterEnd = Math.max(clusterEnd, childX + cw)
            cy += ch + 16
        }
        for (let d = depth; d <= depth + rows; d++) depthNextX.set(d, clusterEnd + 50)
        return originX
    }

    const postOrder = (refStr: string, depth: number): number => {
        const ref = parseInt(refStr)
        if (auxPlans.has(ref)) return -1 // bookkeeping tables are placed below the graph instead
        if (heapLayout.has(ref)) return heapLayout.get(ref)!.x
        if (!drawableHeap[refStr]) return 0
        if (bucketPlans.has(ref)) return layoutBucketCluster(refStr, depth)
        if (mapPlans.has(ref)) return layoutMapCluster(refStr, depth)
        if (isBstRef(refStr)) return layoutBstCluster(refStr, depth)

        const obj = drawableHeap[refStr]
        const w = nodeWidths.get(ref) || 60
        const h = nodeHeights.get(ref) || 40
        
        // Mark visiting to break cycles
        heapLayout.set(ref, { x: -1, y: -1, w, h })
        
        let childrenXs: number[] = []
        for (const [key, childRef] of Object.entries(obj.pointers)) {
            if (childRef !== null) {
                const resolved = resolveRef(childRef.toString())
                if (resolved) {
                    const cx = postOrder(resolved, depth + 1)
                    if (cx !== -1) childrenXs.push(cx)
                }
            }
        }
        
        let desiredX = 0 
        if (childrenXs.length > 0) {
            desiredX = childrenXs.reduce((a, b) => a + b, 0) / childrenXs.length
            // Adjust for BST to make left child actually be to the left of parent if possible
            if ("left" in obj.pointers && childrenXs.length === 1) desiredX += 40
            if ("right" in obj.pointers && childrenXs.length === 1) desiredX -= 40
        }
        
        const minXForDepth = depthNextX.get(depth) || 0
        const finalX = Math.max(desiredX, minXForDepth)
        
        heapLayout.set(ref, { x: finalX, y: depth * 80 + 50, w, h })
        depthNextX.set(depth, finalX + w + 50) // 50px horizontal margin
        
        return finalX
    }

    // Place stack roots first
    for (const variable of Object.values(filteredStack)) {
        if (variable && variable.type === "ref" && variable.ref) {
            const resolved = resolveRef(variable.ref.toString())
            if (resolved) postOrder(resolved, 0)
        }
    }
    
    // Place remaining disconnected components
    for (const ref of Object.keys(drawableHeap)) {
        if (!heapLayout.has(parseInt(ref))) postOrder(ref, 0)
    }

    // Stack the bookkeeping tables in a column directly below the graph,
    // in stack-variable declaration order.
    if (auxPlans.size) {
        const gl = [...graphPlans.keys()].map((r) => heapLayout.get(r)).find(Boolean)
        const ax = gl ? gl.x : 0
        let ay = (gl ? gl.y + gl.h : 50) + 48
        for (const v of Object.values(filteredStack)) {
            if (!v || v.type !== "ref" || !v.ref || !auxPlans.has(v.ref) || heapLayout.has(v.ref)) continue
            const w = nodeWidths.get(v.ref) || 60
            const h = nodeHeights.get(v.ref) || AUX_ROW_H
            heapLayout.set(v.ref, { x: ax, y: ay, w, h })
            ay += h + 46 // leave room for the next table's name label
        }
    }

    // DRAW HEAP (Clipped & Transformed)
    ctx.save()
    ctx.beginPath()
    ctx.rect(stackWidth, 0, jcanvas.width - stackWidth, jcanvas.height)
    ctx.clip()
    
    const { x: tx, y: ty, scale } = transformRef.current
    ctx.translate(stackWidth + tx, ty)
    ctx.scale(scale, scale)

    // Draw Heap Objects
    for (const [refStr, obj] of Object.entries(drawableHeap)) {
        const ref = parseInt(refStr)
        const layout = heapLayout.get(ref)
        if (!layout) continue
        const { x, y, w, h } = layout

        const plan = graphPlans.get(ref)
        if (plan) {
            // Node-link rendering of an adjacency-list map
            ctx.strokeStyle = P.border
            ctx.lineWidth = 1.5
            ctx.strokeRect(x, y, w, h)
            ctx.textAlign = "center"
            ctx.textBaseline = "middle"
            ctx.fillStyle = P.muted
            ctx.font = "10px monospace"
            ctx.fillText(`${obj.type} as graph — ${plan.vertices.length} vertices, ${plan.edges.length} edges`, x + w/2, y - 10)

            const half = plan.box / 2
            const at = (vName: string) => {
                const p = plan.pos.get(vName)!
                return { x: x + p.x, y: y + p.y }
            }
            // Clip an edge endpoint to the border of its square box, so lines
            // attach at the left/top/bottom/right side facing the other node.
            const anchor = (from: { x: number; y: number }, to: { x: number; y: number }) => {
                const dx = to.x - from.x
                const dy = to.y - from.y
                if (dx === 0 && dy === 0) return { x: from.x, y: from.y }
                const s = Math.min(dx !== 0 ? Math.abs(half / dx) : Infinity, dy !== 0 ? Math.abs(half / dy) : Infinity)
                return { x: from.x + dx * s, y: from.y + dy * s }
            }

            ctx.lineWidth = 1.5
            for (const [a, b] of plan.edges) {
                if (a === b || !plan.pos.has(a) || !plan.pos.has(b)) continue
                const pa = at(a)
                const pb = at(b)
                const e1 = anchor(pa, pb)
                const e2 = anchor(pb, pa)
                ctx.beginPath()
                ctx.strokeStyle = P.muted
                ctx.moveTo(e1.x, e1.y)
                ctx.lineTo(e2.x, e2.y)
                ctx.stroke()
                if (plan.directed) {
                    const ang = Math.atan2(pb.y - pa.y, pb.x - pa.x)
                    ctx.beginPath()
                    ctx.moveTo(e2.x, e2.y)
                    ctx.lineTo(e2.x - 8 * Math.cos(ang - Math.PI / 6), e2.y - 8 * Math.sin(ang - Math.PI / 6))
                    ctx.lineTo(e2.x - 8 * Math.cos(ang + Math.PI / 6), e2.y - 8 * Math.sin(ang + Math.PI / 6))
                    ctx.fillStyle = P.muted
                    ctx.fill()
                }
            }

            for (const vName of plan.vertices) {
                const p = at(vName)
                const isCurr = currVal !== null && vName === currVal
                const isVisited = visitedVals.has(vName)
                ctx.fillStyle = isCurr ? P.accent : isVisited ? P.surface2 : P.surface
                ctx.fillRect(p.x - half, p.y - half, plan.box, plan.box)
                ctx.strokeStyle = isCurr ? P.accent : isVisited ? P.accent : P.accent
                ctx.lineWidth = 2
                ctx.strokeRect(p.x - half, p.y - half, plan.box, plan.box)
                ctx.fillStyle = isCurr ? P.accentText : P.text
                ctx.font = "bold 13px 'Segoe UI', sans-serif"
                ctx.fillText(truncate(vName, 6), p.x, p.y)
            }
            ptrOrigins.set(ref, new Map())
            continue
        }

        const aux = auxPlans.get(ref)
        if (aux) {
            const fields = obj.fields || {}
            ctx.textBaseline = "middle"
            ctx.textAlign = "left"
            ctx.fillStyle = P.muted
            ctx.font = "bold 11px monospace"
            ctx.fillText(aux.name + " — " + obj.type, x, y - 10)

            if (!aux.cols.length) {
                ctx.strokeStyle = P.border
                ctx.lineWidth = 1
                ctx.setLineDash([4, 3])
                ctx.strokeRect(x, y, w, h)
                ctx.setLineDash([])
                ctx.fillStyle = P.muted
                ctx.font = "11px 'Segoe UI', sans-serif"
                ctx.textAlign = "center"
                ctx.fillText("(empty)", x + w / 2, y + h / 2)
            } else {
                ctx.lineWidth = 1
                aux.cols.forEach((c, i) => {
                    const cx0 = x + i * aux.colW
                    let cy = y
                    if (aux.kind === "table") {
                        ctx.fillStyle = P.surface2
                        ctx.fillRect(cx0, cy, aux.colW, AUX_HEADER_H)
                        ctx.strokeStyle = P.border
                        ctx.strokeRect(cx0, cy, aux.colW, AUX_HEADER_H)
                        ctx.fillStyle = P.muted
                        ctx.font = "10px 'Segoe UI', sans-serif"
                        ctx.textAlign = "center"
                        ctx.fillText(truncate(aux.labels[i], 6), cx0 + aux.colW / 2, cy + AUX_HEADER_H / 2 + 1)
                        cy += AUX_HEADER_H
                    }
                    const hot = aux.hot.has(c)
                    ctx.fillStyle = hot ? P.surface2 : P.surface
                    ctx.fillRect(cx0, cy, aux.colW, AUX_ROW_H)
                    ctx.strokeStyle = hot ? P.accent : P.border
                    ctx.strokeRect(cx0, cy, aux.colW, AUX_ROW_H)
                    if (aux.filled.has(c) && fields[c] !== undefined) {
                        ctx.fillStyle = hot ? P.accent : P.text
                        ctx.font = "bold 13px 'Segoe UI', sans-serif"
                        ctx.textAlign = "center"
                        ctx.fillText(truncate(String(fields[c]), 6), cx0 + aux.colW / 2, cy + AUX_ROW_H / 2 + 1)
                    }
                })
            }
            ptrOrigins.set(ref, new Map())
            continue
        }

        const bplan = bucketPlans.get(ref)
        if (bplan) {
            ctx.textBaseline = "middle"
            ctx.fillStyle = P.muted
            ctx.font = "10px monospace"
            ctx.textAlign = "left"
            ctx.fillText(obj.type + " " + obj.label, x, y - 10)

            const slotOrigins = new Map<string, { x: number; y: number }>()
            bplan.slots.forEach((k, i) => {
                const cy = y + i * bplan.rowH
                const cellX = x + bplan.labelW
                ctx.fillStyle = P.muted
                ctx.font = "bold 12px monospace"
                ctx.textAlign = "right"
                ctx.fillText(k.replace(/^\[|\]$/g, ""), cellX - 6, cy + bplan.rowH / 2)

                ctx.fillStyle = P.surface
                ctx.strokeStyle = P.accent
                ctx.lineWidth = 1.5
                ctx.fillRect(cellX, cy, bplan.cellW, bplan.rowH)
                ctx.strokeRect(cellX, cy, bplan.cellW, bplan.rowH)

                if (obj.pointers[k] === null) {
                    // textbook empty bucket: diagonal slash
                    ctx.beginPath()
                    ctx.strokeStyle = P.danger
                    ctx.lineWidth = 1.5
                    ctx.moveTo(cellX + 7, cy + bplan.rowH - 7)
                    ctx.lineTo(cellX + bplan.cellW - 7, cy + 7)
                    ctx.stroke()
                } else {
                    const origin = { x: cellX + bplan.cellW / 2, y: cy + bplan.rowH / 2 }
                    ctx.beginPath()
                    ctx.arc(origin.x, origin.y, 3, 0, Math.PI * 2)
                    ctx.fillStyle = P.accent
                    ctx.fill()
                    slotOrigins.set(k, origin)
                }
            })
            ptrOrigins.set(ref, slotOrigins)
            continue
        }

        const mplan = mapPlans.get(ref)
        if (mplan) {
            const { rows, keyW, valW, rowH, headerH } = mplan
            ctx.textBaseline = "middle"
            ctx.fillStyle = P.muted
            ctx.font = "10px monospace"
            ctx.textAlign = "left"
            ctx.fillText(obj.type + " " + obj.label + " id=" + ref, x, y - 10)

            // Header row: key | value
            ctx.fillStyle = P.surface2
            ctx.fillRect(x, y, keyW + valW, headerH)
            ctx.strokeStyle = P.border
            ctx.lineWidth = 1
            ctx.strokeRect(x, y, keyW, headerH)
            ctx.strokeRect(x + keyW, y, valW, headerH)
            ctx.fillStyle = P.muted
            ctx.font = "10px 'Segoe UI', sans-serif"
            ctx.textAlign = "center"
            ctx.fillText("key", x + keyW / 2, y + headerH / 2 + 1)
            ctx.fillText("value", x + keyW + valW / 2, y + headerH / 2 + 1)

            const slotOrigins = new Map<string, { x: number; y: number }>()
            const drawSlash = (cx: number, cy: number) => {
                ctx.beginPath()
                ctx.strokeStyle = P.danger
                ctx.lineWidth = 1.5
                ctx.moveTo(cx - 7, cy + 7)
                ctx.lineTo(cx + 7, cy - 7)
                ctx.stroke()
            }
            const drawDot = (key: string, cx: number, cy: number) => {
                ctx.beginPath()
                ctx.arc(cx, cy, 3, 0, Math.PI * 2)
                ctx.fillStyle = P.accent
                ctx.fill()
                slotOrigins.set(key, { x: cx, y: cy })
            }
            rows.forEach((row, i) => {
                const ry = y + headerH + i * rowH
                const cells: { x0: number; w: number; text: string | null; ptr: string | null }[] = [
                    { x0: x, w: keyW, text: row.keyText, ptr: row.keyPtr },
                    { x0: x + keyW, w: valW, text: row.valText, ptr: row.valPtr },
                ]
                for (const c of cells) {
                    ctx.fillStyle = P.surface
                    ctx.strokeStyle = P.accent
                    ctx.lineWidth = 1.5
                    ctx.fillRect(c.x0, ry, c.w, rowH)
                    ctx.strokeRect(c.x0, ry, c.w, rowH)
                    const ccx = c.x0 + c.w / 2
                    const ccy = ry + rowH / 2
                    if (c.ptr !== null) {
                        if (obj.pointers[c.ptr] == null) drawSlash(ccx, ccy)
                        else drawDot(c.ptr, ccx, ccy)
                    } else if (c.text !== null) {
                        ctx.fillStyle = P.text
                        ctx.font = "bold 13px 'Segoe UI', sans-serif"
                        ctx.textAlign = "center"
                        ctx.textBaseline = "middle"
                        ctx.fillText(truncate(c.text, 12), ccx, ccy + 1)
                    }
                }
            })
            ptrOrigins.set(ref, slotOrigins)
            continue
        }

        ctx.fillStyle = P.surface
        ctx.strokeStyle = P.accent
        ctx.lineWidth = 2

        ctx.fillRect(x, y, w, h)
        ctx.strokeRect(x, y, w, h)
        
        ctx.fillStyle = P.text
        ctx.font = "bold 14px 'Segoe UI', sans-serif"
        ctx.textAlign = "center"
        ctx.textBaseline = "middle"
        
        const isBST = "left" in obj.pointers || "right" in obj.pointers
        const isList = "next" in obj.pointers && !("prev" in obj.pointers)
        const isDll = "prev" in obj.pointers && "next" in obj.pointers

        let slotOrigins = new Map<string, {x: number, y: number}>()

        if (isBST) {
            ctx.beginPath(); ctx.moveTo(x + w/3, y); ctx.lineTo(x + w/3, y + h); ctx.stroke();
            ctx.beginPath(); ctx.moveTo(x + 2*w/3, y); ctx.lineTo(x + 2*w/3, y + h); ctx.stroke();
            ctx.fillText(obj.label, x + w/2, y + h/2)
            slotOrigins.set("left", { x: x + w/6, y: y + h/2 })
            slotOrigins.set("right", { x: x + 5*w/6, y: y + h/2 })
        } else if (isDll) {
            ctx.beginPath(); ctx.moveTo(x + w/3, y); ctx.lineTo(x + w/3, y + h); ctx.stroke();
            ctx.beginPath(); ctx.moveTo(x + 2*w/3, y); ctx.lineTo(x + 2*w/3, y + h); ctx.stroke();
            ctx.fillText(obj.label, x + w/2, y + h/2)
            slotOrigins.set("prev", { x: x + w/6, y: y + h/2 })
            slotOrigins.set("next", { x: x + 5*w/6, y: y + h/2 })
        } else if (isList) {
            ctx.beginPath(); ctx.moveTo(x + w/2, y); ctx.lineTo(x + w/2, y + h); ctx.stroke();
            ctx.fillText(obj.label, x + w/4, y + h/2)
            slotOrigins.set("next", { x: x + 3*w/4, y: y + h/2 })
        } else {
            const slots = slotPlans.get(ref) || []
            let sx = x
            let firstSlot = true
            for (const s of slots) {
                if (!firstSlot) {
                    ctx.beginPath(); ctx.moveTo(sx, y); ctx.lineTo(sx, y + h); ctx.stroke();
                }
                firstSlot = false
                const cx = sx + s.w / 2
                if (s.key) {
                    ctx.fillStyle = P.muted
                    ctx.font = "10px sans-serif"
                    ctx.fillText(s.key, cx, y + 9)
                }
                if (s.kind === "ptr") {
                    slotOrigins.set(s.key, { x: cx, y: y + h / 2 + 5 })
                } else {
                    ctx.fillStyle = P.text
                    ctx.font = "bold 13px 'Segoe UI', sans-serif"
                    ctx.fillText(s.text, cx, y + (s.key ? h / 2 + 7 : h / 2))
                }
                sx += s.w
            }
        }
        
        ptrOrigins.set(ref, slotOrigins)
        
        for (const [key, origin] of slotOrigins.entries()) {
            if (obj.pointers[key] === null) {
                ctx.beginPath()
                ctx.strokeStyle = P.danger
                ctx.lineWidth = 1.5
                ctx.moveTo(origin.x - 8, origin.y + 8)
                ctx.lineTo(origin.x + 8, origin.y - 8)
                ctx.stroke()
            }
        }
        
        ctx.fillStyle = P.muted
        ctx.font = "10px monospace"
        ctx.fillText(obj.type + " id=" + ref, x + w/2, y - 10)
    }

    // Draw Heap-to-Heap Pointers
    for (const [refStr, obj] of Object.entries(drawableHeap)) {
        const ref = parseInt(refStr)
        const origins = ptrOrigins.get(ref)
        if (!origins) continue
        
        for (const [key, targetRef] of Object.entries(obj.pointers)) {
            if (targetRef === null) continue
            const resolved = resolveRef(targetRef.toString())
            if (!resolved) continue
            
            const targetLayout = heapLayout.get(parseInt(resolved))
            const orig = origins.get(key)
            if (targetLayout && orig) {
                ctx.beginPath()
                ctx.arc(orig.x, orig.y, 3, 0, Math.PI*2)
                ctx.fillStyle = P.accent
                ctx.fill()
                drawPointerArrow(ctx, orig.x, orig.y, targetLayout.x + targetLayout.w/2, targetLayout.y + targetLayout.h/2, targetLayout.w, targetLayout.h)
            }
        }
    }
    
    ctx.restore() // End Heap Transform

    // DRAW STACK (Fixed)
    let stackY = 60
    for (const [name, variable] of Object.entries(filteredStack)) {
        ctx.font = "bold 14px monospace"
        ctx.textBaseline = "middle"

        let boxW = 40
        if (variable && variable.type === "primitive") {
            boxW = Math.max(40, Math.min(120, ctx.measureText(truncate(String(variable.value), 16)).width + 14))
        }
        const boxX = stackWidth - 10 - boxW

        ctx.fillStyle = P.text
        ctx.textAlign = "right"
        ctx.fillText(name, boxX - 10, stackY)

        ctx.fillStyle = P.surface
        ctx.strokeStyle = P.accent
        ctx.fillRect(boxX, stackY - 15, boxW, 30)
        ctx.strokeRect(boxX, stackY - 15, boxW, 30)

        if (variable && variable.type === "primitive") {
            ctx.fillStyle = P.text
            ctx.textAlign = "center"
            ctx.fillText(truncate(String(variable.value), 16), boxX + boxW / 2, stackY)
        } else if (variable && variable.type === "ref" && variable.ref) {
            ctx.beginPath()
            ctx.arc(stackWidth - 30, stackY, 4, 0, Math.PI*2)
            ctx.fillStyle = P.accent
            ctx.fill()
            
            const resolvedRef = resolveRef(variable.ref.toString())
            const target = resolvedRef ? heapLayout.get(parseInt(resolvedRef)) : undefined
            if (target) {
                // Calculate transformed target coordinates
                const targetX = stackWidth + tx + (target.x + target.w/2) * scale
                const targetY = ty + (target.y + target.h/2) * scale
                const targetScaledW = target.w * scale
                const targetScaledH = target.h * scale
                drawPointerArrow(ctx, stackWidth - 30, stackY, targetX, targetY, targetScaledW, targetScaledH, P.accent)
            } else {
                ctx.fillStyle = P.danger
                ctx.textAlign = "center"
                ctx.fillText("X", stackWidth - 30, stackY)
            }
        } else {
            ctx.fillStyle = P.muted
            ctx.textAlign = "center"
            ctx.fillText("null", stackWidth - 30, stackY)
        }
        
        stackY += 45
    }
    
    // Draw Split Line
    ctx.beginPath()
    ctx.strokeStyle = P.border
    ctx.lineWidth = 1
    ctx.moveTo(stackWidth, 0)
    ctx.lineTo(stackWidth, jcanvas.height)
    ctx.stroke()

    } catch (e) {
      // A malformed snapshot must never take down the app — skip the frame.
      console.error("Failed to render snapshot", e)
    }
  }, [showClassNodes, hiddenVars])

  useEffect(() => {
    const canvas = jcanvasRef.current
    if (!canvas) return
    
    const handleWheel = (e: WheelEvent) => {
      e.preventDefault()
      const stackWidth = 200
      const rect = canvas.getBoundingClientRect()
      const mouseX = e.clientX - rect.left
      if (mouseX < stackWidth) return // Don't pan/zoom when hovering the Stack

      const zoomSensitivity = 0.002
      const delta = -e.deltaY * zoomSensitivity
      const newScale = Math.min(Math.max(0.1, transformRef.current.scale * (1 + delta)), 5)
      
      const heapMouseX = mouseX - stackWidth
      const heapMouseY = e.clientY - rect.top
      
      const scaleChange = newScale / transformRef.current.scale
      
      transformRef.current.x = heapMouseX - (heapMouseX - transformRef.current.x) * scaleChange
      transformRef.current.y = heapMouseY - (heapMouseY - transformRef.current.y) * scaleChange
      transformRef.current.scale = newScale
      
      requestAnimationFrame(renderJFrame)
    }
    
    const handlePointerDown = (e: PointerEvent) => {
      const rect = canvas.getBoundingClientRect()
      if (e.clientX - rect.left < 200) return
      isDraggingRef.current = true
      lastMousePosRef.current = { x: e.clientX, y: e.clientY }
      canvas.setPointerCapture(e.pointerId)
      canvas.style.cursor = "grabbing"
    }
    
    const handlePointerMove = (e: PointerEvent) => {
      if (!isDraggingRef.current) return
      const dx = e.clientX - lastMousePosRef.current.x
      const dy = e.clientY - lastMousePosRef.current.y
      transformRef.current.x += dx
      transformRef.current.y += dy
      lastMousePosRef.current = { x: e.clientX, y: e.clientY }
      requestAnimationFrame(renderJFrame)
    }
    
    const handlePointerUp = (e: PointerEvent) => {
      isDraggingRef.current = false
      canvas.releasePointerCapture(e.pointerId)
      canvas.style.cursor = "default"
    }
    
    canvas.addEventListener('wheel', handleWheel, { passive: false })
    canvas.addEventListener('pointerdown', handlePointerDown)
    canvas.addEventListener('pointermove', handlePointerMove)
    canvas.addEventListener('pointerup', handlePointerUp)
    canvas.addEventListener('pointercancel', handlePointerUp)
    
    return () => {
      canvas.removeEventListener('wheel', handleWheel)
      canvas.removeEventListener('pointerdown', handlePointerDown)
      canvas.removeEventListener('pointermove', handlePointerMove)
      canvas.removeEventListener('pointerup', handlePointerUp)
      canvas.removeEventListener('pointercancel', handlePointerUp)
    }
  }, [renderJFrame])

  const jResizeCanvas = useCallback(() => {
    const jcanvas = jcanvasRef.current
    const parent = jcardRef.current
    if (!jcanvas || !parent || !parent.clientWidth) return
    jcanvas.width = parent.clientWidth
    jcanvas.height = parent.clientHeight
    renderJFrame()
  }, [renderJFrame])

  const syncFrameState = () => setFrameState({ count: jFramesRef.current.length, idx: jFrameIdxRef.current })

  const setJFrameIdx = (idx: number) => {
    jFrameIdxRef.current = idx
    setJFrameIdxState(idx)
    renderJFrame()
    renderJavaOut()
  }

  const frameTo = (i: number) => {
    if (!jFramesRef.current.length) return
    const idx = Math.max(0, Math.min(jFramesRef.current.length - 1, i))
    setJFrameIdx(idx)
    
    if (editorRef.current && monacoRef.current) {
        const line = jFramesRef.current[idx].line
        // CheerpJ stack traces report line 0, so only instrumented snapshots
        // (which embed the editor line directly) can drive the highlight.
        const valid = line > 0 && line <= editorRef.current.getModel().getLineCount()
        if (valid) editorRef.current.revealLineInCenter(line)
        const newDecs = valid ? [{
            range: new monacoRef.current.Range(line, 1, line, 1),
            options: { isWholeLine: true, className: "highlight-line" }
        }] : []

        if (decorationsCollectionRef.current) {
            decorationsCollectionRef.current.set(newDecs)
        } else if (editorRef.current.createDecorationsCollection) {
            decorationsCollectionRef.current = editorRef.current.createDecorationsCollection(newDecs)
        } else {
            decoratorsRef.current = editorRef.current.deltaDecorations(decoratorsRef.current, newDecs)
        }
    }
    
    // Notify parent of the line change (useful in Studio mode where the editor is in another panel)
    if (onActiveLineChange) {
      const line = jFramesRef.current[idx]?.line ?? 0
      onActiveLineChange(line > 0 ? line : null)
    }
  }

  const frameStep = (d: number) => frameTo(jFrameIdxRef.current + d)

  const frameStepRef = useRef(frameStep)
  useEffect(() => {
    frameStepRef.current = frameStep
  }, [frameStep])

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLElement) {
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.isContentEditable) {
          return
        }
      }
      if (e.key === 'ArrowLeft') {
        frameStepRef.current(-1)
      } else if (e.key === 'ArrowRight') {
        frameStepRef.current(1)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  useEffect(() => {
    syncFrameState()
    renderJFrame()
  }, [jFrameIdxState, renderJFrame])

  // Show only the output that existed at the current step. The last step (which
  // is also where the index sits while frames stream in) shows the full buffer,
  // including anything printed after the final snapshot.
  const renderJavaOut = () => {
    const out = javaOutRef.current
    if (!out) return
    const frames = jFramesRef.current
    const idx = jFrameIdxRef.current
    const buf = javaOutBufRef.current
    const visible =
      frames.length && idx < frames.length - 1 ? buf.slice(0, frames[idx].outChars ?? buf.length) : buf
    if (out.textContent !== visible) {
      out.textContent = visible
      out.scrollTop = out.scrollHeight
    }
  }

  const runningRef = useRef(false)

  const runJava = async () => {
    if (runningRef.current) return
    runningRef.current = true
    setRunning(true)

    if (javaOutRef.current) javaOutRef.current.textContent = ""
    javaOutBufRef.current = ""
    outputCharsRef.current = 0
    jFramesRef.current = []
    setJFrameIdx(0)
    transformRef.current = { x: 50, y: 50, scale: 1 } // Reset Pan/Zoom on Run

    const ctx = jcanvasRef.current?.getContext("2d")
    if (ctx && jcanvasRef.current) {
      ctx.clearRect(0, 0, jcanvasRef.current.width, jcanvasRef.current.height)
    }

    try {
      if (cheerpjStatus !== "ready") {
        jstatus("Java runtime is still loading — try again in a moment.", "info")
        return
      }

      const code: string = programToRunRef.current
      runCodeLinesRef.current = code.split("\n")

      // Auto-instrumentation (Python Tutor style); fall back to the raw source if it throws.
      let instrumentedCode = code
      try {
        instrumentedCode = instrumentJava(code)
      } catch {
        instrumentedCode = code
      }

      // The TreeVisualizer reflection helper is precompiled natively at build time
      // (ECJ-on-CheerpJ crashes scanning its source) and loaded as a .class onto the
      // classpath — unless the user defined their own class by that name.
      const extraClasses: { path: string; bytes: Uint8Array }[] = []
      if (!/class\s+TreeVisualizer\b/.test(code)) {
        const tvResp = await fetch("/TreeVisualizer.class")
        const tvBuf = await tvResp.arrayBuffer()
        extraClasses.push({ path: "/str/TreeVisualizer.class", bytes: new Uint8Array(tvBuf) })
      }
      // Studio mode: compile the other notebook cells alongside so cross-cell
      // class references resolve ("all the code works together").
      const extraSources: { path: string; content: string }[] = []
      for (const sibling of extraSourcesRef.current ?? []) {
        extraSources.push(sibling)
      }

      jstatus("Compiling and running with ECJ…", "info")
      // skipPrecheck keeps line numbers intact for the snapshot↔editor mapping;
      // settleMs lets the final @@TREEVIZ@@ frame flush before stdout capture ends.
      const result = await compileAndRunJava(instrumentedCode, {
        extraSources,
        extraClasses,
        skipPrecheck: true,
        settleMs: 250,
        precompileSeparately: true,
      })

      const { snapshots, output } = parseTreevizSnapshots(result.stdout)

      let buf = output
      if (result.stderr) buf += (buf ? "\n" : "") + result.stderr
      javaOutBufRef.current = buf
      outputCharsRef.current = buf.length

      jFramesRef.current = snapshots
      setJFrameIdx(snapshots.length ? snapshots.length - 1 : 0)
      renderJavaOut()

      if (result.exitCode !== 0) {
        jstatus("Program exited with code " + result.exitCode + " — see the output panel.", "err")
      } else if (snapshots.length) {
        jstatus("Done — captured " + snapshots.length + " snapshots.", "ok")
      } else {
        jstatus("Ran fine, but no state was traced. Make sure your logic lives inside methods, or call TreeVisualizer.show() manually.", "info")
      }
    } catch (e: any) {
      jstatus(String((e && e.message) || e), "err")
    } finally {
      runningRef.current = false
      setRunning(false)
    }
  }

  const runJavaRef = useRef(runJava)
  runJavaRef.current = runJava

  // Studio mode: when a new program is handed in (a cell's Visualize click),
  // focus the visualizer and run it once. The code comes from the notebook.
  useEffect(() => {
    if (!active || !programCode || cheerpjStatus !== "ready") return
    if (lastRunProgramRef.current === programCode) return
    lastRunProgramRef.current = programCode
    setActiveRightTab("visualizer")
    programToRunRef.current = programCode
    setFileLabel(mainClassName(programCode) + ".java")
    const id = setTimeout(() => runJavaRef.current(), 30)
    return () => clearTimeout(id)
  }, [active, programCode, cheerpjStatus])

  // Studio mode: surface assembly errors (e.g. duplicate class names).
  useEffect(() => {
    if (programError) jstatus(programError, "err")
  }, [programError])

  useEffect(() => {
    if (!active) return
    requestAnimationFrame(() => jResizeCanvas())
  }, [active, jResizeCanvas])

  useEffect(() => {
    const onResize = () => { if (active) jResizeCanvas() }
    window.addEventListener("resize", onResize)
    return () => window.removeEventListener("resize", onResize)
  }, [active, jResizeCanvas])

  return (
    <div className={"java-view" + (active ? " visible" : "")}>
      <div className="java-layout" ref={layoutRef} style={{ display: 'flex', flexDirection: 'column', minHeight: 0 }}>
        <div className="java-right" style={{ flex: 1, display: 'flex', flexDirection: 'column', position: 'relative', minHeight: 0 }}>
          <div className="canvas-card java-canvas-card" ref={jcardRef} style={{ display: 'flex', flexDirection: 'column', flex: 1, width: '100%', position: 'relative' }}>
            <div className="java-toolbar" style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
              <div className="tabs" style={{ marginLeft: 0 }}>
                <button 
                  onClick={() => setActiveRightTab("visualizer")}
                  className={`tab ${activeRightTab === "visualizer" ? "active" : ""}`}
                >
                  Execution Visualizer
                </button>
                <button 
                  onClick={() => setActiveRightTab("whiteboard")}
                  className={`tab ${activeRightTab === "whiteboard" ? "active" : ""}`}
                >
                  Scratchpad / Whiteboard
                </button>
              </div>
              {activeRightTab === "visualizer" && (
                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', marginLeft: 'auto' }}>
                  <label style={{display: 'flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.85rem', color: 'var(--muted-foreground)', cursor: 'pointer'}}>
                    <input type="checkbox" checked={showClassNodes} onChange={(e) => setShowClassNodes(e.target.checked)} />
                    Show all objects
                  </label>
                  {!showClassNodes && (
                    <input 
                      type="text" 
                      value={hiddenVars} 
                      onChange={(e) => setHiddenVars(e.target.value)} 
                      placeholder="Hide vars"
                      style={{ background: 'var(--secondary)', border: '1px solid var(--border)', color: 'var(--foreground)', padding: '0.2rem 0.5rem', borderRadius: '4px', fontSize: '0.85rem', width: '150px' }}
                      title="Comma separated variables to hide from stack"
                    />
                  )}
                </div>
              )}
            </div>
            
            <div style={{ display: activeRightTab === "visualizer" ? 'block' : 'none', flex: 1, position: 'relative', minHeight: 0 }}>
              <canvas ref={jcanvasRef} aria-label="Java tree snapshot canvas" style={{ width: '100%', height: '100%', display: 'block' }} />
              
              <div className={"frame-bar" + (frameState.count > 1 ? " visible" : "")} style={{ position: 'absolute', bottom: '1rem', left: '50%', transform: 'translateX(-50%)', display: frameState.count > 1 ? 'flex' : 'none', gap: '1rem', background: 'var(--card)', padding: '0.5rem 1rem', borderRadius: '2rem', zIndex: 10, border: '1px solid var(--border)' }}>
                <button className="frame-btn" onClick={() => frameStep(-1)}>◀ Prev</button>
                <input
                  type="range"
                  min={0}
                  max={Math.max(frameState.count - 1, 0)}
                  value={jFrameIdxState}
                  onChange={(e) => frameTo(+e.target.value)}
                />
                <button className="frame-btn" onClick={() => frameStep(1)}>Next ▶</button>
                <span>{frameState.count ? `${jFrameIdxState + 1} / ${frameState.count}` : ""}</span>
              </div>
            </div>
            
            <Whiteboard active={activeRightTab === "whiteboard"} />
          </div>
        </div>
        <div className="java-console-wrap" style={{ display: activeRightTab === "visualizer" ? 'flex' : 'none', flexDirection: 'column', height: 140, flexShrink: 0 }}>
          <div className="java-console-title">Output</div>
          <pre className="java-out" ref={javaOutRef} />
        </div>
      </div>
      <div className={"status-bar java-status-bar " + status.type} role="status">
        <div className="status-dot" />
        <span>{status.msg}</span>
      </div>
    </div>
  )
}
