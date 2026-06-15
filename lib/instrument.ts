// Auto-instruments Java source so TreeVisualizer captures a snapshot after every
// executable statement (Python Tutor style). Works line-by-line: it never adds or
// removes lines, so the line numbers reported in snapshots match the editor.

interface LiveVar {
  name: string
  depth: number
}

const CONTROL_START = /^(if|else|for|while|do|switch|case|default|try|catch|finally|synchronized|return|new)\b/
// Statements that make code appended after them unreachable (would not compile).
const TERMINAL_STMT = /^(break|continue|return|throw)\b/
// Type, possibly generic and/or an array: Map<Integer, List<Integer>>, int[], final Node
const DECL_RE = /^(?:final\s+)?[A-Za-z_$][\w$.]*\s*(?:<[^=]*>)?\s*(?:\[\s*\]\s*)*\s+([A-Za-z_$][\w$]*)\s*=(?!=)/
// Plain or compound assignment to a bare name (usually a field of the enclosing class).
const BARE_ASSIGN_RE = /^([A-Za-z_$][\w$]*)\s*(?:[+\-*/%&|^]|<<|>>>?)?=(?!=)/
const FOR_DECL_RE = /^for\s*\(\s*(?:final\s+)?[A-Za-z_$][\w$.]*\s*(?:<[^=:;]*>)?\s*(?:\[\s*\]\s*)*\s+([A-Za-z_$][\w$]*)\s*[:=]/

export function instrumentJava(code: string): string {
  const lines = code.split("\n")
  let depth = 0
  let inMethod = false
  let methodBodyDepth = 0
  let liveVars: LiveVar[] = []

  const register = (name: string, d: number) => {
    if (!liveVars.some((v) => v.name === name)) liveVars.push({ name, depth: d })
  }

  const nextLineIsElse = (idx: number): boolean => {
    for (let i = idx + 1; i < lines.length; i++) {
      const t = lines[i].trim()
      if (!t || t.startsWith("//")) continue
      return /^(\}\s*)*else\b/.test(t)
    }
    return false
  }

  return lines
    .map((line, idx) => {
      const trimmed = line.trim()
      const open = (line.match(/\{/g) || []).length
      const close = (line.match(/\}/g) || []).length
      const depthBefore = depth
      const depthAfter = depthBefore + open - close
      // "} else {" both closes and opens: vars from the closed block are gone.
      const keepDepth = Math.min(depthAfter, depthBefore - close)
      depth = depthAfter

      liveVars = liveVars.filter((v) => v.depth <= keepDepth)
      if (inMethod && keepDepth < methodBodyDepth) inMethod = false

      if (!trimmed || trimmed.startsWith("//") || trimmed.startsWith("/*") || trimmed.startsWith("*")) return line

      if (!inMethod) {
        const isSignature =
          depthBefore >= 1 && // inside a class (possibly nested)
          open > close && // opens a body; skips one-line bodies like Node(int x) { data = x; }
          /\([^;]*\)\s*\{/.test(line) &&
          !/\b(class|interface|enum|record)\b/.test(line) &&
          !CONTROL_START.test(trimmed)
        if (!isSignature) return line

        inMethod = true
        methodBodyDepth = depthBefore + 1

        // Capture method/constructor parameters at entry.
        const paren = line.match(/\(([^)]*)\)/)
        let injected = ""
        if (paren && paren[1].trim()) {
          let params = paren[1]
          while (/<[^<>]*>/.test(params)) params = params.replace(/<[^<>]*>/g, "")
          for (const p of params.split(",")) {
            const m = p.trim().match(/([A-Za-z_$][\w$]*)\s*$/)
            if (!m || m[1] === "args") continue
            register(m[1], methodBodyDepth)
            injected += ` TreeVisualizer.stackVars.put("${m[1]}", ${m[1]});`
          }
        }
        return line + injected
      }

      if (trimmed.includes("TreeVisualizer.")) return line // user already traces this line

      if (trimmed.startsWith("for")) {
        // Loop variable is only in scope inside the loop body; skip braceless loops
        // since anything appended to this line would sit outside that scope.
        const m = trimmed.match(FOR_DECL_RE)
        if (m && open > close) register(m[1], depthAfter)
        return line
      }

      const decl = trimmed.match(DECL_RE)
      if (decl) {
        register(decl[1], depthAfter)
      } else {
        const bare = trimmed.match(BARE_ASSIGN_RE)
        if (bare && !CONTROL_START.test(bare[1]) && !TERMINAL_STMT.test(bare[1])) register(bare[1], depthAfter)
      }

      if (!trimmed.endsWith(";")) return line

      // If the line's final statement unconditionally transfers control
      // (break; / return x;), appended code would be unreachable.
      const lastStmt = trimmed.replace(/;\s*$/, "").split(";").pop()!.trim()
      if (TERMINAL_STMT.test(lastStmt)) return line

      // Appending after a braceless "if (...) stmt;" would orphan a following "else".
      if (/^(if|else)\b/.test(trimmed) && nextLineIsElse(idx)) return line

      const names: string[] = []
      for (const v of liveVars) if (!names.includes(v.name)) names.push(v.name)
      const puts = names.map((n) => ` TreeVisualizer.stackVars.put("${n}", ${n});`).join("")
      return line + puts + ` TreeVisualizer.show(${idx + 1});`
    })
    .join("\n")
}
