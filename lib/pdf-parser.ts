"use client"

import type { Notebook, NotebookCell, NotebookMetadata } from "@/types/notebook"
import { autoIndentCode } from "./code-formatter"

interface PdfLine {
  text: string
  y: number
  page: number
  isMono: boolean
  fontSize: number
}

// Patterns used by the adaptive parser
const NUMBERED_HEADING = /^(\d+(?:\.\d+)*)[.)]\s+(.{2,120})$/
const STUDENT_INFO = /([A-Z][A-Za-z'\-]+(?:\s+[A-Z][A-Za-z'\-]+)+)\s*\((\d{6,12})\)/
const SOURCE_MARKER = /\[\s*(?:cite|source|ref)[^\]]*\]/gi
const JAVA_KEYWORDS =
  /\b(public|private|protected|class|interface|extends|implements|static|void|return|new|import|package|if|else|for|while|switch|case|break|try|catch|throw|throws)\b/
const JAVA_STRONG =
  /\b(public\s+class|public\s+static\s+void\s+main|System\.out\.print|System\.out\.println)\b/
const GENERIC_MONO_FONTS = /(mono|courier|consolas|menlo|source\s*code)/i

let workerConfigured = false

// Polyfill for older browsers (like Safari < 16.4) that lack Promise.withResolvers
// and ReadableStream async iteration, which pdf.js uses internally.
if (typeof window !== "undefined") {
  if (typeof (Promise as any).withResolvers !== "function") {
    ;(Promise as any).withResolvers = function () {
      let resolve!: (value: any) => void
      let reject!: (reason?: any) => void
      const promise = new Promise((res, rej) => {
        resolve = res
        reject = rej
      })
      return { promise, resolve, reject }
    }
  }

  if (
    typeof ReadableStream !== "undefined" &&
    !(ReadableStream.prototype as any)[Symbol.asyncIterator]
  ) {
    ;(ReadableStream.prototype as any)[Symbol.asyncIterator] = async function* () {
      const reader = (this as any).getReader()
      try {
        while (true) {
          const { done, value } = await reader.read()
          if (done) return
          yield value
        }
      } finally {
        reader.releaseLock()
      }
    }
  }
}

async function loadPdfJs() {
  console.log("[v0] loadPdfJs: Starting dynamic import of pdfjs-dist...")
  const startImport = performance.now()

  // Dynamic import keeps pdfjs-dist out of the server bundle.
  const pdfjs = await import("pdfjs-dist")
  console.log(`[v0] loadPdfJs: Import complete in ${(performance.now() - startImport).toFixed(0)}ms, version: ${pdfjs.version}`)

  if (!workerConfigured) {
    // Use a CDN worker matching the version the package resolves to.
    const workerUrl = `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`
    console.log("[v0] loadPdfJs: Configuring worker from:", workerUrl)
    pdfjs.GlobalWorkerOptions.workerSrc = workerUrl
    workerConfigured = true
  } else {
    console.log("[v0] loadPdfJs: Worker already configured, skipping")
  }
  return pdfjs
}

function stripMarkers(text: string): string {
  return text.replace(SOURCE_MARKER, "").replace(/\s+$/g, "")
}

function isMonoFont(fontName: string | undefined): boolean {
  if (!fontName) return false
  return GENERIC_MONO_FONTS.test(fontName)
}

function looksLikeCode(line: string, inCodeBlock: boolean = false): boolean {
  if (!line) return false
  if (/^(\s*\/\/|\s*\/\*|\s*\*)/.test(line)) return true
  if (JAVA_STRONG.test(line)) return true
  // Java annotations like @Override, @Deprecated, @SuppressWarnings, etc.
  if (/^\s*@[A-Z][A-Za-z]*/.test(line)) return true
  
  if (inCodeBlock) {
    // If we're already parsing a code block, be very lenient:
    // Any line ending in curly braces, semicolons, or just a closing brace.
    if (/[{};]\s*$/.test(line)) return true
    if (/^[{}]+$/.test(line.trim())) return true
    // Assignments, method calls, etc.
    if (line.includes(" = ") || line.includes("++") || line.includes("--")) return true
    if (/^\s*(return|break|continue)\b/.test(line)) return true
    if (/^[A-Za-z_]\w*\s*\(/.test(line.trim())) return true
    // Fill-in-the-blank lines with underscores (common in worksheets)
    if (/__{2,}/.test(line)) return true
  }

  if (
    /[{};]\s*$/.test(line) &&
    (JAVA_KEYWORDS.test(line) || /^\s+/.test(line))
  ) {
    return true
  }
  if (/^\s*(public|private|protected|static|void|int|String|double|boolean|float|long|char)\b/.test(line)) {
    return true
  }
  return false
}

async function extractLines(file: File): Promise<PdfLine[]> {
  console.log(`[v0] extractLines: Starting extraction for file "${file.name}" (${(file.size / 1024).toFixed(1)} KB)`)
  const totalStart = performance.now()

  const pdfjs = await loadPdfJs()

  console.log("[v0] extractLines: Converting file to ArrayBuffer...")
  const bufStart = performance.now()
  const buf = await file.arrayBuffer()
  console.log(`[v0] extractLines: ArrayBuffer ready in ${(performance.now() - bufStart).toFixed(0)}ms`)

  console.log("[v0] extractLines: Loading PDF document...")
  const docStart = performance.now()
  const pdf = await pdfjs.getDocument({ data: buf }).promise
  console.log(`[v0] extractLines: PDF loaded in ${(performance.now() - docStart).toFixed(0)}ms, pages: ${pdf.numPages}`)

  const lines: PdfLine[] = []

  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
    const pageStart = performance.now()
    console.log(`[v0] extractLines: Processing page ${pageNumber}/${pdf.numPages}...`)

    const page = await pdf.getPage(pageNumber)
    const content = await page.getTextContent()
    console.log(`[v0] extractLines: Page ${pageNumber} text content extracted in ${(performance.now() - pageStart).toFixed(0)}ms, items: ${content.items.length}`)

    // Group text items by their Y coordinate so we can rebuild visual lines.
    type Item = { text: string; x: number; y: number; font: string; size: number }
    const items: Item[] = content.items
      .map((raw) => {
        // pdfjs TextItem has str and transform[6] (x), transform[5] (y)
        const anyItem = raw as {
          str?: string
          transform?: number[]
          fontName?: string
          height?: number
        }
        if (!anyItem.str) return null
        const transform = anyItem.transform ?? [1, 0, 0, 1, 0, 0]
        return {
          text: anyItem.str,
          x: transform[4],
          y: Math.round(transform[5]),
          font: anyItem.fontName ?? "",
          size: anyItem.height ?? 12,
        } satisfies Item
      })
      .filter((i): i is Item => Boolean(i))

    const buckets = new Map<number, Item[]>()
    for (const item of items) {
      // Tolerate tiny Y offsets by snapping to nearest integer.
      const key = item.y
      const existing = buckets.get(key)
      if (existing) existing.push(item)
      else buckets.set(key, [item])
    }

    const sortedKeys = Array.from(buckets.keys()).sort((a, b) => b - a)
    for (const key of sortedKeys) {
      const rowItems = buckets.get(key)!.sort((a, b) => a.x - b.x)
      if (rowItems.length === 0) continue
      const text = rowItems.map((i) => i.text).join("")
      if (!text.trim()) continue
      // A row is code if majority of characters come from monospace fonts.
      let monoChars = 0
      let totalChars = 0
      for (const item of rowItems) {
        totalChars += item.text.length
        if (isMonoFont(item.font)) monoChars += item.text.length
      }
      const isMono = totalChars > 0 && monoChars / totalChars > 0.5
      lines.push({
        text: stripMarkers(text),
        y: key,
        page: pageNumber,
        isMono,
        fontSize: rowItems[0].size,
      })
    }

    // Blank spacer line between pages so paragraphs don't fuse.
    lines.push({ text: "", y: -1, page: pageNumber, isMono: false, fontSize: 0 })
    console.log(`[v0] extractLines: Page ${pageNumber} complete, lines so far: ${lines.length}`)
  }

  console.log(`[v0] extractLines: COMPLETE - Total time: ${(performance.now() - totalStart).toFixed(0)}ms, total lines: ${lines.length}`)
  return lines
}

function extractClassName(code: string): string | undefined {
  const m = code.match(/public\s+class\s+([A-Za-z_][A-Za-z0-9_]*)/)
  if (m) return m[1]
  const m2 = code.match(/class\s+([A-Za-z_][A-Za-z0-9_]*)/)
  if (m2) return m2[1]
  const m3 = code.match(/interface\s+([A-Za-z_][A-Za-z0-9_]*)/)
  return m3?.[1]
}

function buildMetadata(text: string, fileName: string): NotebookMetadata {
  const meta: NotebookMetadata = {
    sourceFileName: fileName,
    detectedPatterns: {
      hasInheritance: /\bextends\s+[A-Z]/.test(text),
      hasStatic: /\bstatic\b/.test(text),
      hasInterface: /\binterface\s+[A-Z]|\bimplements\s+[A-Z]/.test(text),
      hasOverride: /@Override|\boverride\b/i.test(text),
      hasArrayComparison: /==\s*[A-Za-z_]\w*\s*\[\]|Arrays\.equals/.test(text),
    },
  }
  const student = text.match(STUDENT_INFO)
  if (student) {
    meta.studentName = student[1]
    meta.studentId = student[2]
  }
  // Title: first non-numeric, reasonably long line from top of document.
  const firstLines = text.split("\n").slice(0, 20)
  const title = firstLines.find(
    (l) => l.trim().length > 6 && !/^\d/.test(l) && !STUDENT_INFO.test(l),
  )
  if (title) meta.title = title.trim()
  return meta
}

function cellsFromLines(lines: PdfLine[]): NotebookCell[] {
  const cells: NotebookCell[] = []
  let mdBuffer: string[] = []
  let codeBuffer: string[] = []
  let lastHeading: { level: number; text: string; number?: string } | undefined
  let cellCounter = 0

  const flushMarkdown = () => {
    const content = mdBuffer.join("\n").trim()
    mdBuffer = []
    if (!content) return
    cells.push({
      id: `md-${cellCounter++}`,
      kind: "markdown",
      content,
      heading: lastHeading,
    })
    lastHeading = undefined
  }

  const flushCode = () => {
    const rawCode = codeBuffer.join("\n").replace(/\s+$/g, "")
    codeBuffer = []
    if (!rawCode.trim()) return

    // Preserve extracted structure (including method-only snippets)
    // and only normalize indentation.
    const finalCode = autoIndentCode(rawCode)

    cells.push({
      id: `code-${cellCounter++}`,
      kind: "code",
      language: "java",
      code: finalCode,
      className: extractClassName(finalCode),
    })
  }

  for (const line of lines) {
    const raw = line.text
    const trimmed = raw.trim()

    // Numbered heading becomes a new markdown section (and ends code blocks).
    const heading = trimmed.match(NUMBERED_HEADING)
    if (heading && !line.isMono) {
      flushCode()
      flushMarkdown()
      lastHeading = {
        level: Math.min(6, heading[1].split(".").length + 1),
        text: heading[2].trim(),
        number: heading[1],
      }
      mdBuffer.push(`${"#".repeat(lastHeading.level)} ${heading[1]}. ${heading[2].trim()}`)
      continue
    }

    const inCodeBlock = codeBuffer.length > 0
    const codeLike = line.isMono || looksLikeCode(raw, inCodeBlock)
    if (codeLike) {
      if (mdBuffer.length > 0) flushMarkdown()
      codeBuffer.push(raw)
      continue
    }

    if (codeBuffer.length > 0) {
      // A short blank line inside code is ok, but a real prose line ends it.
      if (trimmed.length > 0) {
        flushCode()
      } else {
        codeBuffer.push(raw)
        continue
      }
    }

    if (trimmed.length === 0) {
      if (mdBuffer.length > 0) mdBuffer.push("")
    } else {
      mdBuffer.push(raw)
    }
  }
  flushCode()
  flushMarkdown()

  // Collapse excessive blank lines inside each markdown cell.
  return cells.map((c) =>
    c.kind === "markdown"
      ? { ...c, content: c.content.replace(/\n{3,}/g, "\n\n").trim() }
      : c,
  )
}

export async function parsePdfToNotebook(file: File): Promise<Notebook> {
  console.log(`[v0] parsePdfToNotebook: === STARTING PDF PARSE === File: "${file.name}"`)
  const totalStart = performance.now()

  console.log("[v0] parsePdfToNotebook: Step 1 - Extracting lines...")
  const extractStart = performance.now()
  const lines = await extractLines(file)
  console.log(`[v0] parsePdfToNotebook: Step 1 complete in ${(performance.now() - extractStart).toFixed(0)}ms`)

  console.log("[v0] parsePdfToNotebook: Step 2 - Building raw text...")
  const textStart = performance.now()
  const rawText = lines.map((l) => l.text).join("\n")
  console.log(`[v0] parsePdfToNotebook: Step 2 complete in ${(performance.now() - textStart).toFixed(0)}ms, text length: ${rawText.length} chars`)

  console.log("[v0] parsePdfToNotebook: Step 3 - Building metadata...")
  const metaStart = performance.now()
  const metadata = buildMetadata(rawText, file.name)
  console.log(`[v0] parsePdfToNotebook: Step 3 complete in ${(performance.now() - metaStart).toFixed(0)}ms`)
  console.log("[v0] parsePdfToNotebook: Metadata:", JSON.stringify(metadata, null, 2))

  console.log("[v0] parsePdfToNotebook: Step 4 - Converting lines to cells...")
  const cellsStart = performance.now()
  const cells = cellsFromLines(lines)
  console.log(`[v0] parsePdfToNotebook: Step 4 complete in ${(performance.now() - cellsStart).toFixed(0)}ms, cells created: ${cells.length}`)

  console.log(`[v0] parsePdfToNotebook: === PARSE COMPLETE === Total time: ${(performance.now() - totalStart).toFixed(0)}ms`)
  console.log(`[v0] parsePdfToNotebook: Cell breakdown - markdown: ${cells.filter(c => c.kind === 'markdown').length}, code: ${cells.filter(c => c.kind === 'code').length}`)

  return { metadata, cells }
}

export function createDemoNotebook(): Notebook {
  const cells: NotebookCell[] = [
    {
      id: "md-0",
      kind: "markdown",
      heading: { level: 2, text: "Debugging", number: "1" },
      content: `## 1. Debugging

Below is a small program that demonstrates the effect of the \`static\` keyword on class variables.
Fix the code so that each \`Student\` keeps its own \`favoriteFlavor\` value instead of all
objects sharing the last assigned value.

We can also compute the Euclidean distance between two points:

$$d = \\sqrt{(x_1 - x_2)^2 + (y_1 - y_2)^2}$$`,
    },
    {
      id: "code-1",
      kind: "code",
      language: "java",
      className: "Debug1",
      code: `public class Debug1 {
	static String favoriteFlavor;

	public static void main(String[] args) {
		Debug1 a = new Debug1();
		a.favoriteFlavor = "Chocolate";

		Debug1 b = new Debug1();
		b.favoriteFlavor = "Vanilla";

		System.out.println("a: " + a.favoriteFlavor);
		System.out.println("b: " + b.favoriteFlavor);
	}
}
`,
    },
    {
      id: "md-2",
      kind: "markdown",
      heading: { level: 2, text: "Class Creation", number: "2" },
      content: `## 2. Class Creation

Create a \`Student\` class and an \`EdmondsCollegeStudent\` subclass. Override
\`finishClass()\` so it increases GPA by **0.5** instead of **0.1**.`,
    },
    {
      id: "code-3",
      kind: "code",
      language: "java",
      className: "StudentDemo",
      code: `class Student {
	String name;
	double gpa = 3.0;

	public Student(String name) { this.name = name; }

	public void finishClass() { gpa += 0.1; }
}

class EdmondsCollegeStudent extends Student {
	public EdmondsCollegeStudent(String name) { super(name); }

	@Override
	public void finishClass() { gpa += 0.5; }
}

public class StudentDemo {
	public static void main(String[] args) {
		Student s = new Student("Alex");
		EdmondsCollegeStudent e = new EdmondsCollegeStudent("Louis");

		s.finishClass();
		e.finishClass();

		System.out.println(s.name + " GPA: " + s.gpa);
		System.out.println(e.name + " GPA: " + e.gpa);
	}
}
`,
    },
    {
      id: "md-4",
      kind: "markdown",
      heading: { level: 2, text: "Interfaces", number: "3" },
      content: `## 3. Interface Implementation

Demonstrate the "is-a" relationship by having \`Car\` implement a \`Vehicle\` interface.`,
    },
    {
      id: "code-5",
      kind: "code",
      language: "java",
      className: "VehicleDemo",
      code: `interface Vehicle {
	void start();
}

class Car implements Vehicle {
	public void start() {
		System.out.println("Car engine started");
	}
}

public class VehicleDemo {
	public static void main(String[] args) {
		Vehicle v = new Car();
		v.start();
		System.out.println("Is Car a Vehicle? " + (v instanceof Vehicle));
	}
}
`,
    },
  ]

  return {
    metadata: {
      title: "Java Notebook - @BySandries",
      studentName: "Luis Sandries",
      studentId: "XXXXXXXXX",
      detectedPatterns: {
        hasInheritance: true,
        hasStatic: true,
        hasInterface: true,
        hasOverride: true,
        hasArrayComparison: false,
      },
    },
    cells,
  }
}

export function createBlankNotebook(): Notebook {
  return {
    metadata: {
      title: "New Blank Notebook",
      sourceFileName: "blank",
      detectedPatterns: {
        hasInheritance: false,
        hasStatic: false,
        hasInterface: false,
        hasOverride: false,
        hasArrayComparison: false,
      },
    },
    cells: [],
  }
}
