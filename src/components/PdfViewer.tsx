import React, { useState, useRef, useEffect } from 'react';
import { ZoomIn, ZoomOut, ChevronLeft, ChevronRight, Eye, AlertTriangle, CheckCircle, HelpCircle } from 'lucide-react';
import { BoundingBox, PageExtraction, ReconstructedCell } from '../types';
import { Language, translations } from '../locales/translations';

interface PdfViewerProps {
  pages: PageExtraction[];
  currentPageNumber: number;
  onPageChange: (pageNum: number) => void;
  selectedCell: ReconstructedCell | null;
  onSelectCellById: (cellId: string) => void;
  cellsOnCurrentPage: ReconstructedCell[];
  lang: Language;
}

export const PdfViewer: React.FC<PdfViewerProps> = ({
  pages,
  currentPageNumber,
  onPageChange,
  selectedCell,
  onSelectCellById,
  cellsOnCurrentPage,
  lang,
}) => {
  const t = translations[lang];
  const [scale, setScale] = useState<number>(1.0);
  const containerRef = useRef<HTMLDivElement>(null);

  const currentPage = pages.find((p) => p.pageNumber === currentPageNumber) || pages[0];

  const handleZoomIn = () => setScale((s) => Math.min(2.5, s + 0.2));
  const handleZoomOut = () => setScale((s) => Math.max(0.6, s - 0.2));
  const handleResetZoom = () => setScale(1.0);

  // Auto-scroll to selected cell bounding box if outside viewport
  useEffect(() => {
    if (selectedCell && containerRef.current && selectedCell.pageNumber === currentPageNumber) {
      const bbox = selectedCell.bbox;
      const targetTop = (bbox.ymin / 1000) * (containerRef.current.scrollHeight || 1);
      containerRef.current.scrollTo({
        top: Math.max(0, targetTop - 120),
        behavior: 'smooth',
      });
    }
  }, [selectedCell, currentPageNumber]);

  if (!currentPage) {
    return (
      <div className="h-full flex items-center justify-center p-8 bg-slate-50 border border-slate-200 rounded-2xl text-slate-400 text-xs">
        لا توجد صفحات للعرض
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-slate-100/70 rounded-2xl border border-slate-200 overflow-hidden shadow-2xs">
      {/* Viewer Toolbar */}
      <div className="px-4 py-2.5 bg-white border-b border-slate-200 flex items-center justify-between text-xs">
        {/* Page Navigation */}
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => onPageChange(Math.max(1, currentPageNumber - 1))}
            disabled={currentPageNumber <= 1}
            className="p-1 rounded-md hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed text-slate-700"
            title="Previous Page"
          >
            <ChevronRight className="w-4 h-4 rtl:rotate-0 ltr:rotate-180" />
          </button>

          <span className="font-semibold text-slate-800 px-2 py-0.5 rounded-md bg-slate-50 border border-slate-200">
            {t.pageLabel} {currentPageNumber} {t.ofLabel} {pages.length}
          </span>

          <button
            onClick={() => onPageChange(Math.min(pages.length, currentPageNumber + 1))}
            disabled={currentPageNumber >= pages.length}
            className="p-1 rounded-md hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed text-slate-700"
            title="Next Page"
          >
            <ChevronLeft className="w-4 h-4 rtl:rotate-0 ltr:rotate-180" />
          </button>

          {/* Page Classification Badge */}
          <span
            className={`mr-2 px-2 py-0.5 rounded-full text-[10px] font-bold border ${
              currentPage.classification === 'native'
                ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                : currentPage.classification === 'scanned'
                ? 'bg-rose-50 text-rose-700 border-rose-200'
                : 'bg-amber-50 text-amber-700 border-amber-200'
            }`}
          >
            {currentPage.classification === 'native'
              ? t.nativeBadge
              : currentPage.classification === 'scanned'
              ? t.scannedBadge
              : t.mixedBadge}
          </span>
        </div>

        {/* Zoom Controls */}
        <div className="flex items-center gap-1">
          <button
            onClick={handleZoomOut}
            className="p-1.5 rounded-md hover:bg-slate-100 text-slate-600 transition-colors"
            title={t.zoomOut}
          >
            <ZoomOut className="w-4 h-4" />
          </button>
          <button
            onClick={handleResetZoom}
            className="px-2 py-1 rounded-md hover:bg-slate-100 font-mono text-[11px] text-slate-700 font-semibold"
            title="Reset Zoom"
          >
            {Math.round(scale * 100)}%
          </button>
          <button
            onClick={handleZoomIn}
            className="p-1.5 rounded-md hover:bg-slate-100 text-slate-600 transition-colors"
            title={t.zoomIn}
          >
            <ZoomIn className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Page Canvas Container with Overlaid Interactive SVG */}
      <div
        ref={containerRef}
        className="flex-1 overflow-auto p-4 flex justify-center items-start bg-slate-200/50"
      >
        <div
          className="relative bg-white shadow-lg rounded-sm transition-transform duration-100 origin-top"
          style={{
            transform: `scale(${scale})`,
          }}
        >
          {/* Base Page Rendered Image */}
          {currentPage.dataUrl && (
            <img
              src={currentPage.dataUrl}
              alt={`Page ${currentPageNumber}`}
              className="max-w-none block select-none pointer-events-none"
              style={{
                width: currentPage.canvasWidth ? `${currentPage.canvasWidth / 2}px` : '750px',
              }}
            />
          )}

          {/* SVG Overlay for Bounding Boxes */}
          <svg
            viewBox="0 0 1000 1000"
            preserveAspectRatio="none"
            className="absolute inset-0 w-full h-full pointer-events-auto"
          >
            {/* Draw cell bounding boxes */}
            {cellsOnCurrentPage.map((cell) => {
              const bbox = cell.bbox;
              const isSelected = selectedCell?.id === cell.id;
              const width = Math.max(8, bbox.xmax - bbox.xmin);
              const height = Math.max(8, bbox.ymax - bbox.ymin);

              let strokeColor = 'rgba(16, 185, 129, 0.4)'; // Emerald
              let fillColor = 'rgba(16, 185, 129, 0.05)';

              if (cell.status === 'review_required') {
                strokeColor = 'rgba(245, 158, 11, 0.8)'; // Amber
                fillColor = isSelected ? 'rgba(245, 158, 11, 0.25)' : 'rgba(245, 158, 11, 0.1)';
              } else if (cell.status === 'low_confidence') {
                strokeColor = 'rgba(225, 29, 72, 0.8)'; // Rose
                fillColor = isSelected ? 'rgba(225, 29, 72, 0.25)' : 'rgba(225, 29, 72, 0.1)';
              }

              if (isSelected) {
                strokeColor = '#2563EB'; // Blue focus
                fillColor = 'rgba(37, 99, 235, 0.28)';
              }

              return (
                <g key={cell.id} className="cursor-pointer group">
                  <rect
                    x={bbox.xmin}
                    y={bbox.ymin}
                    width={width}
                    height={height}
                    fill={fillColor}
                    stroke={strokeColor}
                    strokeWidth={isSelected ? 4 : 1.5}
                    rx="2"
                    onClick={() => onSelectCellById(cell.id)}
                    className="transition-all hover:stroke-blue-600 hover:fill-blue-500/20"
                  />
                  {/* Subtle label on selected or error cells */}
                  {isSelected && (
                    <text
                      x={bbox.xmin}
                      y={Math.max(12, bbox.ymin - 3)}
                      fill="#1E40AF"
                      fontSize="14"
                      fontWeight="bold"
                      className="font-mono"
                    >
                      {String.fromCharCode(65 + cell.col)}
                      {cell.row + 1}
                    </text>
                  )}
                </g>
              );
            })}
          </svg>
        </div>
      </div>

      {/* Bottom Info Bar */}
      <div className="px-4 py-2 bg-white border-t border-slate-200 flex items-center justify-between text-[11px] text-slate-500">
        <div className="flex items-center gap-1.5">
          <Eye className="w-3.5 h-3.5 text-slate-400" />
          <span>{t.clickToLocate}</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded-xs bg-emerald-500/30 border border-emerald-500"></span>
            {t.verifiedKpi}
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded-xs bg-amber-500/30 border border-amber-500"></span>
            {t.reviewKpi}
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded-xs bg-rose-500/30 border border-rose-500"></span>
            {t.lowConfKpi}
          </span>
        </div>
      </div>
    </div>
  );
};
