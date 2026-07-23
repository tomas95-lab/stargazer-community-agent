import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url"

export interface BrowserGuidelinesExtraction {
  text: string
  pages: number
  characters: number
  tables: number
  chunks: number
  warnings: string[]
}

type PageText = { num: number; text: string }
type PageTables = { num: number; tables: string[][][] }

function normalizeText(value: string): string {
  return value
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
}

function tableToMarkdown(rows: string[][]): string {
  const cleaned = rows
    .map((row) => row.map((cell) => normalizeText(cell || "").replace(/\n+/g, " ").replace(/\|/g, "\\|")))
    .filter((row) => row.some(Boolean))
  if (!cleaned.length) return ""

  const columns = Math.max(...cleaned.map((row) => row.length))
  const normalized = cleaned.map((row) => Array.from({ length: columns }, (_, index) => row[index] || ""))
  const header = normalized[0].map((cell, index) => cell || `Column ${index + 1}`)
  return [header, header.map(() => "---"), ...normalized.slice(1)]
    .map((row) => `| ${row.join(" | ")} |`)
    .join("\n")
}

function structuredText(pages: PageText[], tablePages: PageTables[]): { text: string; tables: number } {
  const tablesByPage = new Map(tablePages.map((page) => [page.num, page.tables]))
  let tableCount = 0
  const sections = pages.map((page) => {
    const parts = [`## Page ${page.num}`]
    const pageText = normalizeText(page.text)
    if (pageText) parts.push(pageText)
    for (const [index, table] of (tablesByPage.get(page.num) || []).entries()) {
      const markdown = tableToMarkdown(table)
      if (!markdown) continue
      tableCount += 1
      parts.push(`### Table ${index + 1}`, markdown)
    }
    return parts.join("\n\n")
  })
  return { text: sections.join("\n\n").trim(), tables: tableCount }
}

export async function extractGuidelinesPdf(file: File): Promise<BrowserGuidelinesExtraction> {
  const { PDFParse } = await import("pdf-parse")
  PDFParse.setWorker(workerUrl)

  const parser = new PDFParse({ data: new Uint8Array(await file.arrayBuffer()) })
  try {
    const result = await parser.getText({ lineEnforce: true, pageJoiner: "\n\n" })
    const warnings: string[] = []
    let tablePages: PageTables[] = []
    try {
      const tableResult = await parser.getTable()
      tablePages = tableResult.pages as PageTables[]
    } catch {
      warnings.push("Tables could not be detected, but page text was extracted.")
    }

    const structured = structuredText(result.pages as PageText[], tablePages)
    if (!structured.text) {
      throw new Error("No selectable text was found. This looks like a scanned PDF. Run OCR or paste the guideline text below.")
    }

    const chunks = structured.text
      .split(/\n{2,}(?=## Page |\b[A-Z][^\n]{2,80}\n)/)
      .filter((section) => section.trim().length > 0)
      .length

    return {
      text: structured.text,
      pages: result.total,
      characters: structured.text.length,
      tables: structured.tables,
      chunks: Math.max(1, chunks),
      warnings,
    }
  } finally {
    await parser.destroy().catch(() => undefined)
  }
}
