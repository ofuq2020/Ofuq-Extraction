import * as pdfjsLib from 'pdfjs-dist';

// Configure pdfjs worker for client-side browser execution
if (typeof window !== 'undefined') {
  try {
    // Version-matched worker URL from unpkg
    const version = pdfjsLib.version || '4.10.38';
    pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${version}/build/pdf.worker.min.mjs`;
  } catch (err) {
    console.warn('PDF.js worker initialization warning:', err);
  }
}

export { pdfjsLib };
