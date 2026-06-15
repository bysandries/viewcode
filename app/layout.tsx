import type { Metadata } from "next"
import { Geist, Geist_Mono } from "next/font/google"
import { Analytics } from "@vercel/analytics/next"

import { ThemeProvider } from "@/components/theme-provider"
import { CheerpJProvider } from "@/components/cheerpj-provider"
import { RootLoadingBar } from "@/components/root-loading-bar"
import { ServiceWorkerRegister } from "@/components/service-worker-register"

import "katex/dist/katex.min.css"
import "./globals.css"

const geistSans = Geist({
  subsets: ["latin"],
  variable: "--font-geist-sans",
})

const geistMono = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-geist-mono",
})

export const metadata: Metadata = {
  title: "Java Notebooks - @BySandries",
  description:
    "Upload a CS lab PDF and get an interactive Jupyter-style notebook that compiles and runs Java in your browser via CheerpJ.",
  generator: "v0.app",
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} bg-background`}
      suppressHydrationWarning
    >
      <body className="font-sans antialiased">
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          <CheerpJProvider>
            <RootLoadingBar />
            {children}
          </CheerpJProvider>
          <ServiceWorkerRegister />
        </ThemeProvider>
        {process.env.NODE_ENV === "production" && <Analytics />}
      </body>
    </html>
  )
}
