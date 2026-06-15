# learn-code-mvp

An in-browser **Java learning environment** that merges two prototypes into one
[Next.js](https://nextjs.org) app:

- **Java Notebook** — upload a CS lab PDF (or start blank/demo) and get a
  Jupyter-style notebook of markdown + runnable Java cells. Compile & run each
  cell client-side, export to `.ipynb`.
- **Execution Visualizer** — a step-by-step memory visualizer (Python-Tutor style)
  that renders the stack/heap and data-structure diagrams (BST, linked list,
  graph, hash buckets, maps) frame-by-frame as the program runs.

Everything runs **100% in the browser** — no server-side execution.

## How it fits together

| Piece | Location |
|---|---|
| Notebook shell, PDF → notebook, ipynb export | `app/page.tsx`, `components/notebook/*`, `lib/pdf-parser.ts` |
| Shared Java runtime (CheerpJ + ECJ) | `lib/cheerpj.ts`, `components/cheerpj-provider.tsx` |
| Execution visualizer (split route) | `app/visualize/*`, `components/visualizer/java-view.tsx` |
| Instrumentation + snapshot model | `lib/instrument.ts`, `lib/viz-snapshots.ts`, `public/TreeVisualizer.java` |
| Whiteboard / scratchpad | `app/whiteboard/*`, `components/visualizer/whiteboard.tsx`, `public/extension/*` |
| Offline asset cache | `public/sw.js`, `components/service-worker-register.tsx` |

### Java execution (one shared runtime)

Both the notebook cells and the visualizer go through a **single** runtime:

1. **CheerpJ** (WebAssembly JVM) is initialized once by `CheerpJProvider`.
2. **ECJ** (Eclipse Compiler for Java) is fetched via the `/api/ecj` proxy and
   written to CheerpJ's `/str/` filesystem (CheerpJ ships a JRE, not a JDK).
3. `compileAndRunJava()` compiles the user's `.java` to `/files/` and runs it,
   capturing stdout/stderr. Safeguards: 30 s compile / 10 s run / 1 MB output.

The visualizer reuses this runtime via `compileAndRunJava(code, { extraSources, skipPrecheck, settleMs })`:
the user's code is auto-instrumented (`instrumentJava`) and compiled alongside
`TreeVisualizer.java`, which prints `@@TREEVIZ@@`-marked JSON snapshots that
`parseTreevizSnapshots()` turns into the scrubbable timeline.

## Using it

- **Run a cell:** open a notebook → **Run** on a code cell.
- **Visualize a cell:** click **Visualize** on a code cell to open `/visualize`
  with that code loaded; run it to step through stack/heap snapshots.
- **Whiteboard:** the **Whiteboard** header link (or `/whiteboard`) opens the
  drawing scratchpad.

## Getting started

```bash
npm install
npm run dev      # http://localhost:3000
```

For offline support (Service Worker is production-only):

```bash
npm run build && npm start
```

## Notes & limitations (MVP)

- **Language:** Java only. The runtime/engine layer is structured so Python
  (Pyodide) / JS engines can be added later.
- **Isolation:** CheerpJ runs on the main thread with timeouts. A truly wedged
  JVM thread still requires a page reload (it cannot be force-killed).
- **Offline:** the Service Worker caches the proxied ECJ jar and the CheerpJ
  runtime best-effort; CheerpJ's ranged jar fetches are left to the browser cache.
