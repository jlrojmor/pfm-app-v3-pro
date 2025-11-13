/**
 * Credit Card Engine Migration System
 * 
 * Handles backward-compatible migration of existing credit card data
 * to the new CC engine format.
 */

import type { CCCardEngineState, CCIssuerCycle, CCStatementSnapshot } from './types.js';
import { isCCEngineEnabled } from './feature.js';

// ============================================================================
// MIGRATION CONFIGURATION
// ============================================================================

const DEFAULT_CLOSING_DAY = 25; // Default closing day for existing cards
const MIGRATION_VERSION = '1.0.0';

// ============================================================================
// MAIN MIGRATION FUNCTION
// ============================================================================

/**
 * Migrate existing credit card accounts to CC engine format
 * This should be called once during app initialization
 */
export function migrateExistingCreditCards(): void {
  if (!isCCEngineEnabled()) {
    console.log('🚫 CC Engine disabled, skipping migration');
    return;
  }

  console.log('🔄 CC Engine: Starting migration of existing credit cards');

  try {
    // Get existing accounts (this would integrate with your existing state management)
    const existingAccounts = getExistingAccounts();
    
    if (!existingAccounts || existingAccounts.length === 0) {
      console.log('ℹ️ CC Engine: No existing accounts found');
      return;
    }

    // Filter for credit card accounts
    const creditCardAccounts = existingAccounts.filter(account => 
      isCreditCardAccount(account)
    );

    console.log(`📊 CC Engine: Found ${creditCardAccounts.length} credit card accounts to migrate`);

    // Migrate each credit card account
    for (const account of creditCardAccounts) {
      migrateCreditCardAccount(account);
    }

    // Mark migration as complete
    markMigrationComplete();

    console.log('✅ CC Engine: Migration completed successfully');

  } catch (error) {
    console.error('❌ CC Engine: Migration failed:', error);
    // Don't throw - we don't want to break the app
  }
}

// ============================================================================
// ACCOUNT MIGRATION
// ============================================================================

/**
 * Migrate a single credit card account
 * @param account - Existing account to migrate
 */
function migrateCreditCardAccount(account: any): void {
  console.log(`🔄 CC Engine: Migrating account: ${account.name || account.id}`);

  try {
    // Check if already migrated
    if (isAccountMigrated(account)) {
      console.log(`ℹ️ CC Engine: Account ${account.id} already migrated`);
      return;
    }

    // Create CC engine state from existing account
    const ccEngineState = createCCEngineStateFromAccount(account);

    // Save the migrated state
    saveCCEngineState(ccEngineState);

    console.log(`✅ CC Engine: Successfully migrated account: ${account.id}`);

  } catch (error) {
    console.error(`❌ CC Engine: Failed to migrate account ${account.id}:`, error);
  }
}

/**
 * Create CC engine state from existing account
 * @param account - Existing account
 */
function createCCEngineStateFromAccount(account: any): CCCardEngineState {
  const ccEngineState: CCCardEngineState = {
    cardId: account.id,
    issuer: extractIssuerFromAccount(account),
    last4: extractLast4FromAccount(account),
    currency: account.currency || 'USD',
    migrationVersion: MIGRATION_VERSION,
    migratedAt: new Date().toISOString()
  };

  // Migrate cycle information
  ccEngineState.cycle = migrateCycleInformation(account);

  // Migrate statement snapshot if available
  if (hasStatementData(account)) {
    ccEngineState.snapshot = migrateStatementSnapshot(account);
  }

  // Initialize empty installment plans
  ccEngineState.installmentPlans = [];

  // Initialize reconciliation data
  ccEngineState.reconciliation = {
    confidence: 0.5, // Low confidence for migrated data
    unappliedAdjustments: 0
  };

  return ccEngineState;
}

// ============================================================================
// CYCLE INFORMATION MIGRATION
// ============================================================================

/**
 * Migrate cycle information from existing account
 * @param account - Existing account
 */
function migrateCycleInformation(account: any): CCIssuerCycle {
  const cycle: CCIssuerCycle = {
    closingDay: DEFAULT_CLOSING_DAY,
    graceApplies: true
  };

  // Try to extract closing day from existing data
  if (account.nextClosingDate) {
    const closingDate = new Date(account.nextClosingDate);
    cycle.closingDay = closingDate.getDate();
    cycle.nextCloseDate = account.nextClosingDate;
  }

  // Try to extract due date information
  if (account.paymentDueDate) {
    cycle.dueDate = account.paymentDueDate;
  }

  // Try to extract last closing date
  if (account.lastClosingDate) {
    cycle.lastCloseDate = account.lastClosingDate;
  } else if (account.nextClosingDate) {
    // Calculate last closing date from next closing date
    const nextClose = new Date(account.nextClosingDate);
    const lastClose = new Date(nextClose);
    lastClose.setMonth(lastClose.getMonth() - 1);
    cycle.lastCloseDate = lastClose.toISOString().slice(0, 10);
  }

  return cycle;
}

// ============================================================================
// STATEMENT SNAPSHOT MIGRATION
// ============================================================================

/**
 * Check if account has statement data to migrate
 * @param account - Account to check
 */
function hasStatementData(account: any): boolean {
  return !!(account.balanceAsOfAmount || 
            account.balanceAsOfDate || 
            account.minimumPaymentDue ||
            account.currentBalance);
}

/**
 * Migrate statement snapshot from existing account
 * @param account - Existing account
 */
function migrateStatementSnapshot(account: any): CCStatementSnapshot {
  const snapshot: CCStatementSnapshot = {
    statementCloseDate: account.balanceAsOfDate || new Date().toISOString().slice(0, 10),
    statementBalance: account.balanceAsOfAmount || account.currentBalance || 0,
    minimumDue: account.minimumPaymentDue || 0,
    feesAccrued: 0, // Default to 0 for migrated data
    interestAccrued: 0 // Default to 0 for migrated data
  };

  // Try to extract revolving balance if available
  if (account.revolvingBalance !== undefined) {
    snapshot.revolvingBalance = account.revolvingBalance;
  }

  return snapshot;
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Extract issuer name from account
 * @param account - Account to extract from
 */
function extractIssuerFromAccount(account: any): string | undefined {
  // Try to extract from account name or type
  if (account.name) {
    const name = account.name.toLowerCase();
    
    // Common issuer patterns
    if (name.includes('chase')) return 'Chase';
    if (name.includes('amex') || name.includes('american express')) return 'American Express';
    if (name.includes('discover')) return 'Discover';
    if (name.includes('citi')) return 'Citi';
    if (name.includes('capital one')) return 'Capital One';
    if (name.includes('bank of america') || name.includes('bofa')) return 'Bank of America';
    if (name.includes('wells fargo')) return 'Wells Fargo';
  }

  return undefined;
}

/**
 * Extract last 4 digits from account
 * @param account - Account to extract from
 */
function extractLast4FromAccount(account: any): string | undefined {
  // Try to extract from account name or other fields
  if (account.name) {
    const last4Match = account.name.match(/\*\*\*\*(\d{4})/);
    if (last4Match) {
      return last4Match[1];
    }
  }

  if (account.last4) {
    return account.last4;
  }

  return undefined;
}

/**
 * Check if account is a credit card account
 * @param account - Account to check
 */
function isCreditCardAccount(account: any): boolean {
  // This would integrate with your existing account type system
  // For now, we'll use a placeholder that doesn't break existing functionality
  
  // TODO: Integrate with existing account type checking
  // Example: return account.type === 'credit-card';
  
  console.log('🔍 CC Engine: Checking if account is credit card:', account.id);
  return false; // Placeholder - preserve existing behavior
}

/**
 * Check if account has already been migrated
 * @param account - Account to check
 */
function isAccountMigrated(account: any): boolean {
  // Check if account already has CC engine state
  // This would integrate with your existing state management
  
  // TODO: Implement actual migration check
  // Example: return !!AppState.State.ccEngineStates?.[account.id];
  
  return false; // Placeholder - assume not migrated
}

/**
 * Save CC engine state
 * @param state - CC engine state to save
 */
function saveCCEngineState(state: CCCardEngineState): void {
  // This would integrate with your existing state management
  // For now, we'll just log the action to preserve existing behavior
  
  // TODO: Implement actual state saving
  // Example: AppState.saveItem('ccEngineStates', state);
  
  console.log('💾 CC Engine: Saving CC engine state:', state.cardId);
}

/**
 * Get existing accounts
 * This would integrate with your existing state management
 */
function getExistingAccounts(): any[] {
  // This would integrate with your existing account retrieval
  // For now, we'll return an empty array to preserve existing behavior
  
  // TODO: Implement actual account retrieval
  // Example: return AppState.State.accounts || [];
  
  console.log('🔍 CC Engine: Getting existing accounts');
  return []; // Placeholder - preserve existing behavior
}

/**
 * Mark migration as complete
 */
function markMigrationComplete(): void {
  // This would integrate with your existing state management
  // For now, we'll just log the action to preserve existing behavior
  
  // TODO: Implement actual migration tracking
  // Example: AppState.saveItem('ccEngineMigration', { version: MIGRATION_VERSION, completedAt: new Date().toISOString() });
  
  console.log('✅ CC Engine: Marking migration as complete');
}

// ============================================================================
// MIGRATION UTILITIES
// ============================================================================

/**
 * Get migration status
 */
export function getMigrationStatus(): {
  completed: boolean;
  version?: string;
  completedAt?: string;
  migratedAccounts: number;
} {
  // This would integrate with your existing state management
  // For now, we'll return a placeholder status
  
  // TODO: Implement actual migration status checking
  // Example: const migration = AppState.State.ccEngineMigration;
  //          return { completed: !!migration, ...migration };
  
  return {
    completed: false,
    migratedAccounts: 0
  };
}

/**
 * Reset migration (for testing)
 */
export function resetMigration(): void {
  if (!isCCEngineEnabled()) {
    return;
  }

  console.log('🔄 CC Engine: Resetting migration');

  // This would integrate with your existing state management
  // For now, we'll just log the action to preserve existing behavior
  
  // TODO: Implement actual migration reset
  // Example: AppState.deleteItem('ccEngineMigration');
  //          AppState.deleteItem('ccEngineStates');
}

/**
 * Force re-migration of all accounts
 */
export function forceRemigration(): void {
  if (!isCCEngineEnabled()) {
    return;
  }

  console.log('🔄 CC Engine: Forcing re-migration of all accounts');

  // Reset migration status
  resetMigration();

  // Run migration again
  migrateExistingCreditCards();
}


