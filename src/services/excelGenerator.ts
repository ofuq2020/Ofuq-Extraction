import ExcelJS from 'exceljs';
import { ReconstructedModel, ReconstructedTable, VerificationIssue } from '../types';

/**
 * Excel Generation & Final Delivery Engine.
 * Implements Stage 3 (pure DATA cells only) and Stage 5 (Non-data styling, notes, and audit report).
 */
export class ExcelGenerator {
  /**
   * Stage 3: Pure data Excel generation.
   * NO highlights, NO comments, NO report sheet. Only raw data, typed values, and merges.
   */
  public static async generateDataWorkbook(model: ReconstructedModel): Promise<Uint8Array> {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Ofuq Extraction Engine';
    workbook.lastModifiedBy = 'Ofuq Extraction Engine';
    workbook.created = new Date();
    workbook.modified = new Date();

    if (model.tables.length === 0) {
      const emptySheet = workbook.addWorksheet('بيانات المستند');
      (emptySheet.views as any) = [{ rightToLeft: true, rtl: true }];
      emptySheet.getCell('A1').value = 'لم يتم رصد جداول قابلة للاستخراج في هذا المستند';
    }

    for (let tIdx = 0; tIdx < model.tables.length; tIdx++) {
      const table = model.tables[tIdx];
      const sheetName = this.sanitizeSheetName(table.sheetName || `Table_${tIdx + 1}`, tIdx);
      const sheet = workbook.addWorksheet(sheetName);

      // Set RTL view when table is Arabic
      (sheet.views as any) = [{ rightToLeft: table.isRTL, rtl: table.isRTL }];

      // Populate pure data cells
      for (const cell of table.cells) {
        const excelRow = cell.row + 1;
        const excelCol = cell.col + 1;
        const excelCell = sheet.getCell(excelRow, excelCol);

        // Assign typed value directly
        if (cell.typedValue !== null && cell.typedValue !== undefined) {
          if (cell.valueType === 'number') {
            excelCell.value = cell.typedValue as number;
            excelCell.numFmt = '#,##0.00';
          } else if (cell.valueType === 'percentage') {
            excelCell.value = cell.typedValue as number;
            excelCell.numFmt = '0.00%';
          } else if (cell.valueType === 'currency') {
            excelCell.value = cell.typedValue as number;
            excelCell.numFmt = '#,##0.00 "SAR"';
          } else if (cell.valueType === 'date') {
            excelCell.value = cell.typedValue as Date;
            excelCell.numFmt = 'yyyy-mm-dd';
          } else {
            // Text - strictly preserved as string
            excelCell.value = String(cell.typedValue);
          }
        } else {
          excelCell.value = '';
        }

        // Apply cell merges if multi-row or multi-col
        if (cell.rowSpan > 1 || cell.colSpan > 1) {
          try {
            sheet.mergeCells(
              excelRow,
              excelCol,
              excelRow + cell.rowSpan - 1,
              excelCol + cell.colSpan - 1
            );
          } catch {
            // Skip merge if already merged or overlapping
          }
        }
      }

      // Auto-fit column widths
      this.adjustColumnWidths(sheet, table);
    }

    const buffer = await workbook.xlsx.writeBuffer();
    return new Uint8Array(buffer);
  }

  /**
   * Stage 5: Final Delivery.
   * Injects non-data layer (highlighting, comments/notes, and Verification Report sheet)
   * into the verified workbook, then re-verifies that no DATA cells changed.
   */
  public static async generateFinalWorkbook(
    model: ReconstructedModel,
    dataOnlyBuffer: Uint8Array
  ): Promise<{
    finalBuffer: Uint8Array;
    noDataMutationConfirmed: boolean;
    mutationErrors: string[];
  }> {
    // Load fresh copy of data workbook to ensure clean starting state
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(dataOnlyBuffer as any);

    // 1. Add "Verification Report" / "تقرير التحقق والمطابقة" as Sheet 1
    const reportSheet = workbook.addWorksheet('تقرير التحقق والمطابقة');
    (reportSheet.views as any) = [{ rightToLeft: true, rtl: true }];
    // Move report sheet to the very first position
    (workbook.views as any) = [{ x: 0, y: 0, width: 10000, height: 20000, firstSheet: 0, activeTab: 0, visibility: 'visible' }];

    this.buildVerificationReportSheet(reportSheet, model);

    // 2. Add visual highlights and notes to data sheets
    for (let tIdx = 0; tIdx < model.tables.length; tIdx++) {
      const table = model.tables[tIdx];
      const sheetName = this.sanitizeSheetName(table.sheetName || `Table_${tIdx + 1}`, tIdx);
      const sheet = workbook.getWorksheet(sheetName);
      if (!sheet) continue;

      for (const cell of table.cells) {
        const excelRow = cell.row + 1;
        const excelCol = cell.col + 1;
        const excelCell = sheet.getCell(excelRow, excelCol);

        // Header styling
        if (cell.isHeader) {
          excelCell.font = { bold: true, color: { argb: 'FF1E293B' }, name: 'Segoe UI' };
          excelCell.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FFF1F5F9' },
          };
          excelCell.alignment = {
            vertical: 'middle',
            horizontal: table.isRTL ? 'right' : 'left',
          };
        }

        // Total row styling
        if (cell.isTotalRow) {
          excelCell.font = { bold: true, color: { argb: 'FF0F172A' }, name: 'Segoe UI' };
          excelCell.border = {
            top: { style: 'thin', color: { argb: 'FF94A3B8' } },
            bottom: { style: 'double', color: { argb: 'FF475569' } },
          };
        }

        // Highlight based on Verification status
        if (cell.status === 'review_required') {
          // Amber highlight
          excelCell.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FFFFFBEB' }, // Amber-50
          };
          excelCell.border = {
            top: { style: 'medium', color: { argb: 'FFF59E0B' } },
            bottom: { style: 'medium', color: { argb: 'FFF59E0B' } },
            left: { style: 'medium', color: { argb: 'FFF59E0B' } },
            right: { style: 'medium', color: { argb: 'FFF59E0B' } },
          };
        } else if (cell.status === 'low_confidence') {
          // Rose/Red highlight
          excelCell.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FFFFF1F2' }, // Rose-50
          };
          excelCell.border = {
            top: { style: 'medium', color: { argb: 'FFE11D48' } },
            bottom: { style: 'medium', color: { argb: 'FFE11D48' } },
            left: { style: 'medium', color: { argb: 'FFE11D48' } },
            right: { style: 'medium', color: { argb: 'FFE11D48' } },
          };
        }

        // Add note/comment explaining flags
        if (cell.issues.length > 0) {
          const noteText = cell.issues
            .map((iss, i) => `[تنبيه ${i + 1}] ${iss.message}`)
            .join('\n');
          excelCell.note = noteText;
        } else if (cell.isUserEdited) {
          excelCell.note = 'تم التحقق والتعديل يدوياً من قبل المستخدم';
        }
      }
    }

    const finalBufferRaw = await workbook.xlsx.writeBuffer();
    const finalBuffer = new Uint8Array(finalBufferRaw);

    // 3. Mandatory Stage 5 Re-read Check:
    // Confirm no DATA cell changed during styling/note injection
    const verificationCheck = await this.verifyNoDataMutation(dataOnlyBuffer, finalBuffer, model);

    return {
      finalBuffer,
      noDataMutationConfirmed: verificationCheck.passed,
      mutationErrors: verificationCheck.errors,
    };
  }

  /**
   * Re-reads final file to ensure no data cell was mutated by formatting or notes.
   */
  private static async verifyNoDataMutation(
    dataOnlyBuffer: Uint8Array,
    finalBuffer: Uint8Array,
    model: ReconstructedModel
  ): Promise<{ passed: boolean; errors: string[] }> {
    const wb1 = new ExcelJS.Workbook();
    const wb2 = new ExcelJS.Workbook();
    await wb1.xlsx.load(dataOnlyBuffer as any);
    await wb2.xlsx.load(finalBuffer as any);

    const errors: string[] = [];

    for (let tIdx = 0; tIdx < model.tables.length; tIdx++) {
      const table = model.tables[tIdx];
      const sheetName = this.sanitizeSheetName(table.sheetName || `Table_${tIdx + 1}`, tIdx);
      const s1 = wb1.getWorksheet(sheetName);
      const s2 = wb2.getWorksheet(sheetName);

      if (!s1 || !s2) continue;

      for (const cell of table.cells) {
        const r = cell.row + 1;
        const c = cell.col + 1;
        const v1 = s1.getCell(r, c).value;
        const v2 = s2.getCell(r, c).value;

        const str1 = v1 === null || v1 === undefined ? '' : String(v1);
        const str2 = v2 === null || v2 === undefined ? '' : String(v2);

        if (str1 !== str2) {
          errors.push(
            `تحول قيمة الخلية ${sheetName}!R${r}C${c}: كانت "${str1}" وأصبحت "${str2}" بعد إضافة التنسيقات.`
          );
        }
      }
    }

    return {
      passed: errors.length === 0,
      errors,
    };
  }

  /**
   * Constructs the structured Verification Report sheet.
   */
  private static buildVerificationReportSheet(
    sheet: ExcelJS.Worksheet,
    model: ReconstructedModel
  ): void {
    // Title
    sheet.getCell('A1').value = 'تقرير التحقق والمطابقة الشامل (Verification Report)';
    sheet.getCell('A1').font = { size: 16, bold: true, color: { argb: 'FF0F172A' } };
    sheet.getCell('A2').value = `الملف: ${model.metadata.filename} | تاريخ المعالجة: ${new Date(model.metadata.processedAt).toLocaleString('ar-SA')} | النموذج: ${model.metadata.modelUsed}`;
    sheet.getCell('A2').font = { size: 10, color: { argb: 'FF64748B' } };

    // KPI Summary Table
    sheet.getCell('A4').value = 'المؤشر';
    sheet.getCell('B4').value = 'العدد';
    sheet.getCell('C4').value = 'النسبة';
    sheet.getRow(4).font = { bold: true };
    sheet.getRow(4).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFE2E8F0' },
    };

    const total = model.summary.totalCells || 1;
    const verified = model.summary.verifiedCount;
    const review = model.summary.reviewCount;
    const lowConf = model.summary.lowConfidenceCount;
    const exportIssues = model.summary.exportIssuesCount;

    const kpiRows = [
      ['إجمالي الخلايا المستخرجة', total, '100%'],
      ['خلايا تم التحقق منها بنجاح (Verified)', verified, `${Math.round((verified / total) * 100)}%`],
      ['خلايا تحتاج مراجعة بشرية (Review Required)', review, `${Math.round((review / total) * 100)}%`],
      ['خلايا منخفضة الثقة / مسح ضوئي (Low Confidence)', lowConf, `${Math.round((lowConf / total) * 100)}%`],
      ['فروقات ملف الإكسل المصدر (Export Issues - Stage 4B)', exportIssues, '-'],
    ];

    kpiRows.forEach((row, idx) => {
      const r = 5 + idx;
      sheet.getCell(`A${r}`).value = row[0];
      sheet.getCell(`B${r}`).value = row[1];
      sheet.getCell(`C${r}`).value = row[2];

      if (idx === 1) {
        sheet.getCell(`B${r}`).font = { color: { argb: 'FF16A34A' }, bold: true };
      } else if (idx === 2) {
        sheet.getCell(`B${r}`).font = { color: { argb: 'FFD97706' }, bold: true };
      } else if (idx === 3) {
        sheet.getCell(`B${r}`).font = { color: { argb: 'FFDC2626' }, bold: true };
      } else if (idx === 4 && exportIssues > 0) {
        sheet.getCell(`B${r}`).font = { color: { argb: 'FF7C3AED' }, bold: true };
      }
    });

    // Issues Audit Trail Table
    const startTableR = 12;
    sheet.getCell(`A${startTableR}`).value = 'سجل الملاحظات والفروقات المكتشفة (Audit Trail Log)';
    sheet.getCell(`A${startTableR}`).font = { size: 13, bold: true };

    const headers = ['الجدول', 'عنوان الخلية', 'نوع الملاحظة', 'مستوى الأهمية', 'البيان والسبب', 'الدليل المصدري'];
    headers.forEach((h, i) => {
      const colLetter = String.fromCharCode(65 + i);
      const c = sheet.getCell(`${colLetter}${startTableR + 1}`);
      c.value = h;
      c.font = { bold: true };
      c.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFCBD5E1' },
      };
    });

    let currentLogR = startTableR + 2;

    for (const table of model.tables) {
      for (const cell of table.cells) {
        for (const iss of cell.issues) {
          const colLetter = String.fromCharCode(65 + cell.col);
          const cellAddr = `${colLetter}${cell.row + 1}`;

          sheet.getCell(`A${currentLogR}`).value = table.sheetName;
          sheet.getCell(`B${currentLogR}`).value = cellAddr;
          sheet.getCell(`C${currentLogR}`).value = this.getCategoryLabelAr(iss.category);
          sheet.getCell(`D${currentLogR}`).value = iss.severity === 'error' ? 'خطأ' : 'تحذير';
          sheet.getCell(`E${currentLogR}`).value = iss.message;

          let evidenceStr = '';
          if (iss.evidence.sourceText !== undefined) {
            evidenceStr = `المصدر: "${iss.evidence.sourceText}" | المستخرج: "${iss.evidence.extractedText || ''}"`;
          } else if (iss.evidence.cellAddress) {
            evidenceStr = `الإكسل: "${iss.evidence.exportedValue}" (${iss.evidence.exportedType}) | النموذج: "${iss.evidence.modelValue}" (${iss.evidence.modelType})`;
          } else if (iss.evidence.bbox) {
            evidenceStr = `إحداثيات المربع: [ymin:${iss.evidence.bbox.ymin}, xmin:${iss.evidence.bbox.xmin}]`;
          }
          sheet.getCell(`F${currentLogR}`).value = evidenceStr;

          currentLogR++;
        }
      }
    }

    if (currentLogR === startTableR + 2) {
      sheet.getCell(`A${currentLogR}`).value = 'لم يتم رصد أي أخطاء أو فروقات، جميع الفحوصات اجتازت بنجاح.';
      sheet.getCell(`A${currentLogR}`).font = { italic: true, color: { argb: 'FF16A34A' } };
    }

    // Set column widths for report sheet
    sheet.getColumn(1).width = 28;
    sheet.getColumn(2).width = 16;
    sheet.getColumn(3).width = 22;
    sheet.getColumn(4).width = 16;
    sheet.getColumn(5).width = 45;
    sheet.getColumn(6).width = 40;
  }

  private static sanitizeSheetName(name: string, index: number): string {
    // Excel sheet name restrictions: max 31 chars, no : \ / ? * [ ]
    let clean = name.replace(/[:\\/?*\[\]]/g, '').trim();
    if (clean.length > 28) clean = clean.substring(0, 28);
    return clean || `Sheet${index + 1}`;
  }

  private static adjustColumnWidths(sheet: ExcelJS.Worksheet, table: ReconstructedTable): void {
    for (let c = 1; c <= table.colCount; c++) {
      let maxLen = 10;
      sheet.getColumn(c).eachCell({ includeEmpty: false }, (cell) => {
        const valStr = cell.value ? String(cell.value) : '';
        if (valStr.length > maxLen) {
          maxLen = Math.min(valStr.length + 3, 50);
        }
      });
      sheet.getColumn(c).width = maxLen;
    }
  }

  private static getCategoryLabelAr(cat: string): string {
    switch (cat) {
      case 'source_mismatch':
        return 'عدم تطابق مع النص الأصلي';
      case 'dual_disagreement':
        return 'اختلاف بين محركي الاستخراج';
      case 'arithmetic_error':
        return 'خطأ في عملية الجمع / الإجمالي';
      case 'structural_anomaly':
        return 'خلل في بنية الجدول / فراغ عالي';
      case 'export_difference':
        return 'فارق بين النموذج وملف الإكسل';
      case 'low_confidence_source':
        return 'صفحة ممسوحة ضوئياً (ثقة منخفضة)';
      default:
        return cat;
    }
  }
}
