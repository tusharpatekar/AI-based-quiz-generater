import * as pdfjsLib from "https://cdn.jsdelivr.net/npm/pdfjs-dist@4.4.168/build/pdf.min.mjs";
import Tesseract from "https://cdn.jsdelivr.net/npm/tesseract.js@5.0.5/dist/tesseract.esm.min.js";

pdfjsLib.GlobalWorkerOptions.workerSrc =
  "https://cdn.jsdelivr.net/npm/pdfjs-dist@4.4.168/build/pdf.worker.min.mjs";

/**
 * Try to extract text directly from PDF.
 * If empty, fallback to OCR using Tesseract.
 */
export async function extractTextFromPdfFile(file) {
  try {
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

    let text = "";
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      const pageText = content.items.map(it => it.str).join(" ");
      text += "\n" + pageText;
    }

    if (text.trim().length > 20) {
      console.log("✅ Extracted text directly from PDF");
      return text;
    }

    console.warn("⚠️ PDF extraction empty, running OCR fallback…");
    return await ocrPdf(pdf);
  } catch (e) {
    console.error("PDF extraction error:", e);
    throw e;
  }
}

/**
 * Render pages to canvas & OCR them with Tesseract
 */
async function ocrPdf(pdf) {
  let text = "";
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const viewport = page.getViewport({ scale: 2 });
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    canvas.width = viewport.width;
    canvas.height = viewport.height;

    await page.render({ canvasContext: ctx, viewport }).promise;

    const { data: { text: ocrText } } = await Tesseract.recognize(canvas.toDataURL("image/png"), "eng+mar", {
      logger: m => console.log(`OCR p${i}:`, m.status, m.progress)
    });
    text += "\n" + ocrText;
  }
  return text;
}

/**
 * Split text into smaller chunks for Gemini
 */
export function chunkText(txt, size = 1200) {
  const words = txt.split(/\s+/);
  let out = [], chunk = [];
  let count = 0;
  for (const w of words) {
    chunk.push(w);
    count += w.length + 1;
    if (count > size) {
      out.push(chunk.join(" "));
      chunk = []; count = 0;
    }
  }
  if (chunk.length) out.push(chunk.join(" "));
  return out;
}
