import ExcelJS from 'exceljs';
import {
  BoundingBox,
  PageExtraction,
  ReconstructedCell,
  ReconstructedModel,
  ReconstructedTable,
  VerificationIssue,
} from '../types';
import { convertArabicIndicDigits, normalizeForComparison } from '../utils/arabicUtils';

export interface VerificationResult {
  model: ReconstructedModel;
  sourceCheckIssues: VerificationIssue[];
  exportCheckIssues: VerificationIssue[];
  summary: {
    totalCells: number;
    verifiedCount: number;
    reviewCount: number;
    lowConfidenceCount: number;
    exportIssuesCount: number;
    integrityScore: number; // 0 - 100
  };
}

/**
 * Stage 4: Deterministic Verification Engine.
 * Implements 4A (Source Check vs PDF) and 4B (Exported-File Check vs Reconstructed Model).
 */
export class VerificationEngine {
  /**
   * Runs the complete Stage 4 verification pipeline.
   */
  public static async verify(
    model: ReconstructedModel,
    exportedDataBuffer: Uint8Array
  ): Promise<VerificationResult> {
    const sourceCheckIssues: VerificationIssue[] = [];
    const exportCheckIssues: VerificationIssue[] = [];

    // 1. Run 4A: Source Check (Reconstructed Model vs PDF Source)
    this.runSourceChecks(model, sourceCheckIssues);

    // 2. Run 4B: Exported-File Check (Generated Excel vs Reconstructed Model)
    await this.runExportFileChecks(model, exportedDataBuffer, exportCheckIssues);

    // 3. Aggregate cell statuses and model summary
    let verifiedCount = 0;
    let reviewCount = 0;
    let lowConfidenceCount = 0;
    const totalCells = model.tables.reduce((acc, t) => acc + t.cells.length, 0);

    for (const table of model.tables) {
      let tableHasError = false;
      let tableHasWarning = false;
      let tableHasLowConf = false;

      for (const cell of table.cells) {
        // User edited cells always become verified
        if (cell.isUserEdited) {
          cell.status = 'verified';
          cell.issues = cell.issues.filter((iss) => iss.category === 'export_difference');
        } else if (cell.issues.some((i) => i.category === 'low_confidence_source')) {
          cell.status = 'low_confidence';
          tableHasLowConf = true;
        } else if (cell.issues.some((i) => i.severity === 'error' || i.severity === 'warning')) {
          cell.status = 'review_required';
          tableHasWarning = true;
          if (cell.issues.some((i) => i.severity === 'error')) {
            tableHasError = true;
          }
        } else {
          cell.status = 'verified';
        }

        if (cell.status === 'verified') verifiedCount++;
        else if (cell.status === 'review_required') reviewCount++;
        else if (cell.status === 'low_confidence') lowConfidenceCount++;
      }

      // Update table-level status
      if (tableHasLowConf) table.status = 'low_confidence';
      else if (tableHasError || tableHasWarning) table.status = 'review_required';
      else table.status = 'verified';
    }

    const exportIssuesCount = exportCheckIssues.length;
    const integrityScore =
      totalCells > 0 ? Math.max(0, Math.round((verifiedCount / totalCells) * 100)) : 100;

    model.summary = {
      totalCells,
      verifiedCount,
      reviewCount,
      lowConfidenceCount,
      exportIssuesCount,
    };

    return {
      model,
      sourceCheckIssues,
      exportCheckIssues,
      summary: {
        totalCells,
        verifiedCount,
        reviewCount,
        lowConfidenceCount,
        exportIssuesCount,
        integrityScore,
      },
    };
  }

  /**
   * 4A. Source Checks:
   * - Number/date existence in native text layer
   * - Dual-extraction agreement
   * - Table structural integrity & empty cell ratio
   * - Column arithmetic (Total / Subtotal sum verification)
   */
  private static runSourceChecks(
    model: ReconstructedModel,
    collectedIssues: VerificationIssue[]
  ): void {
    const pageMap = new Map<number, PageExtraction>();
    for (const page of model.pages) {
      pageMap.set(page.pageNumber, page);
    }

    for (const table of model.tables) {
      // 1. Check Table Structural Integrity
      const emptyCells = table.cells.filter((c) => !c.rawText || c.rawText.trim() === '');
      const emptyRatio = table.cells.length > 0 ? emptyCells.length / table.cells.length : 0;

      if (emptyRatio > 0.75 && table.cells.length > 8) {
        const issue: VerificationIssue = {
          id: `iss_struct_${table.id}`,
          category: 'structural_anomaly',
          severity: 'warning',
          message: `نسبة الخلايا الفارغة في هذا الجدول مرتفعة جداً (${Math.round(emptyRatio * 100)}%)، يرجى التأكد من اكتمال الصفوف والأعمدة.`,
          evidence: {
            cellAddress: `${table.sheetName}!A1`,
          },
        };
        table.issues.push(issue);
        collectedIssues.push(issue);
      }

      // 2. Cell-by-Cell Ground Truth Source Checks
      for (const cell of table.cells) {
        const page = pageMap.get(cell.pageNumber);
        if (!page) continue;

        // If page was scanned, ground truth text layer is absent
        if (page.classification === 'scanned') {
          const issue: VerificationIssue = {
            id: `iss_scan_${cell.id}`,
            category: 'low_confidence_source',
            severity: 'warning',
            message: 'الصفحة ممسوحة ضوئياً ولا تحتوي على طبقة نصية أصلية للتحقق منها، يتم الاعتماد فقط على القراءة البصرية للنموذج.',
            evidence: {
              bbox: cell.bbox,
              extractedText: cell.rawText,
            },
          };
          cell.issues.push(issue);
          collectedIssues.push(issue);
          continue;
        }

        // For Native and Mixed pages: Check cell text against native text layer
        if (cell.rawText && cell.rawText.trim().length > 0) {
          const nativeMatches = this.findOverlappingNativeText(cell.bbox, page.nativeItems);
          const cellNorm = normalizeForComparison(cell.rawText);

          // If numeric or date value, mandatory check: must exist in native text items near bbox
          if (cell.valueType === 'number' || cell.valueType === 'date' || cell.valueType === 'currency') {
            const cleanDigits = convertArabicIndicDigits(cell.rawText).replace(/[^0-9.]/g, '');

            const foundInNative = nativeMatches.some((item) => {
              const itemNorm = normalizeForComparison(item.text);
              const itemDigits = convertArabicIndicDigits(item.text).replace(/[^0-9.]/g, '');
              return itemNorm.includes(cellNorm) || (cleanDigits.length >= 2 && itemDigits.includes(cleanDigits));
            });

            if (!foundInNative && nativeMatches.length > 0) {
              const combinedNative = nativeMatches.map((m) => m.text).join(' ');
              const issue: VerificationIssue = {
                id: `iss_mismatch_${cell.id}`,
                category: 'source_mismatch',
                severity: 'warning',
                message: `القيمة المستخرجة ("${cell.rawText}") لم يتم العثور عليها في طبقة النص الأصلية بنفس الموقع. النص الأصلي المقابل: "${combinedNative}".`,
                evidence: {
                  bbox: cell.bbox,
                  sourceText: combinedNative,
                  extractedText: cell.rawText,
                },
              };
              cell.issues.push(issue);
              collectedIssues.push(issue);
            }
          }

          // Dual-extraction agreement check
          if (nativeMatches.length > 0) {
            const combinedNativeNorm = normalizeForComparison(nativeMatches.map((m) => m.text).join(' '));
            // Check similarity
            if (combinedNativeNorm.length > 0 && !combinedNativeNorm.includes(cellNorm) && !cellNorm.includes(combinedNativeNorm)) {
              // Disagreement between Gemini visual OCR and PDF.js native text
              const issue: VerificationIssue = {
                id: `iss_dual_${cell.id}`,
                category: 'dual_disagreement',
                severity: 'warning',
                message: `اختلاف في القراءة: طبقة النص تظهر "${nativeMatches.map((m) => m.text).join(' ')}"، بينما استخرج النموذج "${cell.rawText}".`,
                evidence: {
                  bbox: cell.bbox,
                  sourceText: nativeMatches.map((m) => m.text).join(' '),
                  extractedText: cell.rawText,
                },
              };
              cell.issues.push(issue);
              collectedIssues.push(issue);
            }
          }
        }
      }

      // 3. Arithmetic Verification (Total & Subtotal columns)
      this.verifyArithmetic(table, collectedIssues);
    }
  }

  /**
   * Verifies total rows against the sum of preceding numeric cells.
   */
  private static verifyArithmetic(
    table: ReconstructedTable,
    collectedIssues: VerificationIssue[]
  ): void {
    // Look for total rows (either marked isTotalRow or containing 'الإجمالي' / 'المجموع' / 'Total')
    for (let r = 1; r < table.rowCount; r++) {
      const rowCells = table.cells.filter((c) => c.row === r);
      const isTotalRow =
        rowCells.some((c) => c.isTotalRow) ||
        rowCells.some((c) => {
          const norm = normalizeForComparison(c.rawText);
          return norm.includes('اجمالي') || norm.includes('مجموع') || norm.includes('total');
        });

      if (!isTotalRow) continue;

      // For every column that has a number in this total row, sum the numbers in rows 0..r-1
      for (const totalCell of rowCells) {
        if (typeof totalCell.typedValue !== 'number') continue;

        const expectedTotal = totalCell.typedValue;
        const colIndex = totalCell.col;

        // Sum column values above
        let calculatedSum = 0;
        let numericCellCount = 0;

        for (let prevRow = 0; prevRow < r; prevRow++) {
          const prevCell = table.grid[prevRow]?.[colIndex];
          if (prevCell && typeof prevCell.typedValue === 'number' && !prevCell.isHeader) {
            calculatedSum += prevCell.typedValue;
            numericCellCount++;
          }
        }

        if (numericCellCount >= 2) {
          const diff = Math.abs(calculatedSum - expectedTotal);
          // Allow rounding tolerance of 0.05
          if (diff > 0.05) {
            const issue: VerificationIssue = {
              id: `iss_arith_${totalCell.id}`,
              category: 'arithmetic_error',
              severity: 'error',
              message: `عدم تطابق حسابي في الإجمالي: القيمة المدونة "${expectedTotal}" تختلف عن ناتج جمع خلايا العمود أعلاه ("${calculatedSum.toFixed(2)}"، الفرق: ${diff.toFixed(2)}).`,
              evidence: {
                bbox: totalCell.bbox,
                expectedSum: expectedTotal,
                calculatedSum: parseFloat(calculatedSum.toFixed(2)),
                cellAddress: `${table.sheetName}!C${colIndex + 1}R${r + 1}`,
              },
            };
            totalCell.issues.push(issue);
            collectedIssues.push(issue);
          }
        }
      }
    }
  }

  /**
   * 4B. Exported-File Checks:
   * Re-reads the generated .xlsx bytes from scratch using ExcelJS,
   * comparing every single cell against the Reconstructed Model.
   */
  private static async runExportFileChecks(
    model: ReconstructedModel,
    exportedDataBuffer: Uint8Array,
    collectedIssues: VerificationIssue[]
  ): Promise<void> {
    const workbook = new ExcelJS.Workbook();
    try {
      await workbook.xlsx.load(exportedDataBuffer as any);
    } catch (err: any) {
      const fatalIssue: VerificationIssue = {
        id: 'iss_wb_load_fail',
        category: 'export_difference',
        severity: 'error',
        message: `فشل إعادة قراءة ملف الإكسل المصدر: ${err?.message || err}`,
        evidence: {},
      };
      collectedIssues.push(fatalIssue);
      return;
    }

    // Verify worksheet count
    if (workbook.worksheets.length !== model.tables.length) {
      const issue: VerificationIssue = {
        id: 'iss_sheet_count_mismatch',
        category: 'export_difference',
        severity: 'error',
        message: `اختلاف عدد أوراق العمل: في النموذج ${model.tables.length} وفي الإكسل ${workbook.worksheets.length}.`,
        evidence: {
          modelValue: model.tables.length,
          exportedValue: workbook.worksheets.length,
        },
      };
      collectedIssues.push(issue);
    }

    // Compare table by table and cell by cell
    for (let tIdx = 0; tIdx < model.tables.length; tIdx++) {
      const table = model.tables[tIdx];
      const sheet = workbook.worksheets[tIdx];

      if (!sheet) {
        const issue: VerificationIssue = {
          id: `iss_missing_sheet_${table.id}`,
          category: 'export_difference',
          severity: 'error',
          message: `ورقة العمل الخاصة بالجدول "${table.sheetName}" مفقودة في ملف الإكسل المصدر.`,
          evidence: {
            cellAddress: `${table.sheetName}`,
          },
        };
        table.issues.push(issue);
        collectedIssues.push(issue);
        continue;
      }

      // Check RTL view setting
      const firstView = sheet.views && (sheet.views[0] as any);
      const sheetIsRTL = Boolean(firstView?.rightToLeft || firstView?.rtl);
      if (sheetIsRTL !== table.isRTL) {
        const issue: VerificationIssue = {
          id: `iss_rtl_${table.id}`,
          category: 'export_difference',
          severity: 'warning',
          message: `اتجاه ورقة العمل في الإكسل (${sheetIsRTL ? 'RTL' : 'LTR'}) لا يطابق اتجاه النموذج (${table.isRTL ? 'RTL' : 'LTR'}).`,
          evidence: {
            modelValue: table.isRTL ? 'RTL' : 'LTR',
            exportedValue: sheetIsRTL ? 'RTL' : 'LTR',
          },
        };
        table.issues.push(issue);
        collectedIssues.push(issue);
      }

      // Check every cell in the table
      for (const cell of table.cells) {
        const r = cell.row + 1;
        const c = cell.col + 1;
        const colLetter = String.fromCharCode(64 + c);
        const cellAddress = `${sheet.name}!${colLetter}${r}`;
        const excelCell = sheet.getCell(r, c);

        const exportedVal = excelCell.value;

        // Check Type & Value Integrity
        if (cell.typedValue !== null && cell.typedValue !== undefined && cell.rawText.trim() !== '') {
          // 1. Check if string with leading zero was preserved as text
          if (cell.valueType === 'text') {
            const strVal = exportedVal === null || exportedVal === undefined ? '' : String(exportedVal);
            if (strVal !== String(cell.typedValue)) {
              const issue: VerificationIssue = {
                id: `iss_val_${cell.id}`,
                category: 'export_difference',
                severity: 'error',
                message: `فارق في قيمة النص: القيمة في النموذج "${cell.typedValue}"، بينما في الإكسل المصدر "${strVal}".`,
                evidence: {
                  cellAddress,
                  modelValue: cell.typedValue,
                  exportedValue: strVal,
                  modelType: 'text',
                  exportedType: typeof exportedVal,
                },
              };
              cell.issues.push(issue);
              collectedIssues.push(issue);
            }
          } else if (cell.valueType === 'number' || cell.valueType === 'currency' || cell.valueType === 'percentage') {
            // Check number type preservation
            if (typeof exportedVal !== 'number') {
              const issue: VerificationIssue = {
                id: `iss_type_${cell.id}`,
                category: 'export_difference',
                severity: 'error',
                message: `فقدان النوع الرقمي: الخلية كانت رقم (${cell.typedValue}) وتحولت إلى نوع (${typeof exportedVal}) بقيمة "${exportedVal}".`,
                evidence: {
                  cellAddress,
                  modelValue: cell.typedValue,
                  exportedValue: exportedVal,
                  modelType: cell.valueType,
                  exportedType: typeof exportedVal,
                },
              };
              cell.issues.push(issue);
              collectedIssues.push(issue);
            } else {
              // Compare numeric precision
              const numDiff = Math.abs(exportedVal - (cell.typedValue as number));
              if (numDiff > 0.0001) {
                const issue: VerificationIssue = {
                  id: `iss_numdiff_${cell.id}`,
                  category: 'export_difference',
                  severity: 'error',
                  message: `فارق في دقة الرقم: القيمة الأصلية ${cell.typedValue} وأصبحت في الإكسل ${exportedVal}.`,
                  evidence: {
                    cellAddress,
                    modelValue: cell.typedValue,
                    exportedValue: exportedVal,
                  },
                };
                cell.issues.push(issue);
                collectedIssues.push(issue);
              }
            }
          }
        }
      }
    }
  }

  /**
   * Finds native text items whose bounding box overlaps or is adjacent to cell bbox.
   */
  private static findOverlappingNativeText(
    cellBbox: BoundingBox,
    nativeItems: { text: string; bbox: BoundingBox }[]
  ): { text: string; bbox: BoundingBox }[] {
    const margin = 20; // 2% tolerance margin
    return nativeItems.filter((item) => {
      const noOverlap =
        item.bbox.xmax < cellBbox.xmin - margin ||
        item.bbox.xmin > cellBbox.xmax + margin ||
        item.bbox.ymax < cellBbox.ymin - margin ||
        item.bbox.ymin > cellBbox.ymax + margin;
      return !noOverlap;
    });
  }
}
