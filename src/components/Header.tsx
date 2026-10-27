import React from 'react';
import { ShieldCheck, Cpu, Languages, Sparkles } from 'lucide-react';
import { Language, translations } from '../locales/translations';

interface HeaderProps {
  lang: Language;
  onToggleLang: () => void;
  selectedModel: string;
  onSelectModel: (model: string) => void;
  isProcessing: boolean;
}

export const Header: React.FC<HeaderProps> = ({
  lang,
  onToggleLang,
  selectedModel,
  onSelectModel,
  isProcessing,
}) => {
  const t = translations[lang];

  return (
    <header className="border-b border-slate-200 bg-white/95 backdrop-blur-md sticky top-0 z-30 shadow-xs">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-18 flex items-center justify-between">
        {/* Logo & Identity */}
        <div className="flex items-center gap-3.5">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-emerald-700 via-teal-600 to-cyan-600 flex items-center justify-center text-white shadow-md shadow-emerald-700/20">
            <ShieldCheck className="w-6 h-6 stroke-[2.2]" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold tracking-tight text-slate-900 font-sans">
                {t.appName}
              </h1>
              <span className="px-2 py-0.5 text-xs font-semibold rounded-full bg-emerald-100 text-emerald-800 border border-emerald-200">
                Verification Engine
              </span>
            </div>
            <p className="text-xs text-slate-500 hidden sm:block line-clamp-1 max-w-xl">
              {t.appTagline}
            </p>
          </div>
        </div>

        {/* Controls: Model Switcher & Language Toggle */}
        <div className="flex items-center gap-3">
          {/* Model Switcher */}
          <div className="relative inline-flex items-center">
            <label htmlFor="model-select" className="sr-only">Gemini Model</label>
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 bg-slate-50 hover:bg-slate-100 transition-colors text-xs font-medium text-slate-700">
              <Cpu className="w-3.5 h-3.5 text-slate-500" />
              <select
                id="model-select"
                aria-label="Gemini Model"
                disabled={isProcessing}
                value={selectedModel}
                onChange={(e) => onSelectModel(e.target.value)}
                className="bg-transparent border-none outline-hidden cursor-pointer text-slate-800 pr-1 text-xs"
              >
                <option value="gemini-3.8-flash">
                  {lang === 'ar' ? 'Gemini 3.8 Flash (افتراضي، متوازن ودقيق)' : 'Gemini 3.8 Flash (Default, Balanced & Accurate)'}
                </option>
                <option value="gemini-3.1-flash-lite">
                  {lang === 'ar' ? 'Gemini 3.1 Flash Lite (خفيف للحصص وسريع)' : 'Gemini 3.1 Flash Lite (Quota-Optimized & Fast)'}
                </option>
              </select>
            </div>
          </div>

          {/* Language Toggle */}
          <button
            onClick={onToggleLang}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 hover:border-slate-300 bg-white hover:bg-slate-50 transition-colors text-xs font-semibold text-slate-700 shadow-2xs"
            title="Switch Language"
          >
            <Languages className="w-3.5 h-3.5 text-slate-500" />
            <span>{t.langToggle}</span>
          </button>
        </div>
      </div>
    </header>
  );
};
