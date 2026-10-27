import React from 'react';
import {
  FileSpreadsheet,
  AlertOctagon,
  CheckCircle,
  Download,
  X,
  FileWarning,
  ShieldAlert,
} from 'lucide-react';
import { VerificationIssue } from '../types';
import { Language, translations } from '../locales/translations';

interface ExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirmDownload: () => void;
  exportIssues: VerificationIssue[];
  noDataMutationConfirmed: boolean;
  mutationErrors: string[];
  filename: string;
  lang: Language;
}

export const ExportModal: React.FC<ExportModalProps> = ({
  isOpen,
  onClose,
  onConfirmDownload,
  exportIssues,
  noDataMutationConfirmed,
  mutationErrors,
  filename,
  lang,
}) => {
  const t = translations[lang];

  if (!isOpen) return null;

  const hasExportIssues = exportIssues.length > 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="bg-white rounded-3xl max-w-2xl w-full border border-slate-200 shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="p-6 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div
              className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                hasExportIssues
                  ? 'bg-amber-100 text-amber-800'
                  : 'bg-emerald-100 text-emerald-800'
              }`}
            >
              {hasExportIssues ? (
                <ShieldAlert className="w-5 h-5 stroke-[2.2]" />
              ) : (
                <FileSpreadsheet className="w-5 h-5 stroke-[2.2]" />
              )}
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900">
                {lang === 'ar' ? 'فحص جاهزية ملف الإكسل والتصدير' : 'Excel Export Verification Audit'}
              </h3>
              <p className="text-xs text-slate-500">
                {filename.replace(/\.pdf$/i, '')}_verified.xlsx
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 overflow-y-auto space-y-4 text-xs">
          {/* Stage 5 Integrity Confirmation */}
          <div
            className={`p-4 rounded-2xl border flex items-start gap-3 ${
              noDataMutationConfirmed
                ? 'bg-emerald-50/70 border-emerald-200 text-emerald-900'
                : 'bg-rose-50/70 border-rose-200 text-rose-900'
            }`}
          >
            {noDataMutationConfirmed ? (
              <CheckCircle className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
            ) : (
              <AlertOctagon className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
            )}
            <div>
              <span className="font-bold block text-sm mb-1">
                {noDataMutationConfirmed
                  ? (lang === 'ar' ? 'تم تأكيد ثبات البيانات 100%' : 'Data Invariance Fully Confirmed')
                  : (lang === 'ar' ? 'تحذير: حدث تعديل غير مقصود أثناء إضافة التنسيقات' : 'Warning: Unintended mutation detected')}
              </span>
              <p className="leading-relaxed">
                {noDataMutationConfirmed
                  ? (lang === 'ar'
                      ? 'تمت إعادة قراءة ملف الإكسل النهائي من الذاكرة والتأكد التام من عدم تغير أي قيمة في الخلايا أثناء إضافة التلوين والملاحظات وورقة التقرير.'
                      : 'The final .xlsx was re-read from scratch; zero data cells changed during styling and report generation.')
                  : mutationErrors.join('\n')}
              </p>
            </div>
          </div>

          {/* Export Issues (Stage 4B) Warnings */}
          {hasExportIssues ? (
            <div className="space-y-3">
              <div className="p-4 rounded-2xl bg-amber-50 border border-amber-200 text-amber-900">
                <span className="font-bold block text-sm mb-1">
                  {lang === 'ar' ? 'تنبيه: تم رصد فروقات في ملف الإكسل (فحص 4B)' : 'Notice: Export Inspection Differences Detected (Check 4B)'}
                </span>
                <p className="leading-relaxed mb-3">
                  {lang === 'ar'
                    ? 'بناءً على مبدأ الشفافية الصارمة، لا نخفي أي فرق تم رصده بين النموذج الرياضي وملف الإكسل الناتج. يمكنك مراجعة الفروقات أدناه قبل التحميل:'
                    : 'Adhering to strict transparency, any difference between the reconstructed model and the exported spreadsheet is visibly documented below:'}
                </p>

                <div className="space-y-2 max-h-48 overflow-y-auto">
                  {exportIssues.map((issue) => (
                    <div
                      key={issue.id}
                      className="p-2.5 rounded-xl bg-white border border-amber-300 text-slate-800 space-y-1 font-mono text-[11px]"
                    >
                      <div className="font-bold text-amber-900">{issue.message}</div>
                      {issue.evidence.cellAddress && (
                        <div className="text-slate-500">
                          الخلية: {issue.evidence.cellAddress} | النموذج: {String(issue.evidence.modelValue)} | الإكسل: {String(issue.evidence.exportedValue)}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 text-slate-700">
              <span className="font-bold block text-sm mb-1 text-slate-900">
                {lang === 'ar' ? 'محتويات الملف المصدر:' : 'Exported Package Contents:'}
              </span>
              <ul className="list-disc list-inside space-y-1 leading-relaxed text-slate-600">
                <li>{lang === 'ar' ? 'أوراق عمل منفصلة لكل جدول مع تطبيق اتجاه اليمين لليسار (RTL)' : 'Dedicated worksheets per table with native RTL views'}</li>
                <li>{lang === 'ar' ? 'ورقة "تقرير التحقق والمطابقة" الأولى بملخص الـ KPIs وسجل التدقيق' : 'Verification Report audit worksheet with KPIs and full issue log'}</li>
                <li>{lang === 'ar' ? 'تعليقات وملاحظات توضيحية داخل كل خلية بها تنبيه' : 'Cell notes/comments attached to any flagged cell with source evidence'}</li>
                <li>{lang === 'ar' ? 'تنسيق أرقام دقيق يحفظ الأصفار الأولى بالهواتف والمعرفات كنص' : 'Strict typing preserving leading zeros on phone numbers and IDs'}</li>
              </ul>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="p-6 bg-slate-50 border-t border-slate-100 flex items-center justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2.5 rounded-xl border border-slate-300 hover:bg-slate-200 text-slate-700 font-semibold text-xs transition-colors"
          >
            {t.cancelEditBtn}
          </button>

          <button
            onClick={() => {
              onConfirmDownload();
              onClose();
            }}
            className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white font-bold text-xs shadow-md shadow-emerald-600/20 transition-all flex items-center gap-2"
          >
            <Download className="w-4 h-4" />
            <span>{hasExportIssues ? t.downloadWithWarnings : t.downloadExcelBtn}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
