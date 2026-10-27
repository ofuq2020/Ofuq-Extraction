import React, { useState } from 'react';
import {
  ShieldCheck,
  AlertTriangle,
  HelpCircle,
  FileCheck2,
  Layers,
  ChevronDown,
  ChevronUp,
  MapPin,
  FileWarning,
  CheckCircle2,
} from 'lucide-react';
import {
  ReconstructedCell,
  ReconstructedModel,
  VerificationIssue,
} from '../types';
import { Language, translations } from '../locales/translations';

interface VerificationDrawerProps {
  model: ReconstructedModel;
  selectedCell: ReconstructedCell | null;
  onSelectCell: (cell: ReconstructedCell) => void;
  lang: Language;
}

export const VerificationDrawer: React.FC<VerificationDrawerProps> = ({
  model,
  selectedCell,
  onSelectCell,
  lang,
}) => {
  const t = translations[lang];
  const [activeTab, setActiveTab] = useState<'selected' | 'audit_log'>('selected');
  const [isExpanded, setIsExpanded] = useState(true);

  const { totalCells, verifiedCount, reviewCount, lowConfidenceCount, exportIssuesCount } =
    model.summary;

  const verifiedPercent = totalCells > 0 ? Math.round((verifiedCount / totalCells) * 100) : 100;

  // Flatten all issues with cell context
  const allIssues: { cell: ReconstructedCell; issue: VerificationIssue; sheetName: string }[] = [];
  for (const table of model.tables) {
    for (const cell of table.cells) {
      for (const issue of cell.issues) {
        allIssues.push({
          cell,
          issue,
          sheetName: table.sheetName,
        });
      }
    }
  }

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
      {/* Top KPI Header Summary */}
      <div className="p-4 bg-slate-50/80 border-b border-slate-200">
        <div className="flex flex-wrap items-center justify-between gap-4">
          {/* Integrity Score Meter */}
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-emerald-600 text-white flex items-center justify-center font-bold text-sm shadow-xs font-mono">
              {verifiedPercent}%
            </div>
            <div>
              <div className="flex items-center gap-1.5 font-bold text-slate-800 text-sm">
                <ShieldCheck className="w-4 h-4 text-emerald-600" />
                <span>{t.integrityScore}</span>
              </div>
              <p className="text-xs text-slate-500">
                {verifiedCount} {t.ofLabel} {totalCells} {lang === 'ar' ? 'خلية مطابقة بالكامل' : 'cells fully verified'}
              </p>
            </div>
          </div>

          {/* Quick Metrics Badges */}
          <div className="flex items-center gap-2 text-xs">
            {/* Verified */}
            <div className="px-3 py-1.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 font-semibold flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
              <span>{t.verifiedKpi}: {verifiedCount}</span>
            </div>

            {/* Review Required */}
            <div className="px-3 py-1.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 font-semibold flex items-center gap-1.5">
              <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />
              <span>{t.reviewKpi}: {reviewCount}</span>
            </div>

            {/* Low Confidence */}
            <div className="px-3 py-1.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 font-semibold flex items-center gap-1.5">
              <HelpCircle className="w-3.5 h-3.5 text-rose-500" />
              <span>{t.lowConfKpi}: {lowConfidenceCount}</span>
            </div>

            {/* Export Differences (4B) */}
            <div
              className={`px-3 py-1.5 rounded-xl font-semibold flex items-center gap-1.5 border ${
                exportIssuesCount > 0
                  ? 'bg-purple-50 border-purple-300 text-purple-800 animate-pulse'
                  : 'bg-slate-50 border-slate-200 text-slate-600'
              }`}
            >
              <FileCheck2 className="w-3.5 h-3.5 text-purple-600" />
              <span>{t.exportDiffKpi}: {exportIssuesCount}</span>
            </div>

            {/* Collapse / Expand Toggle */}
            <button
              onClick={() => setIsExpanded(!isExpanded)}
              className="p-1.5 rounded-lg hover:bg-slate-200/60 text-slate-500 transition-colors mr-1"
              title="Toggle Panel"
            >
              {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>
          </div>
        </div>
      </div>

      {/* Expandable Body */}
      {isExpanded && (
        <div className="p-4 space-y-4">
          {/* Sub Tabs */}
          <div className="flex items-center gap-2 border-b border-slate-200 pb-2 text-xs">
            <button
              onClick={() => setActiveTab('selected')}
              className={`px-3 py-1.5 rounded-lg font-bold transition-all ${
                activeTab === 'selected'
                  ? 'bg-emerald-100 text-emerald-900 border border-emerald-300'
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              {lang === 'ar' ? 'فحص الخلية المحددة' : 'Selected Cell Verification'}
            </button>

            <button
              onClick={() => setActiveTab('audit_log')}
              className={`px-3 py-1.5 rounded-lg font-bold transition-all flex items-center gap-1.5 ${
                activeTab === 'audit_log'
                  ? 'bg-emerald-100 text-emerald-900 border border-emerald-300'
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              <span>{t.auditLogTitle}</span>
              <span className="px-1.5 py-0.2 rounded-full bg-slate-200 text-slate-700 text-[10px] font-mono">
                {allIssues.length}
              </span>
            </button>
          </div>

          {/* Tab 1: Selected Cell Details */}
          {activeTab === 'selected' && (
            <div>
              {selectedCell ? (
                <div className="bg-slate-50 rounded-xl p-4 border border-slate-200 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200/80 pb-2.5">
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-bold text-sm text-slate-800 bg-white px-2.5 py-1 rounded-md border border-slate-200">
                        {String.fromCharCode(65 + selectedCell.col)}
                        {selectedCell.row + 1}
                      </span>
                      <span className="text-xs text-slate-500">
                        ({t.pageLabel} {selectedCell.pageNumber})
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      <span
                        className={`px-2.5 py-0.5 rounded-full text-xs font-bold border ${
                          selectedCell.status === 'verified'
                            ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                            : selectedCell.status === 'review_required'
                            ? 'bg-amber-50 text-amber-700 border-amber-200'
                            : 'bg-rose-50 text-rose-700 border-rose-200'
                        }`}
                      >
                        {selectedCell.status === 'verified'
                          ? t.verifiedKpi
                          : selectedCell.status === 'review_required'
                          ? t.reviewKpi
                          : t.lowConfKpi}
                      </span>

                      {selectedCell.isUserEdited && (
                        <span className="px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 text-xs font-bold border border-blue-200">
                          {t.userVerifiedBadge}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Values Comparison Grid */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                    <div className="p-2.5 rounded-lg bg-white border border-slate-200">
                      <span className="text-slate-400 block text-[11px] mb-1">{t.originalRaw}</span>
                      <span className="font-semibold text-slate-800 break-words">
                        {selectedCell.rawText || '<فارغ>'}
                      </span>
                    </div>

                    <div className="p-2.5 rounded-lg bg-white border border-slate-200">
                      <span className="text-slate-400 block text-[11px] mb-1">{t.typedValue}</span>
                      <span className="font-semibold text-slate-800 break-words">
                        {selectedCell.typedValue !== null ? String(selectedCell.typedValue) : '<فارغ>'}
                      </span>
                    </div>

                    <div className="p-2.5 rounded-lg bg-white border border-slate-200">
                      <span className="text-slate-400 block text-[11px] mb-1">{t.valueType}</span>
                      <span className="font-mono uppercase font-bold text-slate-700">
                        {selectedCell.valueType}
                      </span>
                    </div>
                  </div>

                  {/* Issues & Evidences List */}
                  {selectedCell.issues.length > 0 ? (
                    <div className="space-y-2 pt-1">
                      <span className="text-xs font-bold text-slate-700 block">
                        {lang === 'ar' ? 'الملاحظات والأدلة الموثقة للخلية:' : 'Documented Issues & Evidence:'}
                      </span>
                      {selectedCell.issues.map((iss) => (
                        <div
                          key={iss.id}
                          className={`p-3 rounded-xl border text-xs leading-relaxed space-y-1.5 ${
                            iss.severity === 'error'
                              ? 'bg-rose-50/80 border-rose-200 text-rose-900'
                              : 'bg-amber-50/80 border-amber-200 text-amber-900'
                          }`}
                        >
                          <div className="flex items-center gap-1.5 font-bold">
                            <AlertTriangle className="w-4 h-4 shrink-0" />
                            <span>{iss.message}</span>
                          </div>

                          {/* Evidence Details */}
                          {iss.evidence && (
                            <div className="bg-white/80 p-2 rounded-lg border border-slate-200/60 font-mono text-[11px] text-slate-700 space-y-0.5">
                              {iss.evidence.sourceText && (
                                <div>
                                  <span className="font-bold text-slate-500">النص بالمصدر: </span>
                                  <span>"{iss.evidence.sourceText}"</span>
                                </div>
                              )}
                              {iss.evidence.bbox && (
                                <div>
                                  <span className="font-bold text-slate-500">إحداثيات المربع: </span>
                                  <span>
                                    ymin: {iss.evidence.bbox.ymin}, xmin: {iss.evidence.bbox.xmin}, ymax: {iss.evidence.bbox.ymax}, xmax: {iss.evidence.bbox.xmax}
                                  </span>
                                </div>
                              )}
                              {iss.evidence.expectedSum !== undefined && (
                                <div>
                                  <span className="font-bold text-slate-500">الإجمالي المدون vs المحسوب: </span>
                                  <span>
                                    {iss.evidence.expectedSum} مقابل {iss.evidence.calculatedSum}
                                  </span>
                                </div>
                              )}
                              {iss.evidence.exportedValue !== undefined && (
                                <div>
                                  <span className="font-bold text-slate-500">فحص الإكسل (4B): </span>
                                  <span>
                                    النموذج: {String(iss.evidence.modelValue)} | ملف الإكسل: {String(iss.evidence.exportedValue)}
                                  </span>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="p-3 rounded-xl bg-emerald-50/80 border border-emerald-200 text-emerald-800 text-xs flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                      <span>{t.noIssuesFound}</span>
                    </div>
                  )}
                </div>
              ) : (
                <div className="p-6 text-center text-slate-400 text-xs border border-dashed border-slate-200 rounded-xl">
                  {lang === 'ar'
                    ? 'انقر على أي خلية في الجدول أعلاه لعرض تقرير المطابقة وأدلة الفحص المباشر.'
                    : 'Click any cell above to inspect its verification audit report and evidence.'}
                </div>
              )}
            </div>
          )}

          {/* Tab 2: Full Audit Trail */}
          {activeTab === 'audit_log' && (
            <div className="max-h-72 overflow-y-auto space-y-2">
              {allIssues.length > 0 ? (
                allIssues.map((item, i) => (
                  <div
                    key={i}
                    onClick={() => onSelectCell(item.cell)}
                    className="p-3 rounded-xl border border-slate-200 hover:border-emerald-400 bg-white hover:bg-slate-50/70 transition-all cursor-pointer text-xs flex items-start justify-between gap-3 shadow-2xs"
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-bold bg-slate-100 px-2 py-0.5 rounded-md text-slate-800">
                          {item.sheetName}!{String.fromCharCode(65 + item.cell.col)}
                          {item.cell.row + 1}
                        </span>
                        <span
                          className={`px-2 py-0.2 rounded-full text-[10px] font-bold ${
                            item.issue.severity === 'error'
                              ? 'bg-rose-100 text-rose-800'
                              : 'bg-amber-100 text-amber-800'
                          }`}
                        >
                          {item.issue.severity === 'error' ? 'خطأ' : 'تحذير'}
                        </span>
                      </div>
                      <p className="text-slate-700 leading-relaxed">{item.issue.message}</p>
                    </div>

                    <MapPin className="w-4 h-4 text-slate-400 shrink-0 mt-1" />
                  </div>
                ))
              ) : (
                <div className="p-6 text-center text-emerald-700 bg-emerald-50 rounded-xl text-xs flex items-center justify-center gap-2">
                  <CheckCircle2 className="w-5 h-5" />
                  <span>{t.noIssuesFound}</span>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
