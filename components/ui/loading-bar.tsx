"use client"

import * as React from "react"
import { cn } from "@/lib/utils"

interface LoadingBarProps {
  progress: number // 0 to 100
  isLoading: boolean
  className?: string
}

export function LoadingBar({ progress, isLoading, className }: LoadingBarProps) {
  const [mounted, setMounted] = React.useState(false)
  const [visible, setVisible] = React.useState(false)

  React.useEffect(() => {
    setMounted(true)
  }, [])

  // Delay hiding so the user sees the bar reach 100% before fading out
  React.useEffect(() => {
    if (isLoading) {
      setVisible(true)
    } else {
      const timer = setTimeout(() => setVisible(false), 800)
      return () => clearTimeout(timer)
    }
  }, [isLoading])

  if (!mounted) return null

  return (
    <div
      className={cn(
        "fixed left-0 top-0 z-[100] h-1 w-full transition-opacity duration-700",
        visible ? "opacity-100" : "opacity-0 pointer-events-none",
        className
      )}
      style={{ backgroundColor: "rgba(0,0,0,0.08)" }}
    >
      <div
        className="h-full transition-all duration-500 ease-out"
        style={{
          width: `${Math.max(progress, isLoading ? 3 : 0)}%`,
          background: "linear-gradient(90deg, #22c55e, #16a34a)",
          boxShadow: "0 0 12px rgba(34, 197, 94, 0.6)",
        }}
      />
    </div>
  )
}
