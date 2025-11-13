/**
 * Universal Statement Ingestion V2 - Type Definitions
 * 
 * This module defines the canonical data structures for parsed credit card statements
 * across different issuers and languages.
 */

export type CanonicalStatement = {
  issuer?: string;               // e.g., "American Express", "Citi"
  cardLast4?: string;            // ****1234
  currency?: string;             // USD, MXN, etc.

  // Cycle
  statementPeriodStart?: string; // ISO date if present
  statementPeriodEnd?: string;   // ISO (a.k.a. closing date)
  closingDay?: number;           // 1..28 derived from End
  paymentDueDate?: string;       // ISO

  // Balances & components
  previousBalance?: number;
  statementBalance?: number;     // "New Balance" / "Saldo al corte"
  minimumDue?: number;           // "Minimum Payment Due" / "Pago mínimo"
  paymentsAndCredits?: number;
  purchases?: number;            // net purchases
  cashAdvances?: number;
  fees?: number;                 // includes annual/late if grouped
  interest?: number;

  // Limits
  creditLimit?: number;
  availableCredit?: number;

  // APRs (optional but try)
  aprPurchase?: number;
  aprCash?: number;
  aprInstallment?: number;

  // Installment plans
  installmentPlans: Array<{
    planId?: string;            // stable hash we generate
    descriptor: string;         // e.g., "Plan It Laptop"
    startDate?: string;         // ISO if available
    termMonths?: number;        // 3/6/12/etc
    monthsElapsed?: number;
    remainingPayments?: number;
    monthlyCharge?: number;     // billed each statement
    remainingPrincipal?: number;
    planApr?: number;           // or fixed fee model (set as apr=null)
    source: "statement" | "inferred";
    confidence: number;         // 0..1
  }>;

  // Provenance & quality
  rawTextLength: number;
  confidenceByField: Record<string, number>; // 0..1 per field
  warnings: string[];
  needsUserConfirm: boolean;
};

export type StatementParseResult = {
  success: boolean;
  data?: CanonicalStatement;
  errors?: string[];
  warnings?: string[];
};

export type ExtractionContext = {
  text: string;
  issuer?: string;
  language: 'en' | 'es' | 'auto';
  fileType: 'pdf' | 'csv' | 'ofx' | 'image' | 'text';
  confidenceThreshold: number;
};

export type FieldExtraction = {
  value: any;
  confidence: number;
  source: string; // which pattern matched
  rawMatch?: string;
};

export type InstallmentPlanRaw = {
  descriptor?: string;
  monthlyCharge?: number;
  remainingPayments?: number;
  remainingPrincipal?: number;
  termMonths?: number;
  planApr?: number;
  startDate?: string;
  source: "statement" | "inferred";
  confidence: number;
};

export type BalanceEquation = {
  previousBalance: number;
  paymentsAndCredits: number;
  purchases: number;
  fees: number;
  interest: number;
  cashAdvances: number;
  computedEnding: number;
  actualEnding: number;
  difference: number;
  isValid: boolean;
};

export type StatementTemplate = {
  issuer: string;
  language: 'en' | 'es';
  patterns: {
    balance?: RegExp[];
    minimumDue?: RegExp[];
    dueDate?: RegExp[];
    closingDate?: RegExp[];
    installmentSection?: RegExp[];
  };
  confidence: number;
};


