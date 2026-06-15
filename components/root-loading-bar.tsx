"use client"

import { useCheerpJ } from "@/components/cheerpj-provider"
import { LoadingBar } from "@/components/ui/loading-bar"

export function RootLoadingBar() {
  const { status, progress } = useCheerpJ()
  // Show during idle (script downloading) AND loading (initializing)
  const isLoading = status === "idle" || status === "loading"
  // During idle phase, show a small initial progress so the bar is visible
  const displayProgress = status === "idle" ? 5 : progress
  return <LoadingBar progress={displayProgress} isLoading={isLoading} />
}
