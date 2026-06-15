/**
 * Intelligent code indenter that restores indentation to code blocks
 * extracted from PDFs where leading whitespace is often lost.
 */
export function autoIndentCode(code: string, useTabs: boolean = true): string {
  const lines = code.split("\n")
  let level = 0
  const result: string[] = []
  const indentChar = useTabs ? "\t" : "  "

  for (let line of lines) {
    const trimmed = line.trim()
    if (!trimmed) {
      result.push("")
      continue
    }

    // Count braces to determine indentation changes
    // We ignore braces inside comments for a bit more robustness
    const lineWithoutComments = trimmed.replace(/\/\/.*$|\/\*[\s\S]*?\*\//g, "")
    const openBraces = (lineWithoutComments.match(/{/g) || []).length
    const closeBraces = (lineWithoutComments.match(/}/g) || []).length

    // If the line starts with a closing brace, it should be indented one level less
    // than the current scope (e.g., matching the opening brace's line).
    let currentLineLevel = level
    if (trimmed.startsWith("}")) {
      currentLineLevel--
    }

    // Ensure we don't go below 0
    currentLineLevel = Math.max(0, currentLineLevel)

    result.push(indentChar.repeat(currentLineLevel) + trimmed)

    // Update level for the next line
    level += openBraces - closeBraces
    level = Math.max(0, level)
  }

  return result.join("\n")
}
