/**
 * Credit Card Engine Integration Hooks
 * 
 * Provides integration points with the existing transaction pipeline
 * without modifying existing functionality.
 */

import type { TransactionCardMeta } from './types.js';
import { 
  applyPayment, 
  generateSyntheticInstallmentTransactions,
  getCardEngineState 
} from './engine.js';
import { isCCEngineEnabled, isSyntheticTransactionsEnabled } from './feature.js';

// ============================================================================
// TRANSACTION PIPELINE HOOKS
// ============================================================================

/**
 * Hook for transaction creation/update
 * This should be called when a transaction is created or updated
 * @param transaction - Transaction object
 * @param isUpdate - Whether this is an update to existing transaction
 */
export function onTransactionChange(transaction: any, isUpdate: boolean = false): void {
  if (!isCCEngineEnabled()) {
    return; // No-op when CC engine is disabled
  }

  console.log('🔗 CC Engine: Processing transaction change', {
    id: transaction.id,
    type: transaction.transactionType,
    amount: transaction.amount,
    fromAccount: transaction.fromAccountId,
    isUpdate
  });

  try {
    // Check if this is a credit card transaction
    if (isCreditCardTransaction(transaction)) {
      processCreditCardTransaction(transaction, isUpdate);
    }

    // Check if this is a payment to a credit card
    if (isCreditCardPayment(transaction)) {
      processCreditCardPayment(transaction, isUpdate);
    }

  } catch (error) {
    console.error('❌ CC Engine: Error processing transaction:', error);
    // Don't throw - we don't want to break existing transaction flow
  }
}

/**
 * Hook for generating synthetic transactions
 * This should be called when displaying transactions to include installment charges
 * @param cardId - Credit card ID
 * @param existingTransactions - Existing transactions to augment
 * @param dateRange - Date range for synthetic transactions
 */
export function generateSyntheticTransactions(
  cardId: string, 
  existingTransactions: any[], 
  dateRange?: { start: string; end: string }
): any[] {
  if (!isSyntheticTransactionsEnabled()) {
    return existingTransactions; // Return unchanged when disabled
  }

  console.log('🔮 CC Engine: Generating synthetic transactions for card:', cardId);

  try {
    const card = getCardEngineState(cardId);
    if (!card) {
      return existingTransactions;
    }

    // Generate synthetic installment transactions
    const syntheticTxns = generateSyntheticInstallmentTransactions(card, dateRange?.end || new Date().toISOString().slice(0, 10));
    
    // Combine with existing transactions
    const allTransactions = [...existingTransactions, ...syntheticTxns];
    
    // Sort by date
    allTransactions.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    
    console.log(`✅ CC Engine: Generated ${syntheticTxns.length} synthetic transactions`);
    return allTransactions;

  } catch (error) {
    console.error('❌ CC Engine: Error generating synthetic transactions:', error);
    return existingTransactions; // Return unchanged on error
  }
}

// ============================================================================
// TRANSACTION PROCESSING
// ============================================================================

/**
 * Check if transaction is a credit card transaction
 * @param transaction - Transaction to check
 */
function isCreditCardTransaction(transaction: any): boolean {
  // Check if transaction is from a credit card account
  if (transaction.fromAccountId && isCreditCardAccount(transaction.fromAccountId)) {
    return true;
  }
  
  // Check if transaction has credit card metadata
  if (transaction.meta?.cardId) {
    return true;
  }
  
  return false;
}

/**
 * Check if transaction is a payment to a credit card
 * @param transaction - Transaction to check
 */
function isCreditCardPayment(transaction: any): boolean {
  // Check transaction type
  if (transaction.transactionType === 'Credit Card Payment') {
    return true;
  }
  
  // Check if transaction is to a credit card account
  if (transaction.toAccountId && isCreditCardAccount(transaction.toAccountId)) {
    return true;
  }
  
  return false;
}

/**
 * Check if account ID corresponds to a credit card
 * @param accountId - Account ID to check
 */
function isCreditCardAccount(accountId: string): boolean {
  // This would integrate with your existing account type checking
  // For now, we'll use a placeholder that doesn't break existing functionality
  
  // TODO: Integrate with existing account type system
  // Example: return AppState.State.accounts.find(a => a.id === accountId)?.type === 'credit-card';
  
  console.log('🔍 CC Engine: Checking if account is credit card:', accountId);
  return false; // Placeholder - preserve existing behavior
}

/**
 * Process a credit card transaction
 * @param transaction - Transaction to process
 * @param isUpdate - Whether this is an update
 */
function processCreditCardTransaction(transaction: any, isUpdate: boolean): void {
  console.log('💳 CC Engine: Processing credit card transaction:', transaction.id);

  // Attach metadata if not present
  if (!transaction.meta) {
    transaction.meta = {};
  }

  // Set card ID metadata
  if (transaction.fromAccountId && isCreditCardAccount(transaction.fromAccountId)) {
    transaction.meta.cardId = transaction.fromAccountId;
  }

  // Check if this should be marked as installment charge
  if (transaction.isDeferred && transaction.deferredMonths > 0) {
    transaction.meta.isInstallmentCharge = true;
    
    // Generate plan ID if not present
    if (!transaction.meta.installmentPlanId) {
      transaction.meta.installmentPlanId = `plan_${transaction.id}`;
    }
  }

  // Update card engine state if needed
  updateCardEngineFromTransaction(transaction, isUpdate);
}

/**
 * Process a credit card payment
 * @param transaction - Payment transaction
 * @param isUpdate - Whether this is an update
 */
function processCreditCardPayment(transaction: any, isUpdate: boolean): void {
  console.log('💰 CC Engine: Processing credit card payment:', transaction.id);

  // Determine which credit card this payment is for
  const cardId = transaction.toAccountId || transaction.fromAccountId;
  if (!cardId || !isCreditCardAccount(cardId)) {
    return;
  }

  // Get card engine state
  const card = getCardEngineState(cardId);
  if (!card) {
    console.log('⚠️ CC Engine: Card state not found for payment processing');
    return;
  }

  // Apply payment to card engine
  const allocation = applyPayment(card, transaction);
  if (allocation) {
    console.log('✅ CC Engine: Payment allocation:', allocation);
    
    // Store allocation for reconciliation
    storePaymentAllocation(cardId, allocation);
  }
}

// ============================================================================
// CARD ENGINE UPDATES
// ============================================================================

/**
 * Update card engine state from transaction
 * @param transaction - Transaction to process
 * @param isUpdate - Whether this is an update
 */
function updateCardEngineFromTransaction(transaction: any, isUpdate: boolean): void {
  const cardId = transaction.meta?.cardId || transaction.fromAccountId;
  if (!cardId) {
    return;
  }

  console.log('🔄 CC Engine: Updating card state from transaction:', cardId);

  // This would update the card engine state based on the transaction
  // For now, we'll just log the action to preserve existing behavior
  
  // TODO: Implement actual card state updates
  // Example: upsertCardEngine(cardId, { /* updates based on transaction */ });
}

/**
 * Store payment allocation for reconciliation
 * @param cardId - Credit card ID
 * @param allocation - Payment allocation
 */
function storePaymentAllocation(cardId: string, allocation: any): void {
  console.log('💾 CC Engine: Storing payment allocation:', cardId, allocation);

  // This would store the payment allocation for reconciliation purposes
  // For now, we'll just log the action to preserve existing behavior
  
  // TODO: Implement actual allocation storage
  // Example: AppState.saveItem('paymentAllocations', allocation);
}

// ============================================================================
// INTEGRATION UTILITIES
// ============================================================================

/**
 * Get transaction metadata for credit card transactions
 * @param transaction - Transaction to get metadata for
 */
export function getTransactionMetadata(transaction: any): TransactionCardMeta | null {
  if (!isCCEngineEnabled()) {
    return null;
  }

  if (!isCreditCardTransaction(transaction)) {
    return null;
  }

  return transaction.meta || null;
}

/**
 * Check if transaction is synthetic
 * @param transaction - Transaction to check
 */
export function isSyntheticTransaction(transaction: any): boolean {
  if (!isCCEngineEnabled()) {
    return false;
  }

  // Check if transaction ID starts with 'synthetic:'
  if (transaction.id && transaction.id.startsWith('synthetic:')) {
    return true;
  }

  // Check metadata
  if (transaction.meta?.isInstallmentCharge) {
    return true;
  }

  return false;
}

/**
 * Filter out synthetic transactions (for exports)
 * @param transactions - Transactions to filter
 * @param includeSynthetic - Whether to include synthetic transactions
 */
export function filterSyntheticTransactions(
  transactions: any[], 
  includeSynthetic: boolean = false
): any[] {
  if (!isCCEngineEnabled() || includeSynthetic) {
    return transactions;
  }

  return transactions.filter(txn => !isSyntheticTransaction(txn));
}

// ============================================================================
// EXISTING SYSTEM INTEGRATION HELPERS
// ============================================================================

/**
 * Hook into existing transaction save function
 * This should be called from the existing transaction save logic
 * @param transaction - Transaction being saved
 */
export function hookTransactionSave(transaction: any): void {
  // This is a safe hook that doesn't modify existing behavior
  onTransactionChange(transaction, false);
}

/**
 * Hook into existing transaction update function
 * This should be called from the existing transaction update logic
 * @param transaction - Transaction being updated
 */
export function hookTransactionUpdate(transaction: any): void {
  // This is a safe hook that doesn't modify existing behavior
  onTransactionChange(transaction, true);
}

/**
 * Hook into existing transaction display function
 * This should be called when displaying transactions for a credit card
 * @param cardId - Credit card ID
 * @param transactions - Existing transactions
 */
export function hookTransactionDisplay(cardId: string, transactions: any[]): any[] {
  // This is a safe hook that preserves existing behavior when disabled
  return generateSyntheticTransactions(cardId, transactions);
}

/**
 * Hook into existing export function
 * This should be called when exporting transactions
 * @param transactions - Transactions to export
 * @param options - Export options
 */
export function hookTransactionExport(transactions: any[], options: any = {}): any[] {
  const includeSynthetic = options.includeSynthetic || false;
  return filterSyntheticTransactions(transactions, includeSynthetic);
}


