/**
 * Credit Card Statement Ingestion System
 * 
 * Parses various statement formats (PDF, CSV, OFX) and extracts
 * credit card cycle information, installment plans, and balances.
 */

import type { 
  CCCardEngineState, 
  CCStatementIngestResult, 
  CCStatementSource,
  CCInstallmentPlan,
  CCIssuerCycle,
  CCStatementSnapshot,
  CCRates
} from './types.js';
import { requireFeature, withFeatureFlagAsync } from './feature.js';

// ============================================================================
// MAIN INGESTION FUNCTION
// ============================================================================

/**
 * Ingest a credit card statement from various sources
 * @param fileOrText - File object, text content, or manual data
 * @param cardId - Credit card ID
 * @param source - Source type
 */
export async function ingestStatement(
  fileOrText: File | string | object,
  cardId: string,
  source: CCStatementSource = 'manual'
): Promise<CCStatementIngestResult> {
  return await withFeatureFlagAsync(async () => {
    console.log('📄 Ingesting statement for card:', cardId, 'from:', source);
    
    try {
      let rawData: any;
      
      switch (source) {
        case 'pdf':
          rawData = await parsePDF(fileOrText as File);
          break;
        case 'csv':
          rawData = await parseCSV(fileOrText as File);
          break;
        case 'ofx':
          rawData = await parseOFX(fileOrText as File);
          break;
        case 'text':
          rawData = parseText(fileOrText as string);
          break;
        case 'manual':
          rawData = fileOrText as object;
          break;
        default:
          throw new Error(`Unsupported source type: ${source}`);
      }
      
      // Normalize the data
      const normalizedData = normalizeStatementData(rawData, cardId);
      
      return {
        success: true,
        data: normalizedData,
        warnings: []
      };
      
    } catch (error) {
      console.error('❌ Statement ingestion failed:', error);
      return {
        success: false,
        errors: [error instanceof Error ? error.message : 'Unknown error'],
        warnings: []
      };
    }
  }, {
    success: false,
    errors: ['CC Engine disabled'],
    warnings: []
  });
}

// ============================================================================
// PARSER IMPLEMENTATIONS
// ============================================================================

/**
 * Parse PDF statement (placeholder implementation)
 * @param file - PDF file
 */
async function parsePDF(file: File): Promise<any> {
  if (!requireFeature('statementIngestion', 'parsePDF')) {
    throw new Error('Statement ingestion disabled');
  }
  
  // TODO: Implement PDF parsing using a library like pdf-parse or pdf2pic
  console.log('📄 Parsing PDF:', file.name);
  
  // Placeholder - return mock data structure
  return {
    issuer: 'Chase',
    statementDate: '2025-10-05',
    dueDate: '2025-11-02',
    statementBalance: 1905.50,
    minimumDue: 157.04,
    feesAccrued: 0,
    interestAccrued: 0,
    installmentPlans: [
      {
        descriptor: 'Laptop Purchase',
        monthlyCharge: 157.04,
        remainingPayments: 10,
        totalPayments: 12
      }
    ]
  };
}

/**
 * Parse CSV statement (placeholder implementation)
 * @param file - CSV file
 */
async function parseCSV(file: File): Promise<any> {
  if (!requireFeature('statementIngestion', 'parseCSV')) {
    throw new Error('Statement ingestion disabled');
  }
  
  console.log('📊 Parsing CSV:', file.name);
  
  // TODO: Implement CSV parsing
  return {
    issuer: 'Amex',
    statementDate: '2025-10-15',
    dueDate: '2025-11-10',
    statementBalance: 2500.00,
    minimumDue: 75.00,
    feesAccrued: 0,
    interestAccrued: 0,
    installmentPlans: []
  };
}

/**
 * Parse OFX statement (placeholder implementation)
 * @param file - OFX file
 */
async function parseOFX(file: File): Promise<any> {
  if (!requireFeature('statementIngestion', 'parseOFX')) {
    throw new Error('Statement ingestion disabled');
  }
  
  console.log('🏦 Parsing OFX:', file.name);
  
  // TODO: Implement OFX parsing
  return {
    issuer: 'Bank of America',
    statementDate: '2025-10-01',
    dueDate: '2025-10-25',
    statementBalance: 1200.00,
    minimumDue: 35.00,
    feesAccrued: 0,
    interestAccrued: 0,
    installmentPlans: []
  };
}

/**
 * Parse text content (placeholder implementation)
 * @param text - Text content
 */
function parseText(text: string): any {
  if (!requireFeature('statementIngestion', 'parseText')) {
    throw new Error('Statement ingestion disabled');
  }
  
  console.log('📝 Parsing text content');
  
  // TODO: Implement text parsing with regex patterns
  return {
    issuer: 'Manual Entry',
    statementDate: new Date().toISOString().slice(0, 10),
    dueDate: new Date(Date.now() + 25 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
    statementBalance: 0,
    minimumDue: 0,
    feesAccrued: 0,
    interestAccrued: 0,
    installmentPlans: []
  };
}

// ============================================================================
// DATA NORMALIZATION
// ============================================================================

/**
 * Normalize parsed statement data into CC engine format
 * @param rawData - Raw parsed data
 * @param cardId - Credit card ID
 */
function normalizeStatementData(rawData: any, cardId: string): Partial<CCCardEngineState> {
  const normalized: Partial<CCCardEngineState> = {
    cardId,
    issuer: rawData.issuer,
    currency: 'USD' // Default, could be extracted from data
  };
  
  // Normalize cycle information
  if (rawData.statementDate || rawData.dueDate) {
    const cycle: CCIssuerCycle = {
      closingDay: extractClosingDay(rawData.statementDate),
      graceApplies: true
    };
    
    if (rawData.statementDate) {
      cycle.lastCloseDate = rawData.statementDate;
    }
    
    if (rawData.dueDate) {
      cycle.dueDate = rawData.dueDate;
    }
    
    // Calculate next closing date
    if (cycle.lastCloseDate) {
      cycle.nextCloseDate = calculateNextClosingDate(cycle.lastCloseDate, cycle.closingDay);
    }
    
    normalized.cycle = cycle;
  }
  
  // Normalize statement snapshot
  if (rawData.statementBalance !== undefined) {
    const snapshot: CCStatementSnapshot = {
      statementCloseDate: rawData.statementDate || new Date().toISOString().slice(0, 10),
      statementBalance: rawData.statementBalance,
      minimumDue: rawData.minimumDue,
      feesAccrued: rawData.feesAccrued || 0,
      interestAccrued: rawData.interestAccrued || 0
    };
    
    normalized.snapshot = snapshot;
  }
  
  // Normalize installment plans
  if (rawData.installmentPlans && Array.isArray(rawData.installmentPlans)) {
    normalized.installmentPlans = rawData.installmentPlans.map((plan: any, index: number) => {
      return {
        planId: `plan_${cardId}_${index}`,
        descriptor: plan.descriptor || `Installment Plan ${index + 1}`,
        startDate: plan.startDate || rawData.statementDate || new Date().toISOString().slice(0, 10),
        termMonths: plan.totalPayments || 12,
        monthsElapsed: (plan.totalPayments || 12) - (plan.remainingPayments || 0),
        monthlyCharge: plan.monthlyCharge || 0,
        remainingPayments: plan.remainingPayments || 0,
        status: (plan.remainingPayments || 0) > 0 ? 'active' : 'closed',
        source: 'statement' as const,
        confidence: 1.0
      };
    });
  }
  
  // Normalize rates if available
  if (rawData.aprPurchase || rawData.aprCash || rawData.aprInstallment) {
    normalized.rates = {
      aprPurchase: rawData.aprPurchase,
      aprCash: rawData.aprCash,
      aprInstallment: rawData.aprInstallment
    };
  }
  
  return normalized;
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Extract closing day from statement date
 * @param statementDate - Statement date string
 */
function extractClosingDay(statementDate?: string): number {
  if (!statementDate) return 25; // Default
  
  const date = new Date(statementDate);
  return date.getDate();
}

/**
 * Calculate next closing date
 * @param lastCloseDate - Last closing date
 * @param closingDay - Day of month for closing
 */
function calculateNextClosingDate(lastCloseDate: string, closingDay: number): string {
  const lastClose = new Date(lastCloseDate);
  const nextClose = new Date(lastClose);
  nextClose.setMonth(nextClose.getMonth() + 1);
  nextClose.setDate(closingDay);
  
  return nextClose.toISOString().slice(0, 10);
}

// ============================================================================
// MANUAL ENTRY HELPERS
// ============================================================================

/**
 * Create manual statement entry form data
 */
export function createManualEntryTemplate(): Partial<CCCardEngineState> {
  return {
    cycle: {
      closingDay: 25,
      graceApplies: true
    },
    snapshot: {
      statementCloseDate: new Date().toISOString().slice(0, 10),
      statementBalance: 0,
      minimumDue: 0
    },
    installmentPlans: []
  };
}

/**
 * Validate manual entry data
 * @param data - Manual entry data
 */
export function validateManualEntry(data: Partial<CCCardEngineState>): string[] {
  const errors: string[] = [];
  
  if (!data.cycle?.closingDay || data.cycle.closingDay < 1 || data.cycle.closingDay > 28) {
    errors.push('Closing day must be between 1 and 28');
  }
  
  if (data.snapshot && data.snapshot.statementBalance < 0) {
    errors.push('Statement balance cannot be negative');
  }
  
  if (data.snapshot && data.snapshot.minimumDue && data.snapshot.minimumDue < 0) {
    errors.push('Minimum due cannot be negative');
  }
  
  return errors;
}


