/**
 * Credit Card Reconciliation System
 * 
 * Verifies balance calculations against statements and transactions,
 * identifies discrepancies, and provides reconciliation reports.
 */

import type { 
  CCCardEngineState, 
  CCStatementSnapshot, 
  CCReconciliationResult, 
  CCPredictionResult,
  CCPaymentAllocation
} from './types.js';
import { requireFeature, withFeatureFlag } from './feature.js';

// ============================================================================
// STATEMENT RECONCILIATION
// ============================================================================

/**
 * Reconcile card state against a statement snapshot
 * @param cardId - Credit card ID
 * @param statement - Statement snapshot
 */
export function reconcileAgainstStatement(
  cardId: string, 
  statement: CCStatementSnapshot
): CCReconciliationResult {
  return withFeatureFlag(() => {
    console.log('🔍 Reconciling card against statement:', cardId);
    
    const notes: string[] = [];
    let diff = 0;
    let ok = true;
    
    // Get current card state (placeholder - would integrate with actual state)
    const card = getCardEngineState(cardId);
    if (!card) {
      return {
        ok: false,
        diff: 0,
        notes: ['Card state not found']
      };
    }
    
    // Calculate expected balance using the reconciliation formula
    const expectedBalance = calculateExpectedBalance(card, statement);
    
    // Compare with statement balance
    diff = expectedBalance - statement.statementBalance;
    
    if (Math.abs(diff) > 0.01) { // Allow for small rounding differences
      ok = false;
      notes.push(`Balance discrepancy: Expected $${expectedBalance.toFixed(2)}, Statement shows $${statement.statementBalance.toFixed(2)}`);
      notes.push(`Difference: $${diff.toFixed(2)}`);
      
      // Store unapplied adjustment
      if (card.reconciliation) {
        card.reconciliation.unappliedAdjustments = (card.reconciliation.unappliedAdjustments || 0) + diff;
        card.reconciliation.confidence = Math.max(0, card.reconciliation.confidence - 0.2);
      }
    } else {
      notes.push('Balance reconciliation successful');
    }
    
    // Check minimum due
    if (statement.minimumDue !== undefined) {
      const expectedMinDue = calculateExpectedMinimumDue(card, statement);
      const minDueDiff = expectedMinDue - statement.minimumDue;
      
      if (Math.abs(minDueDiff) > 0.01) {
        notes.push(`Minimum due discrepancy: Expected $${expectedMinDue.toFixed(2)}, Statement shows $${statement.minimumDue.toFixed(2)}`);
      }
    }
    
    // Validate installment plans
    const planValidation = validateInstallmentPlans(card, statement);
    notes.push(...planValidation.notes);
    
    if (!planValidation.ok) {
      ok = false;
    }
    
    return { ok, diff, notes };
  }, {
    ok: true,
    diff: 0,
    notes: ['CC Engine disabled - reconciliation skipped']
  });
}

/**
 * Calculate expected balance using reconciliation formula
 * @param card - Card engine state
 * @param statement - Statement snapshot
 */
function calculateExpectedBalance(card: CCCardEngineState, statement: CCStatementSnapshot): number {
  // Formula: Ending = Prior - Payments - Credits + Purchases + Fees + Interest + InstallmentMonthlyCharges ± Adjustments
  
  let expectedBalance = 0;
  
  // Start with prior balance (from previous statement or initial balance)
  if (card.snapshot) {
    expectedBalance = card.snapshot.statementBalance;
  }
  
  // Subtract payments made since last statement
  const payments = getPaymentsSinceStatement(card, statement.statementCloseDate);
  expectedBalance -= payments;
  
  // Add new purchases since last statement
  const purchases = getPurchasesSinceStatement(card, statement.statementCloseDate);
  expectedBalance += purchases;
  
  // Add fees and interest from statement
  expectedBalance += (statement.feesAccrued || 0);
  expectedBalance += (statement.interestAccrued || 0);
  
  // Add installment charges for this cycle
  const installmentCharges = getInstallmentChargesForCycle(card, statement.statementCloseDate);
  expectedBalance += installmentCharges;
  
  // Apply any unapplied adjustments
  if (card.reconciliation?.unappliedAdjustments) {
    expectedBalance += card.reconciliation.unappliedAdjustments;
  }
  
  return expectedBalance;
}

/**
 * Calculate expected minimum due
 * @param card - Card engine state
 * @param statement - Statement snapshot
 */
function calculateExpectedMinimumDue(card: CCCardEngineState, statement: CCStatementSnapshot): number {
  // Minimum due = Fees + Interest + Installment monthly charges + Revolving minimum
  
  let expectedMinDue = 0;
  
  // Add fees and interest
  expectedMinDue += (statement.feesAccrued || 0);
  expectedMinDue += (statement.interestAccrued || 0);
  
  // Add installment charges
  const installmentCharges = getInstallmentChargesForCycle(card, statement.statementCloseDate);
  expectedMinDue += installmentCharges;
  
  // Add revolving minimum (1% of revolving balance, minimum $25)
  const revolvingBalance = statement.revolvingBalance || statement.statementBalance;
  const revolvingMin = Math.max(revolvingBalance * 0.01, 25);
  expectedMinDue += revolvingMin;
  
  return expectedMinDue;
}

/**
 * Validate installment plans against statement
 * @param card - Card engine state
 * @param statement - Statement snapshot
 */
function validateInstallmentPlans(card: CCCardEngineState, statement: CCStatementSnapshot): CCReconciliationResult {
  const notes: string[] = [];
  let ok = true;
  
  const activePlans = card.installmentPlans?.filter(plan => plan.status === 'active') || [];
  
  for (const plan of activePlans) {
    // Check if plan should have charged this cycle
    if (plan.nextChargeDate && plan.nextChargeDate <= statement.statementCloseDate) {
      // Verify the charge was applied
      const chargeApplied = checkInstallmentChargeApplied(card, plan, statement.statementCloseDate);
      
      if (!chargeApplied) {
        notes.push(`Missing installment charge for plan: ${plan.descriptor}`);
        ok = false;
      }
    }
    
    // Check remaining payments consistency
    if (plan.remainingPayments < 0) {
      notes.push(`Invalid remaining payments for plan: ${plan.descriptor} (${plan.remainingPayments})`);
      ok = false;
    }
  }
  
  return { ok, diff: 0, notes };
}

// ============================================================================
// TRANSACTION RECONCILIATION
// ============================================================================

/**
 * Reconcile against transactions to predict statement balance
 * @param cardId - Credit card ID
 * @param txns - Transactions to analyze
 * @param asOf - Date to reconcile as of
 */
export function reconcileAgainstTransactions(
  cardId: string, 
  txns: any[], 
  asOf: Date
): CCPredictionResult {
  return withFeatureFlag(() => {
    console.log('🔮 Predicting statement balance for card:', cardId);
    
    const card = getCardEngineState(cardId);
    if (!card) {
      return {
        predictedStatementBalance: 0,
        confidence: 0
      };
    }
    
    // Calculate balance from transactions
    let predictedBalance = 0;
    
    // Start with last known balance
    if (card.snapshot) {
      predictedBalance = card.snapshot.statementBalance;
    }
    
    // Add transactions since last statement
    const relevantTxns = txns.filter(txn => 
      txn.fromAccountId === cardId && 
      new Date(txn.date) > new Date(card.snapshot?.statementCloseDate || '1900-01-01')
    );
    
    for (const txn of relevantTxns) {
      if (txn.transactionType === 'Expense') {
        predictedBalance += txn.amount;
      } else if (txn.transactionType === 'Credit Card Payment') {
        predictedBalance -= txn.amount;
      }
    }
    
    // Add installment charges
    const installmentCharges = getInstallmentChargesForPeriod(card, card.snapshot?.statementCloseDate || '1900-01-01', asOf.toISOString().slice(0, 10));
    predictedBalance += installmentCharges;
    
    // Calculate confidence based on data quality
    let confidence = 0.8; // Base confidence
    
    // Reduce confidence if no recent statement
    if (!card.snapshot || !card.snapshot.statementCloseDate) {
      confidence -= 0.3;
    }
    
    // Reduce confidence if many unapplied adjustments
    if (card.reconciliation?.unappliedAdjustments && Math.abs(card.reconciliation.unappliedAdjustments) > 100) {
      confidence -= 0.2;
    }
    
    // Boost confidence if recent reconciliation was successful
    if (card.reconciliation?.confidence && card.reconciliation.confidence > 0.8) {
      confidence += 0.1;
    }
    
    confidence = Math.max(0, Math.min(1, confidence));
    
    return {
      predictedStatementBalance: predictedBalance,
      confidence
    };
  }, {
    predictedStatementBalance: 0,
    confidence: 0
  });
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Get payments made since a statement date
 * @param card - Card engine state
 * @param statementDate - Statement close date
 */
function getPaymentsSinceStatement(card: CCCardEngineState, statementDate: string): number {
  // This would integrate with actual transaction data
  // For now, return 0 as placeholder
  console.log('💰 Getting payments since statement:', statementDate);
  return 0;
}

/**
 * Get purchases made since a statement date
 * @param card - Card engine state
 * @param statementDate - Statement close date
 */
function getPurchasesSinceStatement(card: CCCardEngineState, statementDate: string): number {
  // This would integrate with actual transaction data
  // For now, return 0 as placeholder
  console.log('🛒 Getting purchases since statement:', statementDate);
  return 0;
}

/**
 * Get installment charges for a billing cycle
 * @param card - Card engine state
 * @param cycleEndDate - End date of billing cycle
 */
function getInstallmentChargesForCycle(card: CCCardEngineState, cycleEndDate: string): number {
  const activePlans = card.installmentPlans?.filter(plan => plan.status === 'active') || [];
  let totalCharges = 0;
  
  for (const plan of activePlans) {
    if (plan.nextChargeDate && plan.nextChargeDate <= cycleEndDate) {
      totalCharges += plan.monthlyCharge;
    }
  }
  
  return totalCharges;
}

/**
 * Get installment charges for a date period
 * @param card - Card engine state
 * @param startDate - Start date
 * @param endDate - End date
 */
function getInstallmentChargesForPeriod(card: CCCardEngineState, startDate: string, endDate: string): number {
  const activePlans = card.installmentPlans?.filter(plan => plan.status === 'active') || [];
  let totalCharges = 0;
  
  for (const plan of activePlans) {
    if (plan.nextChargeDate && plan.nextChargeDate >= startDate && plan.nextChargeDate <= endDate) {
      totalCharges += plan.monthlyCharge;
    }
  }
  
  return totalCharges;
}

/**
 * Check if an installment charge was applied
 * @param card - Card engine state
 * @param plan - Installment plan
 * @param statementDate - Statement date
 */
function checkInstallmentChargeApplied(card: CCCardEngineState, plan: any, statementDate: string): boolean {
  // This would check actual transaction data for the installment charge
  // For now, return true as placeholder
  console.log('✅ Checking installment charge for plan:', plan.planId);
  return true;
}

/**
 * Get card engine state (placeholder)
 * @param cardId - Credit card ID
 */
function getCardEngineState(cardId: string): CCCardEngineState | null {
  // This would integrate with actual state management
  // For now, return null to preserve existing behavior
  console.log('🔍 Getting card engine state for:', cardId);
  return null;
}

// ============================================================================
// RECONCILIATION REPORTS
// ============================================================================

/**
 * Generate reconciliation report
 * @param cardId - Credit card ID
 */
export function generateReconciliationReport(cardId: string): {
  summary: string;
  details: string[];
  recommendations: string[];
} {
  return withFeatureFlag(() => {
    const card = getCardEngineState(cardId);
    if (!card) {
      return {
        summary: 'Card not found',
        details: [],
        recommendations: []
      };
    }
    
    const details: string[] = [];
    const recommendations: string[] = [];
    
    // Check reconciliation status
    if (card.reconciliation) {
      if (card.reconciliation.unappliedAdjustments && Math.abs(card.reconciliation.unappliedAdjustments) > 0.01) {
        details.push(`Unapplied adjustments: $${card.reconciliation.unappliedAdjustments.toFixed(2)}`);
        recommendations.push('Review recent transactions for accuracy');
      }
      
      if (card.reconciliation.confidence && card.reconciliation.confidence < 0.7) {
        details.push(`Low reconciliation confidence: ${Math.round(card.reconciliation.confidence * 100)}%`);
        recommendations.push('Upload latest statement to improve accuracy');
      }
    }
    
    // Check installment plans
    const activePlans = card.installmentPlans?.filter(plan => plan.status === 'active') || [];
    if (activePlans.length > 0) {
      details.push(`${activePlans.length} active installment plans`);
      
      const totalMonthly = activePlans.reduce((sum, plan) => sum + plan.monthlyCharge, 0);
      details.push(`Total monthly installment charges: $${totalMonthly.toFixed(2)}`);
    }
    
    const summary = details.length > 0 ? 'Reconciliation completed with findings' : 'Reconciliation successful';
    
    return { summary, details, recommendations };
  }, {
    summary: 'CC Engine disabled',
    details: ['Reconciliation unavailable'],
    recommendations: []
  });
}


