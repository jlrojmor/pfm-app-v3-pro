/**
 * Credit Card Engine Integration Tests
 * 
 * Tests for integration with existing transaction pipeline and
 * synthetic transaction generation.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { 
  onTransactionChange,
  generateSyntheticTransactions,
  isSyntheticTransaction,
  filterSyntheticTransactions,
  hookTransactionSave,
  hookTransactionUpdate,
  hookTransactionDisplay,
  hookTransactionExport
} from '../integration.js';
import { enableCCEngine, disableCCEngine } from '../feature.js';

// ============================================================================
// TEST SETUP
// ============================================================================

describe('Credit Card Engine Integration', () => {
  beforeEach(() => {
    enableCCEngine();
  });

  afterEach(() => {
    disableCCEngine();
  });

  // ============================================================================
  // TRANSACTION PROCESSING TESTS
  // ============================================================================

  describe('onTransactionChange', () => {
    it('should process credit card transactions', () => {
      const transaction = {
        id: 'test-txn-1',
        transactionType: 'Expense',
        fromAccountId: 'credit-card-1',
        amount: 100.00,
        date: '2025-11-15',
        description: 'Test Purchase'
      };

      // Should not throw
      expect(() => onTransactionChange(transaction, false)).not.toThrow();
    });

    it('should process credit card payments', () => {
      const paymentTxn = {
        id: 'test-payment-1',
        transactionType: 'Credit Card Payment',
        toAccountId: 'credit-card-1',
        amount: 150.00,
        date: '2025-11-15'
      };

      // Should not throw
      expect(() => onTransactionChange(paymentTxn, false)).not.toThrow();
    });

    it('should handle updates to existing transactions', () => {
      const transaction = {
        id: 'existing-txn-1',
        transactionType: 'Expense',
        fromAccountId: 'credit-card-1',
        amount: 200.00,
        date: '2025-11-15'
      };

      // Should not throw
      expect(() => onTransactionChange(transaction, true)).not.toThrow();
    });

    it('should be no-op when CC engine is disabled', () => {
      disableCCEngine();

      const transaction = {
        id: 'test-txn-1',
        transactionType: 'Expense',
        fromAccountId: 'credit-card-1',
        amount: 100.00
      };

      // Should not throw and should be no-op
      expect(() => onTransactionChange(transaction, false)).not.toThrow();
    });
  });

  // ============================================================================
  // SYNTHETIC TRANSACTION TESTS
  // ============================================================================

  describe('generateSyntheticTransactions', () => {
    it('should return original transactions when CC engine is disabled', () => {
      disableCCEngine();

      const originalTxns = [
        { id: 'txn-1', amount: 100 },
        { id: 'txn-2', amount: 200 }
      ];

      const result = generateSyntheticTransactions('test-card', originalTxns);
      expect(result).toEqual(originalTxns);
    });

    it('should return original transactions when no card state exists', () => {
      const originalTxns = [
        { id: 'txn-1', amount: 100 },
        { id: 'txn-2', amount: 200 }
      ];

      const result = generateSyntheticTransactions('nonexistent-card', originalTxns);
      expect(result).toEqual(originalTxns);
    });

    it('should handle empty transaction list', () => {
      const result = generateSyntheticTransactions('test-card', []);
      expect(result).toEqual([]);
    });

    it('should handle date range parameter', () => {
      const originalTxns = [
        { id: 'txn-1', amount: 100, date: '2025-11-01' }
      ];

      const dateRange = {
        start: '2025-11-01',
        end: '2025-11-30'
      };

      const result = generateSyntheticTransactions('test-card', originalTxns, dateRange);
      expect(result).toEqual(originalTxns);
    });
  });

  // ============================================================================
  // SYNTHETIC TRANSACTION DETECTION TESTS
  // ============================================================================

  describe('isSyntheticTransaction', () => {
    it('should detect synthetic transactions by ID', () => {
      const syntheticTxn = {
        id: 'synthetic:plan-1:2025-11-25',
        amount: 250.00,
        description: '[Installment] Test Plan'
      };

      expect(isSyntheticTransaction(syntheticTxn)).toBe(true);
    });

    it('should detect synthetic transactions by metadata', () => {
      const syntheticTxn = {
        id: 'regular-txn-1',
        amount: 250.00,
        meta: {
          isInstallmentCharge: true,
          installmentPlanId: 'plan-1'
        }
      };

      expect(isSyntheticTransaction(syntheticTxn)).toBe(true);
    });

    it('should not detect regular transactions as synthetic', () => {
      const regularTxn = {
        id: 'regular-txn-1',
        amount: 100.00,
        description: 'Regular Purchase',
        meta: {
          cardId: 'credit-card-1'
        }
      };

      expect(isSyntheticTransaction(regularTxn)).toBe(false);
    });

    it('should return false when CC engine is disabled', () => {
      disableCCEngine();

      const syntheticTxn = {
        id: 'synthetic:plan-1:2025-11-25',
        amount: 250.00
      };

      expect(isSyntheticTransaction(syntheticTxn)).toBe(false);
    });
  });

  // ============================================================================
  // TRANSACTION FILTERING TESTS
  // ============================================================================

  describe('filterSyntheticTransactions', () => {
    it('should filter out synthetic transactions by default', () => {
      const transactions = [
        { id: 'regular-1', amount: 100 },
        { id: 'synthetic:plan-1:2025-11-25', amount: 250 },
        { id: 'regular-2', amount: 200 }
      ];

      const filtered = filterSyntheticTransactions(transactions);
      expect(filtered).toHaveLength(2);
      expect(filtered.map(t => t.id)).toEqual(['regular-1', 'regular-2']);
    });

    it('should include synthetic transactions when requested', () => {
      const transactions = [
        { id: 'regular-1', amount: 100 },
        { id: 'synthetic:plan-1:2025-11-25', amount: 250 }
      ];

      const filtered = filterSyntheticTransactions(transactions, true);
      expect(filtered).toHaveLength(2);
      expect(filtered.map(t => t.id)).toEqual(['regular-1', 'synthetic:plan-1:2025-11-25']);
    });

    it('should return original list when CC engine is disabled', () => {
      disableCCEngine();

      const transactions = [
        { id: 'regular-1', amount: 100 },
        { id: 'synthetic:plan-1:2025-11-25', amount: 250 }
      ];

      const filtered = filterSyntheticTransactions(transactions);
      expect(filtered).toEqual(transactions);
    });

    it('should handle empty transaction list', () => {
      const filtered = filterSyntheticTransactions([]);
      expect(filtered).toEqual([]);
    });
  });

  // ============================================================================
  // HOOK FUNCTION TESTS
  // ============================================================================

  describe('Hook Functions', () => {
    it('should provide safe hook for transaction save', () => {
      const transaction = {
        id: 'test-save',
        transactionType: 'Expense',
        amount: 100.00
      };

      // Should not throw
      expect(() => hookTransactionSave(transaction)).not.toThrow();
    });

    it('should provide safe hook for transaction update', () => {
      const transaction = {
        id: 'test-update',
        transactionType: 'Expense',
        amount: 150.00
      };

      // Should not throw
      expect(() => hookTransactionUpdate(transaction)).not.toThrow();
    });

    it('should provide safe hook for transaction display', () => {
      const transactions = [
        { id: 'txn-1', amount: 100 },
        { id: 'txn-2', amount: 200 }
      ];

      const result = hookTransactionDisplay('test-card', transactions);
      expect(result).toEqual(transactions); // Should return original when no card state
    });

    it('should provide safe hook for transaction export', () => {
      const transactions = [
        { id: 'txn-1', amount: 100 },
        { id: 'synthetic:plan-1:2025-11-25', amount: 250 }
      ];

      const result = hookTransactionExport(transactions);
      expect(result).toHaveLength(1); // Should filter out synthetic by default
      expect(result[0].id).toBe('txn-1');

      const resultWithSynthetic = hookTransactionExport(transactions, { includeSynthetic: true });
      expect(resultWithSynthetic).toHaveLength(2); // Should include synthetic when requested
    });
  });

  // ============================================================================
  // ERROR HANDLING TESTS
  // ============================================================================

  describe('Error Handling', () => {
    it('should handle malformed transaction data gracefully', () => {
      const malformedTxn = {
        // Missing required fields
        id: 'malformed'
      };

      // Should not throw
      expect(() => onTransactionChange(malformedTxn, false)).not.toThrow();
    });

    it('should handle null/undefined transactions gracefully', () => {
      // Should not throw
      expect(() => onTransactionChange(null, false)).not.toThrow();
      expect(() => onTransactionChange(undefined, false)).not.toThrow();
    });

    it('should handle errors in synthetic transaction generation', () => {
      // Mock a scenario that might cause an error
      const result = generateSyntheticTransactions('invalid-card-id', []);
      expect(result).toEqual([]); // Should return original transactions on error
    });
  });
});


