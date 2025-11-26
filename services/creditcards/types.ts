/**
 * Credit Card Engine Types
 * 
 * This module defines all interfaces for the credit card cycle & installment engine.
 * All types are additive and backward-compatible with existing code.
 */

// ============================================================================
// CORE CREDIT CARD ENGINE TYPES
// ============================================================================

export type CCIssuerCycle = {
  closingDay: number;              // 1..28
  lastCloseDate?: string;          // ISO
  nextCloseDate?: string;          // ISO
  dueDate?: string;                // ISO (for the last statement)
  graceApplies?: boolean;
};

export type CCRates = {
  aprPurchase?: number;
  aprCash?: number;
  aprInstallment?: number;
};

export type CCStatementSnapshot = {
  statementCloseDate: string;      // ISO
  statementBalance: number;        // ending balance on that statement
  minimumDue?: number;
  revolvingBalance?: number;       // non-installment portion if known
  feesAccrued?: number;
  interestAccrued?: number;
};

export type CCInstallmentPlan = {
  planId: string;                  // stable id
  descriptor: string;              // e.g., "Laptop $600"
  startDate: string;               // ISO
  termMonths: number;
  monthsElapsed?: number;          // optional; computed if missing
  monthlyCharge: number;           // principal + fee/interest (as billed)
  remainingPayments: number;
  remainingPrincipal?: number;
  planApr?: number;                // if APR model; optional
  nextChargeDate?: string;         // ISO (aligned to cycle/due date)
  status: "active" | "closed";
  source: "statement" | "inferred";
  confidence: number;              // 0..1
};

export type CCPaymentAllocation = {
  paymentId: string;
  date: string;                    // ISO
  amount: number;
  applied: { 
    fees: number; 
    installments: number; 
    revolving: number;
  };
};

export type CCCardEngineState = {
  cardId: string;                  // matches existing card/account id
  issuer?: string;
  last4?: string;
  currency?: string;

  cycle?: CCIssuerCycle;
  rates?: CCRates;
  snapshot?: CCStatementSnapshot;
  installmentPlans?: CCInstallmentPlan[];

  reconciliation?: {
    lastPaymentDate?: string;
    lastPaymentAmount?: number;
    unappliedAdjustments?: number;
    confidence?: number;
  };
};

// ============================================================================
// TRANSACTION AUGMENTATION TYPES
// ============================================================================

export type TransactionCardMeta = {
  cardId?: string;                 // link to CCCardEngineState.cardId
  isInstallmentCharge?: boolean;   // true if this posted as a monthly plan charge
  installmentPlanId?: string;      // back-reference when we synthesize the monthly charge
};

// ============================================================================
// ENGINE COMPUTATION RESULTS
// ============================================================================

export type CCCycleInfo = {
  periodStart: string;             // ISO
  periodEnd: string;               // ISO
  dueDate: string;                 // ISO
};

export type CCAmountsDue = {
  cycle: CCCycleInfo;
  installmentDue: number;
  feesInterest: number;
  revolvingMin: number;
  minimumDue: number;
  totalDue: number;
};

export type CCInstallmentForecast = {
  date: string;                    // ISO
  amount: number;
  planId: string;
  descriptor: string;
};

// ============================================================================
// RECONCILIATION TYPES
// ============================================================================

export type CCReconciliationResult = {
  ok: boolean;
  diff: number;
  notes: string[];
};

export type CCPredictionResult = {
  predictedStatementBalance: number;
  confidence: number;
};

// ============================================================================
// GUARD/WARNING TYPES
// ============================================================================

export type CCGuardWarning = {
  type: 'date_drift' | 'plan_mismatch' | 'negative_remaining' | 'balance_discrepancy';
  severity: 'low' | 'medium' | 'high';
  message: string;
  data?: any;
};

// ============================================================================
// UI ADAPTER TYPES
// ============================================================================

export type CCCardSnapshot = {
  dueDate: string;
  totalDue: number;
  minimumDue: number;
  includesInstallments: number;    // sum for this cycle
  plansCount: number;
  basedOn: 'statement' | 'estimated';
  warnings: string[];
};

// ============================================================================
// STATEMENT INGESTION TYPES
// ============================================================================

export type CCStatementIngestResult = {
  success: boolean;
  data?: Partial<CCCardEngineState>;
  errors?: string[];
  warnings?: string[];
};

export type CCStatementSource = 'pdf' | 'csv' | 'ofx' | 'manual' | 'text';

// ============================================================================
// FEATURE FLAG TYPES
// ============================================================================

export type CCFeatureConfig = {
  enabled: boolean;
  syntheticTransactions: boolean;
  statementIngestion: boolean;
  planInference: boolean;
  reconciliation: boolean;
};






