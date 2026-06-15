/**
 * Java Pre-Compilation Checks & Auto-Fixes
 *
 * This module performs static analysis on Java source code BEFORE sending it
 * to the ECJ compiler. It has two responsibilities:
 *
 * 1. **Auto-fix**: Silently patch common structural issues that students don't
 *    need to worry about (e.g. missing class wrapper, missing main method).
 *
 * 2. **Diagnose**: Detect unfixable errors and return clear, student-friendly
 *    messages so they can correct the code themselves (e.g. duplicate variable
 *    declarations within the same scope).
 *
 * The pipeline runs in order: diagnostics first → if clean, apply auto-fixes.
 * This keeps the two concerns separate: we never auto-fix code that has
 * real errors because the fix might mask the problem.
 */

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface PreCompileResult {
  /** Whether the code passed all checks */
  ok: boolean
  /** The (potentially auto-fixed) source code, ready for compilation */
  code: string
  /** Human-readable error messages (empty when ok === true) */
  errors: PreCompileError[]
  /** Auto-fixes that were applied (informational) */
  fixes: string[]
}

export interface PreCompileError {
  /** Short rule identifier (e.g. "DUPLICATE_VARIABLE") */
  rule: string
  /** Line number in the *original* source (1-indexed), or null if global */
  line: number | null
  /** Student-friendly explanation */
  message: string
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Strip single-line and multi-line comments, preserving line count */
function stripComments(code: string): string {
  // Replace block comments with equivalent newlines to keep line numbers stable
  let result = code.replace(/\/\*[\s\S]*?\*\//g, (match) => {
    return match.replace(/[^\n]/g, " ")
  })
  // Replace single-line comments
  result = result.replace(/\/\/.*$/gm, (match) => " ".repeat(match.length))
  return result
}

/** Strip string literals so they don't confuse our regex-based analysis */
function stripStrings(code: string): string {
  return code.replace(/"(?:[^"\\]|\\.)*"/g, (m) => '"' + " ".repeat(m.length - 2) + '"')
}

/**
 * Normalise source for analysis: remove comments + string literals.
 * The returned string has the same number of lines as the original.
 */
function normalise(code: string): string {
  return stripStrings(stripComments(code))
}

// ---------------------------------------------------------------------------
// Diagnostic checks (unfixable errors → user must correct)
// ---------------------------------------------------------------------------

/**
 * Detect duplicate variable declarations inside the same block scope.
 *
 * Example that triggers this:
 *   int x = 10;
 *   ...
 *   int[] x = new int[]{1, 2, 3};   // ← x already declared
 */
function checkDuplicateVariables(normalised: string): PreCompileError[] {
  const errors: PreCompileError[] = []
  const lines = normalised.split("\n")

  // Simplified scope tracker: we track nested { } depth and per-depth declared names.
  // This is good enough for the single-method snippets students write.
  const scopeStack: Map<string, number>[] = [new Map()] // global scope

  // Regex for local variable declarations:
  //   (type) (name) = ...   or   (type) (name);
  // Handles: int x, int[] x, String s, IntSquasher isq, etc.
  const declRegex =
    /\b(?:int|long|short|byte|char|float|double|boolean|String|(?:[A-Z]\w*))\s*(?:\[\s*\])?\s+([a-zA-Z_$]\w*)\s*(?:=|;|,)/g

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]

    // Track scope depth changes on this line
    for (const ch of line) {
      if (ch === "{") {
        scopeStack.push(new Map())
      } else if (ch === "}") {
        if (scopeStack.length > 1) scopeStack.pop()
      }
    }

    // Skip lines that look like method signatures, class declarations, for-loop headers
    if (/\b(class|interface|enum)\b/.test(line)) continue

    // Find variable declarations
    let match: RegExpExecArray | null
    declRegex.lastIndex = 0
    while ((match = declRegex.exec(line)) !== null) {
      const varName = match[1]

      // Skip common false positives (method parameters in signatures)
      // If line contains the method pattern, skip
      if (/\)\s*\{?\s*$/.test(line.trim()) && /\(/.test(line)) continue

      const currentScope = scopeStack[scopeStack.length - 1]
      const existingLine = currentScope.get(varName)

      if (existingLine !== undefined) {
        errors.push({
          rule: "DUPLICATE_VARIABLE",
          line: i + 1,
          message:
            `Variable '${varName}' is already declared on line ${existingLine}. ` +
            `You cannot declare a variable with the same name in the same scope. ` +
            `Rename one of them (e.g. '${varName}2' or 'arr').`,
        })
      } else {
        currentScope.set(varName, i + 1)
      }
    }
  }

  return errors
}

/**
 * Detect if the code references methods that are neither:
 *  - Defined in the same source
 *  - Standard library methods (System.out.println, etc.)
 *  - Constructor calls (new ...)
 *
 * For the CS143 lab exercises, undefined helper methods like obliterate(),
 * shamble(), agglutinate(), mystery() are expected to be defined.
 * We only warn — we don't block compilation — because ECJ will give the
 * definitive error. This check just provides a friendlier message.
 */
function checkUndefinedMethods(normalised: string, original: string): PreCompileError[] {
  const errors: PreCompileError[] = []
  const lines = normalised.split("\n")

  // Collect all method definitions in the source
  const definedMethods = new Set<string>()
  const methodDefRegex =
    /\b(?:public|private|protected|static|\s)+\s+\w[\w<>\[\]]*\s+(\w+)\s*\(/g
  let m: RegExpExecArray | null
  while ((m = methodDefRegex.exec(normalised)) !== null) {
    definedMethods.add(m[1])
  }

  // Well-known methods and prefixes we should never flag
  const wellKnown = new Set([
    "main", "println", "print", "printf", "format", "toString", "equals",
    "hashCode", "length", "charAt", "substring", "indexOf", "compareTo",
    "parseInt", "parseDouble", "valueOf", "getClass", "notify", "notifyAll",
    "wait", "clone", "finalize", "add", "remove", "get", "set", "size",
    "isEmpty", "contains", "containsKey", "containsValue", "put", "clear",
    "toArray", "sort", "asList", "copyOf", "fill", "arraycopy",
    "setOut", "setErr", "setIn", "exit", "currentTimeMillis", "nanoTime",
    "abs", "max", "min", "sqrt", "pow", "random", "floor", "ceil", "round",
  ])

  // Find standalone method calls:  methodName(...)
  // Exclude: new Foo(, System.out.println(, obj.method(
  const callRegex = /\b([a-z]\w*)\s*\(/g
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    callRegex.lastIndex = 0
    let callMatch: RegExpExecArray | null
    while ((callMatch = callRegex.exec(line)) !== null) {
      const name = callMatch[1]

      // Skip well-known, defined, or preceded by a dot (i.e. obj.method())
      if (wellKnown.has(name)) continue
      if (definedMethods.has(name)) continue
      // Check if preceded by '.'
      const before = line.substring(0, callMatch.index)
      if (/\.\s*$/.test(before)) continue
      // Skip keywords
      if (["if", "for", "while", "switch", "catch", "return", "new", "else", "super", "this"].includes(name)) continue

      errors.push({
        rule: "UNDEFINED_METHOD",
        line: i + 1,
        message:
          `Method '${name}()' is called but not defined in this file. ` +
          `Make sure you define it, or check for typos.`,
      })
    }
  }

  return errors
}

/**
 * Check for undefined classes (like IntSquasher) used with 'new'.
 */
function checkUndefinedClasses(normalised: string): PreCompileError[] {
  const errors: PreCompileError[] = []
  const lines = normalised.split("\n")

  // Collect defined classes in this source
  const definedClasses = new Set<string>()
  const classDefRegex = /\b(?:class|interface|enum)\s+(\w+)/g
  let m: RegExpExecArray | null
  while ((m = classDefRegex.exec(normalised)) !== null) {
    definedClasses.add(m[1])
  }

  // Well-known standard library classes
  const stdClasses = new Set([
    "String", "Integer", "Double", "Float", "Long", "Short", "Byte", "Character",
    "Boolean", "Object", "System", "Math", "StringBuilder", "StringBuffer",
    "ArrayList", "LinkedList", "HashMap", "HashSet", "TreeMap", "TreeSet",
    "Arrays", "Collections", "Scanner", "Random", "File", "IOException",
    "Exception", "RuntimeException", "NullPointerException", "Thread",
    "Comparable", "Iterable", "Iterator", "List", "Map", "Set", "Queue",
    "Stack", "Deque", "ArrayDeque", "PriorityQueue", "PrintStream",
    "InputStream", "OutputStream", "BufferedReader", "InputStreamReader",
    "FileReader", "FileWriter", "BigInteger", "BigDecimal",
  ])

  // Find 'new ClassName(' patterns
  const newRegex = /\bnew\s+([A-Z]\w*)\s*(?:\[|\()/g
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    newRegex.lastIndex = 0
    let newMatch: RegExpExecArray | null
    while ((newMatch = newRegex.exec(line)) !== null) {
      const clsName = newMatch[1]
      if (definedClasses.has(clsName)) continue
      if (stdClasses.has(clsName)) continue

      errors.push({
        rule: "UNDEFINED_CLASS",
        line: i + 1,
        message:
          `Class '${clsName}' is used but not defined in this file. ` +
          `Define the '${clsName}' class, or check for typos.`,
      })
    }
  }

  return errors
}

// ---------------------------------------------------------------------------
// Auto-fix transforms (applied silently when no blocking errors exist)
// ---------------------------------------------------------------------------

/**
 * If the code has no top-level `class` declaration, wrap it in a class.
 * Returns the fixed code and a description, or null if no fix was needed.
 */
function fixMissingClassWrapper(code: string): { code: string; fix: string } | null {
  const normalised = normalise(code)

  // Check if there's already a class/interface/enum at the top level
  if (/\b(class|interface|enum)\s+\w+/.test(normalised)) {
    return null
  }

  // The code is bare — probably just a main() or statements.
  // Check if it has a main method already
  const hasMain = /public\s+static\s+void\s+main\s*\(\s*String\s*\[\s*\]\s+\w+\s*\)/.test(normalised)

  let wrapped: string
  if (hasMain) {
    // Wrap the whole thing in a class
    wrapped = `public class Main {\n${code}\n}`
  } else {
    // Wrap in class + main
    wrapped = `public class Main {\n  public static void main(String[] args) {\n${code
      .split("\n")
      .map((l) => "    " + l)
      .join("\n")}\n  }\n}`
  }

  return {
    code: wrapped,
    fix: "Wrapped code in 'public class Main' (Java requires all code to be inside a class).",
  }
}

/**
 * If a class exists but has no main() method, add one.
 * This fixes the "Main method not found" runtime error.
 */
function fixMissingMainMethod(code: string): { code: string; fix: string } | null {
  const normalised = normalise(code)

  // Must have a class
  const classMatch = normalised.match(/\bclass\s+(\w+)/)
  if (!classMatch) return null

  // Already has main
  if (/public\s+static\s+void\s+main\s*\(/.test(normalised)) return null

  const className = classMatch[1]

  // Find the last closing brace of the class and insert main before it
  const lastBrace = code.lastIndexOf("}")
  if (lastBrace === -1) return null

  const mainMethod = `\n  public static void main(String[] args) {\n    // Auto-generated entry point\n    ${className} obj = new ${className}();\n    System.out.println(obj);\n  }\n`

  const fixed = code.substring(0, lastBrace) + mainMethod + code.substring(lastBrace)

  return {
    code: fixed,
    fix: `Added a 'main' method to class '${className}' (Java needs a main method to run).`,
  }
}

/**
 * Add missing import statements for commonly used classes.
 * Students often forget: import java.util.*
 */
function fixMissingImports(code: string): { code: string; fix: string } | null {
  const normalised = normalise(code)

  // Classes that require java.util import
  const utilClasses = [
    "ArrayList", "LinkedList", "HashMap", "HashSet", "TreeMap", "TreeSet",
    "Arrays", "Collections", "Scanner", "List", "Map", "Set", "Queue",
    "Stack", "Deque", "ArrayDeque", "PriorityQueue", "Iterator",
  ]

  const needsUtil = utilClasses.some(
    (cls) => new RegExp(`\\b${cls}\\b`).test(normalised)
  )
  const hasUtilImport = /import\s+java\.util\.\*/.test(normalised)

  if (!needsUtil || hasUtilImport) return null

  // Prepend import
  const fixed = `import java.util.*;\n${code}`

  return {
    code: fixed,
    fix: "Added 'import java.util.*' (needed for collections/utility classes used in the code).",
  }
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

/**
 * Run all pre-compilation checks on the given Java source.
 *
 * Call this BEFORE sending code to the ECJ compiler. The returned
 * `PreCompileResult.code` is the (potentially patched) source to compile.
 *
 * @param source — Raw Java source code from the editor
 * @returns PreCompileResult with diagnostics or auto-fixed code
 */
export function preCompileCheck(source: string): PreCompileResult {
  const trimmed = source.trim()
  if (!trimmed) {
    return {
      ok: false,
      code: source,
      errors: [{ rule: "EMPTY_SOURCE", line: null, message: "No code to compile." }],
      fixes: [],
    }
  }

  const normalised = normalise(trimmed)

  // -----------------------------------------------------------------------
  // Phase 1: Collect all diagnostic errors
  // -----------------------------------------------------------------------
  const allErrors: PreCompileError[] = []

  // 1a. Duplicate variable declarations (unfixable)
  allErrors.push(...checkDuplicateVariables(normalised))

  // -----------------------------------------------------------------------
  // Phase 2: If there are blocking errors that CANNOT be auto-fixed, return
  // them immediately. We only treat DUPLICATE_VARIABLE as truly blocking
  // because it indicates a logic mistake the student must correct.
  // -----------------------------------------------------------------------
  const blockingErrors = allErrors.filter((e) => e.rule === "DUPLICATE_VARIABLE")

  if (blockingErrors.length > 0) {
    return {
      ok: false,
      code: source,
      errors: blockingErrors,
      fixes: [],
    }
  }

  // -----------------------------------------------------------------------
  // Phase 3: Apply auto-fixes in order
  // -----------------------------------------------------------------------
  let fixedCode = trimmed
  const appliedFixes: string[] = []

  // Fix 1: Missing imports
  const importFix = fixMissingImports(fixedCode)
  if (importFix) {
    fixedCode = importFix.code
    appliedFixes.push(importFix.fix)
  }

  // Fix 2: Missing class wrapper (must come before missing-main check)
  const classFix = fixMissingClassWrapper(fixedCode)
  if (classFix) {
    fixedCode = classFix.code
    appliedFixes.push(classFix.fix)
  }

  // Fix 3: Missing main method
  const mainFix = fixMissingMainMethod(fixedCode)
  if (mainFix) {
    fixedCode = mainFix.code
    appliedFixes.push(mainFix.fix)
  }

  // -----------------------------------------------------------------------
  // Phase 4: Run advisory checks on the fixed code (non-blocking warnings)
  //          These are things ECJ will catch anyway, but we give nicer messages.
  // -----------------------------------------------------------------------
  const fixedNormalised = normalise(fixedCode)
  const advisoryErrors: PreCompileError[] = []

  advisoryErrors.push(...checkUndefinedMethods(fixedNormalised, fixedCode))
  advisoryErrors.push(...checkUndefinedClasses(fixedNormalised))

  // Deduplicate advisory errors (same method/class on multiple lines)
  const seenAdvisory = new Set<string>()
  const uniqueAdvisory = advisoryErrors.filter((e) => {
    const key = `${e.rule}:${e.message}`
    if (seenAdvisory.has(key)) return false
    seenAdvisory.add(key)
    return true
  })

  // If there are advisory errors, return them but still provide the fixed code.
  // These are "soft" errors — the compiler will give the definitive answer.
  if (uniqueAdvisory.length > 0) {
    return {
      ok: false,
      code: fixedCode,
      errors: uniqueAdvisory,
      fixes: appliedFixes,
    }
  }

  return {
    ok: true,
    code: fixedCode,
    errors: [],
    fixes: appliedFixes,
  }
}
