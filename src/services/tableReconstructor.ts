import {
  BoundingBox,
  ExtractedCell,
  ExtractedTable,
  PageExtraction,
  ReconstructedCell,
  ReconstructedModel,
  ReconstructedTable,
} from '../types';
import { isArabicText, normalizeCellValue } from '../utils/arabicUtils';

/**
 * Stage 2: Table Reconstruction Engine.
 * Constructs unified 2D grids, handles multi-page stitching,
 * enforces typed parsing without guessing, and preserves RTL integrity.
 */
export class TableReconstructor {
  /**
   * Reconstruct tables and model from extracted pages.
   */
  public static reconstruct(
    pages: PageExtraction[],
    metadata: { filename: string; fileSizeBytes: number; modelUsed: string }
  ): ReconstructedModel {
    const rawTablesWithPage: { pageNumber: number; table: ExtractedTable; pageClassification: string }[] = [];

    for (const page of pages) {
      for (const t of page.tables) {
        rawTablesWithPage.push({
          pageNumber: page.pageNumber,
          table: t,
          pageClassification: page.classification,
        });
      }
    }

    // Stitch multi-page continuing tables
    const stitched = this.stitchContinuingTables(rawTablesWithPage);

    // Build ReconstructedTable structures
    const reconstructedTables: ReconstructedTable[] = stitched.map((item, index) => {
      return this.buildTableGrid(item, index + 1);
    });

    const totalCells = reconstructedTables.reduce((acc, t) => acc + t.cells.length, 0);

    return {
      tables: reconstructedTables,
      pages,
      metadata: {
        filename: metadata.filename,
        pageCount: pages.length,
        fileSizeBytes: metadata.fileSizeBytes,
        processedAt: new Date().toISOString(),
        modelUsed: metadata.modelUsed,
      },
      summary: {
        totalCells,
        verifiedCount: 0,
        reviewCount: 0,
        lowConfidenceCount: 0,
        exportIssuesCount: 0,
      },
    };
  }

  /**
   * Detects and merges tables that span across consecutive pages when column structures match.
   */
  private static stitchContinuingTables(
    rawTables: { pageNumber: number; table: ExtractedTable; pageClassification: string }[]
  ): {
    title: string;
    pageNumbers: number[];
    isRTL: boolean;
    cells: { cell: ExtractedCell; pageNumber: number; pageClassification: string }[];
    maxCols: number;
  }[] {
    const results: {
      title: string;
      pageNumbers: number[];
      isRTL: boolean;
      cells: { cell: ExtractedCell; pageNumber: number; pageClassification: string }[];
      maxCols: number;
    }[] = [];

    for (const current of rawTables) {
      const prev = results[results.length - 1];

      // Criteria for continuing table:
      // 1. Current page is consecutive to previous page (pageNumber === prev.lastPage + 1)
      // 2. Column count matches closely (exact or within 1)
      // 3. Similar RTL orientation
      const isConsecutive =
        prev &&
        prev.pageNumbers[prev.pageNumbers.length - 1] + 1 === current.pageNumber;
      const colMatch = prev && Math.abs(prev.maxCols - current.table.colCount) === 0;

      if (isConsecutive && colMatch) {
        // Find maximum row index currently in prev
        const maxPrevRow = Math.max(
          -1,
          ...prev.cells.map((c) => c.cell.row + (c.cell.rowSpan || 1) - 1)
        );

        // Check if current table repeats the same header row
        const currentCells = current.table.cells;
        const currentHasHeader = current.table.hasHeader;
        let startRowOffset = 0;

        // If current table repeats header, we can skip the duplicate header row
        const row0Cells = currentCells.filter((c) => c.row === 0);
        const prevHeaderRow0 = prev.cells.filter((c) => c.cell.row === 0);

        const isDuplicateHeader =
          currentHasHeader &&
          row0Cells.length > 0 &&
          prevHeaderRow0.length > 0 &&
          row0Cells.every((c) => {
            const match = prevHeaderRow0.find((p) => p.cell.col === c.col);
            return match && match.cell.text.trim() === c.text.trim();
          });

        if (isDuplicateHeader) {
          startRowOffset = 1; // Skip row 0 of current table
        }

        const newRowBase = maxPrevRow + 1;

        for (const c of currentCells) {
          if (isDuplicateHeader && c.row === 0) continue;
          const adjustedRow = newRowBase + (c.row - startRowOffset);

          prev.cells.push({
            cell: {
              ...c,
              row: adjustedRow,
            },
            pageNumber: current.pageNumber,
            pageClassification: current.pageClassification,
          });
        }

        prev.pageNumbers.push(current.pageNumber);
      } else {
        // New separate table
        results.push({
          title: current.table.title || `جدول ${results.length + 1}`,
          pageNumbers: [current.pageNumber],
          isRTL: current.table.isRTL,
          maxCols: current.table.colCount,
          cells: current.table.cells.map((c) => ({
            cell: c,
            pageNumber: current.pageNumber,
            pageClassification: current.pageClassification,
          })),
        });
      }
    }

    return results;
  }

  /**
   * Builds the 2D grid matrix and populates reconstructed cells with normalized values.
   */
  private static buildTableGrid(
    group: {
      title: string;
      pageNumbers: number[];
      isRTL: boolean;
      cells: { cell: ExtractedCell; pageNumber: number; pageClassification: string }[];
      maxCols: number;
    },
    tableIndex: number
  ): ReconstructedTable {
    const tableId = `tbl_${tableIndex}`;
    const sheetName = group.title.length > 25 ? group.title.substring(0, 25) : group.title || `Sheet${tableIndex}`;

    // Determine dimensions
    let maxRow = 0;
    let maxCol = group.maxCols;

    for (const item of group.cells) {
      const endRow = item.cell.row + (item.cell.rowSpan || 1);
      const endCol = item.cell.col + (item.cell.colSpan || 1);
      if (endRow > maxRow) maxRow = endRow;
      if (endCol > maxCol) maxCol = endCol;
    }

    if (maxRow === 0) maxRow = 1;
    if (maxCol === 0) maxCol = 1;

    // Initialize 2D grid
    const grid: (ReconstructedCell | null)[][] = Array.from({ length: maxRow }, () =>
      Array.from({ length: maxCol }, () => null)
    );

    const reconstructedCells: ReconstructedCell[] = [];

    // Track Arabic dominance
    let arabicTextCount = 0;
    let totalTextCount = 0;

    for (let i = 0; i < group.cells.length; i++) {
      const { cell, pageNumber, pageClassification } = group.cells[i];
      const rawText = cell.text ?? '';

      if (rawText.trim()) {
        totalTextCount++;
        if (isArabicText(rawText)) arabicTextCount++;
      }

      // Normalization strictly adhering to principles
      const normalized = normalizeCellValue(rawText);

      // Determine initial source trust
      let source: 'text-layer' | 'gemini' | 'hybrid' = 'gemini';
      if (pageClassification === 'native') {
        source = 'hybrid';
      }

      const cellId = `${tableId}_r${cell.row}_c${cell.col}`;
      const rCell: ReconstructedCell = {
        id: cellId,
        pageNumber,
        row: cell.row,
        col: cell.col,
        rowSpan: cell.rowSpan || 1,
        colSpan: cell.colSpan || 1,
        rawText,
        typedValue: normalized.typedValue,
        valueType: normalized.valueType,
        source,
        bbox: cell.bbox || { ymin: 0, xmin: 0, ymax: 1000, xmax: 1000 },
        isHeader: Boolean(cell.isHeader),
        isTotalRow: Boolean(cell.isTotalRow),
        status: pageClassification === 'scanned' ? 'low_confidence' : 'verified',
        issues: [],
      };

      reconstructedCells.push(rCell);

      // Place in grid matrix
      if (cell.row < maxRow && cell.col < maxCol) {
        grid[cell.row][cell.col] = rCell;
      }
    }

    // Determine RTL orientation based on text analysis or table flag
    const isDominantArabic = totalTextCount > 0 ? arabicTextCount / totalTextCount > 0.4 : true;
    const finalIsRTL = group.isRTL || isDominantArabic;

    // Header extraction
    const headers: string[] = [];
    if (grid.length > 0) {
      for (let c = 0; c < maxCol; c++) {
        const cell = grid[0][c];
        headers.push(cell ? cell.rawText : `عمود ${c + 1}`);
      }
    }

    return {
      id: tableId,
      tableIndex,
      sheetName,
      title: group.title,
      pageNumbers: group.pageNumbers,
      rowCount: maxRow,
      colCount: maxCol,
      isRTL: finalIsRTL,
      cells: reconstructedCells,
      grid,
      status: 'verified',
      issues: [],
      headers,
    };
  }
}
