import { NextResponse } from "next/server"

const ECJ_URL = "https://repo1.maven.org/maven2/org/eclipse/jdt/ecj/3.21.0/ecj-3.21.0.jar"

// Cache the JAR in memory once downloaded
let cachedJar3210: ArrayBuffer | null = null

export async function GET() {
  try {
    // Return cached if available
    if (cachedJar3210) {
      console.log("[v0] ECJ proxy: Returning cached JAR")
      return new NextResponse(cachedJar3210, {
        headers: {
          "Content-Type": "application/java-archive",
          "Cache-Control": "public, max-age=31536000, immutable",
        },
      })
    }

    console.log("[v0] ECJ proxy: Downloading from Maven Central...")
    const response = await fetch(ECJ_URL)
    
    if (!response.ok) {
      throw new Error(`Failed to fetch ECJ: ${response.status}`)
    }

    cachedJar3210 = await response.arrayBuffer()
    console.log(`[v0] ECJ proxy: Downloaded ${(cachedJar3210.byteLength / 1024 / 1024).toFixed(2)} MB`)

    return new NextResponse(cachedJar3210, {
      headers: {
        "Content-Type": "application/java-archive",
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    })
  } catch (error) {
    console.error("[v0] ECJ proxy error:", error)
    return NextResponse.json(
      { error: "Failed to fetch ECJ" },
      { status: 500 }
    )
  }
}
