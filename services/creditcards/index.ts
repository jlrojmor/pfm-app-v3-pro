/**
 * Credit Card Engine - Main Export File
 * 
 * This is the main entry point for the Credit Card Engine.
 * All public APIs are exported from here.
 */

// ============================================================================
// CORE ENGINE EXPORTS
// ============================================================================

export type * from './types.js';

export {
  // Engine core functions
  upsertCardEngine,
  computeCurrentCycle,
  computeAmountsDue,
  forecastInstallments,
  applyPayment,
  getCardEngineState,
  createInstallmentPlan,
  updateInstallmentPlan,
  generateSyntheticInstallmentTransactions
} from './engine.js';

export {
  // Statement ingestion
  ingestStatement,
  createManualEntryTemplate,
  validateManualEntry
} from './ingestStatement.js';

export {
  // Plan inference
  inferInstallmentPlans,
  validateInferredPlans
} from './inferPlans.js';

export {
  // Reconciliation
  reconcileAgainstStatement,
  reconcileAgainstTransactions,
  generateReconciliationReport
} from './reconcile.js';

export {
  // Guards and validation
  runAllGuards,
  checkDateDrift,
  checkPlanSums,
  checkNegativeRemaining,
  checkBalanceDiscrepancy,
  getWarningColor,
  getWarningIcon,
  filterWarningsBySeverity,
  getWarningSummary
} from './guards.js';

export {
  // Feature flag management
  initializeFeatureFlags,
  getFeatureConfig,
  isCCEngineEnabled,
  isSyntheticTransactionsEnabled,
  isStatementIngestionEnabled,
  isPlanInferenceEnabled,
  isReconciliationEnabled,
  disableCCEngine,
  enableCCEngine,
  withFeatureFlag,
  withFeatureFlagAsync,
  requireFeature,
  getFeatureStatus,
  logFeatureStatus
} from './feature.js';

export {
  // Integration hooks
  onTransactionChange,
  generateSyntheticTransactions,
  getTransactionMetadata,
  isSyntheticTransaction,
  filterSyntheticTransactions,
  hookTransactionSave,
  hookTransactionUpdate,
  hookTransactionDisplay,
  hookTransactionExport
} from './integration.js';

export {
  // Migration
  migrateExistingCreditCards,
  getMigrationStatus,
  resetMigration,
  forceRemigration
} from './migration.js';

// ============================================================================
// UI ADAPTER EXPORTS
// ============================================================================

export {
  // Main UI adapter
  useCardSnapshot,
  
  // UI helper functions
  getFormattedDueDate,
  getPaymentUrgency,
  getInstallmentSummary,
  getDataSourceInfo,
  getWarningsSummary,
  getCardStatusBadge,
  getPaymentRecommendation,
  formatCurrency,
  cardNeedsAttention,
  getCardHealthScore
} from '../../ui/creditcards/useCardSnapshot.js';

// ============================================================================
// CONVENIENCE EXPORTS
// ============================================================================

/**
 * Initialize the Credit Card Engine
 * Call this once during app startup
 */
export function initializeCCEngine(config?: {
  enabled?: boolean;
  syntheticTransactions?: boolean;
  statementIngestion?: boolean;
  planInference?: boolean;
  reconciliation?: boolean;
}): void {
  console.log('🚀 Initializing Credit Card Engine...');
  
  // Initialize feature flags
  initializeFeatureFlags(config);
  
  // Run migration for existing cards
  migrateExistingCreditCards();
  
  console.log('✅ Credit Card Engine initialized');
}

/**
 * Get engine status for debugging
 */
export function getEngineStatus(): {
  enabled: boolean;
  features: Record<string, boolean>;
  migration: {
    completed: boolean;
    migratedAccounts: number;
  };
} {
  const config = getFeatureConfig();
  const migration = getMigrationStatus();
  
  return {
    enabled: config.enabled,
    features: {
      syntheticTransactions: config.syntheticTransactions,
      statementIngestion: config.statementIngestion,
      planInference: config.planInference,
      reconciliation: config.reconciliation
    },
    migration
  };
}

/**
 * Quick setup for a new credit card
 * @param cardId - Credit card ID
 * @param basicInfo - Basic card information
 */
export function quickSetupCard(cardId: string, basicInfo: {
  issuer?: string;
  last4?: string;
  currency?: string;
  closingDay?: number;
  statementBalance?: number;
  minimumDue?: number;
}): void {
  if (!isCCEngineEnabled()) {
    console.warn('CC Engine is disabled, cannot setup card');
    return;
  }
  
  console.log('⚡ Quick setup for card:', cardId);
  
  const cardState = {
    cardId,
    issuer: basicInfo.issuer,
    last4: basicInfo.last4,
    currency: basicInfo.currency || 'USD',
    cycle: {
      closingDay: basicInfo.closingDay || 25,
      graceApplies: true
    },
    snapshot: basicInfo.statementBalance !== undefined ? {
      statementCloseDate: new Date().toISOString().slice(0, 10),
      statementBalance: basicInfo.statementBalance,
      minimumDue: basicInfo.minimumDue || 0
    } : undefined,
    installmentPlans: [],
    reconciliation: {
      confidence: basicInfo.statementBalance !== undefined ? 0.8 : 0.5
    }
  };
  
  upsertCardEngine(cardId, cardState);
  
  console.log('✅ Card setup complete:', cardId);
}

/**
 * Get all active installment plans across all cards
 */
export function getAllActiveInstallmentPlans(): Array<{
  cardId: string;
  plan: any;
}> {
  if (!isCCEngineEnabled()) {
    return [];
  }
  
  // This would integrate with actual state management
  // For now, return empty array to preserve existing behavior
  console.log('🔍 Getting all active installment plans');
  return [];
}

/**
 * Calculate total monthly installment payments across all cards
 */
export function getTotalMonthlyInstallmentPayments(): number {
  if (!isCCEngineEnabled()) {
    return 0;
  }
  
  const allPlans = getAllActiveInstallmentPlans();
  return allPlans.reduce((total, { plan }) => total + plan.monthlyCharge, 0);
}

// ============================================================================
// VERSION INFO
// ============================================================================

export const CC_ENGINE_VERSION = '1.0.0';
export const CC_ENGINE_BUILD_DATE = new Date().toISOString();

/**
 * Get version information
 */
export function getVersionInfo(): {
  version: string;
  buildDate: string;
  features: string[];
} {
  return {
    version: CC_ENGINE_VERSION,
    buildDate: CC_ENGINE_BUILD_DATE,
    features: [
      'Credit Card Cycle Management',
      'Installment Plan Tracking',
      'Statement Ingestion',
      'Payment Reconciliation',
      'Synthetic Transaction Generation',
      'Balance Prediction',
      'Guard System',
      'Migration Support'
    ]
  };
}


