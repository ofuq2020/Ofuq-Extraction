import express from 'express';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenAI, Type } from '@google/genai';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const isProd = process.env.NODE_ENV === 'production';
const PORT = 3000;

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '60mb' }));

// Shared Gemini client instance
  const ai = new GoogleGenAI({
    apiKey: process.env.GEMINI_API_KEY || '',
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });

  // Helper to extract retry delay from Gemini ApiError
  function parseRetryDelayMs(err: any): number {
    try {
      const details = err?.details || err?.error?.details || [];
      if (Array.isArray(details)) {
        for (const d of details) {
          if (d?.retryDelay) {
            const str = String(d.retryDelay).trim();
            if (str.endsWith('ms')) {
              const ms = parseFloat(str);
              if (!isNaN(ms)) return Math.ceil(ms);
            }
            const sec = parseFloat(str);
            if (!isNaN(sec)) return Math.ceil(sec * 1000);
          }
        }
      }

      const msg = err?.message || (typeof err === 'string' ? err : JSON.stringify(err));
      const secMatch = msg.match(/retry in\s+([0-9.]+)\s*s/i);
      if (secMatch) {
        return Math.ceil(parseFloat(secMatch[1]) * 1000);
      }
      const msMatch = msg.match(/retry in\s+([0-9.]+)\s*ms/i);
      if (msMatch) {
        return Math.ceil(parseFloat(msMatch[1]));
      }
    } catch {
      // Fallback below
    }
    return 4000;
  }

  function isRateLimitError(err: any): boolean {
    if (!err) return false;
    const status = err?.status || err?.code || '';
    const msg = (err?.message || (typeof err === 'string' ? err : JSON.stringify(err))).toLowerCase();
    return (
      status === 429 ||
      status === 'RESOURCE_EXHAUSTED' ||
      msg.includes('429') ||
      msg.includes('resource_exhausted') ||
      msg.includes('quota exceeded') ||
      msg.includes('rate limit')
    );
  }

  // Queue to sequence Gemini requests and avoid bursting the RPM quota
  class GeminiQueue {
    private queue: Array<() => Promise<void>> = [];
    private isProcessing = false;
    private lastCallEndTime = 0;
    private minIntervalMs = 1500; // Pacing between consecutive API requests

    public async enqueue<T>(task: () => Promise<T>): Promise<T> {
      return new Promise<T>((resolve, reject) => {
        this.queue.push(async () => {
          try {
            const now = Date.now();
            const elapsed = now - this.lastCallEndTime;
            if (elapsed < this.minIntervalMs) {
              await new Promise((r) => setTimeout(r, this.minIntervalMs - elapsed));
            }

            const result = await task();
            this.lastCallEndTime = Date.now();
            resolve(result);
          } catch (err) {
            this.lastCallEndTime = Date.now();
            reject(err);
          }
        });

        this.processNext();
      });
    }

    private async processNext() {
      if (this.isProcessing || this.queue.length === 0) return;
      this.isProcessing = true;
      const nextTask = this.queue.shift();
      if (nextTask) {
        try {
          await nextTask();
        } finally {
          this.isProcessing = false;
          this.processNext();
        }
      } else {
        this.isProcessing = false;
      }
    }
  }

  const geminiQueue = new GeminiQueue();

  // Health check endpoint
  app.get('/api/health', (req, res) => {
    res.json({
      status: 'ok',
      hasApiKey: Boolean(process.env.GEMINI_API_KEY),
      service: 'Ofuq Extraction Engine',
    });
  });

  // Dual-extraction endpoint: processes rendered PDF page image
  app.post('/api/extract-page', async (req, res) => {
    try {
      const {
        imageBase64,
        mimeType = 'image/png',
        pageNumber = 1,
        pageClassification = 'mixed',
        modelOverride,
      } = req.body;

      if (!imageBase64) {
        return res.status(400).json({ error: 'Missing imageBase64 data in request' });
      }

      if (!process.env.GEMINI_API_KEY) {
        return res.status(500).json({
          error: 'GEMINI_API_KEY environment variable is not configured on the server.',
        });
      }

      const selectedModel = modelOverride || 'gemini-3.8-flash';

      const promptText = `Analyze this PDF page image (Page ${pageNumber}, Classification: ${pageClassification}).
Extract ALL structured tabular data and textual sections with high precision.
Follow these critical rules:
1. Tabular layout:
   - Identify every distinct table grid.
   - For every cell, specify 0-based row and col index, cell content as exact raw text, rowSpan, colSpan.
   - Calculate normalized bounding boxes [ymin, xmin, ymax, xmax] scaled 0 to 1000 (where 0,0 is top-left, 1000,1000 is bottom-right).
   - Flag header rows with isHeader: true.
   - Flag summary/total rows (e.g. rows containing 'الإجمالي', 'المجموع', 'Total', 'Subtotal') with isTotalRow: true.
2. Arabic & RTL Fidelity:
   - Preserve natural Arabic character sequences and ligature order. NEVER reverse characters or garble numbers.
   - Set readingDirection to 'rtl' if the dominant script is Arabic, otherwise 'ltr'.
3. Strict Fidelity:
   - NEVER fabricate numbers, dates, or values. If text in a cell is empty or cut off, output an empty string.
   - Output free-standing text (titles, headers, footnotes, disclaimers) into freeTextBlocks.
4. Scanned quality: Provide scannedQualityScore (0.0 = unreadable smudge, 1.0 = sharp vector scan).`;

      // Execute through paced queue with automatic backoff retry on 429
      const parsedData = await geminiQueue.enqueue(async () => {
        let attempts = 0;
        const maxAttempts = 4;
        let lastError: any = null;

        while (attempts < maxAttempts) {
          attempts++;
          try {
            const response = await ai.models.generateContent({
              model: selectedModel,
              contents: {
                parts: [
                  {
                    inlineData: {
                      mimeType,
                      data: imageBase64.replace(/^data:image\/\w+;base64,/, ''),
                    },
                  },
                  {
                    text: promptText,
                  },
                ],
              },
              config: {
                temperature: 0.1,
                responseMimeType: 'application/json',
                responseSchema: {
                  type: Type.OBJECT,
                  properties: {
                    pageNumber: { type: Type.INTEGER },
                    hasTables: { type: Type.BOOLEAN },
                    readingDirection: { type: Type.STRING, description: "'rtl' or 'ltr'" },
                    tables: {
                      type: Type.ARRAY,
                      items: {
                        type: Type.OBJECT,
                        properties: {
                          tableIndex: { type: Type.INTEGER },
                          title: { type: Type.STRING },
                          rowCount: { type: Type.INTEGER },
                          colCount: { type: Type.INTEGER },
                          hasHeader: { type: Type.BOOLEAN },
                          isRTL: { type: Type.BOOLEAN },
                          bbox: {
                            type: Type.OBJECT,
                            properties: {
                              ymin: { type: Type.NUMBER },
                              xmin: { type: Type.NUMBER },
                              ymax: { type: Type.NUMBER },
                              xmax: { type: Type.NUMBER },
                            },
                            required: ['ymin', 'xmin', 'ymax', 'xmax'],
                          },
                          cells: {
                            type: Type.ARRAY,
                            items: {
                              type: Type.OBJECT,
                              properties: {
                                row: { type: Type.INTEGER },
                                col: { type: Type.INTEGER },
                                rowSpan: { type: Type.INTEGER },
                                colSpan: { type: Type.INTEGER },
                                text: { type: Type.STRING },
                                isHeader: { type: Type.BOOLEAN },
                                isTotalRow: { type: Type.BOOLEAN },
                                bbox: {
                                  type: Type.OBJECT,
                                  properties: {
                                    ymin: { type: Type.NUMBER },
                                    xmin: { type: Type.NUMBER },
                                    ymax: { type: Type.NUMBER },
                                    xmax: { type: Type.NUMBER },
                                  },
                                  required: ['ymin', 'xmin', 'ymax', 'xmax'],
                                },
                              },
                              required: ['row', 'col', 'text'],
                            },
                          },
                        },
                        required: ['tableIndex', 'rowCount', 'colCount', 'cells'],
                      },
                    },
                    freeTextBlocks: {
                      type: Type.ARRAY,
                      items: {
                        type: Type.OBJECT,
                        properties: {
                          text: { type: Type.STRING },
                          type: {
                            type: Type.STRING,
                            description: "'title', 'header', 'paragraph', 'footer', 'meta'",
                          },
                          bbox: {
                            type: Type.OBJECT,
                            properties: {
                              ymin: { type: Type.NUMBER },
                              xmin: { type: Type.NUMBER },
                              ymax: { type: Type.NUMBER },
                              xmax: { type: Type.NUMBER },
                            },
                            required: ['ymin', 'xmin', 'ymax', 'xmax'],
                          },
                        },
                        required: ['text', 'type'],
                      },
                    },
                    scannedQualityScore: {
                      type: Type.NUMBER,
                      description: '0 to 1 score of page clarity and legibility',
                    },
                  },
                  required: ['hasTables', 'tables', 'readingDirection'],
                },
              },
            });

            const responseText = response.text || '{}';
            const data = JSON.parse(responseText);
            data.pageNumber = pageNumber;
            return data;
          } catch (err: any) {
            lastError = err;
            if (isRateLimitError(err) && attempts < maxAttempts) {
              const retryDelayMs = parseRetryDelayMs(err);
              // Wait for Google's indicated backoff window with safety margin
              const waitTime = Math.min(Math.max(retryDelayMs + 800, 2000), 20000);
              console.warn(
                `[Gemini Rate Limiter] Page ${pageNumber} rate limited (attempt ${attempts}/${maxAttempts}). Waiting ${waitTime}ms...`
              );
              await new Promise((r) => setTimeout(r, waitTime));
              continue;
            }
            throw err;
          }
        }
        throw lastError;
      });

      return res.json({
        success: true,
        data: parsedData,
        modelUsed: selectedModel,
      });
    } catch (err: any) {
      console.warn(`[Gemini Extraction Handled] Page ${req.body?.pageNumber || 1}:`, err?.message || err);

      // Return a graceful fallback response so the pipeline continues with native layer extraction
      return res.json({
        success: true,
        fallback: true,
        rateLimited: isRateLimitError(err),
        data: {
          pageNumber: req.body?.pageNumber || 1,
          hasTables: false,
          readingDirection: 'rtl',
          tables: [],
          freeTextBlocks: [],
          scannedQualityScore: 0.5,
          rateLimited: isRateLimitError(err),
        },
        modelUsed: req.body?.modelOverride || 'gemini-3.8-flash',
        warning: err?.message || 'Gemini extraction rate limited or unavailable, falling back to native layer',
      });
    }
  });

  // Setup Vite middleware in dev or static files in production
  if (!isProd) {
    const { createServer } = await import('vite');
    const vite = await createServer({
      server: { middlewareMode: true, port: PORT, host: '0.0.0.0' },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.resolve(__dirname, 'dist')));
    app.get('*', (req, res) => {
      res.sendFile(path.resolve(__dirname, 'dist', 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Ofuq Extraction server running on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Fatal server boot error:', err);
  process.exit(1);
});
