// services/cards_convergent/types.ts
// Type definitions for Cards Convergent V2 system

export interface Money {
  amount: number;
  currency: string;
}

export interface DateRange {
  start: string; // ISO date
  end: string;   // ISO date
}

export interface InstallmentPlan {
  id: string;
  descriptor: string;
  monthlyCharge: number;
  remainingPayments: number | null; // null for aggregate plans
  source: 'statement' | 'structured' | 'pdf' | 'inferred';
  confidence: number;
  startDate?: string;
  endDate?: string;
  isEstimated?: boolean;
}

export interface CardSnapshot {
  cardId: string;
  dueDate: string;
  minimumDue: number;
  totalDue: number;
  includesInstallments: boolean;
  plansCount: number;
  basedOn: 'summary' | 'structured' | 'pdf-confirmed' | 'inferred' | 'defaults';
  warnings: string[];
  confidence: number;
  lastUpdated: string;
}

// Multi-source ingestion types
export interface SummaryData {
  minimumDue?: number;
  dueDate?: string;
  statementBalance?: number;
  closingDate?: string;
  confidence: number;
  source: 'paste' | 'ocr';
  timestamp: string;
}

export interface StructuredData {
  periodStart: string;
  periodEnd: string;
  statementBalance: number;
  minimumDue: number;
  payments: number;
  purchases: number;
  fees: number;
  interest: number;
  aggregateInstallmentDue?: number;
  confidence: number;
  source: 'csv' | 'ofx' | 'qfx';
  timestamp: string;
}

export interface PdfData {
  [field: string]: {
    value: any;
    confidence: number;
    source: 'pdf' | 'ocr';
  };
  timestamp: string;
}

export interface TransactionData {
  periodStart: string;
  periodEnd: string;
  transactions: Array<{
    date: string;
    amount: number;
    description: string;
    type: 'payment' | 'purchase' | 'fee' | 'interest' | 'installment';
  }>;
  timestamp: string;
}

export interface InferredData {
  installmentPlans: InstallmentPlan[];
  estimatedCycle: {
    closingDate: string;
    dueDate: string;
    minimumDue: number;
  };
  confidence: number;
  timestamp: string;
}

// Truth layers
export interface TruthLayers {
  L1_summary?: SummaryData;
  L2_structured?: StructuredData;
  L3_pdf?: PdfData;
  L0_tx?: TransactionData;
  Lx_inferred?: InferredData;
}

export interface ConvergentTruth {
  cardId: string;
  layers: TruthLayers;
  merged: CardSnapshot;
  reconciliation: {
    balanceMatch: boolean;
    driftAmount: number;
    warnings: string[];
  };
  lastMerge: string;
}

// Parsing results
export interface ParseResult {
  minimumDue?: number;
  dueDate?: string;
  statementBalance?: number;
  closingDate?: string;
  confidence: number;
  matchedFields: string[];
  warnings: string[];
}

// Confirmation modal data
export interface ConfirmationData {
  dueDate: string;
  minimumDue: number;
  statementBalance: number;
  closingDate: string;
  installments: Array<{
    descriptor: string;
    amount: number;
    remaining?: number;
    source: string;
    confidence: number;
  }>;
  fieldConfidence: {
    dueDate: number;
    minimumDue: number;
    statementBalance: number;
    closingDate: number;
  };
  source: string;
}

// Reconciliation result
export interface ReconciliationResult {
  computedEnding: number;
  statementBalance: number;
  difference: number;
  isMatch: boolean;
  warnings: string[];
  appliedPayments: {
    fees: number;
    interest: number;
    installments: number;
    revolving: number;
  };
}