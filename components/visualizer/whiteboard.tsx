"use client"

import { useEffect } from "react"
import Script from "next/script"

export function Whiteboard({ active }: { active: boolean }) {
  useEffect(() => {
    // When active, ensure the css is loaded
    if (active) {
      const link = document.createElement("link")
      link.rel = "stylesheet"
      link.href = "/extension/styles.css"
      link.id = "csbs-extension-css"
      if (!document.getElementById("csbs-extension-css")) {
        document.head.appendChild(link)
      }
    }
  }, [active])

  return (
    <div style={{ display: active ? 'flex' : 'none', flex: 1, minHeight: 0, position: 'relative', width: '100%', height: '100%', background: 'var(--card)', color: 'var(--foreground)' }}>
      {/* 
        The extension's content.js MutationObserver waits for #solutionarea.
        When it appears, it inserts the drawing panel wrapper BEFORE #solutionarea.
      */}
      {active && (
        <div id="solutionarea-container" style={{ display: 'flex', flex: 1, flexDirection: 'column', width: '100%', height: '100%' }}>
          <div id="solutionarea" style={{ display: 'none' }}></div>
        </div>
      )}
      <Script src="/extension/content.js" strategy="lazyOnload" />
    </div>
  )
}
