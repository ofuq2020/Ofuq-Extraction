import React, { useState, useRef, useTransition } from 'react';
import { Header } from './components/Header';
import { DropZone } from './components/DropZone';
import { PipelineProgress } from './components/PipelineProgress';
import { PdfViewer } from './components/PdfViewer';
import { TableGrid } from './components/TableGrid';
import { VerificationDrawer } from './components/VerificationDrawer';
import { ExportModal } from './components/ExportModal';
import { Language, translations } from './locales/translations';
import {
  PipelineProgressState,
  ReconstructedCell,
  ReconstructedModel,
  VerificationIssue,
} from './types';
import { PdfExtractor } from './services/pdfExtractor';
import { TableReconstructor } from './services/tableReconstructor';
import { ExcelGenerator } from './services/excelGenerator';
import { VerificationEngine } from './services/verificationEngine';
import { createSamplePdfBuffer } from './utils/samplePdfGenerator';
import { normalizeCellValue } from './utils/arabicUtils';
import { Download, RotateCcw, AlertTriangle, CheckCircle, RefreshCw } from 'lucide-react';

export default function App() {
  const [lang, setLang] = useState<Language>('ar');
  const [selectedModel, setSelectedModel] = useState<string>('gemini-3.8-flash');
  const t = translations[lang];

  // Pipeline state
  const [progress, setProgress] = useState<PipelineProgressState>({
    stage: 'idle',
    currentPage: 0,
    totalPages: 0,
    stageMessage: '',
    progressPercent: 0,
  });

  const [model, setModel] = useState<ReconstructedModel | null>(null);
  const [selectedTableIndex, setSelectedTableIndex] = useState<number>(0);
  const [selectedCell, setSelectedCell] = useState<ReconstructedCell | null>(null);
  const [currentPageNumber, setCurrentPageNumber] = useState<number>(1);
  const [filterIssuesOnly, setFilterIssuesOnly] = useState<boolean>(false);

  // Verification & Export Results
  const [dataBuffer, setDataBuffer] = useState<Uint8Array | null>(null);
  const [finalBuffer, setFinalBuffer] = useState<Uint8Array | null>(null);
  const [exportIssues, setExportIssues] = useState<VerificationIssue[]>([]);
  const [noDataMutationConfirmed, setNoDataMutationConfirmed] = useState<boolean>(true);
  const [mutationErrors, setMutationErrors] = useState<string[]>([]);
  const [isExportModalOpen, setIsExportModalOpen] = useState<boolean>(false);

  const abortControllerRef = useRef<AbortController | null>(null);

  // Cancellation handler
  const handleCancel = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setProgress({
      stage: 'idle',
      currentPage: 0,
      totalPages: 0,
      stageMessage: lang === 'ar' ? 'تم إلغاء العملية بواسطة المستخدم.' : 'Operation cancelled by user.',
      progressPercent: 0,
    });
  };

  /**
   * Complete 5-stage sequential pipeline execution.
   */
  const runPipeline = async (buffer: ArrayBuffer, filename: string, fileSizeBytes: number) => {
    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      // ----------------------------------------------------
      // STAGE 1: EXTRACTION (Dual Extraction: Native Text + Gemini)
      // ----------------------------------------------------
      setProgress({
        stage: 'extracting',
        currentPage: 0,
        totalPages: 1,
        stageMessage: lang === 'ar' ? 'المرحلة 1: بدء الاستخراج المزدوج لطبقة النص والصورة...' : 'Stage 1: Dual extraction underway...',
        progressPercent: 10,
        startTime: Date.now(),
      });

      const pages = await PdfExtractor.extractPdf(buffer, {
        modelOverride: selectedModel,
        signal: controller.signal,
        maxConcurrency: 1,
        onProgress: (pageIdx, total, msg, pct) => {
          setProgress((prev) => ({
            ...prev,
            currentPage: pageIdx,
            totalPages: total,
            stageMessage: msg,
            progressPercent: pct,
          }));
        },
      });

      if (controller.signal.aborted) return;

      // ----------------------------------------------------
      // STAGE 2: TABLE RECONSTRUCTION (Grid Construction & Typing)
      // ----------------------------------------------------
      setProgress({
        stage: 'reconstructing',
        currentPage: pages.length,
        totalPages: pages.length,
        stageMessage: lang === 'ar' ? 'المرحلة 2: توحيد بنية الجداول وإعادة بناء المصفوفة وتصنيف البيانات...' : 'Stage 2: Reconstructing table grid & normalizing values...',
        progressPercent: 80,
      });

      const reconstructedModel = TableReconstructor.reconstruct(pages, {
        filename,
        fileSizeBytes,
        modelUsed: selectedModel,
      });

      // ----------------------------------------------------
      // STAGE 3: EXCEL GENERATION (Data Cells Only)
      // ----------------------------------------------------
      setProgress({
        stage: 'generating_excel',
        currentPage: pages.length,
        totalPages: pages.length,
        stageMessage: lang === 'ar' ? 'المرحلة 3: توليد ملف Excel الأولي بالخلايا والبيانات الخام فقط...' : 'Stage 3: Generating pure data in-memory Excel workbook...',
        progressPercent: 88,
      });

      const initialDataBuffer = await ExcelGenerator.generateDataWorkbook(reconstructedModel);
      setDataBuffer(initialDataBuffer);

      // ----------------------------------------------------
      // STAGE 4: VERIFICATION ENGINE (4A Source Check + 4B Exported-File Check)
      // ----------------------------------------------------
      setProgress({
        stage: 'verifying',
        currentPage: pages.length,
        totalPages: pages.length,
        stageMessage: lang === 'ar' ? 'المرحلة 4: تنفيذ محرك التحقق الصارم (فحص 4A للمصدر + فحص 4B لإعادة قراءة الإكسل)...' : 'Stage 4: Executing mandatory 4A and 4B verification engine...',
        progressPercent: 93,
      });

      const verifyResult = await VerificationEngine.verify(reconstructedModel, initialDataBuffer);
      setExportIssues(verifyResult.exportCheckIssues);

      // ----------------------------------------------------
      // STAGE 5: FINAL DELIVERY (Styling, Cell Notes & Audit Report Sheet)
      // ----------------------------------------------------
      setProgress({
        stage: 'finalizing',
        currentPage: pages.length,
        totalPages: pages.length,
        stageMessage: lang === 'ar' ? 'المرحلة 5: بناء ورقة تقرير التحقق وتلوين التنبيهات والتأكد من عدم تغير البيانات...' : 'Stage 5: Finalizing delivery, adding report sheet and confirming invariance...',
        progressPercent: 97,
      });

      const finalResult = await ExcelGenerator.generateFinalWorkbook(
        verifyResult.model,
        initialDataBuffer
      );

      setFinalBuffer(finalResult.finalBuffer);
      setNoDataMutationConfirmed(finalResult.noDataMutationConfirmed);
      setMutationErrors(finalResult.mutationErrors);

      setModel(verifyResult.model);
      setSelectedTableIndex(0);
      if (verifyResult.model.tables.length > 0 && verifyResult.model.tables[0].cells.length > 0) {
        setSelectedCell(verifyResult.model.tables[0].cells[0]);
        setCurrentPageNumber(verifyResult.model.tables[0].cells[0].pageNumber);
      }

      setProgress({
        stage: 'ready',
        currentPage: pages.length,
        totalPages: pages.length,
        stageMessage: lang === 'ar' ? 'اكتمل خط الأنابيب واجتازت البيانات فحوصات التحقق!' : 'Pipeline completed and verified!',
        progressPercent: 100,
      });
    } catch (err: any) {
      if (err.name === 'AbortError') {
        return;
      }
      console.warn('Pipeline execution encountered an issue:', err?.message || err);
      setProgress({
        stage: 'error',
        currentPage: 0,
        totalPages: 0,
        stageMessage: err?.message || 'حدث خطأ أثناء معالجة ملف PDF',
        progressPercent: 0,
        error: err?.message,
      });
    } finally {
      abortControllerRef.current = null;
    }
  };

  // Upload user file
  const handleFileSelect = async (file: File) => {
    const buffer = await file.arrayBuffer();
    runPipeline(buffer, file.name, file.size);
  };

  // 1-Click sample PDF
  const handleSampleLoad = async () => {
    const buffer = createSamplePdfBuffer();
    runPipeline(buffer, 'Sample_Tax_Invoice_INV2026.pdf', buffer.byteLength);
  };

  // Re-run 4B and final delivery after cell edit
  const handleUpdateCellValue = async (tableId: string, cellId: string, newValue: string) => {
    if (!model) return;

    // Deep clone model
    const updatedTables = model.tables.map((tbl) => {
      if (tbl.id !== tableId) return tbl;

      const updatedCells = tbl.cells.map((cell) => {
        if (cell.id !== cellId) return cell;

        const normalized = normalizeCellValue(newValue);
        return {
          ...cell,
          rawText: newValue,
          typedValue: normalized.typedValue,
          valueType: normalized.valueType,
          isUserEdited: true,
          status: 'verified' as const,
          issues: cell.issues.filter((i) => i.category === 'export_difference'),
        };
      });

      // Update grid
      const updatedGrid = tbl.grid.map((row) =>
        row.map((c) => {
          if (!c || c.id !== cellId) return c;
          const normalized = normalizeCellValue(newValue);
          return {
            ...c,
            rawText: newValue,
            typedValue: normalized.typedValue,
            valueType: normalized.valueType,
            isUserEdited: true,
            status: 'verified' as const,
            issues: c.issues.filter((i) => i.category === 'export_difference'),
          };
        })
      );

      return {
        ...tbl,
        cells: updatedCells,
        grid: updatedGrid,
      };
    });

    const updatedModel: ReconstructedModel = {
      ...model,
      tables: updatedTables,
    };

    // Re-generate Stage 3 and re-run Stage 4 & 5
    const newInitialBuffer = await ExcelGenerator.generateDataWorkbook(updatedModel);
    setDataBuffer(newInitialBuffer);

    const reVerify = await VerificationEngine.verify(updatedModel, newInitialBuffer);
    setExportIssues(reVerify.exportCheckIssues);

    const reFinal = await ExcelGenerator.generateFinalWorkbook(reVerify.model, newInitialBuffer);
    setFinalBuffer(reFinal.finalBuffer);
    setNoDataMutationConfirmed(reFinal.noDataMutationConfirmed);
    setMutationErrors(reFinal.mutationErrors);

    setModel(reVerify.model);
    const updatedCell = reVerify.model.tables
      .flatMap((t) => t.cells)
      .find((c) => c.id === cellId);
    if (updatedCell) {
      setSelectedCell(updatedCell);
    }
  };

  const handleCellSelect = (cell: ReconstructedCell) => {
    setSelectedCell(cell);
    if (cell.pageNumber !== currentPageNumber) {
      setCurrentPageNumber(cell.pageNumber);
    }
  };

  const handleSelectCellById = (cellId: string) => {
    if (!model) return;
    const found = model.tables.flatMap((t) => t.cells).find((c) => c.id === cellId);
    if (found) {
      handleCellSelect(found);
    }
  };

  // Download final Excel workbook
  const handleDownloadExcel = () => {
    if (!finalBuffer || !model) return;

    const blob = new Blob([finalBuffer as any], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const baseName = model.metadata.filename.replace(/\.pdf$/i, '');
    a.download = `${baseName}_verified.xlsx`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // Reset to initial
  const handleReset = () => {
    setModel(null);
    setDataBuffer(null);
    setFinalBuffer(null);
    setSelectedCell(null);
    setProgress({
      stage: 'idle',
      currentPage: 0,
      totalPages: 0,
      stageMessage: '',
      progressPercent: 0,
    });
  };

  const currentTable = model?.tables[selectedTableIndex];
  const cellsOnCurrentPage =
    model?.tables.flatMap((t) => t.cells).filter((c) => c.pageNumber === currentPageNumber) || [];

  return (
    <div
      dir={lang === 'ar' ? 'rtl' : 'ltr'}
      className="min-h-screen bg-slate-50/70 text-slate-800 flex flex-col font-sans selection:bg-emerald-500/20 selection:text-emerald-900"
    >
      {/* App Header */}
      <Header
        lang={lang}
        onToggleLang={() => setLang(lang === 'ar' ? 'en' : 'ar')}
        selectedModel={selectedModel}
        onSelectModel={setSelectedModel}
        isProcessing={progress.stage !== 'idle' && progress.stage !== 'ready' && progress.stage !== 'error'}
      />

      {/* Main App Container */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {/* If Error */}
        {progress.stage === 'error' && (
          <div className="mb-6 p-4 rounded-2xl bg-rose-50 border border-rose-200 text-rose-900 flex items-start justify-between gap-3">
            <div className="flex items-start gap-2.5">
              <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
              <div>
                <span className="font-bold text-sm block">حدث خطأ أثناء المعالجة:</span>
                <p className="text-xs text-rose-700 mt-0.5 leading-relaxed">{progress.error}</p>
              </div>
            </div>
            <button
              onClick={handleReset}
              className="px-3 py-1.5 rounded-lg bg-rose-100 hover:bg-rose-200 text-rose-800 text-xs font-semibold"
            >
              إعادة المحاولة
            </button>
          </div>
        )}

        {/* If Idle: Dropzone & Hero */}
        {!model && progress.stage === 'idle' && (
          <div className="py-6">
            <DropZone
              lang={lang}
              onFileSelect={handleFileSelect}
              onSampleLoad={handleSampleLoad}
              isProcessing={false}
            />
          </div>
        )}

        {/* If In-Progress Pipeline */}
        {progress.stage !== 'idle' && progress.stage !== 'ready' && progress.stage !== 'error' && (
          <PipelineProgress progress={progress} lang={lang} onCancel={handleCancel} />
        )}

        {/* If Model Ready: Full Split View & Verification Workspace */}
        {model && (
          <div className="space-y-6">
            {/* Action Bar & Summary Top Banner */}
            <div className="flex flex-wrap items-center justify-between gap-3 bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-emerald-100 text-emerald-800 flex items-center justify-center font-bold">
                  <CheckCircle className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-sm font-bold text-slate-900">
                    {model.metadata.filename}
                  </h2>
                  <p className="text-[11px] text-slate-500">
                    {model.metadata.pageCount} {t.pageLabel} | {model.tables.length} {lang === 'ar' ? 'جداول مستخرجة' : 'tables'} | {model.summary.totalCells} {lang === 'ar' ? 'خلية' : 'cells'}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={handleReset}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-200 hover:bg-slate-100 text-slate-700 text-xs font-semibold transition-colors"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>{lang === 'ar' ? 'معالجة ملف جديد' : 'Convert Another'}</span>
                </button>

                <button
                  onClick={() => setIsExportModalOpen(true)}
                  className="flex items-center gap-2 px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white text-xs font-bold shadow-md shadow-emerald-600/20 transition-all"
                >
                  <Download className="w-4 h-4" />
                  <span>{exportIssues.length > 0 ? t.downloadWithWarnings : t.downloadExcelBtn}</span>
                </button>
              </div>
            </div>

            {/* Split View: PDF Source on one side, Reconstructed Table on other */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 h-[720px]">
              {/* Side 1: PDF Source Ground Truth with Overlaid SVG */}
              <div className="h-full flex flex-col">
                <div className="flex items-center justify-between mb-2 px-1">
                  <span className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-blue-500"></span>
                    {t.splitPdfHeader}
                  </span>
                  <span className="text-[11px] text-slate-500">
                    {currentPageNumber} / {model.pages.length}
                  </span>
                </div>
                <div className="flex-1 min-h-0">
                  <PdfViewer
                    pages={model.pages}
                    currentPageNumber={currentPageNumber}
                    onPageChange={setCurrentPageNumber}
                    selectedCell={selectedCell}
                    onSelectCellById={handleSelectCellById}
                    cellsOnCurrentPage={cellsOnCurrentPage}
                    lang={lang}
                  />
                </div>
              </div>

              {/* Side 2: Reconstructed Table Grid */}
              <div className="h-full flex flex-col">
                <div className="flex items-center justify-between mb-2 px-1">
                  <span className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                    {t.splitGridHeader}
                  </span>
                  {currentTable && (
                    <span className="text-[11px] text-slate-500">
                      {currentTable.rowCount} {lang === 'ar' ? 'صفوف' : 'rows'} × {currentTable.colCount} {lang === 'ar' ? 'أعمدة' : 'cols'}
                    </span>
                  )}
                </div>
                <div className="flex-1 min-h-0">
                  <TableGrid
                    tables={model.tables}
                    selectedTableIndex={selectedTableIndex}
                    onSelectTableIndex={setSelectedTableIndex}
                    selectedCell={selectedCell}
                    onSelectCell={handleCellSelect}
                    onUpdateCellValue={handleUpdateCellValue}
                    filterIssuesOnly={filterIssuesOnly}
                    onToggleFilterIssues={() => setFilterIssuesOnly(!filterIssuesOnly)}
                    lang={lang}
                  />
                </div>
              </div>
            </div>

            {/* Stage 4 Verification Audit Drawer & KPIs */}
            <VerificationDrawer
              model={model}
              selectedCell={selectedCell}
              onSelectCell={handleCellSelect}
              lang={lang}
            />
          </div>
        )}
      </main>

      {/* Export & Stage 4B Confirmation Modal */}
      <ExportModal
        isOpen={isExportModalOpen}
        onClose={() => setIsExportModalOpen(false)}
        onConfirmDownload={handleDownloadExcel}
        exportIssues={exportIssues}
        noDataMutationConfirmed={noDataMutationConfirmed}
        mutationErrors={mutationErrors}
        filename={model?.metadata.filename || 'export.xlsx'}
        lang={lang}
      />
    </div>
  );
}
