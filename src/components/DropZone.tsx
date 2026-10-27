import React, { useRef, useState } from 'react';
import { UploadCloud, FileSpreadsheet, Lock, Sparkles, FileText, CheckCircle } from 'lucide-react';
import { Language, translations } from '../locales/translations';

interface DropZoneProps {
  lang: Language;
  onFileSelect: (file: File) => void;
  onSampleLoad: () => void;
  isProcessing: boolean;
}

export const DropZone: React.FC<DropZoneProps> = ({
  lang,
  onFileSelect,
  onSampleLoad,
  isProcessing,
}) => {
  const t = translations[lang];
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragOver, setIsDragOver] = useState(false);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    if (!isProcessing) setIsDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    if (isProcessing) return;

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const file = e.dataTransfer.files[0];
      if (file.type === 'application/pdf' || file.name.endsWith('.pdf')) {
        onFileSelect(file);
      } else {
        alert(lang === 'ar' ? 'يرجى اختيار ملف PDF صالح.' : 'Please choose a valid PDF file.');
      }
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      onFileSelect(e.target.files[0]);
    }
  };

  return (
    <div className="space-y-4">
      {/* Privacy Notice Banner */}
      <div className="rounded-xl bg-amber-50/80 border border-amber-200/80 p-3.5 flex items-start gap-3 shadow-2xs">
        <Lock className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
        <div className="text-xs text-amber-900 leading-relaxed">
          <span className="font-bold">{lang === 'ar' ? 'تنويه الخصوصية والأمان: ' : 'Privacy & Security Notice: '}</span>
          {t.privacyNotice}
        </div>
      </div>

      {/* Main Drag & Drop Card */}
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => !isProcessing && fileInputRef.current?.click()}
        className={`relative border-2 border-dashed rounded-3xl p-8 sm:p-12 text-center transition-all cursor-pointer select-none ${
          isDragOver
            ? 'border-emerald-500 bg-emerald-50/70 scale-[1.01]'
            : 'border-slate-300 hover:border-emerald-500/70 bg-gradient-to-b from-slate-50/60 to-white'
        }`}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept="application/pdf"
          className="hidden"
          onChange={handleFileChange}
          disabled={isProcessing}
        />

        <div className="max-w-md mx-auto flex flex-col items-center">
          <div className="w-16 h-16 rounded-2xl bg-emerald-100/70 text-emerald-700 flex items-center justify-center mb-4 shadow-inner ring-8 ring-emerald-50">
            <UploadCloud className="w-8 h-8 stroke-[2]" />
          </div>

          <h3 className="text-lg sm:text-xl font-bold text-slate-800 mb-1.5 font-sans">
            {t.dropTitle}
          </h3>
          <p className="text-xs sm:text-sm text-slate-500 leading-relaxed mb-6">
            {t.dropSubtitle}
          </p>

          <div className="flex flex-wrap items-center justify-center gap-3">
            <button
              type="button"
              disabled={isProcessing}
              className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white font-medium text-xs sm:text-sm shadow-md shadow-emerald-600/20 transition-all flex items-center gap-2"
            >
              <FileSpreadsheet className="w-4 h-4" />
              {t.selectPdfBtn}
            </button>

            <button
              type="button"
              disabled={isProcessing}
              onClick={(e) => {
                e.stopPropagation();
                onSampleLoad();
              }}
              className="px-4 py-2.5 rounded-xl border border-slate-300 hover:border-emerald-600 bg-white hover:bg-emerald-50/40 text-slate-700 hover:text-emerald-800 font-medium text-xs sm:text-sm transition-all flex items-center gap-1.5 shadow-2xs"
            >
              <Sparkles className="w-4 h-4 text-emerald-600" />
              {t.trySampleBtn}
            </button>
          </div>

          {/* Quick Pillars of Ofuq */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 mt-8 w-full border-t border-slate-200/80 pt-6 text-start">
            <div className="flex items-center gap-2 text-xs text-slate-600">
              <CheckCircle className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
              <span>{lang === 'ar' ? 'فحص حسابي للإجماليات' : 'Arithmetic sum verification'}</span>
            </div>
            <div className="flex items-center gap-2 text-xs text-slate-600">
              <CheckCircle className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
              <span>{lang === 'ar' ? 'حفظ الأصفار الأولى بالهواتف والـ IDs' : 'Leading zeros preservation'}</span>
            </div>
            <div className="flex items-center gap-2 text-xs text-slate-600">
              <CheckCircle className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
              <span>{lang === 'ar' ? 'إعادة قراءة وفحص ملف الإكسل (4B)' : '4B Exported-file re-read check'}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
