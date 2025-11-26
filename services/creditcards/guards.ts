/**
 * Credit Card Engine Guards and Validation System
 * 
 * Provides sanity checks, data validation, and warning generation
 * for credit card engine operations.
 */

import type { 
  CCCardEngineState, 
  CCGuardWarning, 
  CCInstallmentPlan,
  CCIssuerCycle,
  CCStatementSnapshot
} from './types.js';
import { requireFeature, withFeatureFlag } from './feature.js';

// ============================================================================
// MAIN GUARD FUNCTIONS
// ============================================================================

/**
 * Run all guard checks on a card engine state
 * @param card - Card engine state to validate
 */
export function runAllGuards(card: CCCardEngineState): CCGuardWarning[] {
  return withFeatureFlag(() => {
    console.log('🛡️ Running guard checks for card:', card.cardId);
    
    const warnings: CCGuardWarning[] = [];
    
    // Run individual guard checks
    warnings.push(...checkDateDrift(card));
    warnings.push(...checkPlanSums(card));
    warnings.push(...checkNegativeRemaining(card));
    warnings.push(...checkBalanceDiscrepancy(card));
    warnings.push(...checkCycleConsistency(card));
    warnings.push(...checkInstallmentLogic(card));
    
    return warnings;
  }, []);
}

/**
 * Check for date drift issues
 * @param card - Card engine state
 */
export function checkDateDrift(card: CCCardEngineState): CCGuardWarning[] {
  if (!requireFeature('reconciliation', 'checkDateDrift')) return [];
  
  const warnings: CCGuardWarning[] = [];
  
  // Check cycle dates
  if (card.cycle) {
    const cycleWarnings = checkCycleDateDrift(card.cycle);
    warnings.push(...cycleWarnings);
  }
  
  // Check statement dates
  if (card.snapshot) {
    const snapshotWarnings = checkSnapshotDateDrift(card.snapshot);
    warnings.push(...snapshotWarnings);
  }
  
  // Check installment plan dates
  if (card.installmentPlans) {
    const planWarnings = checkPlanDateDrift(card.installmentPlans);
    warnings.push(...planWarnings);
  }
  
  return warnings;
}

/**
 * Check plan sums against statement data
 * @param card - Card engine state
 */
export function checkPlanSums(card: CCCardEngineState): CCGuardWarning[] {
  if (!requireFeature('reconciliation', 'checkPlanSums')) return [];
  
  const warnings: CCGuardWarning[] = [];
  
  if (!card.snapshot || !card.installmentPlans) {
    return warnings;
  }
  
  const activePlans = card.installmentPlans.filter(plan => plan.status === 'active');
  
  // Calculate total remaining principal from plans
  const totalRemainingPrincipal = activePlans.reduce((sum, plan) => {
    return sum + (plan.remainingPrincipal || (plan.remainingPayments * plan.monthlyCharge));
  }, 0);
  
  // Check if statement has revolving balance that seems inconsistent
  if (card.snapshot.revolvingBalance !== undefined) {
    const expectedRevolving = card.snapshot.statementBalance - totalRemainingPrincipal;
    const revolvingDiff = Math.abs(expectedRevolving - card.snapshot.revolvingBalance);
    
    if (revolvingDiff > 10) { // Allow for $10 tolerance
      warnings.push({
        type: 'plan_mismatch',
        severity: 'medium',
        message: `Plan sums don't match statement revolving balance. Expected ~$${expectedRevolving.toFixed(2)}, statement shows $${card.snapshot.revolvingBalance.toFixed(2)}`,
        data: {
          expectedRevolving,
          statementRevolving: card.snapshot.revolvingBalance,
          totalRemainingPrincipal
        }
      });
    }
  }
  
  return warnings;
}

/**
 * Check for negative remaining payments
 * @param card - Card engine state
 */
export function checkNegativeRemaining(card: CCCardEngineState): CCGuardWarning[] {
  if (!requireFeature('reconciliation', 'checkNegativeRemaining')) return [];
  
  const warnings: CCGuardWarning[] = [];
  
  if (!card.installmentPlans) {
    return warnings;
  }
  
  for (const plan of card.installmentPlans) {
    if (plan.remainingPayments < 0) {
      warnings.push({
        type: 'negative_remaining',
        severity: 'high',
        message: `Installment plan "${plan.descriptor}" has negative remaining payments: ${plan.remainingPayments}`,
        data: { planId: plan.planId, remainingPayments: plan.remainingPayments }
      });
    }
    
    if (plan.remainingPrincipal !== undefined && plan.remainingPrincipal < 0) {
      warnings.push({
        type: 'negative_remaining',
        severity: 'medium',
        message: `Installment plan "${plan.descriptor}" has negative remaining principal: $${plan.remainingPrincipal.toFixed(2)}`,
        data: { planId: plan.planId, remainingPrincipal: plan.remainingPrincipal }
      });
    }
  }
  
  return warnings;
}

/**
 * Check for balance discrepancies
 * @param card - Card engine state
 */
export function checkBalanceDiscrepancy(card: CCCardEngineState): CCGuardWarning[] {
  if (!requireFeature('reconciliation', 'checkBalanceDiscrepancy')) return [];
  
  const warnings: CCGuardWarning[] = [];
  
  if (!card.reconciliation) {
    return warnings;
  }
  
  const unappliedAdjustments = card.reconciliation.unappliedAdjustments || 0;
  
  if (Math.abs(unappliedAdjustments) > 100) {
    warnings.push({
      type: 'balance_discrepancy',
      severity: 'high',
      message: `Large unapplied adjustment: $${unappliedAdjustments.toFixed(2)}. This may indicate a reconciliation issue.`,
      data: { unappliedAdjustments }
    });
  } else if (Math.abs(unappliedAdjustments) > 10) {
    warnings.push({
      type: 'balance_discrepancy',
      severity: 'medium',
      message: `Unapplied adjustment: $${unappliedAdjustments.toFixed(2)}. Review recent transactions.`,
      data: { unappliedAdjustments }
    });
  }
  
  // Check confidence level
  const confidence = card.reconciliation.confidence || 1;
  if (confidence < 0.5) {
    warnings.push({
      type: 'balance_discrepancy',
      severity: 'high',
      message: `Low reconciliation confidence: ${Math.round(confidence * 100)}%. Consider uploading latest statement.`,
      data: { confidence }
    });
  } else if (confidence < 0.8) {
    warnings.push({
      type: 'balance_discrepancy',
      severity: 'low',
      message: `Moderate reconciliation confidence: ${Math.round(confidence * 100)}%.`,
      data: { confidence }
    });
  }
  
  return warnings;
}

// ============================================================================
// DETAILED GUARD CHECKS
// ============================================================================

/**
 * Check cycle date drift
 * @param cycle - Issuer cycle configuration
 */
function checkCycleDateDrift(cycle: CCIssuerCycle): CCGuardWarning[] {
  const warnings: CCGuardWarning[] = [];
  
  // Check closing day validity
  if (cycle.closingDay < 1 || cycle.closingDay > 28) {
    warnings.push({
      type: 'date_drift',
      severity: 'high',
      message: `Invalid closing day: ${cycle.closingDay}. Must be between 1 and 28.`,
      data: { closingDay: cycle.closingDay }
    });
  }
  
  // Check date consistency
  if (cycle.lastCloseDate && cycle.nextCloseDate) {
    const lastClose = new Date(cycle.lastCloseDate);
    const nextClose = new Date(cycle.nextCloseDate);
    
    // Check if next close is approximately one month after last close
    const expectedNextClose = new Date(lastClose);
    expectedNextClose.setMonth(expectedNextClose.getMonth() + 1);
    expectedNextClose.setDate(cycle.closingDay);
    
    const daysDiff = Math.abs((nextClose.getTime() - expectedNextClose.getTime()) / (1000 * 60 * 60 * 24));
    
    if (daysDiff > 3) { // Allow 3 days tolerance
      warnings.push({
        type: 'date_drift',
        severity: 'medium',
        message: `Cycle dates seem inconsistent. Last close: ${cycle.lastCloseDate}, Next close: ${cycle.nextCloseDate}`,
        data: { lastCloseDate: cycle.lastCloseDate, nextCloseDate: cycle.nextCloseDate, daysDiff }
      });
    }
  }
  
  return warnings;
}

/**
 * Check snapshot date drift
 * @param snapshot - Statement snapshot
 */
function checkSnapshotDateDrift(snapshot: CCStatementSnapshot): CCGuardWarning[] {
  const warnings: CCGuardWarning[] = [];
  
  const snapshotDate = new Date(snapshot.statementCloseDate);
  const now = new Date();
  
  // Check if snapshot is too old (more than 2 months)
  const monthsDiff = (now.getFullYear() - snapshotDate.getFullYear()) * 12 + 
                    (now.getMonth() - snapshotDate.getMonth());
  
  if (monthsDiff > 2) {
    warnings.push({
      type: 'date_drift',
      severity: 'medium',
      message: `Statement snapshot is ${monthsDiff} months old. Consider uploading a recent statement.`,
      data: { snapshotDate: snapshot.statementCloseDate, monthsDiff }
    });
  }
  
  // Check for future dates
  if (snapshotDate > now) {
    warnings.push({
      type: 'date_drift',
      severity: 'high',
      message: `Statement date is in the future: ${snapshot.statementCloseDate}`,
      data: { snapshotDate: snapshot.statementCloseDate }
    });
  }
  
  return warnings;
}

/**
 * Check plan date drift
 * @param plans - Installment plans
 */
function checkPlanDateDrift(plans: CCInstallmentPlan[]): CCGuardWarning[] {
  const warnings: CCGuardWarning[] = [];
  
  for (const plan of plans) {
    const startDate = new Date(plan.startDate);
    const now = new Date();
    
    // Check if plan started in the future
    if (startDate > now) {
      warnings.push({
        type: 'date_drift',
        severity: 'medium',
        message: `Installment plan "${plan.descriptor}" has future start date: ${plan.startDate}`,
        data: { planId: plan.planId, startDate: plan.startDate }
      });
    }
    
    // Check if plan is too old (more than 5 years)
    const yearsDiff = (now.getFullYear() - startDate.getFullYear());
    if (yearsDiff > 5) {
      warnings.push({
        type: 'date_drift',
        severity: 'low',
        message: `Installment plan "${plan.descriptor}" is ${yearsDiff} years old. Consider reviewing.`,
        data: { planId: plan.planId, startDate: plan.startDate, yearsDiff }
      });
    }
    
    // Check next charge date
    if (plan.nextChargeDate) {
      const nextCharge = new Date(plan.nextChargeDate);
      if (nextCharge > now && (nextCharge.getTime() - now.getTime()) > 90 * 24 * 60 * 60 * 1000) { // More than 90 days
        warnings.push({
          type: 'date_drift',
          severity: 'low',
          message: `Next charge date for "${plan.descriptor}" is more than 90 days away: ${plan.nextChargeDate}`,
          data: { planId: plan.planId, nextChargeDate: plan.nextChargeDate }
        });
      }
    }
  }
  
  return warnings;
}

/**
 * Check cycle consistency
 * @param card - Card engine state
 */
function checkCycleConsistency(card: CCCardEngineState): CCGuardWarning[] {
  const warnings: CCGuardWarning[] = [];
  
  if (!card.cycle) {
    return warnings;
  }
  
  // Check if we have both closing and due dates
  if (card.cycle.lastCloseDate && card.cycle.dueDate) {
    const closeDate = new Date(card.cycle.lastCloseDate);
    const dueDate = new Date(card.cycle.dueDate);
    
    const daysDiff = Math.round((dueDate.getTime() - closeDate.getTime()) / (1000 * 60 * 60 * 24));
    
    // Check if grace period is reasonable (15-35 days)
    if (daysDiff < 15 || daysDiff > 35) {
      warnings.push({
        type: 'date_drift',
        severity: 'medium',
        message: `Unusual grace period: ${daysDiff} days between closing and due date`,
        data: { closeDate: card.cycle.lastCloseDate, dueDate: card.cycle.dueDate, graceDays: daysDiff }
      });
    }
  }
  
  return warnings;
}

/**
 * Check installment logic
 * @param card - Card engine state
 */
function checkInstallmentLogic(card: CCCardEngineState): CCGuardWarning[] {
  const warnings: CCGuardWarning[] = [];
  
  if (!card.installmentPlans) {
    return warnings;
  }
  
  for (const plan of card.installmentPlans) {
    // Check if remaining payments exceed total term
    if (plan.remainingPayments > plan.termMonths) {
      warnings.push({
        type: 'plan_mismatch',
        severity: 'high',
        message: `Plan "${plan.descriptor}" has more remaining payments (${plan.remainingPayments}) than total term (${plan.termMonths})`,
        data: { planId: plan.planId, remainingPayments: plan.remainingPayments, termMonths: plan.termMonths }
      });
    }
    
    // Check if months elapsed exceeds total term
    if (plan.monthsElapsed !== undefined && plan.monthsElapsed > plan.termMonths) {
      warnings.push({
        type: 'plan_mismatch',
        severity: 'high',
        message: `Plan "${plan.descriptor}" has more elapsed months (${plan.monthsElapsed}) than total term (${plan.termMonths})`,
        data: { planId: plan.planId, monthsElapsed: plan.monthsElapsed, termMonths: plan.termMonths }
      });
    }
    
    // Check for zero or negative monthly charge
    if (plan.monthlyCharge <= 0) {
      warnings.push({
        type: 'plan_mismatch',
        severity: 'high',
        message: `Plan "${plan.descriptor}" has invalid monthly charge: $${plan.monthlyCharge.toFixed(2)}`,
        data: { planId: plan.planId, monthlyCharge: plan.monthlyCharge }
      });
    }
    
    // Check confidence level for inferred plans
    if (plan.source === 'inferred' && plan.confidence < 0.5) {
      warnings.push({
        type: 'plan_mismatch',
        severity: 'low',
        message: `Inferred plan "${plan.descriptor}" has low confidence: ${Math.round(plan.confidence * 100)}%`,
        data: { planId: plan.planId, confidence: plan.confidence }
      });
    }
  }
  
  return warnings;
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Get warning severity color
 * @param severity - Warning severity
 */
export function getWarningColor(severity: CCGuardWarning['severity']): string {
  switch (severity) {
    case 'high': return '#dc2626'; // Red
    case 'medium': return '#ea580c'; // Orange
    case 'low': return '#ca8a04'; // Yellow
    default: return '#6b7280'; // Gray
  }
}

/**
 * Get warning severity icon
 * @param severity - Warning severity
 */
export function getWarningIcon(severity: CCGuardWarning['severity']): string {
  switch (severity) {
    case 'high': return '⚠️';
    case 'medium': return '⚠️';
    case 'low': return 'ℹ️';
    default: return 'ℹ️';
  }
}

/**
 * Filter warnings by severity
 * @param warnings - All warnings
 * @param severity - Severity to filter by
 */
export function filterWarningsBySeverity(warnings: CCGuardWarning[], severity: CCGuardWarning['severity']): CCGuardWarning[] {
  return warnings.filter(warning => warning.severity === severity);
}

/**
 * Get summary of warnings
 * @param warnings - All warnings
 */
export function getWarningSummary(warnings: CCGuardWarning[]): {
  total: number;
  high: number;
  medium: number;
  low: number;
} {
  return {
    total: warnings.length,
    high: warnings.filter(w => w.severity === 'high').length,
    medium: warnings.filter(w => w.severity === 'medium').length,
    low: warnings.filter(w => w.severity === 'low').length
  };
}






