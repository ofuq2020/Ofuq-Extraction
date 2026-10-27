export type PageClassification = 'native' | 'scanned' | 'mixed';

export interface BoundingBox {
  ymin: number; // 0 - 1000
  xmin: number; // 0 - 1000
  ymax: number; // 0 - 1000
  xmax: number; // 0 - 1000
}

export interface NativeTextItem {
  text: string;
  bbox: BoundingBox;
  fontName?: string;
  fontSize?: number;
  dir?: string;
}

export interface ExtractedCell {
  row: number;
  col: number;
  rowSpan?: number;
  colSpan?: number;
  text: string;
  isHeader?: boolean;
  isTotalRow?: boolean;
  bbox: BoundingBox;
}

export interface ExtractedTable {
  id: string;
  tableIndex: number;
  title?: string;
  rowCount: number;
  colCount: number;
  hasHeader: boolean;
  isRTL: boolean;
  bbox: BoundingBox;
  cells: ExtractedCell[];
}

export interface FreeTextBlock {
  text: string;
  type: 'title' | 'header' | 'paragraph' | 'footer' | 'meta' | string;
  bbox: BoundingBox;
}

export interface PageExtraction {
  pageNumber: number;
  classification: PageClassification;
  charCount: number;
  nativeItems: NativeTextItem[];
  tables: ExtractedTable[];
  freeBlocks: FreeTextBlock[];
  canvasWidth: number;
  canvasHeight: number;
  dataUrl?: string; // High-res image rendered from PDF
  scannedQualityScore?: number;
  readingDirection?: 'rtl' | 'ltr';
}

export type TypedValueType = 'text' | 'number' | 'date' | 'currency' | 'percentage' | 'empty';

export type VerificationStatus = 'verified' | 'review_required' | 'low_confidence';

export type IssueCategory =
  | 'source_mismatch'
  | 'dual_disagreement'
  | 'arithmetic_error'
  | 'structural_anomaly'
  | 'export_difference'
  | 'low_confidence_source';

export interface VerificationIssue {
  id: string;
  category: IssueCategory;
  severity: 'error' | 'warning' | 'info';
  message: string;
  evidence: {
    bbox?: BoundingBox;
    sourceText?: string;
    extractedText?: string;
    modelValue?: any;
    exportedValue?: any;
    modelType?: string;
    exportedType?: string;
    cellAddress?: string;
    expectedSum?: number;
    calculatedSum?: number;
  };
}

export interface ReconstructedCell {
  id: string;
  pageNumber: number;
  row: number;
  col: number;
  rowSpan: number;
  colSpan: number;
  rawText: string;
  typedValue: string | number | Date | null;
  valueType: TypedValueType;
  source: 'text-layer' | 'gemini' | 'hybrid' | 'user-edited';
  bbox: BoundingBox;
  isHeader: boolean;
  isTotalRow: boolean;
  status: VerificationStatus;
  issues: VerificationIssue[];
  isUserEdited?: boolean;
  userNotes?: string;
}

export interface ReconstructedTable {
  id: string;
  tableIndex: number;
  sheetName: string;
  title: string;
  pageNumbers: number[];
  rowCount: number;
  colCount: number;
  isRTL: boolean;
  cells: ReconstructedCell[];
  grid: (ReconstructedCell | null)[][];
  status: VerificationStatus;
  issues: VerificationIssue[];
  headers?: string[];
}

export interface ReconstructedModel {
  tables: ReconstructedTable[];
  pages: PageExtraction[];
  metadata: {
    filename: string;
    pageCount: number;
    fileSizeBytes: number;
    processedAt: string;
    modelUsed: string;
  };
  summary: {
    totalCells: number;
    verifiedCount: number;
    reviewCount: number;
    lowConfidenceCount: number;
    exportIssuesCount: number;
  };
}

export type PipelineStage =
  | 'idle'
  | 'analyzing'
  | 'extracting'
  | 'reconstructing'
  | 'generating_excel'
  | 'verifying'
  | 'finalizing'
  | 'ready'
  | 'error';

export interface PipelineProgressState {
  stage: PipelineStage;
  currentPage: number;
  totalPages: number;
  stageMessage: string;
  progressPercent: number;
  startTime?: number;
  error?: string;
}
