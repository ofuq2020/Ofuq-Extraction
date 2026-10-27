import { pdfjsLib } from '../utils/pdfWorker';
import {
  BoundingBox,
  ExtractedCell,
  ExtractedTable,
  FreeTextBlock,
  NativeTextItem,
  PageClassification,
  PageExtraction,
} from '../types';

export interface ExtractionProgressCallback {
  (pageIndex: number, totalPages: number, message: string, percent: number): void;
}

export interface ExtractOptions {
  modelOverride?: string;
  onProgress?: ExtractionProgressCallback;
  signal?: AbortSignal;
  maxConcurrency?: number;
}

/**
 * Stage 1: Extraction Engine.
 * Dual-extraction:
 * 1. Native text layer from PDF.js (ground truth coordinates and characters)
 * 2. Gemini 2x image analysis for grid structures and scanned text
 */
export class PdfExtractor {
  private static async retryWithBackoff<T>(
    fn: () => Promise<T>,
    maxRetries = 3,
    initialDelayMs = 1200,
    signal?: AbortSignal
  ): Promise<T> {
    let attempt = 0;
    let delay = initialDelayMs;

    while (attempt < maxRetries) {
      if (signal?.aborted) {
        throw new DOMException('Extraction aborted by user', 'AbortError');
      }

      try {
        return await fn();
      } catch (err: any) {
        attempt++;
        if (attempt >= maxRetries || signal?.aborted) {
          throw err;
        }
        console.warn(`Extraction attempt ${attempt} failed, retrying in ${delay}ms...`, err);
        await new Promise((res) => setTimeout(res, delay));
        delay *= 2;
      }
    }

    throw new Error('Maximum retries exceeded');
  }

  /**
   * Process a PDF ArrayBuffer page by page with concurrency limit and progress updates.
   */
  public static async extractPdf(
    pdfBuffer: ArrayBuffer,
    options: ExtractOptions = {}
  ): Promise<PageExtraction[]> {
    const { modelOverride, onProgress, signal, maxConcurrency = 3 } = options;

    if (signal?.aborted) {
      throw new DOMException('Extraction aborted by user', 'AbortError');
    }

    onProgress?.(0, 1, 'جاري قراءة ملف PDF وفحص البنية...', 5);

    const loadingTask = pdfjsLib.getDocument({
      data: new Uint8Array(pdfBuffer),
      cMapUrl: 'https://unpkg.com/pdfjs-dist@4.10.38/cmaps/',
      cMapPacked: true,
    });

    if (signal) {
      signal.addEventListener('abort', () => loadingTask.destroy());
    }

    const pdfDoc = await loadingTask.promise;
    const totalPages = pdfDoc.numPages;
    const results: PageExtraction[] = new Array(totalPages);

    onProgress?.(0, totalPages, `تم تحميل ${totalPages} صفحة، بدء الاستخراج المزدوج...`, 10);

    // Concurrency pool (max 3 pages parallel)
    let completedPages = 0;
    const pageIndices = Array.from({ length: totalPages }, (_, i) => i + 1);

    const processPageWorker = async (pageNum: number) => {
      if (signal?.aborted) {
        throw new DOMException('Extraction aborted by user', 'AbortError');
      }

      const page = await pdfDoc.getPage(pageNum);
      const viewport1x = page.getViewport({ scale: 1.0 });

      // 1. Native text layer extraction
      const textContent = await page.getTextContent();
      const nativeItems: NativeTextItem[] = [];
      let totalChars = 0;

      for (const item of textContent.items as any[]) {
        if (!item.str || item.str.trim() === '') continue;

        totalChars += item.str.trim().length;

        // Convert coordinates to normalized 0..1000 scale
        const tx = item.transform[4];
        const ty = item.transform[5];
        const [vx, vy] = viewport1x.convertToViewportPoint(tx, ty);
        const itemWidth = (item.width || 20);
        const itemHeight = (item.height || 12);

        const xmin = Math.max(0, Math.min(1000, (vx / viewport1x.width) * 1000));
        const xmax = Math.max(0, Math.min(1000, ((vx + itemWidth) / viewport1x.width) * 1000));
        const ymin = Math.max(0, Math.min(1000, ((vy - itemHeight) / viewport1x.height) * 1000));
        const ymax = Math.max(0, Math.min(1000, (vy / viewport1x.height) * 1000));

        nativeItems.push({
          text: item.str,
          fontName: item.fontName,
          fontSize: itemHeight,
          bbox: {
            ymin: Math.min(ymin, ymax),
            xmin: Math.min(xmin, xmax),
            ymax: Math.max(ymin, ymax),
            xmax: Math.max(xmin, xmax),
          },
        });
      }

      // Classify page
      let classification: PageClassification = 'mixed';
      if (totalChars > 80) {
        classification = 'native';
      } else if (totalChars < 10) {
        classification = 'scanned';
      }

      // 2. Render page at 2x scale for high-clarity Gemini OCR & Grid analysis
      const scale = 2.0;
      const viewport2x = page.getViewport({ scale });
      const canvas = document.createElement('canvas');
      canvas.width = Math.floor(viewport2x.width);
      canvas.height = Math.floor(viewport2x.height);
      const ctx = canvas.getContext('2d', { alpha: false });

      if (ctx) {
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
      }

      await page.render({
        canvasContext: ctx!,
        viewport: viewport2x,
        canvas: canvas as any,
      }).promise;

      const dataUrl = canvas.toDataURL('image/png', 0.95);

      // 3. Send to Server-side Gemini extraction API
      let geminiData: any = null;
      try {
        const resp = await fetch('/api/extract-page', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            imageBase64: dataUrl,
            mimeType: 'image/png',
            pageNumber: pageNum,
            pageClassification: classification,
            modelOverride,
          }),
          signal,
        });

        if (resp.ok) {
          const json = await resp.json();
          geminiData = json.data;
          if (json.fallback) {
            console.warn(`[Page ${pageNum}] Server provided fallback:`, json.warning || 'Rate limited');
          }
        } else {
          console.warn(`[Page ${pageNum}] Server returned HTTP ${resp.status}`);
        }
      } catch (geminiErr: any) {
        if (signal?.aborted) throw geminiErr;
        console.warn(`[Page ${pageNum}] Extraction request handled via fallback:`, geminiErr?.message || geminiErr);
      }

      if (!geminiData) {
        geminiData = {
          pageNumber: pageNum,
          hasTables: false,
          readingDirection: 'rtl',
          tables: [],
          freeTextBlocks: [],
          scannedQualityScore: classification === 'scanned' ? 0.3 : 0.7,
        };
      }

      // Format tables from Gemini output, with intelligent fallback to native text layer
      let tables: ExtractedTable[] = (geminiData.tables || []).map((t: any, idx: number) => {
        const tableId = `p${pageNum}_t${idx + 1}`;
        const cells: ExtractedCell[] = (t.cells || []).map((c: any) => ({
          row: c.row ?? 0,
          col: c.col ?? 0,
          rowSpan: c.rowSpan || 1,
          colSpan: c.colSpan || 1,
          text: c.text ?? '',
          isHeader: Boolean(c.isHeader),
          isTotalRow: Boolean(c.isTotalRow),
          bbox: c.bbox || { ymin: 0, xmin: 0, ymax: 1000, xmax: 1000 },
        }));

        return {
          id: tableId,
          tableIndex: idx + 1,
          title: t.title || `جدول صفحة ${pageNum} - ${idx + 1}`,
          rowCount: t.rowCount || Math.max(...cells.map((c) => c.row + (c.rowSpan || 1)), 1),
          colCount: t.colCount || Math.max(...cells.map((c) => c.col + (c.colSpan || 1)), 1),
          hasHeader: Boolean(t.hasHeader),
          isRTL: t.isRTL ?? (geminiData.readingDirection === 'rtl'),
          bbox: t.bbox || { ymin: 0, xmin: 0, ymax: 1000, xmax: 1000 },
          cells,
        };
      });

      // Fallback: If Gemini returned no tables but native text items exist with tabular structure
      if (tables.length === 0 && nativeItems.length > 0) {
        tables = this.extractTablesFromNativeText(nativeItems, pageNum);
      }

      const freeBlocks: FreeTextBlock[] = (geminiData.freeTextBlocks || []).map((f: any) => ({
        text: f.text || '',
        type: f.type || 'paragraph',
        bbox: f.bbox || { ymin: 0, xmin: 0, ymax: 0, xmax: 0 },
      }));

      results[pageNum - 1] = {
        pageNumber: pageNum,
        classification,
        charCount: totalChars,
        nativeItems,
        tables,
        freeBlocks,
        canvasWidth: canvas.width,
        canvasHeight: canvas.height,
        dataUrl,
        scannedQualityScore: geminiData.scannedQualityScore,
        readingDirection: geminiData.readingDirection || 'rtl',
      };

      completedPages++;
      const currentPercent = Math.min(75, 10 + Math.round((completedPages / totalPages) * 65));
      onProgress?.(
        completedPages,
        totalPages,
        `تم استخراج الصفحة ${completedPages} من ${totalPages} (${classification === 'native' ? 'نصية' : classification === 'scanned' ? 'ممسوحة' : 'مختلطة'})...`,
        currentPercent
      );
    };

    // Sequential page execution to prevent quota spikes and respect rate limits
    for (const pageNum of pageIndices) {
      if (signal?.aborted) {
        throw new DOMException('Extraction aborted by user', 'AbortError');
      }
      await processPageWorker(pageNum);
      if (totalPages > 1 && pageNum < totalPages) {
        // Small pause between pages to adhere to RPM limits
        await new Promise((r) => setTimeout(r, 600));
      }
    }

    return results;
  }

  /**
   * Deterministic native text clustering fallback when Gemini is unavailable or rate limited.
   */
  private static extractTablesFromNativeText(
    nativeItems: NativeTextItem[],
    pageNum: number
  ): ExtractedTable[] {
    if (nativeItems.length === 0) return [];

    const hasArabic = nativeItems.some((item) => /[\u0600-\u06FF]/.test(item.text));

    // Group items by Y coordinate into rows (threshold 16 units in 0..1000 scale)
    const sortedByY = [...nativeItems].sort((a, b) => a.bbox.ymin - b.bbox.ymin);
    const rows: { ymin: number; items: NativeTextItem[] }[] = [];

    for (const item of sortedByY) {
      const existingRow = rows.find((r) => Math.abs(r.ymin - item.bbox.ymin) <= 16);
      if (existingRow) {
        existingRow.items.push(item);
      } else {
        rows.push({ ymin: item.bbox.ymin, items: [item] });
      }
    }

    // Filter rows that have multiple columns (at least 2 items)
    const multiColRows = rows.filter((r) => r.items.length >= 2);
    if (multiColRows.length === 0) return [];

    // Sort items within each row by X coordinate based on script direction
    for (const r of multiColRows) {
      if (hasArabic) {
        r.items.sort((a, b) => b.bbox.xmin - a.bbox.xmin);
      } else {
        r.items.sort((a, b) => a.bbox.xmin - b.bbox.xmin);
      }
    }

    const maxCols = Math.max(...multiColRows.map((r) => r.items.length));
    const cells: ExtractedCell[] = [];

    multiColRows.forEach((r, rowIdx) => {
      r.items.forEach((item, colIdx) => {
        const isHeader = rowIdx === 0;
        const isTotal =
          item.text.includes('Total') ||
          item.text.includes('الإجمالي') ||
          item.text.includes('المجموع');

        cells.push({
          row: rowIdx,
          col: colIdx,
          rowSpan: 1,
          colSpan: 1,
          text: item.text,
          isHeader,
          isTotalRow: isTotal,
          bbox: item.bbox,
        });
      });
    });

    const minX = Math.min(...cells.map((c) => c.bbox.xmin));
    const maxX = Math.max(...cells.map((c) => c.bbox.xmax));
    const minY = Math.min(...cells.map((c) => c.bbox.ymin));
    const maxY = Math.max(...cells.map((c) => c.bbox.ymax));

    return [
      {
        id: `p${pageNum}_t1`,
        tableIndex: 1,
        title: `جدول صفحة ${pageNum} (الطبقة النصية الأصلية)`,
        rowCount: multiColRows.length,
        colCount: maxCols,
        hasHeader: true,
        isRTL: hasArabic,
        bbox: { ymin: minY, xmin: minX, ymax: maxY, xmax: maxX },
        cells,
      },
    ];
  }
}

