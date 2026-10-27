import React, { useState } from 'react';
import {
  ReconstructedCell,
  ReconstructedTable,
  VerificationIssue,
} from '../types';
import {
  AlertTriangle,
  CheckCircle2,
  HelpCircle,
  Edit2,
  FileSpreadsheet,
  Check,
  X,
  Filter,
} from 'lucide-react';
import { Language, translations } from '../locales/translations';

interface TableGridProps {
  tables: ReconstructedTable[];
  selectedTableIndex: number;
  onSelectTableIndex: (index: number) => void;
  selectedCell: ReconstructedCell | null;
  onSelectCell: (cell: ReconstructedCell) => void;
  onUpdateCellValue: (tableId: string, cellId: string, newValue: string) => void;
  filterIssuesOnly: boolean;
  onToggleFilterIssues: () => void;
  lang: Language;
}

export const TableGrid: React.FC<TableGridProps> = ({
  tables,
  selectedTableIndex,
  onSelectTableIndex,
  selectedCell,
  onSelectCell,
  onUpdateCellValue,
  filterIssuesOnly,
  onToggleFilterIssues,
  lang,
}) => {
  const t = translations[lang];
  const [editingCell, setEditingCell] = useState<ReconstructedCell | null>(null);
  const [editValue, setEditValue] = useState<string>('');

  const currentTable = tables[selectedTableIndex] || tables[0];

  if (!currentTable) {
    return (
      <div className="h-full flex items-center justify-center p-8 bg-slate-50 border border-slate-200 rounded-2xl text-slate-400 text-xs">
        لا توجد جداول مستخرجة
      </div>
    );
  }

  const handleStartEdit = (cell: ReconstructedCell) => {
    setEditingCell(cell);
    setEditValue(cell.rawText);
  };

  const handleSaveEdit = () => {
    if (editingCell) {
      onUpdateCellValue(currentTable.id, editingCell.id, editValue);
      setEditingCell(null);
    }
  };

  const handleCancelEdit = () => {
    setEditingCell(null);
  };

  return (
    <div className="flex flex-col h-full bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-2xs">
      {/* Table Navigation & Filter Bar */}
      <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2 text-xs">
        {/* Sheet Tabs */}
        <div className="flex items-center gap-1.5 overflow-x-auto max-w-full py-0.5">
          {tables.map((tbl, idx) => (
            <button
              key={tbl.id}
              onClick={() => onSelectTableIndex(idx)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-medium transition-all text-xs shrink-0 ${
                selectedTableIndex === idx
                  ? 'bg-white text-emerald-800 border border-emerald-300 shadow-2xs font-bold'
                  : 'text-slate-600 hover:bg-slate-200/70 border border-transparent'
              }`}
            >
              <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
              <span>{tbl.sheetName}</span>
              {tbl.cells.some((c) => c.status !== 'verified') && (
                <span className="w-2 h-2 rounded-full bg-amber-500"></span>
              )}
            </button>
          ))}
        </div>

        {/* Filter Toggle */}
        <div className="flex items-center gap-2">
          <button
            onClick={onToggleFilterIssues}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-semibold transition-all ${
              filterIssuesOnly
                ? 'bg-amber-100/80 border-amber-300 text-amber-900'
                : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-100'
            }`}
          >
            <Filter className="w-3.5 h-3.5" />
            <span>{filterIssuesOnly ? t.filterIssues : t.filterAll}</span>
          </button>
        </div>
      </div>

      {/* Grid Table Container */}
      <div
        className="flex-1 overflow-auto bg-slate-100/40 p-4"
        dir={currentTable.isRTL ? 'rtl' : 'ltr'}
      >
        <div className="inline-block min-w-full align-middle bg-white rounded-xl shadow-xs border border-slate-200 overflow-hidden">
          <table className="min-w-full border-collapse text-xs">
            {/* Column Headers Letters (A, B, C...) */}
            <thead>
              <tr className="bg-slate-100 border-b border-slate-200">
                <th className="w-10 px-2 py-1.5 text-center font-mono text-[11px] text-slate-400 bg-slate-100/90 border-e border-slate-200 select-none">
                  #
                </th>
                {Array.from({ length: currentTable.colCount }, (_, cIdx) => (
                  <th
                    key={cIdx}
                    className="px-3 py-1.5 text-center font-mono text-[11px] text-slate-600 font-semibold border-e border-slate-200 select-none min-w-[110px]"
                  >
                    {String.fromCharCode(65 + cIdx)}
                  </th>
                ))}
              </tr>
            </thead>

            {/* Grid Rows */}
            <tbody className="divide-y divide-slate-200">
              {Array.from({ length: currentTable.rowCount }, (_, rIdx) => {
                // If filter is active, check if this row has issues
                const rowCells = currentTable.cells.filter((c) => c.row === rIdx);
                const rowHasIssues = rowCells.some((c) => c.status !== 'verified');
                if (filterIssuesOnly && !rowHasIssues) {
                  return null;
                }

                return (
                  <tr key={rIdx} className="hover:bg-slate-50/70 transition-colors">
                    {/* Row Number (1-based) */}
                    <td className="w-10 px-2 py-2 text-center font-mono text-[11px] text-slate-400 bg-slate-50 border-e border-slate-200 font-semibold select-none">
                      {rIdx + 1}
                    </td>

                    {/* Columns in Row */}
                    {Array.from({ length: currentTable.colCount }, (_, cIdx) => {
                      const cell = currentTable.grid[rIdx]?.[cIdx];
                      const isSelected = selectedCell?.id === cell?.id;

                      if (!cell) {
                        return (
                          <td
                            key={cIdx}
                            className="px-3 py-2 border-e border-slate-100 bg-slate-50/30 text-slate-300 font-mono text-[11px] text-center"
                          >
                            -
                          </td>
                        );
                      }

                      // Status Badge Styling
                      let statusBg = 'bg-white';
                      let statusBorder = 'border-slate-200';

                      if (cell.status === 'review_required') {
                        statusBg = 'bg-amber-50/70 hover:bg-amber-100/60';
                        statusBorder = 'border-amber-300';
                      } else if (cell.status === 'low_confidence') {
                        statusBg = 'bg-rose-50/70 hover:bg-rose-100/60';
                        statusBorder = 'border-rose-300';
                      }

                      if (isSelected) {
                        statusBg = 'bg-blue-50/90 ring-2 ring-blue-500 ring-inset';
                      }

                      return (
                        <td
                          key={cIdx}
                          onClick={() => onSelectCell(cell)}
                          onDoubleClick={() => handleStartEdit(cell)}
                          className={`px-3 py-2 border-e border-slate-200 transition-all cursor-pointer relative group ${statusBg} ${
                            cell.isHeader
                              ? 'font-bold text-slate-900 bg-slate-100/60'
                              : cell.isTotalRow
                              ? 'font-bold text-slate-950 border-t-2 border-t-slate-400'
                              : 'text-slate-800'
                          }`}
                        >
                          <div className="flex items-center justify-between gap-1.5">
                            <span className="truncate max-w-[200px]" title={cell.rawText}>
                              {cell.rawText || (
                                <span className="text-slate-300 italic font-mono">[فارغ]</span>
                              )}
                            </span>

                            {/* Status Icon Badges */}
                            <div className="flex items-center gap-1 shrink-0">
                              {cell.isUserEdited && (
                                <span
                                  className="w-2 h-2 rounded-full bg-blue-500"
                                  title={t.userVerifiedBadge}
                                ></span>
                              )}

                              {cell.status === 'review_required' && (
                                <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />
                              )}

                              {cell.status === 'low_confidence' && (
                                <HelpCircle className="w-3.5 h-3.5 text-rose-500" />
                              )}

                              {cell.status === 'verified' && !cell.isHeader && (
                                <CheckCircle2 className="w-3 h-3 text-emerald-500/70 opacity-0 group-hover:opacity-100 transition-opacity" />
                              )}

                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleStartEdit(cell);
                                }}
                                className="opacity-0 group-hover:opacity-100 p-0.5 hover:bg-slate-200/80 rounded-sm text-slate-500 transition-opacity"
                                title={t.editCellTitle}
                              >
                                <Edit2 className="w-3 h-3" />
                              </button>
                            </div>
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* In-Place Cell Editor Modal / Drawer */}
      {editingCell && (
        <div className="p-4 bg-slate-50 border-t border-slate-200 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2">
            <span className="font-bold text-slate-700">
              {t.editCellTitle} ({String.fromCharCode(65 + editingCell.col)}
              {editingCell.row + 1}):
            </span>
            <input
              type="text"
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleSaveEdit();
                if (e.key === 'Escape') handleCancelEdit();
              }}
              autoFocus
              className="px-3 py-1.5 rounded-lg border border-slate-300 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 bg-white text-slate-900 min-w-[240px]"
            />
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleSaveEdit}
              className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-semibold transition-colors shadow-2xs"
            >
              <Check className="w-3.5 h-3.5" />
              <span>{t.saveEditBtn}</span>
            </button>
            <button
              onClick={handleCancelEdit}
              className="flex items-center gap-1 px-3 py-1.5 rounded-lg border border-slate-300 hover:bg-slate-200 text-slate-700 font-medium transition-colors"
            >
              <X className="w-3.5 h-3.5" />
              <span>{t.cancelEditBtn}</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
