/**
 * Credit Card Installment Plan Inference System
 * 
 * Detects installment plans from transaction patterns when explicit
 * statement data is not available.
 */

import type { 
  CCInstallmentPlan, 
  CCCardEngineState 
} from './types.js';
import { requireFeature, withFeatureFlag } from './feature.js';

// ============================================================================
// MAIN INFERENCE FUNCTION
// ============================================================================

/**
 * Infer installment plans from transactions and statement data
 * @param params - Inference parameters
 */
export function inferInstallmentPlans(params: {
  cardId: string;
  txns: any[];
  statement?: any;
}): CCInstallmentPlan[] {
  return withFeatureFlag(() => {
    console.log('🔍 Inferring installment plans for card:', params.cardId);
    
    const plans: CCInstallmentPlan[] = [];
    
    // If statement has explicit plans, use those
    if (params.statement?.installmentPlans) {
      console.log('📄 Using statement plans');
      return parseStatementPlans(params.statement.installmentPlans, params.cardId);
    }
    
    // Otherwise, infer from transaction patterns
    console.log('🧠 Inferring from transaction patterns');
    const inferredPlans = inferFromTransactions(params.txns, params.cardId);
    plans.push(...inferredPlans);
    
    return plans;
  }, []);
}

// ============================================================================
// STATEMENT PLAN PARSING
// ============================================================================

/**
 * Parse installment plans from statement data
 * @param statementPlans - Plans from statement
 * @param cardId - Credit card ID
 */
function parseStatementPlans(statementPlans: any[], cardId: string): CCInstallmentPlan[] {
  if (!requireFeature('planInference', 'parseStatementPlans')) return [];
  
  return statementPlans.map((plan, index) => ({
    planId: `plan_${cardId}_${index}`,
    descriptor: plan.descriptor || `Statement Plan ${index + 1}`,
    startDate: plan.startDate || new Date().toISOString().slice(0, 10),
    termMonths: plan.termMonths || plan.totalPayments || 12,
    monthsElapsed: plan.monthsElapsed || 0,
    monthlyCharge: plan.monthlyCharge || 0,
    remainingPayments: plan.remainingPayments || plan.termMonths || 12,
    remainingPrincipal: plan.remainingPrincipal,
    planApr: plan.planApr,
    nextChargeDate: plan.nextChargeDate,
    status: (plan.remainingPayments || plan.termMonths || 12) > 0 ? 'active' : 'closed',
    source: 'statement' as const,
    confidence: 1.0
  }));
}

// ============================================================================
// TRANSACTION PATTERN INFERENCE
// ============================================================================

/**
 * Infer installment plans from transaction patterns
 * @param txns - Credit card transactions
 * @param cardId - Credit card ID
 */
function inferFromTransactions(txns: any[], cardId: string): CCInstallmentPlan[] {
  if (!requireFeature('planInference', 'inferFromTransactions')) return [];
  
  const plans: CCInstallmentPlan[] = [];
  
  // Filter for expense transactions on this card
  const cardExpenses = txns.filter(txn => 
    txn.fromAccountId === cardId && 
    txn.transactionType === 'Expense'
  );
  
  // Group transactions by similar amounts and patterns
  const amountGroups = groupTransactionsByAmount(cardExpenses);
  
  // Analyze each group for installment patterns
  for (const [amount, transactions] of amountGroups) {
    const plan = analyzeAmountGroup(amount, transactions, cardId);
    if (plan) {
      plans.push(plan);
    }
  }
  
  return plans;
}

/**
 * Group transactions by similar amounts
 * @param txns - Transactions to group
 */
function groupTransactionsByAmount(txns: any[]): Map<number, any[]> {
  const groups = new Map<number, any[]>();
  
  for (const txn of txns) {
    const amount = Math.round(txn.amount * 100) / 100; // Round to 2 decimals
    const key = amount;
    
    if (!groups.has(key)) {
      groups.set(key, []);
    }
    groups.get(key)!.push(txn);
  }
  
  return groups;
}

/**
 * Analyze a group of transactions for installment patterns
 * @param amount - Transaction amount
 * @param transactions - Transactions with this amount
 * @param cardId - Credit card ID
 */
function analyzeAmountGroup(amount: number, transactions: any[], cardId: string): CCInstallmentPlan | null {
  if (transactions.length < 2) return null; // Need at least 2 transactions
  
  // Sort by date
  transactions.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  
  // Check for monthly pattern
  const monthlyPattern = detectMonthlyPattern(transactions);
  if (!monthlyPattern) return null;
  
  // Calculate plan details
  const startDate = monthlyPattern.firstDate;
  const monthsElapsed = monthlyPattern.monthCount;
  const totalExpected = monthlyPattern.totalExpected || 12; // Default 12 months
  
  // Create plan descriptor from transaction descriptions
  const descriptor = generatePlanDescriptor(transactions);
  
  return {
    planId: `inferred_${cardId}_${amount}_${Date.now()}`,
    descriptor,
    startDate,
    termMonths: totalExpected,
    monthsElapsed,
    monthlyCharge: amount,
    remainingPayments: Math.max(0, totalExpected - monthsElapsed),
    status: monthsElapsed < totalExpected ? 'active' : 'closed',
    source: 'inferred' as const,
    confidence: calculateConfidence(monthlyPattern)
  };
}

// ============================================================================
// PATTERN DETECTION
// ============================================================================

/**
 * Detect monthly payment patterns
 * @param transactions - Transactions to analyze
 */
function detectMonthlyPattern(transactions: any[]): {
  firstDate: string;
  monthCount: number;
  totalExpected?: number;
  confidence: number;
} | null {
  if (transactions.length < 2) return null;
  
  const firstDate = new Date(transactions[0].date);
  const lastDate = new Date(transactions[transactions.length - 1].date);
  
  // Calculate months between first and last transaction
  const monthsDiff = (lastDate.getFullYear() - firstDate.getFullYear()) * 12 + 
                    (lastDate.getMonth() - firstDate.getMonth());
  
  // Check if transactions are roughly monthly
  const expectedMonths = monthsDiff + 1; // Include first month
  const actualCount = transactions.length;
  
  // Allow some tolerance (80% match)
  const tolerance = Math.ceil(expectedMonths * 0.2);
  if (Math.abs(actualCount - expectedMonths) > tolerance) {
    return null;
  }
  
  // Check date spacing (transactions should be roughly 25-35 days apart)
  const dateSpacing = checkDateSpacing(transactions);
  if (!dateSpacing) return null;
  
  return {
    firstDate: transactions[0].date,
    monthCount: actualCount,
    totalExpected: inferTotalMonths(transactions),
    confidence: dateSpacing
  };
}

/**
 * Check if transactions have consistent monthly spacing
 * @param transactions - Transactions to check
 */
function checkDateSpacing(transactions: any[]): number {
  if (transactions.length < 3) return 0.6; // Low confidence for few transactions
  
  const spacings: number[] = [];
  
  for (let i = 1; i < transactions.length; i++) {
    const prevDate = new Date(transactions[i - 1].date);
    const currDate = new Date(transactions[i].date);
    const daysDiff = (currDate.getTime() - prevDate.getTime()) / (1000 * 60 * 60 * 24);
    spacings.push(daysDiff);
  }
  
  // Check if spacings are consistent (25-35 days)
  const consistentSpacings = spacings.filter(days => days >= 25 && days <= 35);
  const consistencyRatio = consistentSpacings.length / spacings.length;
  
  return consistencyRatio;
}

/**
 * Infer total number of months for a plan
 * @param transactions - Transactions to analyze
 */
function inferTotalMonths(transactions: any[]): number {
  // Common installment periods
  const commonPeriods = [6, 12, 18, 24, 36];
  
  // If we have enough transactions, try to detect the pattern
  if (transactions.length >= 3) {
    const firstDate = new Date(transactions[0].date);
    const lastDate = new Date(transactions[transactions.length - 1].date);
    const monthsElapsed = (lastDate.getFullYear() - firstDate.getFullYear()) * 12 + 
                         (lastDate.getMonth() - firstDate.getMonth()) + 1;
    
    // If we're still seeing payments, estimate total
    if (transactions.length >= monthsElapsed * 0.8) {
      // Estimate based on common patterns
      for (const period of commonPeriods) {
        if (monthsElapsed >= period * 0.6 && monthsElapsed <= period) {
          return period;
        }
      }
      
      // Default to 12 months if no clear pattern
      return 12;
    }
  }
  
  // Default to 12 months
  return 12;
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Generate a plan descriptor from transaction descriptions
 * @param transactions - Transactions to analyze
 */
function generatePlanDescriptor(transactions: any[]): string {
  // Get the most common description pattern
  const descriptions = transactions.map(t => t.description || '').filter(d => d.length > 0);
  
  if (descriptions.length === 0) {
    return 'Inferred Installment Plan';
  }
  
  // Find common words/phrases
  const words = descriptions.join(' ').toLowerCase().split(/\s+/);
  const wordCounts = new Map<string, number>();
  
  for (const word of words) {
    if (word.length > 3) { // Only consider words longer than 3 characters
      wordCounts.set(word, (wordCounts.get(word) || 0) + 1);
    }
  }
  
  // Get the most common word
  let mostCommon = '';
  let maxCount = 0;
  
  for (const [word, count] of wordCounts) {
    if (count > maxCount) {
      maxCount = count;
      mostCommon = word;
    }
  }
  
  if (mostCommon) {
    return `${mostCommon.charAt(0).toUpperCase() + mostCommon.slice(1)} Installment`;
  }
  
  // Fallback to first transaction description
  return descriptions[0] || 'Inferred Installment Plan';
}

/**
 * Calculate confidence score for an inferred plan
 * @param pattern - Detected pattern
 */
function calculateConfidence(pattern: { confidence: number }): number {
  // Base confidence from pattern detection
  let confidence = pattern.confidence;
  
  // Boost confidence for more transactions
  if (pattern.confidence > 0.8) {
    confidence = Math.min(1.0, confidence + 0.1);
  }
  
  // Reduce confidence for fewer transactions
  if (pattern.confidence < 0.6) {
    confidence = Math.max(0.3, confidence - 0.2);
  }
  
  return Math.round(confidence * 100) / 100; // Round to 2 decimals
}

// ============================================================================
// PLAN VALIDATION
// ============================================================================

/**
 * Validate inferred plans for sanity
 * @param plans - Plans to validate
 */
export function validateInferredPlans(plans: CCInstallmentPlan[]): CCInstallmentPlan[] {
  return plans.filter(plan => {
    // Check for reasonable values
    if (plan.monthlyCharge <= 0) return false;
    if (plan.termMonths <= 0 || plan.termMonths > 60) return false;
    if (plan.remainingPayments < 0) return false;
    if (plan.confidence < 0.3) return false;
    
    // Check date validity
    const startDate = new Date(plan.startDate);
    if (isNaN(startDate.getTime())) return false;
    
    // Check if plan is too old (more than 2 years)
    const twoYearsAgo = new Date();
    twoYearsAgo.setFullYear(twoYearsAgo.getFullYear() - 2);
    if (startDate < twoYearsAgo) return false;
    
    return true;
  });
}






