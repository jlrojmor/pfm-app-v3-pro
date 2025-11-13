/**
 * Field Extraction Module for Statement Ingestion V2
 * 
 * Comprehensive regex patterns and extraction logic for all statement fields
 * across different issuers and languages (English/Spanish).
 */

import { CanonicalStatement, FieldExtraction } from './types';
import { MONEY_PATTERN, DATE_PATTERN, extractAmount, extractDate, extractCardLast4, calculateConfidence } from './utils';

export interface FieldExtractionPattern {
  pattern: RegExp;
  field: keyof CanonicalStatement;
  confidence: number;
  type: 'exact' | 'fuzzy' | 'inferred';
  language: 'en' | 'es' | 'both';
  description: string;
}

/**
 * Comprehensive pattern library for field extraction
 */
export const EXTRACTION_PATTERNS: FieldExtractionPattern[] = [
  // BALANCE PATTERNS
  {
    pattern: new RegExp(`(new|current|statement|total)\\s+balance\\s*[:\\s]*${MONEY_PATTERN}`, 'gi'),
    field: 'statementBalance',
    confidence: 0.95,
    type: 'exact',
    language: 'en',
    description: 'New/Current/Statement Balance (English)'
  },
  {
    pattern: new RegExp(`(nuevo|saldo\\s+nuevo|saldo\\s+actual|saldo\\s+del\\s+estado|saldo\\s+total)\\s*[:\\s]*${MONEY_PATTERN}`, 'gi'),
    field: 'statementBalance',
    confidence: 0.95,
    type: 'exact',
    language: 'es',
    description: 'Nuevo Saldo (Spanish)'
  },
  {
    pattern: new RegExp(`balance\\s*[:\\s]*${MONEY_PATTERN}`, 'gi'),
    field: 'statementBalance',
    confidence: 0.80,
    type: 'fuzzy',
    language: 'both',
    description: 'Generic Balance'
  },

  // MINIMUM PAYMENT PATTERNS
  {
    pattern: new RegExp(`(minimum\\s+(?:payment\\s+)?due|min\\s+payment|minimum\\s+amount|required\\s+payment)\\s*[:\\s]*${MONEY_PATTERN}`, 'gi'),
    field: 'minimumDue',
    confidence: 0.95,
    type: 'exact',
    language: 'en',
    description: 'Minimum Payment Due (English)'
  },
  {
    pattern: new RegExp(`(pago\\s+m[íi]nimo|m[íi]nimo\\s+a\\s+pagar|monto\\s+m[íi]nimo|pago\\s+requerido|pago\\s+obligatorio)\\s*[:\\s]*${MONEY_PATTERN}`, 'gi'),
    field: 'minimumDue',
    confidence: 0.95,
    type: 'exact',
    language: 'es',
    description: 'Pago Mínimo (Spanish)'
  },

  // PREVIOUS BALANCE PATTERNS
  {
    pattern: new RegExp(`(previous\\s+balance|prior\\s+balance|beginning\\s+balance)\\s*[:\\s]*${MONEY_PATTERN}`, 'gi'),
    field: 'previousBalance',
    confidence: 0.90,
    type: 'exact',
    language: 'en',
    description: 'Previous Balance (English)'
  },
  {
    pattern: new RegExp(`(saldo\\s+anterior|saldo\\s+previo|saldo\\s+inicial)\\s*[:\\s]*${MONEY_PATTERN}`, 'gi'),
    field: 'previousBalance',
    confidence: 0.90,
    type: 'exact',
    language: 'es',
    description: 'Saldo Anterior (Spanish)'
  },

  // PAYMENTS AND CREDITS PATTERNS
  {
    pattern: new RegExp(`(payments?\\s*(?:and)?\\s*credits?|credits?\\s*(?:and)?\\s*payments?)\\s*[:\\s]*${MONEY_PATTERN}`, 'gi'),
    field: 'paymentsAndCredits',
    confidence: 0.90,
    type: 'exact',
    language: 'en',
    description: 'Payments and Credits (English)'
  },
  {
    pattern: new RegExp(`(pagos?\\s*y\\s*abonos?|abonos?\\s*y\\s*pagos?)\\s*[:\\s]*${MONEY_PATTERN}`, 'gi'),
    field: 'paymentsAndCredits',
    confidence: 0.90,
    type: 'exact',
    language: 'es',
    description: 'Pagos y Abonos (Spanish)'
  },

  // PURCHASES PATTERNS
  {
    pattern: new RegExp(`(purchases?|new\\s+charges?|debits?)\\s*[:\\s]*${MONEY_PATTERN}`, 'gi'),
    field: 'purchases',
    confidence: 0.85,
    type: 'exact',
    language: 'en',
    description: 'Purchases (English)'
  },
  {
    pattern: new RegExp(`(compras?|cargos?\\s+nuevos?|d[ée]bitos?)\\s*[:\\s]*${MONEY_PATTERN}`, 'gi'),
    field: 'purchases',
    confidence: 0.85,
    type: 'exact',
    language: 'es',
    description: 'Compras (Spanish)'
  },

  // FEES PATTERNS
  {
    pattern: new RegExp(`(fees?|late\\s+fees?|annual\\s+fees?|service\\s+fees?|overlimit\\s+fees?)\\s*[:\\s]*${MONEY_PATTERN}`, 'gi'),
    field: 'fees',
    confidence: 0.85,
    type: 'exact',
    language: 'en',
    description: 'Fees (English)'
  },
  {
    pattern: new RegExp(`(cargos?|comisiones?|cargo\\s+por\\s+servicio|cargo\\s+anual|cargo\\s+por\\s+atraso)\\s*[:\\s]*${MONEY_PATTERN}`, 'gi'),
    field: 'fees',
    confidence: 0.85,
    type: 'exact',
    language: 'es',
    description: 'Cargos/Comisiones (Spanish)'
  },

  // INTEREST PATTERNS
  {
    pattern: new RegExp(`(interest|finance\\s+charges?|interest\\s+charges?)\\s*[:\\s]*${MONEY_PATTERN}`, 'gi'),
    field: 'interest',
    confidence: 0.85,
    type: 'exact',
    language: 'en',
    description: 'Interest (English)'
  },
  {
    pattern: new RegExp(`(intereses?|cargos\\s+financieros?|cargos\\s+por\\s+intereses?)\\s*[:\\s]*${MONEY_PATTERN}`, 'gi'),
    field: 'interest',
    confidence: 0.85,
    type: 'exact',
    language: 'es',
    description: 'Intereses (Spanish)'
  },

  // CASH ADVANCES PATTERNS
  {
    pattern: new RegExp(`(cash\\s+advances?|cash\\s+withdrawals?)\\s*[:\\s]*${MONEY_PATTERN}`, 'gi'),
    field: 'cashAdvances',
    confidence: 0.80,
    type: 'exact',
    language: 'en',
    description: 'Cash Advances (English)'
  },
  {
    pattern: new RegExp(`(avances?\\s+en\\s+efectivo|retiros?\\s+en\\s+efectivo)\\s*[:\\s]*${MONEY_PATTERN}`, 'gi'),
    field: 'cashAdvances',
    confidence: 0.80,
    type: 'exact',
    language: 'es',
    description: 'Avances en Efectivo (Spanish)'
  },

  // CREDIT LIMIT PATTERNS
  {
    pattern: new RegExp(`(credit\\s+limit|available\\s+credit)\\s*[:\\s]*${MONEY_PATTERN}`, 'gi'),
    field: 'creditLimit',
    confidence: 0.90,
    type: 'exact',
    language: 'en',
    description: 'Credit Limit (English)'
  },
  {
    pattern: new RegExp(`(l[íi]mite\\s+de\\s+cr[ée]dito|cr[ée]dito\\s+disponible)\\s*[:\\s]*${MONEY_PATTERN}`, 'gi'),
    field: 'creditLimit',
    confidence: 0.90,
    type: 'exact',
    language: 'es',
    description: 'Límite de Crédito (Spanish)'
  },

  // AVAILABLE CREDIT PATTERNS
  {
    pattern: new RegExp(`available\\s+credit\\s*[:\\s]*${MONEY_PATTERN}`, 'gi'),
    field: 'availableCredit',
    confidence: 0.90,
    type: 'exact',
    language: 'en',
    description: 'Available Credit (English)'
  },
  {
    pattern: new RegExp(`cr[ée]dito\\s+disponible\\s*[:\\s]*${MONEY_PATTERN}`, 'gi'),
    field: 'availableCredit',
    confidence: 0.90,
    type: 'exact',
    language: 'es',
    description: 'Crédito Disponible (Spanish)'
  },

  // DATE PATTERNS
  {
    pattern: new RegExp(`(payment\\s+due\\s+date|due\\s+date|payment\\s+due)\\s*[:\\s]*${DATE_PATTERN}`, 'gi'),
    field: 'paymentDueDate',
    confidence: 0.95,
    type: 'exact',
    language: 'en',
    description: 'Payment Due Date (English)'
  },
  {
    pattern: new RegExp(`(fecha\\s+de\\s+vencimiento|fecha\\s+de\\s+vencim|vencimiento\\s+del\\s+pago)\\s*[:\\s]*${DATE_PATTERN}`, 'gi'),
    field: 'paymentDueDate',
    confidence: 0.95,
    type: 'exact',
    language: 'es',
    description: 'Fecha de Vencimiento (Spanish)'
  },
  {
    pattern: new RegExp(`fecha\\s+de\\s+vencim\\.\\s*del\\s+pago\\s*[:\\s]*${DATE_PATTERN}`, 'gi'),
    field: 'paymentDueDate',
    confidence: 0.95,
    type: 'exact',
    language: 'es',
    description: 'Fecha de Vencim. del Pago (Chase Spanish)'
  },

  {
    pattern: new RegExp(`(statement\\s+date|closing\\s+date|period\\s+ending|statement\\s+period)\\s*[:\\s]*${DATE_PATTERN}`, 'gi'),
    field: 'statementPeriodEnd',
    confidence: 0.95,
    type: 'exact',
    language: 'en',
    description: 'Statement Date (English)'
  },
  {
    pattern: new RegExp(`(fecha\\s+de\\s+estado|fecha\\s+de\\s+corte|periodo\\s+terminando)\\s*[:\\s]*${DATE_PATTERN}`, 'gi'),
    field: 'statementPeriodEnd',
    confidence: 0.95,
    type: 'exact',
    language: 'es',
    description: 'Fecha de Corte (Spanish)'
  },

  // APR PATTERNS
  {
    pattern: new RegExp(`(purchase|cash|installment|promo).{0,20}(APR|tasa|%)\\s*[^\\d]*(\\d{1,2}[.,]?\\d{0,2})\\s?%`, 'gi'),
    field: 'aprPurchase',
    confidence: 0.80,
    type: 'exact',
    language: 'both',
    description: 'APR Rates'
  }
];

/**
 * Extract all fields from normalized text
 */
export function extractAllFields(text: string, issuer?: string): Partial<CanonicalStatement> {
  const extracted: Partial<CanonicalStatement> = {
    installmentPlans: [],
    confidenceByField: {},
    warnings: []
  };

  // Extract basic fields
  extractBasicFields(text, extracted);
  
  // Extract card information
  extractCardInfo(text, extracted);
  
  // Extract APRs
  extractAPRs(text, extracted);
  
  // Calculate derived fields
  calculateDerivedFields(extracted);
  
  return extracted;
}

/**
 * Extract basic financial fields
 */
function extractBasicFields(text: string, extracted: Partial<CanonicalStatement>): void {
  for (const pattern of EXTRACTION_PATTERNS) {
    const matches = text.match(pattern.pattern);
    if (matches) {
      for (const match of matches) {
        if (pattern.field === 'statementBalance' || 
            pattern.field === 'minimumDue' || 
            pattern.field === 'previousBalance' ||
            pattern.field === 'paymentsAndCredits' ||
            pattern.field === 'purchases' ||
            pattern.field === 'fees' ||
            pattern.field === 'interest' ||
            pattern.field === 'cashAdvances' ||
            pattern.field === 'creditLimit' ||
            pattern.field === 'availableCredit') {
          
          const amount = extractAmount(match);
          if (amount !== null && amount > 0) {
            (extracted as any)[pattern.field] = amount;
            extracted.confidenceByField![pattern.field] = calculateConfidence(
              pattern.type, 
              true, // context match
              matches.length > 1 // multiple matches
            );
            break;
          }
        } else if (pattern.field === 'paymentDueDate' || 
                   pattern.field === 'statementPeriodEnd') {
          
          const date = extractDate(match);
          if (date) {
            (extracted as any)[pattern.field] = date;
            extracted.confidenceByField![pattern.field] = calculateConfidence(
              pattern.type,
              true,
              matches.length > 1
            );
            break;
          }
        }
      }
    }
  }
}

/**
 * Extract card information
 */
function extractCardInfo(text: string, extracted: Partial<CanonicalStatement>): void {
  // Extract card last 4 digits
  const last4 = extractCardLast4(text);
  if (last4) {
    extracted.cardLast4 = last4;
    extracted.confidenceByField!.cardLast4 = 0.90;
  }
  
  // Detect currency
  if (text.includes('USD') || text.includes('$') || text.includes('dollars')) {
    extracted.currency = 'USD';
  } else if (text.includes('MXN') || text.includes('pesos')) {
    extracted.currency = 'MXN';
  } else if (text.includes('EUR') || text.includes('€') || text.includes('euros')) {
    extracted.currency = 'EUR';
  } else {
    extracted.currency = 'USD'; // Default
  }
}

/**
 * Extract APR information
 */
function extractAPRs(text: string, extracted: Partial<CanonicalStatement>): void {
  const aprPatterns = [
    {
      pattern: /purchase.{0,20}(?:APR|rate).{0,10}(\d{1,2}[.,]?\d{0,2})\s?%/gi,
      field: 'aprPurchase' as keyof CanonicalStatement
    },
    {
      pattern: /cash.{0,20}(?:APR|rate).{0,10}(\d{1,2}[.,]?\d{0,2})\s?%/gi,
      field: 'aprCash' as keyof CanonicalStatement
    },
    {
      pattern: /installment.{0,20}(?:APR|rate).{0,10}(\d{1,2}[.,]?\d{0,2})\s?%/gi,
      field: 'aprInstallment' as keyof CanonicalStatement
    }
  ];
  
  for (const aprPattern of aprPatterns) {
    const matches = text.match(aprPattern.pattern);
    if (matches) {
      const aprValue = parseFloat(matches[0].match(/(\d{1,2}[.,]?\d{0,2})/)?.[1]?.replace(',', '.') || '0');
      if (aprValue > 0) {
        (extracted as any)[aprPattern.field] = aprValue;
        extracted.confidenceByField![aprPattern.field] = 0.80;
      }
    }
  }
}

/**
 * Calculate derived fields
 */
function calculateDerivedFields(extracted: Partial<CanonicalStatement>): void {
  // Calculate closing day from statement period end
  if (extracted.statementPeriodEnd) {
    const date = new Date(extracted.statementPeriodEnd);
    extracted.closingDay = date.getDate();
  }
  
  // Calculate available credit if not found but credit limit exists
  if (extracted.creditLimit && !extracted.availableCredit && extracted.statementBalance) {
    extracted.availableCredit = extracted.creditLimit - extracted.statementBalance;
    extracted.confidenceByField!.availableCredit = 0.60; // Inferred
  }
}


