"use client";

type PdfTextItem = { str?: string; hasEOL?: boolean };

export async function extractPdfText(file: File): Promise<string> {
  const pdfjsLib = await import("pdfjs-dist");
  pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
    "pdfjs-dist/build/pdf.worker.min.mjs",
    import.meta.url,
  ).toString();

  const buffer = await file.arrayBuffer();
  const doc = await pdfjsLib.getDocument({ data: buffer }).promise;

  const pages: string[] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const textContent = await page.getTextContent();
    const pageText = (textContent.items as PdfTextItem[])
      .map((item) => {
        if (typeof item.str !== "string") return "";
        return item.hasEOL ? `${item.str}\n` : `${item.str} `;
      })
      .join("")
      .replace(/[ \t]+\n/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
    if (pageText) pages.push(pageText);
  }

  await doc.cleanup();
  await doc.destroy();

  return pages.join("\n\n").trim();
}

export function isPdfFile(file: File): boolean {
  if (file.type === "application/pdf") return true;
  return /\.pdf$/i.test(file.name);
}
