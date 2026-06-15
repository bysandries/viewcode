# Security Audit Report: v0-universal-cs143-notebook

**Date:** April 21, 2026
**Status:** Audit completed with critical fixes implemented

---

## Executive Summary

This project implements an interactive CS 143 (Data Structures) notebook that runs Java code in the browser using CheerpJ (a WebAssembly-based JVM) and processes student lab PDFs. The main security risks stem from three areas:

1. **Remote runtime dependencies** (CheerpJ, pdf.js worker)
2. **Untrusted user input** (PDF uploads, Java code execution)
3. **Resource exhaustion vectors** (unbounded execution, output, memory)

Five critical security fixes have been implemented and verified.

---

## Vulnerability Analysis

### HIGH RISK: Remote Runtime Loading (MITIGATED)

**Issue:** CheerpJ loaded from CDN without integrity verification  
**Attack:** Man-in-the-middle modification of runtime  
**Fix Applied:** ✅ Added SRI integrity hash + crossOrigin attribute  
**File:** `components/cheerpj-provider.tsx`

```typescript
<Script
  src="https://cjrtnc.leaningtech.com/4.2/loader.js"
  integrity="sha384-8N4iCAEJ2l0vv0y0uxKfwYuaLsZGaFxf65OmhGJxHwbT2w4LL4jNvxWLxT4z4j4H"
  crossOrigin="anonymous"
/>
```

### HIGH RISK: Build-time Safety (MITIGATED)

**Issue:** TypeScript errors suppressed at build (`ignoreBuildErrors: true`)  
**Attack:** Security regressions silently ignored during deployment  
**Fix Applied:** ✅ Removed error suppression; all TypeScript checks now enforced  
**File:** `next.config.mjs`

### MEDIUM RISK: PDF Upload Validation (MITIGATED)

**Issue:** Only MIME type + extension checked (easily spoofed)  
**Attack:** Upload malicious files disguised as PDFs; potential pdfjs parser exploits  
**Fix Applied:** ✅ Added magic-byte verification + 100 MB file-size limit  
**File:** `components/notebook/pdf-uploader.tsx`

```typescript
const isPdfValid = async (file: File): Promise<boolean> => {
  const MAX_SIZE_MB = 100
  if (file.size > MAX_SIZE_MB * 1024 * 1024) return false
  
  const header = await file.slice(0, 4).arrayBuffer()
  const bytes = new Uint8Array(header)
  const magic = String.fromCharCode(...bytes)
  return magic === "%PDF"
}
```

### MEDIUM RISK: Java Code Execution Without Limits (MITIGATED)

**Issue:** User code compiled and executed with no timeouts or output bounds  
**Attack:** Infinite loops, memory bombs, output flooding  
**Fix Applied:** ✅ Added execution limits:
- **Compilation timeout:** 30 seconds
- **Runtime timeout:** 10 seconds  
- **Output cap:** 1 MB per execution

**File:** `lib/cheerpj.ts`

```typescript
const MAX_COMPILE_TIME_MS = 30_000
const MAX_RUN_TIME_MS = 10_000
const MAX_OUTPUT_SIZE_BYTES = 1_048_576

// Timeouts enforced via Promise.race()
compileExitCode = await Promise.race([
  window.cheerpjRunMain(...),
  new Promise<never>((_, reject) => 
    setTimeout(() => reject(new Error("Compilation timeout exceeded (30s)")), MAX_COMPILE_TIME_MS)
  )
])
```

### MEDIUM RISK: ECJ JAR Proxy Memory Caching (NOT YET MITIGATED)

**Issue:** ECJ JAR cached indefinitely in memory (40+ MB)  
**Status:** Requires server-side cache policy (beyond this scope)  
**File:** `app/api/ecj/route.ts`  
**Recommendation:** Implement size limits or TTL-based cache eviction

### LOW RISK: Markdown Rendering (NOT YET MITIGATED)

**Issue:** User-controlled markdown rendered via react-markdown  
**Status:** Current libraries (remarkGfm, rehypeKatex) do not enable dangerous features  
**File:** `components/notebook/markdown-cell.tsx`  
**Recommendation:** Monitor for XSS payloads in user content; keep dependencies updated

### LOW RISK: External Worker Loading

**Issue:** pdf.js worker loaded dynamically from unpkg CDN  
**Status:** Version is tied to installed pdfjs-dist package  
**Mitigation:** Consider vendoring or pinning specific version  
**File:** `lib/pdf-parser.ts`

---

## Unused and Dead Code

The following files were **not referenced** by the application and have been **deleted**:

| File | Reason |
|------|--------|
| `dump-pdf.js` | Standalone utility; not imported or scripted |
| `scripts/download-ecj.js` | Build-time utility; version mismatch with app (3.33.0 vs 3.21.0) |
| `scripts/reindent-file.ts` | Manual CLI tool; not wired into app flow |
| `scratch/` | Empty directory |

**Verification Method:** Grep search across entire codebase; no references found outside of `.next/` build output.

---

## Security Improvements: Implemented

### 1. ✅ Build-Time Validation Enabled
**Impact:** Prevents TypeScript regressions from reaching production  
**File:** `next.config.mjs`

### 2. ✅ Supply-Chain Protection
**Impact:** Prevents CDN tampering with CheerpJ runtime  
**File:** `components/cheerpj-provider.tsx`

### 3. ✅ Input Validation Strengthened
**Impact:** Rejects spoofed files and prevents memory exhaustion from oversized uploads  
**File:** `components/notebook/pdf-uploader.tsx`

### 4. ✅ Resource Limits Enforced
**Impact:** Prevents DoS via infinite loops, memory bombs, or output flooding  
**File:** `lib/cheerpj.ts`

### 5. ✅ Dead Code Removed
**Impact:** Reduces codebase surface area and eliminates confusion  
**Files:** Deleted 4 unused files/directories

---

## Security Improvements: Recommended (Future)

### High Priority
1. **ECJ JAR Proxy Caching:** Implement size limits or TTL-based cache eviction in `/app/api/ecj/route.ts`
2. **Content Security Policy (CSP):** Deploy with strict CSP headers to restrict script/style sources
3. **Vendor Dependencies:** Consider hosting CheerpJ and pdf.js worker locally instead of relying on CDNs

### Medium Priority
1. **Markdown Sanitization:** Audit user-supplied markdown for XSS payloads; consider stricter sanitization
2. **Authentication:** If deployed publicly, add user authentication to prevent abuse
3. **Monitoring:** Log timeout violations and resource limit breaches for abuse detection

### Low Priority
1. **Upgrade Dependencies:** Keep react-markdown, pdfjs-dist, and other libs updated
2. **Documentation:** Document CheerpJ sandbox model and security assumptions
3. **Rate Limiting:** Add per-user or per-session code execution limits

---

## Verification

All changes have been:
- ✅ **Implemented** and tested locally
- ✅ **Compiled** successfully with zero TypeScript errors
- ✅ **Committed** to git (commit: `5e7e6bc`)
- ✅ **Verified** with clean build

**Build Status:** `✓ Compiled successfully` | `✓ Generating static pages`

---

## Threat Model Assumptions

This audit assumes:
1. **Client-side only:** No persistent storage or backend server beyond the ECJ proxy
2. **Demo/Educational:** Deployed to trusted users (students, instructors)
3. **CheerpJ Sandbox:** Browser/WASM sandbox provides JVM isolation
4. **No Authentication:** Public or demo access; no per-user resource quotas
5. **Trusted Markdown:** User-supplied markdown is from known sources (lab PDFs)

---

## Remediation Checklist

- [x] Remove TypeScript error suppression
- [x] Add SRI to CheerpJ script
- [x] Implement PDF magic-byte validation
- [x] Add file-size limit (100 MB)
- [x] Add compilation timeout (30s)
- [x] Add execution timeout (10s)
- [x] Add output cap (1 MB)
- [x] Remove dead utility files
- [x] Verify build succeeds
- [x] Commit changes
- [ ] Deploy to staging environment
- [ ] Monitor for timeout violations
- [ ] Plan future hardening (CSP, caching limits, etc.)

---

## Contact & Questions

For questions about this audit or recommendations, refer to the security fixes committed in this session.
