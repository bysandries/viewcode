"use client"
import * as React from "react"
import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"
import remarkMath from "remark-math"
import rehypeKatex from "rehype-katex"
import Prism from "prismjs"
import "prismjs/components/prism-java"
import {
  Check,
  Copy,
  Pencil,
  Bold,
  Italic,
  Heading1,
  Heading2,
  Link2,
  Quote,
  List,
  Code,
  Table,
  Sigma,
  Save,
  X,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

import type { MarkdownCell } from "@/types/notebook"

interface MarkdownCellProps {
  cell: MarkdownCell
  onChange: (content: string) => void
}

export function MarkdownCellView({ cell, onChange }: MarkdownCellProps) {
  const [editing, setEditing] = React.useState(false)
  const [draft, setDraft] = React.useState(cell.content)
  const textareaRef = React.useRef<HTMLTextAreaElement>(null)

  React.useEffect(() => {
    setDraft(cell.content)
  }, [cell.content])

  React.useEffect(() => {
    if (editing) {
      textareaRef.current?.focus()
    }
  }, [editing])

  const wrapSelection = React.useCallback(
    (prefix: string, suffix: string, fallback: string) => {
      const el = textareaRef.current
      if (!el) return
      const start = el.selectionStart
      const end = el.selectionEnd
      const selected = draft.slice(start, end)
      const next = `${draft.slice(0, start)}${prefix}${selected || fallback}${suffix}${draft.slice(end)}`
      setDraft(next)
      requestAnimationFrame(() => {
        el.focus()
        const caret = start + prefix.length + (selected || fallback).length + suffix.length
        el.setSelectionRange(caret, caret)
      })
    },
    [draft],
  )

  const prefixLines = React.useCallback(
    (prefix: string) => {
      const el = textareaRef.current
      if (!el) return
      const start = el.selectionStart
      const end = el.selectionEnd
      const selected = draft.slice(start, end)
      const source = selected || "item"
      const transformed = source
        .split("\n")
        .map((line) => (line.trim() ? `${prefix}${line}` : line))
        .join("\n")
      const next = `${draft.slice(0, start)}${transformed}${draft.slice(end)}`
      setDraft(next)
      requestAnimationFrame(() => {
        el.focus()
        const caret = start + transformed.length
        el.setSelectionRange(caret, caret)
      })
    },
    [draft],
  )

  const insertSnippet = React.useCallback(
    (snippet: string) => {
      const el = textareaRef.current
      if (!el) return
      const start = el.selectionStart
      const end = el.selectionEnd
      const next = `${draft.slice(0, start)}${snippet}${draft.slice(end)}`
      setDraft(next)
      requestAnimationFrame(() => {
        el.focus()
        const caret = start + snippet.length
        el.setSelectionRange(caret, caret)
      })
    },
    [draft],
  )

  const handleSave = React.useCallback(() => {
    onChange(draft)
    setEditing(false)
  }, [draft, onChange])

  const handleCancel = React.useCallback(() => {
    setDraft(cell.content)
    setEditing(false)
  }, [cell.content])

  if (editing) {
    return (
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-1 rounded-md border border-border bg-muted/30 p-2">
          <Button type="button" size="sm" variant="ghost" onClick={() => prefixLines("# ")}>
            <Heading1 className="size-4" />
          </Button>
          <Button type="button" size="sm" variant="ghost" onClick={() => prefixLines("## ")}>
            <Heading2 className="size-4" />
          </Button>
          <Button type="button" size="sm" variant="ghost" onClick={() => wrapSelection("**", "**", "bold") }>
            <Bold className="size-4" />
          </Button>
          <Button type="button" size="sm" variant="ghost" onClick={() => wrapSelection("*", "*", "italic") }>
            <Italic className="size-4" />
          </Button>
          <Button type="button" size="sm" variant="ghost" onClick={() => wrapSelection("[", "](https://example.com)", "link text") }>
            <Link2 className="size-4" />
          </Button>
          <Button type="button" size="sm" variant="ghost" onClick={() => prefixLines("> ")}>
            <Quote className="size-4" />
          </Button>
          <Button type="button" size="sm" variant="ghost" onClick={() => prefixLines("- ")}>
            <List className="size-4" />
          </Button>
          <Button type="button" size="sm" variant="ghost" onClick={() => wrapSelection("`", "`", "code") }>
            <Code className="size-4" />
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => insertSnippet("\n\n| Column 1 | Column 2 |\n| --- | --- |\n| Value A | Value B |\n")}
          >
            <Table className="size-4" />
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => insertSnippet("\n\n$$\\nE = mc^2\\n$$\n")}
          >
            <Sigma className="size-4" />
          </Button>
        </div>

        <textarea
          ref={textareaRef}
          className="min-h-56 w-full resize-y rounded-md border border-border bg-background px-3 py-2 font-mono text-sm outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          aria-label="Markdown editor"
          placeholder="Write markdown content..."
        />

        <div className="flex items-center justify-end gap-2">
          <Button type="button" size="sm" variant="ghost" onClick={handleCancel}>
            <X className="size-4" />
            Cancel
          </Button>
          <Button type="button" size="sm" onClick={handleSave}>
            <Save className="size-4" />
            Save
          </Button>
        </div>
      </div>
    )
  }

  return (
    <article className="group markdown-cell relative text-sm leading-relaxed text-foreground">
      <Button
        type="button"
        size="icon"
        variant="ghost"
        className="no-print absolute top-1 right-1 z-10 h-8 w-8 opacity-0 transition-opacity group-hover:opacity-100"
        onClick={() => setEditing(true)}
        aria-label="Edit markdown"
      >
        <Pencil className="size-4" />
      </Button>

      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[rehypeKatex]}
        components={{
          pre: ({ children }) => <>{children}</>,
          code: ({ className, children, ...rest }) => {
            const isBlock = className?.includes("language-")
            if (isBlock) {
              return (
                <CodeBlock className={className} {...rest}>
                  {children}
                </CodeBlock>
              )
            }
            return (
              <code
                className="rounded bg-muted px-1 py-0.5 font-mono text-[0.85em] text-foreground"
                {...rest}
              >
                {children}
              </code>
            )
          },
          h1: (props) => (
            <h1
              {...props}
              className="mt-6 mb-3 text-2xl font-semibold tracking-tight text-balance"
            />
          ),
          h2: (props) => (
            <h2
              {...props}
              className="mt-6 mb-3 text-xl font-semibold tracking-tight text-balance"
            />
          ),
          h3: (props) => (
            <h3
              {...props}
              className="mt-4 mb-2 text-lg font-semibold tracking-tight"
            />
          ),
          h4: (props) => (
            <h4 {...props} className="mt-4 mb-2 text-base font-semibold" />
          ),
          p: (props) => <p {...props} className="my-3 leading-relaxed text-pretty" />,
          ul: (props) => (
            <ul {...props} className="my-3 list-disc space-y-1 pl-6" />
          ),
          ol: (props) => (
            <ol {...props} className="my-3 list-decimal space-y-1 pl-6" />
          ),
          strong: (props) => (
            <strong {...props} className="font-semibold text-foreground" />
          ),
          em: (props) => <em {...props} className="italic" />,
          a: (props) => (
            <a
              {...props}
              className="text-foreground underline underline-offset-4 hover:text-primary"
              target="_blank"
              rel="noreferrer"
            />
          ),
          blockquote: (props) => (
            <blockquote
              {...props}
              className="my-4 border-l-2 border-border pl-4 italic text-muted-foreground"
            />
          ),
          hr: () => <hr className="my-6 border-border" />,

          table: (props) => (
            <div className="my-4 overflow-x-auto">
              <table
                {...props}
                className="w-full border-collapse text-sm"
              />
            </div>
          ),
          th: (props) => (
            <th
              {...props}
              className="border-b border-border px-3 py-2 text-left font-semibold"
            />
          ),
          td: (props) => (
            <td {...props} className="border-b border-border px-3 py-2" />
          ),
        }}
      >
        {cell.content}
      </ReactMarkdown>
    </article>
  )
}

function CodeBlock({
  children,
  className,
  ...props
}: {
  children: React.ReactNode
  className?: string
}) {
  const [copied, setCopied] = React.useState(false)

  const rawText = React.useMemo(() => {
    if (typeof children === "string") return children
    return React.Children.toArray(children)
      .map((child) => {
        if (typeof child === "string" || typeof child === "number") return String(child)
        return ""
      })
      .join("")
  }, [children])

  const language = React.useMemo(() => {
    const match = className?.match(/language-([\w-]+)/)
    return match?.[1]?.toLowerCase()
  }, [className])

  const highlighted = React.useMemo(() => {
    if (!language) return null
    const grammar = Prism.languages[language]
    if (!grammar) return null
    return Prism.highlight(rawText, grammar, language)
  }, [language, rawText])

  const handleCopy = async () => {
    await navigator.clipboard.writeText(rawText)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="relative group my-4">
      <pre
        className={cn(
          "code-print-block overflow-x-auto rounded-md bg-muted p-3 font-mono text-xs",
          className,
        )}
      >
        {highlighted ? (
          <code className={className} {...props} dangerouslySetInnerHTML={{ __html: highlighted }} />
        ) : (
          <code className={className} {...props}>
            {children}
          </code>
        )}
      </pre>
      <Button
        size="icon"
        variant="ghost"
        className="no-print absolute right-2 top-2 h-8 w-8 opacity-0 transition-opacity group-hover:opacity-100"
        onClick={handleCopy}
        aria-label="Copy code block"
      >
        {copied ? (
          <Check className="size-3.5 text-green-500" />
        ) : (
          <Copy className="size-3.5" />
        )}
      </Button>
    </div>
  )
}
