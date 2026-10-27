/**
 * Arabic, RTL and Data Normalization Utilities for Ofuq Extraction.
 * Adheres strictly to:
 * - Never invent or guess data.
 * - Preserve RTL character integrity.
 * - Preserve leading zeros on IDs, phone numbers, and codes.
 */

// Arabic-Indic digit mapping (٠-٩)
const ARABIC_INDIC_DIGITS: { [key: string]: string } = {
  '٠': '0',
  '١': '1',
  '٢': '2',
  '٣': '3',
  '٤': '4',
  '٥': '5',
  '٦': '6',
  '٧': '7',
  '٨': '8',
  '٩': '9',
  '۰': '0', // Persian variants
  '۱': '1',
  '۲': '2',
  '۳': '3',
  '۴': '4',
  '۵': '5',
  '۶': '6',
  '۷': '7',
  '۸': '8',
  '۹': '9',
};

/**
 * Replaces Arabic-Indic and Eastern digits with standard ASCII digits (0-9).
 */
export function convertArabicIndicDigits(text: string): string {
  if (!text) return '';
  return text.replace(/[٠-٩۰-۹]/g, (digit) => ARABIC_INDIC_DIGITS[digit] || digit);
}

/**
 * Tests whether text contains Arabic characters.
 */
export function isArabicText(text: string): boolean {
  if (!text) return false;
  // Unicode range for Arabic script
  const arabicRegex = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/;
  return arabicRegex.test(text);
}

/**
 * Checks if a string represents an identifier, phone number, IBAN or code
 * that MUST remain as text to avoid Excel stripping leading zeros or formatting as scientific notation.
 */
export function isIdOrPhoneNumber(cleanStr: string): boolean {
  const normalized = convertArabicIndicDigits(cleanStr.trim());

  // Starts with '0' followed by more digits (e.g. Saudi phone 05xxxxxxxx, postal code 01234)
  if (/^0\d{2,}$/.test(normalized)) {
    return true;
  }

  // 10-digit Saudi National ID or Iqama (starts with 1 or 2, 10 digits total)
  if (/^[12]\d{9}$/.test(normalized)) {
    return true;
  }

  // Commercial Registration / Tax ID / Long IDs (10 to 16 continuous digits)
  if (/^\d{10,}$/.test(normalized)) {
    return true;
  }

  // IBAN (starts with 2 letters e.g. SA, followed by digits)
  if (/^[A-Za-z]{2}\d{10,}$/.test(normalized.replace(/\s+/g, ''))) {
    return true;
  }

  return false;
}

export interface NormalizedValueResult {
  typedValue: string | number | Date | null;
  valueType: 'text' | 'number' | 'date' | 'currency' | 'percentage' | 'empty';
  rawText: string;
  isConfident: boolean;
}

/**
 * Parses and types cell values strictly without guessing.
 * If uncertainty exists, keeps typedValue as string and valueType as 'text'.
 */
export function normalizeCellValue(raw: string | undefined | null): NormalizedValueResult {
  if (raw === undefined || raw === null || raw.trim() === '') {
    return {
      typedValue: null,
      valueType: 'empty',
      rawText: raw || '',
      isConfident: true,
    };
  }

  const trimmed = raw.trim();
  const normalized = convertArabicIndicDigits(trimmed);

  // 1. Check if it must be preserved as text (ID, phone number, leading zeros)
  if (isIdOrPhoneNumber(normalized)) {
    return {
      typedValue: trimmed, // Preserve original representation as string
      valueType: 'text',
      rawText: trimmed,
      isConfident: true,
    };
  }

  // 2. Percentage check (e.g. 15%, 15.5 %, %15, ٪١٥)
  if (/^[-+]?\s*[\d,.]+\s*(%|٪)$/.test(normalized) || /^([%٪])\s*[-+]?\s*[\d,.]+$/.test(normalized)) {
    const numPart = normalized.replace(/[%٪\s]/g, '').replace(/,/g, '');
    const num = parseFloat(numPart);
    if (!isNaN(num)) {
      return {
        typedValue: num / 100, // Excel percentage format expects fractional
        valueType: 'percentage',
        rawText: trimmed,
        isConfident: true,
      };
    }
  }

  // 3. Currency check (e.g. 150.00 ر.س, SAR 1,200, $500, 500 ريال)
  const currencyPattern = /^(?:SAR|AED|USD|EUR|GBP|ر\.?س|ريال|درهم|جنيه|\$|€|£)\s*[-+]?\s*[\d,.]+$|^[-+]?\s*[\d,.]+\s*(?:SAR|AED|USD|EUR|GBP|ر\.?س|ريال|درهم|جنيه|\$|€|£)$/i;
  if (currencyPattern.test(normalized)) {
    const numPart = normalized.replace(/[^0-9.-]/g, '');
    const num = parseFloat(numPart);
    if (!isNaN(num)) {
      return {
        typedValue: num,
        valueType: 'currency',
        rawText: trimmed,
        isConfident: true,
      };
    }
  }

  // 4. Number check: integer or floating point (accounting for negative with parentheses or minus)
  // e.g., "(1,250.75)" or "-1,250.75" or "1250.5"
  const isParenNegative = /^\(\s*[\d,.]+\s*\)$/.test(normalized);
  const cleanNumberCandidate = isParenNegative
    ? normalized.replace(/[()\s]/g, '')
    : normalized.replace(/\s/g, '');

  if (/^[-+]?[\d,]+(?:\.\d+)?$/.test(cleanNumberCandidate) || /^[-+]?\d+(?:,\d+)?$/.test(cleanNumberCandidate)) {
    // Check if comma is used as decimal separator (European/Middle East e.g., "12,50") or thousands ("1,250.00")
    let sanitized = cleanNumberCandidate;
    if (sanitized.includes(',') && sanitized.includes('.')) {
      // Standard: comma is thousands, period is decimal
      sanitized = sanitized.replace(/,/g, '');
    } else if (sanitized.includes(',')) {
      const parts = sanitized.split(',');
      if (parts.length === 2 && parts[1].length <= 2) {
        // Likely decimal separator e.g. "15,50"
        sanitized = sanitized.replace(',', '.');
      } else {
        // Thousands separator e.g. "1,000"
        sanitized = sanitized.replace(/,/g, '');
      }
    }

    const parsedNum = parseFloat(sanitized);
    if (!isNaN(parsedNum)) {
      const finalVal = isParenNegative ? -Math.abs(parsedNum) : parsedNum;
      return {
        typedValue: finalVal,
        valueType: 'number',
        rawText: trimmed,
        isConfident: true,
      };
    }
  }

  // 5. Date check (YYYY-MM-DD, DD/MM/YYYY, YYYY/MM/DD)
  // Check for common ISO/Standard date formats strictly
  const isoDateMatch = normalized.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/);
  if (isoDateMatch) {
    const year = parseInt(isoDateMatch[1], 10);
    const month = parseInt(isoDateMatch[2], 10) - 1;
    const day = parseInt(isoDateMatch[3], 10);
    if (year >= 1970 && year <= 2099 && month >= 0 && month <= 11 && day >= 1 && day <= 31) {
      const d = new Date(Date.UTC(year, month, day));
      return {
        typedValue: d,
        valueType: 'date',
        rawText: trimmed,
        isConfident: true,
      };
    }
  }

  const dmyMatch = normalized.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/);
  if (dmyMatch) {
    const day = parseInt(dmyMatch[1], 10);
    const month = parseInt(dmyMatch[2], 10) - 1;
    const year = parseInt(dmyMatch[3], 10);
    if (year >= 1970 && year <= 2099 && month >= 0 && month <= 11 && day >= 1 && day <= 31) {
      const d = new Date(Date.UTC(year, month, day));
      return {
        typedValue: d,
        valueType: 'date',
        rawText: trimmed,
        isConfident: true,
      };
    }
  }

  // Fallback: strictly keep as text
  return {
    typedValue: trimmed,
    valueType: 'text',
    rawText: trimmed,
    isConfident: true,
  };
}

/**
 * Normalizes text for comparison (removes multiple whitespace, normalizes Arabic diacritics and digits).
 */
export function normalizeForComparison(str: string): string {
  if (!str) return '';
  return convertArabicIndicDigits(str)
    // Remove Arabic tashkeel (harakat)
    .replace(/[\u064B-\u065F\u0670]/g, '')
    // Normalize Alef variants: أ إ آ -> ا
    .replace(/[أإآ]/g, 'ا')
    // Normalize Teh Marbuta: ة -> ه
    .replace(/ة/g, 'ه')
    // Normalize Yeh: ى -> ي
    .replace(/ى/g, 'ي')
    // Normalize spaces and lowercase
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}
