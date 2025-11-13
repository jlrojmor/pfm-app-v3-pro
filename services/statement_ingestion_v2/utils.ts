/**
 * Utility functions for Statement Ingestion V2
 */

import { CanonicalStatement } from './types';

/**
 * Shared money pattern for regex matching
 */
export const MONEY_PATTERN = '([$£€¥]?\\s?-?\\d{1,3}(?:[.,]\\d{3})*(?:[.,]\\d{2})?)';

/**
 * Date pattern for various date formats
 */
export const DATE_PATTERN = '([A-Za-z]{3,9}\\s+\\d{1,2},\\s*\\d{4}|\\d{1,2}[\\/.-]\\d{1,2}[\\/.-]\\d{2,4})';

/**
 * Extract amount from text using various currency formats
 */
export function extractAmount(text: string): number | null {
  if (!text) return null;
  
  // Remove currency symbols and normalize
  const cleaned = text.replace(/[$£€¥]/g, '').trim();
  
  // Handle negative amounts
  const isNegative = cleaned.startsWith('-');
  const amount = cleaned.replace(/^-/, '');
  
  // Extract digits and decimal separators
  const match = amount.match(/(\d{1,3}(?:[.,]\d{3})*(?:[.,]\d{2})?)/);
  if (!match) return null;
  
  // Normalize decimal separator (assume , is thousands separator if followed by 3 digits)
  let normalized = match[1];
  if (normalized.includes(',') && normalized.split(',')[1]?.length === 3) {
    // Comma is thousands separator
    normalized = normalized.replace(/,/g, '');
  } else if (normalized.includes(',')) {
    // Comma is decimal separator
    normalized = normalized.replace(',', '.');
  }
  
  const result = parseFloat(normalized);
  return isNaN(result) ? null : (isNegative ? -result : result);
}

/**
 * Extract date from text and normalize to ISO format
 */
export function extractDate(text: string): string | null {
  if (!text) return null;
  
  // Remove extra whitespace
  const cleaned = text.trim();
  
  // Try various date formats
  const patterns = [
    // MM/DD/YYYY or MM-DD-YYYY
    /(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{4})/,
    // DD/MM/YYYY or DD-MM-YYYY  
    /(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{4})/,
    // YYYY-MM-DD
    /(\d{4})-(\d{1,2})-(\d{1,2})/,
    // Month DD, YYYY
    /([A-Za-z]{3,9})\s+(\d{1,2}),\s*(\d{4})/
  ];
  
  for (const pattern of patterns) {
    const match = cleaned.match(pattern);
    if (match) {
      let year, month, day;
      
      if (match[0].includes(',')) {
        // Month DD, YYYY format
        const monthNames: Record<string, string> = {
          'january': '01', 'february': '02', 'march': '03', 'april': '04',
          'may': '05', 'june': '06', 'july': '07', 'august': '08',
          'september': '09', 'october': '10', 'november': '11', 'december': '12',
          'jan': '01', 'feb': '02', 'mar': '03', 'apr': '04',
          'may': '05', 'jun': '06', 'jul': '07', 'aug': '08',
          'sep': '09', 'oct': '10', 'nov': '11', 'dec': '12'
        };
        month = monthNames[match[1].toLowerCase()];
        day = match[2].padStart(2, '0');
        year = match[3];
      } else {
        // Numeric formats
        if (match[1].length === 4) {
          // YYYY-MM-DD
          year = match[1];
          month = match[2].padStart(2, '0');
          day = match[3].padStart(2, '0');
        } else {
          // MM/DD/YYYY or DD/MM/YYYY - assume MM/DD/YYYY for now
          month = match[1].padStart(2, '0');
          day = match[2].padStart(2, '0');
          year = match[3];
        }
      }
      
      if (month && day && year) {
        return `${year}-${month}-${day}`;
      }
    }
  }
  
  return null;
}

/**
 * Extract card last 4 digits from text
 */
export function extractCardLast4(text: string): string | null {
  const patterns = [
    /\*{0,4}\s?(\d{4})/,
    /(?:account|card)\s*(?:number|no\.?)\s*(?:ending|terminada|terminaci[oó]n)\s*(?:in|en)?\s*\*{0,4}\s?(\d{4})/i,
    /ending\s*in\s*\*{0,4}\s?(\d{4})/i,
    /\*{4}\s*(\d{4})/
  ];
  
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      return match[1];
    }
  }
  
  return null;
}

/**
 * Generate stable plan ID from plan characteristics
 */
export function generatePlanId(issuer: string, cardLast4: string, descriptor: string, monthlyCharge: number): string {
  const hashInput = `${issuer}|${cardLast4}|${descriptor}|${monthlyCharge}`;
  // Simple hash function
  let hash = 0;
  for (let i = 0; i < hashInput.length; i++) {
    const char = hashInput.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  return Math.abs(hash).toString(36);
}

/**
 * Calculate confidence based on pattern match quality
 */
export function calculateConfidence(
  patternType: 'exact' | 'fuzzy' | 'inferred',
  contextMatch: boolean = false,
  multipleMatches: boolean = false
): number {
  let baseConfidence = 0;
  
  switch (patternType) {
    case 'exact':
      baseConfidence = 0.95;
      break;
    case 'fuzzy':
      baseConfidence = 0.80;
      break;
    case 'inferred':
      baseConfidence = 0.60;
      break;
  }
  
  // Adjust based on context
  if (contextMatch) baseConfidence += 0.05;
  if (multipleMatches) baseConfidence -= 0.10;
  
  return Math.max(0, Math.min(1, baseConfidence));
}

/**
 * Normalize currency to ISO codes
 */
export function normalizeCurrency(text: string): string {
  const currencyMap: Record<string, string> = {
    '$': 'USD',
    'usd': 'USD',
    'dollars': 'USD',
    'pesos': 'MXN',
    'mxn': 'MXN',
    '€': 'EUR',
    'eur': 'EUR',
    'euros': 'EUR',
    '£': 'GBP',
    'gbp': 'GBP',
    'pounds': 'GBP'
  };
  
  const lower = text.toLowerCase();
  for (const [symbol, iso] of Object.entries(currencyMap)) {
    if (lower.includes(symbol.toLowerCase())) {
      return iso;
    }
  }
  
  return 'USD'; // Default
}

/**
 * Check if statement needs user confirmation
 */
export function needsUserConfirmation(statement: CanonicalStatement): boolean {
  const criticalFields = ['statementBalance', 'minimumDue', 'paymentDueDate'];
  const threshold = 0.7;
  
  return criticalFields.some(field => {
    const confidence = statement.confidenceByField[field] || 0;
    return confidence < threshold;
  });
}

/**
 * Validate balance equation
 */
export function validateBalanceEquation(statement: CanonicalStatement): {
  isValid: boolean;
  difference: number;
  warning?: string;
} {
  const { previousBalance, paymentsAndCredits, purchases, fees, interest, cashAdvances, statementBalance } = statement;
  
  if (!previousBalance || !statementBalance) {
    return { isValid: true, difference: 0 };
  }
  
  const computed = (previousBalance || 0)
    - (paymentsAndCredits || 0)
    + (purchases || 0)
    + (fees || 0)
    + (interest || 0)
    + (cashAdvances || 0);
    
  const difference = Math.abs(computed - statementBalance);
  const threshold = Math.max(0.5, 0.005 * statementBalance);
  
  if (difference > threshold) {
    return {
      isValid: false,
      difference,
      warning: `Balance equation mismatch: computed ${computed.toFixed(2)}, actual ${statementBalance.toFixed(2)}`
    };
  }
  
  return { isValid: true, difference: 0 };
}


