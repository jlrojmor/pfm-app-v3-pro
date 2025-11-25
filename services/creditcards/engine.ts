/**
 * Credit Card Engine Core Logic
 * 
 * Contains the main business logic for credit card cycle management,
 * installment calculations, and payment processing.
 */

import type { 
  CCCardEngineState, 
  CCCycleInfo, 
  CCAmountsDue, 
  CCInstallmentForecast,
  CCPaymentAllocation,
  CCInstallmentPlan 
} from './types.js';
import { requireFeature, withFeatureFlag } from './feature.js';

// ============================================================================
// CORE ENGINE FUNCTIONS
// ============================================================================

/**
 * Merge new data into existing card engine state
 * @param cardId - Credit card ID
 * @param partial - Partial state to merge
 */
export function upsertCardEngine(cardId: string, partial: Partial<CCCardEngineState>): void {
  if (!requireFeature('enabled', 'upsertCardEngine')) return;
  
  // This would integrate with your existing state management
  // For now, we'll use a simple approach that doesn't break existing code
  console.log('🔄 Upserting card engine state for:', cardId, partial);
  
  // TODO: Integrate with existing AppState or storage system
  // This is a placeholder that preserves existing functionality
}

/**
 * Compute the current billing cycle information
 * @param cycle - Issuer cycle configuration
 * @param asOf - Date to compute cycle for
 */
export function computeCurrentCycle(cycle: CCCardEngineState['cycle'], asOf: Date): CCCycleInfo | null {
  if (!requireFeature('enabled', 'computeCurrentCycle')) return null;
  if (!cycle?.closingDay) return null;
  
  const asOfDate = new Date(asOf);
  const year = asOfDate.getFullYear();
  const month = asOfDate.getMonth();
  
  // Calculate the closing date for this month
  const closingDate = new Date(year, month, cycle.closingDay);
  
  // If the closing date has passed this month, use next month's closing date
  if (closingDate < asOfDate) {
    closingDate.setMonth(month + 1);
  }
  
  // Calculate period start (day after previous closing)
  const periodStart = new Date(closingDate);
  periodStart.setMonth(closingDate.getMonth() - 1);
  periodStart.setDate(periodStart.getDate() + 1);
  
  // Calculate due date (typically 25 days after closing)
  const dueDate = new Date(closingDate);
  dueDate.setDate(closingDate.getDate() + (cycle.graceApplies ? 25 : 21));
  
  return {
    periodStart: periodStart.toISOString().slice(0, 10),
    periodEnd: closingDate.toISOString().slice(0, 10),
    dueDate: dueDate.toISOString().slice(0, 10)
  };
}

/**
 * Compute amounts due for a credit card
 * @param card - Card engine state
 * @param asOf - Date to compute for
 */
export function computeAmountsDue(card: CCCardEngineState, asOf: Date): CCAmountsDue | null {
  if (!requireFeature('enabled', 'computeAmountsDue')) return null;
  
  const cycleInfo = computeCurrentCycle(card.cycle, asOf);
  if (!cycleInfo) return null;
  
  // Calculate installment due for this cycle
  let installmentDue = 0;
  const activePlans = card.installmentPlans?.filter(plan => plan.status === 'active') || [];
  
  for (const plan of activePlans) {
    // Check if this plan should charge in the current cycle
    if (plan.nextChargeDate && plan.nextChargeDate <= cycleInfo.periodEnd) {
      installmentDue += plan.monthlyCharge;
    }
  }
  
  // Calculate fees and interest (from statement snapshot if available)
  const feesInterest = card.snapshot?.feesAccrued || 0 + (card.snapshot?.interestAccrued || 0);
  
  // Calculate revolving minimum (1% of revolving balance, minimum $25)
  const revolvingBalance = card.snapshot?.revolvingBalance || (card.snapshot?.statementBalance || 0);
  const revolvingMin = Math.max(revolvingBalance * 0.01, 25);
  
  // Total minimum due
  const minimumDue = card.snapshot?.minimumDue || (feesInterest + installmentDue + revolvingMin);
  
  // Total due (installment + revolving)
  const totalDue = installmentDue + revolvingBalance;
  
  return {
    cycle: cycleInfo,
    installmentDue,
    feesInterest,
    revolvingMin,
    minimumDue,
    totalDue
  };
}

/**
 * Forecast installment charges for upcoming months
 * @param card - Card engine state
 * @param months - Number of months to forecast (default 6)
 */
export function forecastInstallments(card: CCCardEngineState, months: number = 6): CCInstallmentForecast[] {
  if (!requireFeature('enabled', 'forecastInstallments')) return [];
  
  const forecasts: CCInstallmentForecast[] = [];
  const activePlans = card.installmentPlans?.filter(plan => plan.status === 'active') || [];
  
  if (!activePlans.length) return forecasts;
  
  const startDate = new Date();
  
  for (let month = 0; month < months; month++) {
    const forecastDate = new Date(startDate);
    forecastDate.setMonth(startDate.getMonth() + month);
    
    for (const plan of activePlans) {
      // Check if this plan should charge in this month
      if (plan.nextChargeDate) {
        const planChargeDate = new Date(plan.nextChargeDate);
        const monthStart = new Date(forecastDate.getFullYear(), forecastDate.getMonth(), 1);
        const monthEnd = new Date(forecastDate.getFullYear(), forecastDate.getMonth() + 1, 0);
        
        if (planChargeDate >= monthStart && planChargeDate <= monthEnd) {
          forecasts.push({
            date: planChargeDate.toISOString().slice(0, 10),
            amount: plan.monthlyCharge,
            planId: plan.planId,
            descriptor: plan.descriptor
          });
        }
      }
    }
  }
  
  return forecasts.sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * Apply a payment to a credit card
 * @param card - Card engine state
 * @param paymentTxn - Payment transaction
 */
export function applyPayment(card: CCCardEngineState, paymentTxn: any): CCPaymentAllocation | null {
  if (!requireFeature('enabled', 'applyPayment')) return null;
  
  const paymentAmount = paymentTxn.amount || 0;
  
  // Calculate what's due in current cycle
  const amountsDue = computeAmountsDue(card, new Date());
  if (!amountsDue) return null;
  
  let remainingPayment = paymentAmount;
  const applied = { fees: 0, installments: 0, revolving: 0 };
  
  // Allocation priority: fees/interest → installment dues → revolving
  // 1. Pay fees and interest first
  if (remainingPayment > 0 && amountsDue.feesInterest > 0) {
    const feesPayment = Math.min(remainingPayment, amountsDue.feesInterest);
    applied.fees = feesPayment;
    remainingPayment -= feesPayment;
  }
  
  // 2. Pay installment dues
  if (remainingPayment > 0 && amountsDue.installmentDue > 0) {
    const installmentPayment = Math.min(remainingPayment, amountsDue.installmentDue);
    applied.installments = installmentPayment;
    remainingPayment -= installmentPayment;
  }
  
  // 3. Pay revolving balance
  if (remainingPayment > 0) {
    applied.revolving = remainingPayment;
  }
  
  const allocation: CCPaymentAllocation = {
    paymentId: paymentTxn.id || `payment_${Date.now()}`,
    date: paymentTxn.date || new Date().toISOString().slice(0, 10),
    amount: paymentAmount,
    applied
  };
  
  // Update reconciliation
  if (card.reconciliation) {
    card.reconciliation.lastPaymentDate = allocation.date;
    card.reconciliation.lastPaymentAmount = paymentAmount;
    
    // Track unapplied adjustments if there's leftover payment
    if (remainingPayment < 0) {
      card.reconciliation.unappliedAdjustments = (card.reconciliation.unappliedAdjustments || 0) - remainingPayment;
    }
  }
  
  return allocation;
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Get card engine state for a given card ID
 * @param cardId - Credit card ID
 */
export function getCardEngineState(cardId: string): CCCardEngineState | null {
  if (!requireFeature('enabled', 'getCardEngineState')) return null;
  
  // TODO: Integrate with existing state management
  // This is a placeholder that returns null to preserve existing behavior
  console.log('🔍 Getting card engine state for:', cardId);
  return null;
}

/**
 * Create a new installment plan
 * @param descriptor - Plan description
 * @param monthlyCharge - Monthly charge amount
 * @param termMonths - Number of months
 * @param startDate - Start date
 */
export function createInstallmentPlan(
  descriptor: string,
  monthlyCharge: number,
  termMonths: number,
  startDate: string
): CCInstallmentPlan {
  return {
    planId: `plan_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    descriptor,
    startDate,
    termMonths,
    monthlyCharge,
    remainingPayments: termMonths,
    status: 'active',
    source: 'inferred',
    confidence: 0.7
  };
}

/**
 * Update installment plan status
 * @param plan - Installment plan
 * @param updates - Updates to apply
 */
export function updateInstallmentPlan(
  plan: CCInstallmentPlan, 
  updates: Partial<CCInstallmentPlan>
): CCInstallmentPlan {
  return {
    ...plan,
    ...updates,
    // Ensure planId doesn't change
    planId: plan.planId
  };
}

// ============================================================================
// SYNTHETIC TRANSACTION GENERATION
// ============================================================================

/**
 * Generate synthetic transactions for installment charges
 * @param card - Card engine state
 * @param cycleEnd - End date of billing cycle
 */
export function generateSyntheticInstallmentTransactions(
  card: CCCardEngineState, 
  cycleEnd: string
): any[] {
  if (!requireFeature('syntheticTransactions', 'generateSyntheticInstallmentTransactions')) return [];
  
  const syntheticTransactions: any[] = [];
  const activePlans = card.installmentPlans?.filter(plan => plan.status === 'active') || [];
  
  for (const plan of activePlans) {
    if (plan.nextChargeDate && plan.nextChargeDate <= cycleEnd) {
      syntheticTransactions.push({
        id: `synthetic:${plan.planId}:${cycleEnd}`,
        date: plan.nextChargeDate,
        description: `[Installment] ${plan.descriptor}`,
        amount: plan.monthlyCharge,
        transactionType: 'Expense',
        fromAccountId: card.cardId,
        meta: {
          cardId: card.cardId,
          isInstallmentCharge: true,
          installmentPlanId: plan.planId
        }
      });
    }
  }
  
  return syntheticTransactions;
}






