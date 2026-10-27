import React from 'react';
import { CheckCircle2, Loader2, XCircle, AlertCircle } from 'lucide-react';
import { PipelineProgressState, PipelineStage } from '../types';
import { Language, translations } from '../locales/translations';

interface PipelineProgressProps {
  progress: PipelineProgressState;
  lang: Language;
  onCancel: () => void;
}

export const PipelineProgress: React.FC<PipelineProgressProps> = ({
  progress,
  lang,
  onCancel,
}) => {
  const t = translations[lang];

  const stages: { key: PipelineStage[]; title: string; descAr: string; descEn: string }[] = [
    {
      key: ['analyzing', 'extracting'],
      title: t.stage1Name,
      descAr: 'قراءة طبقة النص الأصلية + فحص بصري 2x عبر Gemini',
      descEn: 'Native text layer + 2x visual analysis via Gemini',
    },
    {
      key: ['reconstructing'],
      title: t.stage2Name,
      descAr: 'مطابقة الأعمدة وتوحيد الجداول الممتدة وتحويل الأرقام دون تخمين',
      descEn: 'Grid stitching, continuing tables, deterministic normalization',
    },
    {
      key: ['generating_excel'],
      title: t.stage3Name,
      descAr: 'توليد ملف .xlsx بالذاكرة مع تطبيق اتجاه RTL ونوع البيانات الخام',
      descEn: 'Writing in-memory XLSX data cells and RTL sheet views',
    },
    {
      key: ['verifying'],
      title: t.stage4Name,
      descAr: 'فحص المصدر 4A (تطابق الأرقام والحسابات) + فحص الإكسل 4B (إعادة القراءة)',
      descEn: 'Mandatory 4A source check + 4B exported-file re-read check',
    },
    {
      key: ['finalizing'],
      title: t.stage5Name,
      descAr: 'تلوين التنبيهات وإضافة الملاحظات وبناء ورقة التقرير الشامل',
      descEn: 'Applying highlights, cell notes & building audit report sheet',
    },
  ];

  const getStageStatus = (stageKeys: PipelineStage[]) => {
    const stageOrder: PipelineStage[] = [
      'analyzing',
      'extracting',
      'reconstructing',
      'generating_excel',
      'verifying',
      'finalizing',
      'ready',
    ];

    const currentIdx = stageOrder.indexOf(progress.stage);

    // If completed
    if (progress.stage === 'ready') return 'completed';
    if (progress.stage === 'error') return 'error';

    // Find index of first stage key in this group
    const thisMinIdx = Math.min(...stageKeys.map((k) => stageOrder.indexOf(k)));
    const thisMaxIdx = Math.max(...stageKeys.map((k) => stageOrder.indexOf(k)));

    if (currentIdx > thisMaxIdx) return 'completed';
    if (currentIdx >= thisMinIdx && currentIdx <= thisMaxIdx) return 'active';
    return 'pending';
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-200/90 p-6 shadow-sm my-6">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse"></span>
            {t.processingTitle}
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            {progress.stageMessage || 'جاري المعالجة وفق خط الأنابيب الصارم...'}
          </p>
        </div>

        <button
          onClick={onCancel}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-rose-200 text-rose-700 bg-rose-50 hover:bg-rose-100 transition-colors text-xs font-semibold"
        >
          <XCircle className="w-4 h-4" />
          {t.cancelBtn}
        </button>
      </div>

      {/* Progress Bar */}
      <div className="w-full bg-slate-100 rounded-full h-2.5 overflow-hidden mb-6">
        <div
          className="bg-gradient-to-r from-emerald-500 to-teal-600 h-2.5 rounded-full transition-all duration-300 ease-out"
          style={{ width: `${Math.min(100, Math.max(5, progress.progressPercent))}%` }}
        ></div>
      </div>

      {/* Pipeline Stepper */}
      <div className="grid grid-cols-1 sm:grid-cols-5 gap-3">
        {stages.map((stg, i) => {
          const status = getStageStatus(stg.key);

          return (
            <div
              key={i}
              className={`p-3 rounded-xl border transition-all text-start ${
                status === 'completed'
                  ? 'border-emerald-200 bg-emerald-50/60'
                  : status === 'active'
                  ? 'border-teal-400 bg-teal-50/70 shadow-xs ring-2 ring-teal-500/20'
                  : 'border-slate-100 bg-slate-50/50 opacity-60'
              }`}
            >
              <div className="flex items-center gap-2 mb-1.5">
                {status === 'completed' ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                ) : status === 'active' ? (
                  <Loader2 className="w-4 h-4 text-teal-600 animate-spin shrink-0" />
                ) : (
                  <div className="w-4 h-4 rounded-full border border-slate-300 flex items-center justify-center text-[10px] text-slate-400 shrink-0 font-mono">
                    {i + 1}
                  </div>
                )}
                <span
                  className={`text-xs font-bold truncate ${
                    status === 'active'
                      ? 'text-teal-900'
                      : status === 'completed'
                      ? 'text-emerald-900'
                      : 'text-slate-600'
                  }`}
                >
                  {stg.title}
                </span>
              </div>
              <p className="text-[11px] text-slate-500 leading-relaxed line-clamp-2">
                {lang === 'ar' ? stg.descAr : stg.descEn}
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
};
