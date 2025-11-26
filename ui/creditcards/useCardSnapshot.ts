/**
 * Credit Card UI Adapter
 * 
 * Provides a clean interface between the CC engine and UI components.
 * This adapter ensures the UI can consume CC engine data without
 * directly depending on internal implementation details.
 */

import type { CCCardSnapshot, CCCardEngineState } from '../../services/creditcards/types.js';
import { computeAmountsDue, getCardEngineState } from '../../services/creditcards/engine.js';
import { runAllGuards } from '../../services/creditcards/guards.js';
import { isCCEngineEnabled } from '../../services/creditcards/feature.js';

// ============================================================================
// MAIN UI ADAPTER FUNCTION
// ============================================================================

/**
 * Get card snapshot for UI display
 * @param cardId - Credit card ID
 * @returns Card snapshot with all UI-relevant data
 */
export function useCardSnapshot(cardId: string): CCCardSnapshot {
  // Default fallback when CC engine is disabled
  const defaultSnapshot: CCCardSnapshot = {
    dueDate: '—',
    totalDue: 0,
    minimumDue: 0,
    includesInstallments: 0,
    plansCount: 0,
    basedOn: 'estimated',
    warnings: []
  };

  if (!isCCEngineEnabled()) {
    return defaultSnapshot;
  }

  try {
    // Get card engine state
    const card = getCardEngineState(cardId);
    if (!card) {
      return defaultSnapshot;
    }

    // Calculate amounts due
    const amountsDue = computeAmountsDue(card, new Date());
    if (!amountsDue) {
      return defaultSnapshot;
    }

    // Run guard checks for warnings
    const warnings = runAllGuards(card);
    const warningMessages = warnings.map(warning => warning.message);

    // Determine data source
    const basedOn = card.snapshot ? 'statement' : 'estimated';

    // Count active installment plans
    const activePlans = card.installmentPlans?.filter(plan => plan.status === 'active') || [];

    return {
      dueDate: amountsDue.cycle.dueDate,
      totalDue: amountsDue.totalDue,
      minimumDue: amountsDue.minimumDue,
      includesInstallments: amountsDue.installmentDue,
      plansCount: activePlans.length,
      basedOn,
      warnings: warningMessages
    };

  } catch (error) {
    console.error('❌ Error getting card snapshot:', error);
    return {
      ...defaultSnapshot,
      warnings: ['Error loading card data']
    };
  }
}

// ============================================================================
// UI HELPER FUNCTIONS
// ============================================================================

/**
 * Get formatted due date for display
 * @param cardId - Credit card ID
 * @returns Formatted due date string
 */
export function getFormattedDueDate(cardId: string): string {
  const snapshot = useCardSnapshot(cardId);
  
  if (snapshot.dueDate === '—') {
    return 'No due date';
  }
  
  try {
    const date = new Date(snapshot.dueDate);
    const now = new Date();
    const daysUntilDue = Math.ceil((date.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    
    if (daysUntilDue < 0) {
      return `Overdue by ${Math.abs(daysUntilDue)} days`;
    } else if (daysUntilDue === 0) {
      return 'Due today';
    } else if (daysUntilDue === 1) {
      return 'Due tomorrow';
    } else if (daysUntilDue <= 7) {
      return `Due in ${daysUntilDue} days`;
    } else {
      return date.toLocaleDateString();
    }
  } catch (error) {
    return snapshot.dueDate;
  }
}

/**
 * Get payment urgency indicator
 * @param cardId - Credit card ID
 * @returns Urgency level and message
 */
export function getPaymentUrgency(cardId: string): {
  level: 'none' | 'low' | 'medium' | 'high' | 'overdue';
  message: string;
  color: string;
} {
  const snapshot = useCardSnapshot(cardId);
  
  if (snapshot.dueDate === '—' || snapshot.totalDue === 0) {
    return {
      level: 'none',
      message: 'No payment due',
      color: '#6b7280'
    };
  }
  
  try {
    const dueDate = new Date(snapshot.dueDate);
    const now = new Date();
    const daysUntilDue = Math.ceil((dueDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    
    if (daysUntilDue < 0) {
      return {
        level: 'overdue',
        message: `Overdue by ${Math.abs(daysUntilDue)} days`,
        color: '#dc2626'
      };
    } else if (daysUntilDue === 0) {
      return {
        level: 'high',
        message: 'Due today',
        color: '#dc2626'
      };
    } else if (daysUntilDue <= 3) {
      return {
        level: 'high',
        message: `Due in ${daysUntilDue} days`,
        color: '#ea580c'
      };
    } else if (daysUntilDue <= 7) {
      return {
        level: 'medium',
        message: `Due in ${daysUntilDue} days`,
        color: '#ca8a04'
      };
    } else if (daysUntilDue <= 14) {
      return {
        level: 'low',
        message: `Due in ${daysUntilDue} days`,
        color: '#16a34a'
      };
    } else {
      return {
        level: 'none',
        message: `Due in ${daysUntilDue} days`,
        color: '#6b7280'
      };
    }
  } catch (error) {
    return {
      level: 'none',
      message: 'Unknown due date',
      color: '#6b7280'
    };
  }
}

/**
 * Get installment summary for display
 * @param cardId - Credit card ID
 * @returns Installment summary
 */
export function getInstallmentSummary(cardId: string): {
  hasInstallments: boolean;
  totalMonthly: number;
  activePlans: number;
  message: string;
} {
  const snapshot = useCardSnapshot(cardId);
  
  if (snapshot.plansCount === 0) {
    return {
      hasInstallments: false,
      totalMonthly: 0,
      activePlans: 0,
      message: 'No active installments'
    };
  }
  
  const totalMonthly = snapshot.includesInstallments;
  const activePlans = snapshot.plansCount;
  
  let message = `${activePlans} installment${activePlans > 1 ? 's' : ''}`;
  if (totalMonthly > 0) {
    message += ` • $${totalMonthly.toFixed(2)}/month`;
  }
  
  return {
    hasInstallments: true,
    totalMonthly,
    activePlans,
    message
  };
}

/**
 * Get data source indicator
 * @param cardId - Credit card ID
 * @returns Data source information
 */
export function getDataSourceInfo(cardId: string): {
  source: 'statement' | 'estimated';
  confidence: number;
  message: string;
  needsStatement: boolean;
} {
  const snapshot = useCardSnapshot(cardId);
  
  if (snapshot.basedOn === 'statement') {
    return {
      source: 'statement',
      confidence: 0.9,
      message: 'Based on latest statement',
      needsStatement: false
    };
  } else {
    return {
      source: 'estimated',
      confidence: 0.6,
      message: 'Estimated from transactions',
      needsStatement: true
    };
  }
}

/**
 * Get warnings summary for UI
 * @param cardId - Credit card ID
 * @returns Warnings summary
 */
export function getWarningsSummary(cardId: string): {
  hasWarnings: boolean;
  criticalCount: number;
  warningCount: number;
  infoCount: number;
  messages: string[];
} {
  const snapshot = useCardSnapshot(cardId);
  
  const criticalCount = snapshot.warnings.filter(msg => 
    msg.toLowerCase().includes('error') || 
    msg.toLowerCase().includes('invalid') ||
    msg.toLowerCase().includes('overdue')
  ).length;
  
  const warningCount = snapshot.warnings.filter(msg => 
    msg.toLowerCase().includes('warning') || 
    msg.toLowerCase().includes('discrepancy') ||
    msg.toLowerCase().includes('unusual')
  ).length;
  
  const infoCount = snapshot.warnings.length - criticalCount - warningCount;
  
  return {
    hasWarnings: snapshot.warnings.length > 0,
    criticalCount,
    warningCount,
    infoCount,
    messages: snapshot.warnings
  };
}

// ============================================================================
// UI COMPONENT HELPERS
// ============================================================================

/**
 * Generate card status badge data
 * @param cardId - Credit card ID
 * @returns Badge configuration
 */
export function getCardStatusBadge(cardId: string): {
  text: string;
  color: string;
  icon: string;
} {
  const urgency = getPaymentUrgency(cardId);
  const installmentSummary = getInstallmentSummary(cardId);
  const dataSource = getDataSourceInfo(cardId);
  
  // Priority: Overdue > High urgency > Installments > Data source
  if (urgency.level === 'overdue') {
    return {
      text: 'Overdue',
      color: '#dc2626',
      icon: '⚠️'
    };
  }
  
  if (urgency.level === 'high') {
    return {
      text: 'Due Soon',
      color: '#ea580c',
      icon: '⏰'
    };
  }
  
  if (installmentSummary.hasInstallments) {
    return {
      text: `${installmentSummary.activePlans} Installments`,
      color: '#7c3aed',
      icon: '💳'
    };
  }
  
  if (dataSource.needsStatement) {
    return {
      text: 'Estimated',
      color: '#ca8a04',
      icon: '📊'
    };
  }
  
  return {
    text: 'Up to Date',
    color: '#16a34a',
    icon: '✅'
  };
}

/**
 * Generate payment recommendation
 * @param cardId - Credit card ID
 * @returns Payment recommendation
 */
export function getPaymentRecommendation(cardId: string): {
  recommendedAmount: number;
  minimumAmount: number;
  message: string;
  urgency: 'low' | 'medium' | 'high';
} {
  const snapshot = useCardSnapshot(cardId);
  const urgency = getPaymentUrgency(cardId);
  
  let recommendedAmount = snapshot.totalDue;
  let minimumAmount = snapshot.minimumDue;
  let message = '';
  let urgencyLevel: 'low' | 'medium' | 'high' = 'low';
  
  if (urgency.level === 'overdue') {
    recommendedAmount = snapshot.totalDue;
    message = 'Pay full balance immediately to avoid additional fees';
    urgencyLevel = 'high';
  } else if (urgency.level === 'high') {
    recommendedAmount = snapshot.totalDue;
    message = 'Pay full balance to avoid interest charges';
    urgencyLevel = 'high';
  } else if (urgency.level === 'medium') {
    recommendedAmount = Math.max(snapshot.minimumDue * 2, snapshot.totalDue * 0.5);
    message = 'Consider paying more than minimum to reduce interest';
    urgencyLevel = 'medium';
  } else {
    recommendedAmount = snapshot.minimumDue;
    message = 'Minimum payment sufficient for now';
    urgencyLevel = 'low';
  }
  
  return {
    recommendedAmount,
    minimumAmount,
    message,
    urgency: urgencyLevel
  };
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Format currency for display
 * @param amount - Amount to format
 * @returns Formatted currency string
 */
export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(amount);
}

/**
 * Check if card has any issues requiring attention
 * @param cardId - Credit card ID
 * @returns True if card needs attention
 */
export function cardNeedsAttention(cardId: string): boolean {
  const urgency = getPaymentUrgency(cardId);
  const warnings = getWarningsSummary(cardId);
  
  return urgency.level === 'overdue' || 
         urgency.level === 'high' || 
         warnings.criticalCount > 0;
}

/**
 * Get card health score (0-100)
 * @param cardId - Credit card ID
 * @returns Health score
 */
export function getCardHealthScore(cardId: string): number {
  const urgency = getPaymentUrgency(cardId);
  const warnings = getWarningsSummary(cardId);
  const dataSource = getDataSourceInfo(cardId);
  
  let score = 100;
  
  // Reduce score for payment urgency
  switch (urgency.level) {
    case 'overdue': score -= 50; break;
    case 'high': score -= 30; break;
    case 'medium': score -= 15; break;
    case 'low': score -= 5; break;
  }
  
  // Reduce score for warnings
  score -= warnings.criticalCount * 20;
  score -= warnings.warningCount * 10;
  score -= warnings.infoCount * 5;
  
  // Reduce score for estimated data
  if (dataSource.source === 'estimated') {
    score -= 10;
  }
  
  return Math.max(0, Math.min(100, score));
}






