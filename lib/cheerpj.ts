/**
 * CheerpJ 4.x Java Runtime with Eclipse Compiler for Java (ECJ)
 * 
 * Since CheerpJ ships as a JRE (not JDK), we use the Eclipse Compiler for Java (ECJ)
 * which is a standalone compiler that implements javax.tools.JavaCompiler.
 * 
 * Approach:
 * 1. Load ECJ JAR via CheerpJ library mode
 * 2. Write .java source to /str/ (readable by Java)
 * 3. Use ECJ's org.eclipse.jdt.internal.compiler.batch.Main to compile
 * 4. Run the compiled class with cheerpjRunMain
 * 5. Capture stdout/stderr via PrintStream redirection
 */

import { preCompileCheck, type PreCompileResult } from "@/lib/java-precompile-checks"
import type { CodeCell, NotebookCell } from "@/types/notebook"

export interface JavaRunResult {
  /** Auto-fixes applied before compilation (informational) */
  autoFixes?: string[]
  stdout: string
  stderr: string
  exitCode: number
  durationMs: number
}

export interface CompileRunOptions {
  /**
   * Extra Java sources written to /str/ and compiled alongside the user's class
   * (e.g. the TreeVisualizer.java reflection helper used by the visualizer route).
   */
  extraSources?: { path: string; content: string }[]
  /**
   * Skip the pre-compilation auto-fix pass. Used for instrumented/visualized runs
   * where the source must be compiled verbatim so snapshot line numbers keep
   * matching the editor.
   */
  skipPrecheck?: boolean
  /**
   * Delay (ms) after the program returns before stdout capture is torn down, so
   * trailing output (CheerpJ keeps flushing briefly after main() resolves) is not
   * truncated. Needed by the visualizer to capture the final @@TREEVIZ@@ frames.
   */
  settleMs?: number
  /**
   * Precompiled `.class` files written to /files/ (on the compile & run classpath)
   * before compilation. The visualizer ships TreeVisualizer.class this way: ECJ on
   * CheerpJ crashes scanning that large helper source, so we compile it natively at
   * build time and only ever compile the small instrumented user code in-browser.
   */
  extraClasses?: { path: string; bytes: Uint8Array }[]
  /**
   * Compile the entry and each extra source in its own single-file ECJ pass
   * (accumulating .class output on the classpath) instead of one multi-file pass.
   * CheerpJ's ECJ scanner intermittently throws ArrayIndexOutOfBoundsException on
   * multi-file compiles; single-file passes are reliable. Used by the visualizer.
   * Trade-off: cells that mutually reference each other won't resolve.
   */
  precompileSeparately?: boolean
}

// Global state
let cheerpjLib: any = null
let ecjLoaded = false

// ECJ JAR URL - using local proxy to avoid CORS issues with Maven Central
export const ECJ_JAR_URL = "/api/ecj?v=3.21.0"

/**
 * Mark ECJ as loaded (called by CheerpJProvider after preloading)
 */
export function markEcjLoaded(): void {
  ecjLoaded = true
  console.log("[v0] CheerpJ: ECJ marked as loaded")
}

// Declare CheerpJ globals
declare global {
  interface Window {
    cheerpjInit: (options?: {
      version?: number
      status?: "splash" | "none" | "default"
      javaProperties?: string[]
    }) => Promise<void>
    cheerpjRunLibrary: (classPath: string) => Promise<any>
    cheerpjRunMain: (
      className: string,
      classPath: string,
      ...args: string[]
    ) => Promise<number>
    cheerpOSAddStringFile: (path: string, content: string | Uint8Array) => void
    cjFileBlob: (path: string) => Promise<Blob>
  }
}

/**
 * Download ECJ JAR and add it to the /str/ filesystem
 * Note: The CheerpJProvider may have already preloaded it
 */
async function loadEcjJar(): Promise<void> {
  if (ecjLoaded) {
    console.log("[v0] CheerpJ: ECJ already loaded (cached)")
    return
  }
  
  // Check if provider already loaded it by trying to read a test file
  // We can't directly check if /str/ecj.jar exists, so we'll just mark it loaded
  // after the provider has set status to "ready"
  console.log("[v0] CheerpJ: Ensuring ECJ compiler JAR is available...")
  const startTime = performance.now()
  
  try {
    const response = await fetch(ECJ_JAR_URL)
    if (!response.ok) {
      throw new Error(`Failed to fetch ECJ: ${response.status} ${response.statusText}`)
    }
    
    const arrayBuffer = await response.arrayBuffer()
    const uint8Array = new Uint8Array(arrayBuffer)
    
    console.log(`[v0] CheerpJ: ECJ JAR downloaded (${(uint8Array.length / 1024 / 1024).toFixed(2)} MB) in ${(performance.now() - startTime).toFixed(0)}ms`)
    
    // Write to /str/ filesystem (overwrites if already exists, which is fine)
    window.cheerpOSAddStringFile("/str/ecj.jar", uint8Array)
    ecjLoaded = true
    
    console.log("[v0] CheerpJ: ECJ JAR loaded into /str/ecj.jar")
  } catch (error) {
    console.error("[v0] CheerpJ: Failed to load ECJ:", error)
    throw error
  }
}

/**
 * Get or initialize the CheerpJ library mode instance
 */
async function getLib(): Promise<any> {
  if (cheerpjLib) return cheerpjLib
  
  console.log("[v0] CheerpJ: Loading library mode with ECJ...")
  
  // First ensure ECJ is loaded
  await loadEcjJar()
  
  // Load library mode with ECJ on classpath
  cheerpjLib = await window.cheerpjRunLibrary("/str/ecj.jar")
  console.log("[v0] CheerpJ: Library mode ready with ECJ")
  
  return cheerpjLib
}

/**
 * Extract the public class name from Java source
 */
function extractClassName(code: string): string {
  const publicMatch = code.match(/public\s+class\s+(\w+)/)
  if (publicMatch) return publicMatch[1]
  
  const classMatch = code.match(/class\s+(\w+)/)
  if (classMatch) return classMatch[1]
  
  return "Main"
}

/**
 * Compile and run Java code using CheerpJ + ECJ
 * 
 * Execution limits:
 * - Max compilation time: 30 seconds
 * - Max execution time: 10 seconds
 * - Max output size: 1 MB
 *
 * `opts` lets the visualizer route compile a helper class alongside the user code
 * and preserve line numbers (see CompileRunOptions).
 */
export async function compileAndRunJava(code: string, opts: CompileRunOptions = {}): Promise<JavaRunResult> {
  const startTime = performance.now()
  const MAX_COMPILE_TIME_MS = 30_000
  const MAX_RUN_TIME_MS = 10_000
  const MAX_OUTPUT_SIZE_BYTES = 1_048_576 // 1 MB
  
  try {
    // --- Step 0: Pre-compilation checks & auto-fixes ---
    // Visualized runs are pre-instrumented; auto-fixes would shift line numbers
    // and break the snapshot↔editor mapping, so they pass skipPrecheck.
    const preCheck: PreCompileResult = opts.skipPrecheck
      ? { ok: true, code, errors: [], fixes: [] }
      : preCompileCheck(code)

    if (!opts.skipPrecheck) {
      console.log("[v0] CheerpJ: Running pre-compilation checks...")
      if (preCheck.fixes.length > 0) {
        console.log("[v0] CheerpJ: Applied auto-fixes:", preCheck.fixes)
      }
    }
    
    // If there are blocking errors (unfixable), return them immediately
    if (!preCheck.ok && preCheck.errors.some(e => e.rule === "DUPLICATE_VARIABLE")) {
      const errorMsg = preCheck.errors
        .map(e => {
          const loc = e.line ? `Line ${e.line}: ` : ""
          return `❌ ${loc}${e.message}`
        })
        .join("\n")
      
      return {
        stdout: "",
        stderr: errorMsg,
        exitCode: 1,
        durationMs: performance.now() - startTime,
        autoFixes: preCheck.fixes,
      }
    }
    
    // Use the (potentially auto-fixed) code from here on
    const processedCode = preCheck.code
    
    const lib = await getLib()
    const className = extractClassName(processedCode)
    
    // CheerpJ's /str/ VFS caches file metadata. When a path is overwritten with
    // different content length, ECJ reads past EOF and throws AIOOBE.
    // Directories are not supported in /str/. The only 100% reliable fix is to
    // use a globally unique filename for every compilation pass.
    // However, ECJ enforces that `public class X` must reside in `X.java`.
    // By stripping the `public` access modifier from classes, we can name the
    // files anything we want (e.g., `X_17150000.java`).
    const runId = Date.now() + "_" + Math.floor(Math.random() * 1000)
    const sourceFile = `/str/${className}_${runId}.java`
    
    console.log(`[v0] CheerpJ: Processing ${className}.java (as ${className}_${runId}.java)`)
    
    const prepareSource = (s: string) => {
      let cleaned = s
        .replace(/^\uFEFF/, "")
        .replace(/[\u200B-\u200F\u2028-\u202F]/g, "")
        .replace(/\r\n/g, "\n")
        .replace(/\r/g, "\n")
        // Strip 'public' from top-level declarations so ECJ accepts arbitrary filenames.
        // It's safe because all files are compiled in the same default package.
        .replace(/(^|\s)public\s+(class|interface|enum|record)\b/g, "$1$2")
      
      // Pad to a fixed size with whitespace. CheerpJ's VFS sometimes has 
      // off-by-one read errors or returns garbage at the EOF boundary.
      // Padding with the EOF character (\u001a) ensures the ECJ Scanner stops
      // cleanly before any garbage.
      if (!cleaned.endsWith("\n")) cleaned += "\n"
      cleaned += "\u001a\n"
      
      return new TextEncoder().encode(cleaned)
    }

    // --- Step 1: Write source file(s) to /str/ ---
    console.log("[v0] CheerpJ: Writing source files to /str/...")
    window.cheerpOSAddStringFile(sourceFile, prepareSource(processedCode))

    // Extra sources (other notebook cells) compiled alongside the user class.
    const extraSourcePaths: string[] = []
    for (const src of opts.extraSources ?? []) {
      const basename = src.path.split("/").pop()!
      const nameNoExt = basename.endsWith(".java") ? basename.slice(0, -5) : basename
      const uniquePath = `/str/${nameNoExt}_${runId}.java`
      window.cheerpOSAddStringFile(uniquePath, prepareSource(src.content))
      extraSourcePaths.push(uniquePath)
    }

    // Precompiled helper classes (e.g. /files/TreeVisualizer.class) placed on the
    // classpath so the user code can reference them without recompiling them.
    for (const cls of opts.extraClasses ?? []) {
      window.cheerpOSAddStringFile(cls.path, cls.bytes)
    }
    
    // --- Step 2: Compile using ECJ with timeout ---
    console.log("[v0] CheerpJ: Compiling with ECJ...")
    const compileStart = performance.now()

    // Compiled output lives in /files/; precompiled helper .class files are written
    // to /str/ (the JS-writable mount), so put both on the classpath when present.
    const classpath = (opts.extraClasses?.length ?? 0) > 0 ? "/files/:/str/" : "/files/"

    const ByteArrayOutputStream = await lib.java.io.ByteArrayOutputStream
    const PrintStream = await lib.java.io.PrintStream
    const System = await lib.java.lang.System

    // One ECJ invocation over `sources`, capturing stdout/stderr and honoring the
    // compile timeout. Returns the exit code plus decoded output.
    const runEcj = async (
      sources: string[],
      extraArgs: string[] = [],
    ): Promise<{ code: number; out: string; err: string; thrown: string }> => {
      const out = await new ByteArrayOutputStream()
      const err = await new ByteArrayOutputStream()
      const outPrint = await new PrintStream(out, true)
      const errPrint = await new PrintStream(err, true)
      const origOut = System.out
      const origErr = System.err
      await System.setOut(outPrint)
      await System.setErr(errPrint)

      let capturedOut = ""
      let capturedErr = ""
      const origConsoleLog = console.log
      const origConsoleError = console.error
      console.log = (...args) => {
        const msg = args.map(String).join(" ")
        if (typeof msg === "string" && msg.startsWith("[v0]")) {
          origConsoleLog(...args)
        } else {
          capturedOut += msg + "\n"
        }
      }
      console.error = (...args) => {
        const msg = args.map(String).join(" ")
        if (typeof msg === "string" && msg.startsWith("[v0]")) {
          origConsoleError(...args)
        } else {
          capturedErr += msg + "\n"
        }
      }

      let code = 1
      let thrown = ""
      try {
        const timeout = new Promise<never>((_, reject) => {
          setTimeout(() => reject(new Error("Compilation timeout exceeded (30s)")), MAX_COMPILE_TIME_MS)
        })
        code = await Promise.race([
          window.cheerpjRunMain(
            "org.eclipse.jdt.internal.compiler.batch.Main",
            "/str/ecj.jar",
            "-d", "/files/",
            "-cp", classpath,
            "-source", "1.8",
            "-target", "1.8",
            "-nowarn",
            ...extraArgs,
            ...sources,
          ),
          timeout,
        ])
      } catch (e: any) {
        thrown = e.message || String(e)
        console.error("[v0] CheerpJ: Compilation runtime error:", thrown)
      } finally {
        await System.setOut(origOut)
        await System.setErr(origErr)
        console.log = origConsoleLog
        console.error = origConsoleError
      }
      const outStr = new TextDecoder().decode(await out.toByteArray()) + capturedOut
      const errStr = new TextDecoder().decode(await err.toByteArray()) + capturedErr
      return { code, out: outStr, err: errStr, thrown }
    }

    let compileExitCode = 1
    let compileOutStr = ""
    let compileErrStr = ""
    let compileErrorStr = ""

    if (opts.precompileSeparately && extraSourcePaths.length > 0) {
      compileExitCode = 0
      for (const path of [...extraSourcePaths, sourceFile]) {
        const r = await runEcj([path])
        compileOutStr += r.out
        compileErrStr += r.err
        if (r.thrown) compileErrorStr = r.thrown
        if (r.code !== 0) { compileExitCode = r.code; break }
      }
    } else {
      const r = await runEcj([sourceFile, ...extraSourcePaths])
      compileExitCode = r.code
      compileOutStr = r.out
      compileErrStr = r.err
      compileErrorStr = r.thrown
    }

    const compileSuccess = compileExitCode === 0
    const compileTime = performance.now() - compileStart

    console.log(`[v0] CheerpJ: Compilation ${compileSuccess ? "succeeded" : "failed"} in ${compileTime.toFixed(0)}ms`)
    
    if (!compileSuccess) {
      let errorMsg = compileErrorStr || compileErrStr || compileOutStr || "Compilation failed"
      
      // If ECJ itself crashed parsing the code (even with unique files), replace
      // the ugly JVM stack trace with a cleaner message.
      if (errorMsg.includes("java.lang.ArrayIndexOutOfBoundsException") && errorMsg.includes("Scanner.getNextToken0")) {
        errorMsg = "Compiler error: The in-browser Java compiler encountered an internal error. " +
          "Try simplifying the code, removing special characters, or refreshing the page."
      }
      
      console.error("[v0] CheerpJ: Compile errors:", errorMsg)
      return {
        stdout: compileOutStr,
        stderr: errorMsg,
        exitCode: 1,
        durationMs: performance.now() - startTime,
      }
    }
    
    // --- Step 3: Run the compiled class with timeout and output limits ---
    console.log(`[v0] CheerpJ: Running ${className}...`)
    const runStart = performance.now()
    
    let exitCode = 0
    let runtimeError = ""
    let capturedStdout = ""
    let capturedStderr = ""
    
    // cheerpjRunMain bypasses System.setOut and writes directly to console.log
    // We intercept console to capture the standard output
    const origConsoleLog = console.log
    const origConsoleError = console.error
    
    console.log = (...args) => {
      const msg = args.map(String).join(" ")
      if (typeof msg === "string" && msg.startsWith("[v0]")) {
        origConsoleLog(...args)
      } else {
        // Enforce output size limit
        if (capturedStdout.length < MAX_OUTPUT_SIZE_BYTES) {
          // CheerpJ sometimes passes strings that already end with newlines,
          // or empty strings for bare print("\n"). Avoid duplicating newlines.
          capturedStdout += msg.replace(/\n$/, "") + "\n"
        }
      }
    }
    
    console.error = (...args) => {
      const msg = args.map(String).join(" ")
      if (typeof msg === "string" && msg.startsWith("[v0]")) {
        origConsoleError(...args)
      } else {
        capturedStderr += msg.replace(/\n$/, "") + "\n"
      }
    }
    
    try {
      // Create timeout promise for execution
      const runTimeout = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error("Execution timeout exceeded (10s)")), MAX_RUN_TIME_MS)
      })
      
      // Run the class from /files/ where the .class was compiled to, with timeout.
      // Include /str/ so precompiled helper classes (TreeVisualizer) resolve at runtime.
      exitCode = await Promise.race([
        window.cheerpjRunMain(className, classpath),
        runTimeout,
      ])

      // CheerpJ keeps flushing stdout for a beat after main() resolves; wait so
      // trailing output (e.g. the visualizer's final @@TREEVIZ@@ frame) is captured
      // before console capture is torn down in the finally block.
      if (opts.settleMs && opts.settleMs > 0) {
        await new Promise((r) => setTimeout(r, opts.settleMs))
      }
    } catch (e: any) {
      runtimeError = e.message || String(e)
      exitCode = 1
      origConsoleError("[v0] CheerpJ: Runtime error:", runtimeError)
    } finally {
      // Restore console
      console.log = origConsoleLog
      console.error = origConsoleError
    }
    
    const stdout = capturedStdout
    const stderrCaptured = capturedStderr
    const stderr = runtimeError ? runtimeError + "\n" + stderrCaptured : stderrCaptured
    
    const runTime = performance.now() - runStart
    console.log(`[v0] CheerpJ: Execution finished in ${runTime.toFixed(0)}ms, exit code: ${exitCode}`)
    console.log(`[v0] CheerpJ: stdout: "${stdout}"`)
    
    return {
      stdout,
      stderr,
      exitCode,
      durationMs: performance.now() - startTime,
      autoFixes: preCheck.fixes.length > 0 ? preCheck.fixes : undefined,
    }
    
  } catch (error: any) {
    console.error("[v0] CheerpJ: Error:", error)
    return {
      stdout: "",
      stderr: `CheerpJ Error: ${error.message || String(error)}`,
      exitCode: 1,
      durationMs: performance.now() - startTime,
    }
  }
}

// ---------------------------------------------------------------------------
// Multi-cell program assembly
//
// The notebook compiles as ONE program: running/visualizing a cell compiles it
// together with every other code cell so a class defined anywhere is usable
// everywhere ("shared classes, fresh run each cell").
// ---------------------------------------------------------------------------

export type CellRole = "runnable" | "library"
export type CellRoleOverride = CellRole | undefined

export interface CellRoleInfo {
  /** Effective role after applying any manual override. */
  role: CellRole
  /** True when the cell is loose statements that must be wrapped in a main(). */
  needsWrap: boolean
  /** Whether the cell can be run/visualized (has, or can be given, an entry point). */
  canVisualize: boolean
}

/** Raw classification of a cell's source, before any manual override. */
export function classifyCell(code: string): "runnable" | "library" | "statements" {
  const hasType = /\b(?:class|interface|enum|record)\s+[A-Za-z_$][\w$]*/.test(code)
  const hasMain = /\bvoid\s+main\s*\(/.test(code)
  if (hasType && hasMain) return "runnable"
  if (hasType) return "library"
  return "statements"
}

/** Resolve a cell's effective role, honoring a manual override. */
export function getCellRole(code: string, override?: CellRoleOverride): CellRoleInfo {
  const base = classifyCell(code)
  // Auto: definitions-only → library; everything else is runnable.
  const role: CellRole = override ?? (base === "library" ? "library" : "runnable")
  const needsWrap = role === "runnable" && base === "statements"
  return { role, needsWrap, canVisualize: role === "runnable" }
}

/** Top-level (depth-0) type names declared in a source file. */
function topLevelTypeNames(code: string): string[] {
  const names: string[] = []
  let depth = 0
  const decl = /\b(?:class|interface|enum|record)\s+([A-Za-z_$][\w$]*)/g
  // Walk line by line tracking brace depth; only record declarations at depth 0.
  for (const line of code.split("\n")) {
    decl.lastIndex = 0
    let m: RegExpExecArray | null
    while ((m = decl.exec(line))) {
      const before = line.slice(0, m.index)
      const localDepth = depth + (before.match(/\{/g)?.length ?? 0) - (before.match(/\}/g)?.length ?? 0)
      if (localDepth === 0) names.push(m[1])
    }
    depth += (line.match(/\{/g)?.length ?? 0) - (line.match(/\}/g)?.length ?? 0)
  }
  return names
}

/** A Java identifier derived from a cell, used for the synthetic wrapper class. */
function wrapperClassName(cell: CodeCell): string {
  const base = cell.className && /^[A-Za-z_$][\w$]*$/.test(cell.className) ? cell.className : "Block"
  // Make it collision-resistant against real cell classes.
  const suffix = cell.id.replace(/[^A-Za-z0-9]/g, "").slice(-6) || "0"
  return `${base}Block_${suffix}`
}

export interface AssembledProgram {
  /** The entry source to instrument and run (the target cell, possibly wrapped). */
  entryCode: string
  /** Name of the class whose main() runs. */
  entryClassName: string
  /** Every other code cell that defines classes, compiled alongside the entry. */
  extraSources: { path: string; content: string }[]
}

/**
 * Thrown by {@link buildProgram} with a student-friendly message (duplicate class
 * names, or visualizing a definitions-only cell).
 */
export class ProgramAssemblyError extends Error {}

const codeCells = (cells: NotebookCell[]): CodeCell[] =>
  cells.filter((c): c is CodeCell => c.kind === "code")

/**
 * Assemble the whole notebook into a single compilable program with `targetId`
 * as the entry point. Other code cells that define classes ride along as
 * extraSources so cross-cell references resolve.
 */
export function buildProgram(
  cells: NotebookCell[],
  targetId: string,
  overrides: Record<string, CellRoleOverride> = {},
): AssembledProgram {
  const all = codeCells(cells)
  const target = all.find((c) => c.id === targetId)
  if (!target) throw new ProgramAssemblyError("That code block no longer exists.")

  const targetRole = getCellRole(target.code, overrides[target.id])
  if (!targetRole.canVisualize) {
    throw new ProgramAssemblyError(
      "This block only defines classes (no main). Mark it Runnable, or run a block that has a main().",
    )
  }

  // Build the entry source (wrap loose statements in a synthetic main()).
  let entryCode: string
  let entryClassName: string
  if (targetRole.needsWrap) {
    entryClassName = wrapperClassName(target)
    entryCode =
      `public class ${entryClassName} {\n` +
      `\tpublic static void main(String[] args) throws Exception {\n` +
      target.code
        .split("\n")
        .map((l) => `\t\t${l}`)
        .join("\n") +
      `\n\t}\n}\n`
  } else {
    entryCode = target.code
    entryClassName = extractClassName(target.code)
  }

  // Siblings that define classes become extra compilation units.
  const extraSources: { path: string; content: string }[] = []
  const nameOwner = new Map<string, string>() // class name -> cell label
  const labelOf = (c: CodeCell) => c.className || `block ${all.indexOf(c) + 1}`

  // Seed collision map with the entry's own top-level types.
  for (const name of topLevelTypeNames(entryCode)) nameOwner.set(name, labelOf(target))

  for (const cell of all) {
    if (cell.id === targetId) continue
    const names = topLevelTypeNames(cell.code)
    if (names.length === 0) continue // loose-statement sibling: nothing to compile

    for (const name of names) {
      const prev = nameOwner.get(name)
      if (prev) {
        throw new ProgramAssemblyError(
          `Two blocks both define class \`${name}\` (${prev} and ${labelOf(cell)}). ` +
            `Rename one so the notebook can compile as a single program.`,
        )
      }
      nameOwner.set(name, labelOf(cell))
    }

    const fileName = extractClassName(cell.code)
    extraSources.push({ path: `/str/${fileName}.java`, content: cell.code })
  }

  return { entryCode, entryClassName, extraSources }
}
