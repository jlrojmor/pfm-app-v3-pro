// services/cards_convergent/quick_summary_parser.ts
// Quick Summary parser for EN/ES with confidence scoring

import { ParseResult } from './types';

// Regex patterns for money and dates
const MONEY_PATTERN = /([$€£¥]?\s?-?\d{1,3}(?:[.,]\d{3})*(?:[.,]\d{2})?)/u;
const DATE_PATTERN = /([A-Za-z]{3,9}\s+\d{1,2},\s*\d{4}|\d{1,2}[\/.-]\d{1,2}[\/.-]\d{2,4})/u;

// Field extraction patterns (case-insensitive, Unicode-aware)
const PATTERNS = {
  minimumDue: [
    // English patterns
    /(minimum\s*(payment\s*)?due|min\s*due)\s*[:\s]*([$€£¥]?\s?-?\d{1,3}(?:[.,]\d{3})*(?:[.,]\d{2})?)/iu,
    /due\s*([$€£¥]?\s?-?\d{1,3}(?:[.,]\d{3})*(?:[.,]\d{2})?)/iu,
    
    // Spanish patterns
    /(pago\s*m[íi]nimo|m[íi]nimo\s*pago)\s*[:\s]*([$€£¥]?\s?-?\d{1,3}(?:[.,]\d{3})*(?:[.,]\d{2})?)/iu,
    /m[íi]nimo\s*([$€£¥]?\s?-?\d{1,3}(?:[.,]\d{3})*(?:[.,]\d{2})?)/iu
  ],
  
  dueDate: [
    // English patterns
    /(payment\s*due\s*date|due\s*date|due\s*by)\s*[:\s]*([A-Za-z]{3,9}\s+\d{1,2},\s*\d{4}|\d{1,2}[\/.-]\d{1,2}[\/.-]\d{2,4})/iu,
    /due\s*([A-Za-z]{3,9}\s+\d{1,2},\s*\d{4}|\d{1,2}[\/.-]\d{1,2}[\/.-]\d{2,4})/iu,
    /by\s*([A-Za-z]{3,9}\s+\d{1,2},\s*\d{4}|\d{1,2}[\/.-]\d{1,2}[\/.-]\d{2,4})/iu,
    
    // Spanish patterns
    /(fecha\s*l[íi]mite\s*de\s*pago|fecha\s*de\s*vencimiento|vencimiento)\s*[:\s]*([A-Za-z]{3,9}\s+\d{1,2},\s*\d{4}|\d{1,2}[\/.-]\d{1,2}[\/.-]\d{2,4})/iu,
    /para\s*el\s*([A-Za-z]{3,9}\s+\d{1,2},\s*\d{4}|\d{1,2}[\/.-]\d{1,2}[\/.-]\d{2,4})/iu
  ],
  
  statementBalance: [
    // English patterns
    /((new|statement|current)\s*balance|balance)\s*[:\s]*([$€£¥]?\s?-?\d{1,3}(?:[.,]\d{3})*(?:[.,]\d{2})?)/iu,
    /(new|current)\s*([$€£¥]?\s?-?\d{1,3}(?:[.,]\d{3})*(?:[.,]\d{2})?)/iu,
    
    // Spanish patterns
    /(saldo\s*(al\s*corte|total|nuevo)|nuevo\s*saldo)\s*[:\s]*([$€£¥]?\s?-?\d{1,3}(?:[.,]\d{3})*(?:[.,]\d{2})?)/iu,
    /saldo\s*([$€£¥]?\s?-?\d{1,3}(?:[.,]\d{3})*(?:[.,]\d{2})?)/iu
  ],
  
  closingDate: [
    // English patterns
    /(statement\s*(closing)?\s*date|period\s*end|closing\s*date)\s*[:\s]*([A-Za-z]{3,9}\s+\d{1,2},\s*\d{4}|\d{1,2}[\/.-]\d{1,2}[\/.-]\d{2,4})/iu,
    /(statement\s*period|billing\s*period)\s*[:\s]*([A-Za-z]{3,9}\s+\d{1,2},\s*\d{4}|\d{1,2}[\/.-]\d{1,2}[\/.-]\d{2,4})/iu,
    
    // Spanish patterns
    /(fecha\s*de\s*(corte|cierre)|periodo\s*de\s*corte)\s*[:\s]*([A-Za-z]{3,9}\s+\d{1,2},\s*\d{4}|\d{1,2}[\/.-]\d{1,2}[\/.-]\d{2,4})/iu,
    /corte\s*([A-Za-z]{3,9}\s+\d{1,2},\s*\d{4}|\d{1,2}[\/.-]\d{1,2}[\/.-]\d{2,4})/iu
  ]
};

export function parseQuickSummary(text: string): ParseResult {
  const result: ParseResult = {
    confidence: 0,
    matchedFields: [],
    warnings: []
  };
  
  console.log('🔍 Parsing quick summary:', text);
  
  // Clean the text
  const cleanText = text.trim().replace(/\s+/g, ' ');
  
  // Extract each field using all patterns
  for (const [fieldName, patterns] of Object.entries(PATTERNS)) {
    for (const pattern of patterns) {
      const match = cleanText.match(pattern);
      if (match) {
        const value = extractFieldValue(fieldName, match, cleanText);
        if (value !== null) {
          result[fieldName as keyof ParseResult] = value;
          result.matchedFields.push(fieldName);
          console.log(`✅ Matched ${fieldName}:`, value);
          break; // Stop on first match for this field
        }
      }
    }
  }
  
  // Calculate confidence based on matched fields
  const criticalFields = ['minimumDue', 'dueDate', 'statementBalance'];
  const matchedCritical = criticalFields.filter(field => result.matchedFields.includes(field));
  result.confidence = matchedCritical.length / criticalFields.length;
  
  // Add warnings for low confidence
  if (result.confidence < 0.5) {
    result.warnings.push('Low confidence: Only partial data extracted');
  }
  
  console.log('📊 Parse result:', result);
  return result;
}

function extractFieldValue(fieldName: string, match: RegExpMatchArray, text: string): any {
  const matchIndex = match.index || 0;
  const contextStart = Math.max(0, matchIndex - 50);
  const contextEnd = Math.min(text.length, matchIndex + match[0].length + 50);
  const context = text.substring(contextStart, contextEnd);
  
  console.log(`🔍 Extracting ${fieldName} from context:`, context);
  
  switch (fieldName) {
    case 'minimumDue':
    case 'statementBalance':
      return extractMoney(match, context);
    
    case 'dueDate':
    case 'closingDate':
      return extractDate(match, context);
    
    default:
      return null;
  }
}

function extractMoney(match: RegExpMatchArray, context: string): number | null {
  // Look for money patterns in the match and surrounding context
  const moneyPattern = /\$?([-+]?[\d,]+\.?\d*)/g;
  const matches = Array.from(context.matchAll(moneyPattern));
  
  for (const moneyMatch of matches) {
    const amount = parseFloat(moneyMatch[1].replace(/,/g, ''));
    if (!isNaN(amount) && amount >= 0 && amount <= 1000000) {
      return amount;
    }
  }
  
  return null;
}

function extractDate(match: RegExpMatchArray, context: string): string | null {
  // Look for date patterns in the match and surrounding context
  const datePattern = /(\d{1,2}[\/.-]\d{1,2}[\/.-]\d{2,4}|[A-Za-z]{3,9}\s+\d{1,2},\s*\d{4})/g;
  const matches = Array.from(context.matchAll(datePattern));
  
  for (const dateMatch of matches) {
    const dateStr = dateMatch[1];
    const parsedDate = parseDateString(dateStr);
    if (parsedDate && isValidDate(parsedDate)) {
      return parsedDate.toISOString().slice(0, 10);
    }
  }
  
  return null;
}

function parseDateString(dateStr: string): Date | null {
  // Handle MM/DD/YYYY, MM-DD-YYYY, MM.DD.YYYY formats
  const slashMatch = dateStr.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2,4})$/);
  if (slashMatch) {
    let month = parseInt(slashMatch[1]);
    let day = parseInt(slashMatch[2]);
    let year = parseInt(slashMatch[3]);
    
    // Handle 2-digit years
    if (year < 100) {
      year += year < 50 ? 2000 : 1900;
    }
    
    // Swap month/day if month > 12
    if (month > 12 && day <= 12) {
      [month, day] = [day, month];
    }
    
    return new Date(year, month - 1, day);
  }
  
  // Handle "Month Day, Year" format
  const monthMatch = dateStr.match(/^([A-Za-z]{3,9})\s+(\d{1,2}),\s*(\d{4})$/);
  if (monthMatch) {
    const monthName = monthMatch[1];
    const day = parseInt(monthMatch[2]);
    const year = parseInt(monthMatch[3]);
    
    const monthMap: { [key: string]: number } = {
      'january': 0, 'jan': 0, 'enero': 0,
      'february': 1, 'feb': 1, 'febrero': 1,
      'march': 2, 'mar': 2, 'marzo': 2,
      'april': 3, 'apr': 3, 'abril': 3,
      'may': 4, 'mayo': 4,
      'june': 5, 'jun': 5, 'junio': 5,
      'july': 6, 'jul': 6, 'julio': 6,
      'august': 7, 'aug': 7, 'agosto': 7,
      'september': 8, 'sep': 8, 'sept': 8, 'septiembre': 8,
      'october': 9, 'oct': 9, 'octubre': 9,
      'november': 10, 'nov': 10, 'noviembre': 10,
      'december': 11, 'dec': 11, 'diciembre': 11
    };
    
    const monthIndex = monthMap[monthName.toLowerCase()];
    if (monthIndex !== undefined) {
      return new Date(year, monthIndex, day);
    }
  }
  
  return null;
}

function isValidDate(date: Date): boolean {
  // Check if date is reasonable (between 2000 and 2030)
  const year = date.getFullYear();
  return year >= 2000 && year <= 2030 && !isNaN(date.getTime());
}