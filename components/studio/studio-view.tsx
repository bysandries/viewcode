"use client"

import * as React from "react"

import {
  ResizablePanelGroup,
  ResizablePanel,
  ResizableHandle,
} from "@/components/ui/resizable"
import { NotebookView } from "@/components/notebook/notebook-view"
import { JavaView } from "@/components/visualizer/java-view"
import { buildProgram, ProgramAssemblyError } from "@/lib/cheerpj"
import { useNotebook } from "./notebook-provider"

/**
 * The single-screen studio: notebook on the left, visualizer/whiteboard on the
 * right. Clicking Visualize on a cell sets `vizTargetId`; we assemble the whole
 * notebook into one program (that cell as entry, the rest on the classpath) and
 * hand it to the visualizer.
 */
export function StudioView() {
  const { cells, roleOverrides, vizTargetId, setVizActiveLine } = useNotebook()

  const assembled = React.useMemo(() => {
    if (!vizTargetId) {
      return { entryCode: undefined, extraSources: undefined, error: null as string | null }
    }
    try {
      const { entryCode, extraSources } = buildProgram(cells, vizTargetId, roleOverrides)
      return { entryCode, extraSources, error: null as string | null }
    } catch (e) {
      const error =
        e instanceof ProgramAssemblyError
          ? e.message
          : e instanceof Error
            ? e.message
            : String(e)
      return { entryCode: undefined, extraSources: undefined, error }
    }
  }, [cells, roleOverrides, vizTargetId])

  return (
    <ResizablePanelGroup direction="horizontal" className="h-full">
      <ResizablePanel defaultSize={50} minSize={28}>
        <div className="h-full overflow-y-auto bg-background px-4 py-6">
          <div className="mx-auto max-w-3xl">
            <NotebookView />
          </div>
        </div>
      </ResizablePanel>
      <ResizableHandle withHandle />
      <ResizablePanel defaultSize={50} minSize={25}>
        {/* viz-root scopes the visualizer's dark palette; override its 100vh so it
            fills the panel (which sits below the app header) instead of overflowing. */}
        <div className="viz-root" style={{ height: "100%" }}>
          <JavaView
            active
            programCode={assembled.entryCode}
            extraSources={assembled.extraSources}
            programError={assembled.error}
            onActiveLineChange={setVizActiveLine}
          />
        </div>
      </ResizablePanel>
    </ResizablePanelGroup>
  )
}
