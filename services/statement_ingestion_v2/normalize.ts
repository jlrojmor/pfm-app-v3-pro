/**
 * Text Normalization Module for Statement Ingestion V2
 * 
 * Normalizes raw extracted text for better pattern matching:
 * - Collapse multi-columns
 * - Fix hyphenations
 * - Normalize whitespace
 * - Unify currency symbols
 * - Unify decimal separators
 * - Remove headers/footers/page numbers
 */

export interface NormalizationResult {
  normalizedText: string;
  originalLength: number;
  normalizedLength: number;
  changes: string[];
}

/**
 * Main text normalization function
 */
export function normalizeText(text: string): NormalizationResult {
  const originalLength = text.length;
  const changes: string[] = [];
  let normalized = text;
  
  // Step 1: Basic cleanup
  normalized = normalizeWhitespace(normalized, changes);
  
  // Step 2: Fix common OCR errors
  normalized = fixOCRErrors(normalized, changes);
  
  // Step 3: Normalize currency symbols
  normalized = normalizeCurrencySymbols(normalized, changes);
  
  // Step 4: Normalize decimal separators
  normalized = normalizeDecimalSeparators(normalized, changes);
  
  // Step 5: Remove headers/footers
  normalized = removeHeadersFooters(normalized, changes);
  
  // Step 6: Fix hyphenations
  normalized = fixHyphenations(normalized, changes);
  
  // Step 7: Collapse multi-columns (basic attempt)
  normalized = collapseMultiColumns(normalized, changes);
  
  return {
    normalizedText: normalized,
    originalLength,
    normalizedLength: normalized.length,
    changes
  };
}

/**
 * Normalize whitespace - collapse multiple spaces, normalize line breaks
 */
function normalizeWhitespace(text: string, changes: string[]): string {
  let normalized = text;
  
  // Replace multiple spaces with single space
  const before = normalized;
  normalized = normalized.replace(/\s+/g, ' ');
  
  if (normalized !== before) {
    changes.push('Normalized whitespace');
  }
  
  // Normalize line breaks
  normalized = normalized.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  
  return normalized;
}

/**
 * Fix common OCR errors
 */
function fixOCRErrors(text: string, changes: string[]): string {
  let normalized = text;
  
  const ocrFixes = [
    // Common OCR mistakes
    [/0/g, 'O'], // Sometimes O is read as 0
    [/1/g, 'I'], // Sometimes I is read as 1
    [/8/g, 'B'], // Sometimes B is read as 8
    [/5/g, 'S'], // Sometimes S is read as 5
    // But be careful - only fix in context where it makes sense
  ];
  
  // More sophisticated fixes based on context
  const contextFixes = [
    // Fix "Bal ance" -> "Balance"
    [/\bBal\s+ance\b/g, 'Balance'],
    [/\bPay\s+ment\b/g, 'Payment'],
    [/\bMin\s+imum\b/g, 'Minimum'],
    [/\bDue\s+Date\b/g, 'Due Date'],
    [/\bStatement\s+Date\b/g, 'Statement Date'],
    [/\bCredit\s+Limit\b/g, 'Credit Limit'],
    [/\bAvailable\s+Credit\b/g, 'Available Credit'],
    // Spanish fixes
    [/\bSal\s+do\b/g, 'Saldo'],
    [/\bPa\s+go\b/g, 'Pago'],
    [/\bM[íi]\s+nimo\b/g, 'Mínimo'],
    [/\bFe\s+cha\b/g, 'Fecha'],
    [/\bInter\s+eses\b/g, 'Intereses'],
    [/\bComis\s+iones\b/g, 'Comisiones']
  ];
  
  for (const [pattern, replacement] of contextFixes) {
    const before = normalized;
    normalized = normalized.replace(pattern, replacement as string);
    if (normalized !== before) {
      changes.push(`Fixed OCR error: ${pattern} -> ${replacement}`);
    }
  }
  
  return normalized;
}

/**
 * Normalize currency symbols to ISO codes
 */
function normalizeCurrencySymbols(text: string, changes: string[]): string {
  let normalized = text;
  
  const currencyMap = [
    [/\$/g, 'USD'],
    [/USD/g, 'USD'],
    [/US\s*Dollars?/gi, 'USD'],
    [/Dollars?/gi, 'USD'],
    [/pesos?/gi, 'MXN'],
    [/MXN/gi, 'MXN'],
    [/€/g, 'EUR'],
    [/EUR/gi, 'EUR'],
    [/Euros?/gi, 'EUR'],
    [/£/g, 'GBP'],
    [/GBP/gi, 'GBP'],
    [/Pounds?/gi, 'GBP']
  ];
  
  for (const [pattern, replacement] of currencyMap) {
    const before = normalized;
    normalized = normalized.replace(pattern, replacement as string);
    if (normalized !== before) {
      changes.push(`Normalized currency: ${pattern} -> ${replacement}`);
    }
  }
  
  return normalized;
}

/**
 * Normalize decimal separators - handle both US and European formats
 */
function normalizeDecimalSeparators(text: string, changes: string[]): string {
  let normalized = text;
  
  // Look for patterns like "1,234.56" or "1.234,56"
  const before = normalized;
  
  // Handle European format (1.234,56) - convert to US format (1,234.56)
  normalized = normalized.replace(/(\d{1,3})\.(\d{3}),(\d{2})/g, '$1,$2.$3');
  
  // Handle cases where comma might be decimal separator in small amounts
  normalized = normalized.replace(/(\d+),(\d{2})\b/g, (match, whole, decimal) => {
    // Only convert if it looks like a currency amount (2 decimal places)
    if (whole.length <= 3 || decimal.length === 2) {
      return `${whole}.${decimal}`;
    }
    return match;
  });
  
  if (normalized !== before) {
    changes.push('Normalized decimal separators');
  }
  
  return normalized;
}

/**
 * Remove headers, footers, and page numbers
 */
function removeHeadersFooters(text: string, changes: string[]): string {
  let normalized = text;
  const lines = normalized.split('\n');
  const filteredLines: string[] = [];
  
  for (const line of lines) {
    const trimmed = line.trim();
    
    // Skip obvious headers/footers
    if (isHeaderFooter(trimmed)) {
      continue;
    }
    
    // Skip page numbers
    if (isPageNumber(trimmed)) {
      continue;
    }
    
    filteredLines.push(line);
  }
  
  const before = normalized;
  normalized = filteredLines.join('\n');
  
  if (normalized !== before) {
    changes.push('Removed headers/footers and page numbers');
  }
  
  return normalized;
}

/**
 * Check if line is a header or footer
 */
function isHeaderFooter(line: string): boolean {
  const headerFooterPatterns = [
    /^page\s+\d+/i,
    /^\d+\s+of\s+\d+/i,
    /^confidential/i,
    /^private/i,
    /^internal\s+use/i,
    /^statement\s+of\s+account/i,
    /^account\s+summary/i,
    /^this\s+is\s+not\s+a\s+bill/i,
    /^please\s+do\s+not\s+reply/i,
    /^visit\s+our\s+website/i,
    /^call\s+us\s+at/i,
    /^customer\s+service/i
  ];
  
  return headerFooterPatterns.some(pattern => pattern.test(line));
}

/**
 * Check if line is a page number
 */
function isPageNumber(line: string): boolean {
  return /^\s*\d+\s*$/.test(line);
}

/**
 * Fix hyphenations across line breaks
 */
function fixHyphenations(text: string, changes: string[]): string {
  let normalized = text;
  
  const before = normalized;
  
  // Common hyphenated words in financial statements
  const hyphenatedWords = [
    ['pay-ment', 'payment'],
    ['bal-ance', 'balance'],
    ['mini-mum', 'minimum'],
    ['state-ment', 'statement'],
    ['avail-able', 'available'],
    ['cred-it', 'credit'],
    ['inter-est', 'interest'],
    ['com-mis-sion', 'commission'],
    ['an-nu-al', 'annual'],
    ['month-ly', 'monthly']
  ];
  
  for (const [hyphenated, fixed] of hyphenatedWords) {
    const pattern = new RegExp(hyphenated.replace('-', '-\\s*'), 'gi');
    normalized = normalized.replace(pattern, fixed);
  }
  
  // Fix general hyphenations at line breaks
  normalized = normalized.replace(/(\w+)-\s*\n\s*(\w+)/g, '$1$2');
  
  if (normalized !== before) {
    changes.push('Fixed hyphenations');
  }
  
  return normalized;
}

/**
 * Attempt to collapse multi-column layouts (basic approach)
 */
function collapseMultiColumns(text: string, changes: string[]): string {
  let normalized = text;
  
  const before = normalized;
  const lines = normalized.split('\n');
  const collapsedLines: string[] = [];
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const nextLine = lines[i + 1];
    
    // If current line looks like it continues on next line (no punctuation, similar length)
    if (nextLine && 
        !line.match(/[.!?:]$/) && 
        Math.abs(line.length - nextLine.length) < 10 &&
        line.trim().length > 5) {
      
      // Check if next line starts with lowercase or is clearly a continuation
      if (nextLine.match(/^\s*[a-z]/) || 
          nextLine.match(/^\s*\d/) ||
          nextLine.trim().length < 20) {
        collapsedLines.push(line + ' ' + nextLine.trim());
        i++; // Skip next line
        continue;
      }
    }
    
    collapsedLines.push(line);
  }
  
  normalized = collapsedLines.join('\n');
  
  if (normalized !== before) {
    changes.push('Collapsed multi-column layout');
  }
  
  return normalized;
}

/**
 * Validate balance equation after normalization
 */
export function validateBalanceEquation(
  previousBalance: number,
  paymentsAndCredits: number,
  purchases: number,
  fees: number,
  interest: number,
  cashAdvances: number,
  statementBalance: number
): { isValid: boolean; difference: number; warning?: string } {
  
  const computedEnding = previousBalance
    - paymentsAndCredits
    + purchases + fees + interest
    + cashAdvances;
    
  const difference = Math.abs(computedEnding - statementBalance);
  const threshold = Math.max(0.5, 0.005 * statementBalance);
  
  if (difference > threshold) {
    return {
      isValid: false,
      difference,
      warning: `Balance equation mismatch: computed ${computedEnding.toFixed(2)}, actual ${statementBalance.toFixed(2)}`
    };
  }
  
  return { isValid: true, difference: 0 };
}






