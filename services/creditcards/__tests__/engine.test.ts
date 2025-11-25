/**
 * Credit Card Engine Core Tests
 * 
 * Tests for the core engine functionality including cycle calculations,
 * installment management, and payment processing.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type { CCCardEngineState, CCInstallmentPlan } from '../types.js';
import { 
  computeCurrentCycle, 
  computeAmountsDue, 
  forecastInstallments,
  applyPayment,
  createInstallmentPlan 
} from '../engine.js';
import { enableCCEngine, disableCCEngine } from '../feature.js';

// ============================================================================
// TEST SETUP
// ============================================================================

describe('Credit Card Engine Core', () => {
  let testCard: CCCardEngineState;

  beforeEach(() => {
    // Enable CC engine for tests
    enableCCEngine();

    // Create test card
    testCard = {
      cardId: 'test-card-1',
      issuer: 'Test Bank',
      currency: 'USD',
      cycle: {
        closingDay: 25,
        graceApplies: true,
        lastCloseDate: '2025-10-25',
        nextCloseDate: '2025-11-25',
        dueDate: '2025-12-20'
      },
      snapshot: {
        statementCloseDate: '2025-10-25',
        statementBalance: 1500.00,
        minimumDue: 75.00,
        revolvingBalance: 1000.00,
        feesAccrued: 0,
        interestAccrued: 0
      },
      installmentPlans: [
        {
          planId: 'plan-1',
          descriptor: 'Test Laptop',
          startDate: '2025-09-01',
          termMonths: 12,
          monthsElapsed: 2,
          monthlyCharge: 250.00,
          remainingPayments: 10,
          remainingPrincipal: 2500.00,
          status: 'active',
          source: 'statement',
          confidence: 1.0
        }
      ],
      reconciliation: {
        confidence: 0.9,
        unappliedAdjustments: 0
      }
    };
  });

  afterEach(() => {
    // Clean up after tests
    disableCCEngine();
  });

  // ============================================================================
  // CYCLE COMPUTATION TESTS
  // ============================================================================

  describe('computeCurrentCycle', () => {
    it('should compute cycle for current month', () => {
      const asOf = new Date('2025-11-15');
      const cycle = computeCurrentCycle(testCard.cycle, asOf);

      expect(cycle).toBeDefined();
      expect(cycle?.periodStart).toBe('2025-10-26');
      expect(cycle?.periodEnd).toBe('2025-11-25');
      expect(cycle?.dueDate).toBe('2025-12-20');
    });

    it('should return null when CC engine is disabled', () => {
      disableCCEngine();
      const cycle = computeCurrentCycle(testCard.cycle, new Date());
      expect(cycle).toBeNull();
    });

    it('should return null for invalid cycle data', () => {
      const invalidCard = { ...testCard, cycle: undefined };
      const cycle = computeCurrentCycle(invalidCard.cycle, new Date());
      expect(cycle).toBeNull();
    });
  });

  // ============================================================================
  // AMOUNTS DUE TESTS
  // ============================================================================

  describe('computeAmountsDue', () => {
    it('should compute correct amounts due', () => {
      const asOf = new Date('2025-11-15');
      const amounts = computeAmountsDue(testCard, asOf);

      expect(amounts).toBeDefined();
      expect(amounts?.installmentDue).toBe(250.00); // One active plan
      expect(amounts?.feesInterest).toBe(0);
      expect(amounts?.revolvingMin).toBe(25); // 1% of 1000, minimum 25
      expect(amounts?.minimumDue).toBe(75.00); // From statement
      expect(amounts?.totalDue).toBe(1250.00); // 250 + 1000
    });

    it('should handle card with no installment plans', () => {
      const cardWithoutPlans = { ...testCard, installmentPlans: [] };
      const amounts = computeAmountsDue(cardWithoutPlans, new Date());

      expect(amounts).toBeDefined();
      expect(amounts?.installmentDue).toBe(0);
      expect(amounts?.totalDue).toBe(1000.00); // Only revolving balance
    });

    it('should return null when CC engine is disabled', () => {
      disableCCEngine();
      const amounts = computeAmountsDue(testCard, new Date());
      expect(amounts).toBeNull();
    });
  });

  // ============================================================================
  // INSTALLMENT FORECAST TESTS
  // ============================================================================

  describe('forecastInstallments', () => {
    it('should forecast installment charges', () => {
      const forecasts = forecastInstallments(testCard, 6);

      expect(forecasts).toBeDefined();
      expect(forecasts.length).toBeGreaterThan(0);
      
      // Check that forecasts have correct structure
      const firstForecast = forecasts[0];
      expect(firstForecast.date).toBeDefined();
      expect(firstForecast.amount).toBe(250.00);
      expect(firstForecast.planId).toBe('plan-1');
      expect(firstForecast.descriptor).toBe('Test Laptop');
    });

    it('should return empty array for card with no plans', () => {
      const cardWithoutPlans = { ...testCard, installmentPlans: [] };
      const forecasts = forecastInstallments(cardWithoutPlans, 6);

      expect(forecasts).toEqual([]);
    });

    it('should return empty array when CC engine is disabled', () => {
      disableCCEngine();
      const forecasts = forecastInstallments(testCard, 6);
      expect(forecasts).toEqual([]);
    });
  });

  // ============================================================================
  // PAYMENT APPLICATION TESTS
  // ============================================================================

  describe('applyPayment', () => {
    it('should apply payment correctly', () => {
      const paymentTxn = {
        id: 'payment-1',
        date: '2025-11-15',
        amount: 500.00,
        transactionType: 'Credit Card Payment'
      };

      const allocation = applyPayment(testCard, paymentTxn);

      expect(allocation).toBeDefined();
      expect(allocation?.paymentId).toBe('payment-1');
      expect(allocation?.amount).toBe(500.00);
      expect(allocation?.applied.fees).toBe(0);
      expect(allocation?.applied.installments).toBe(250.00); // Pay installment due
      expect(allocation?.applied.revolving).toBe(250.00); // Remaining to revolving
    });

    it('should handle payment larger than total due', () => {
      const paymentTxn = {
        id: 'payment-2',
        date: '2025-11-15',
        amount: 2000.00,
        transactionType: 'Credit Card Payment'
      };

      const allocation = applyPayment(testCard, paymentTxn);

      expect(allocation).toBeDefined();
      expect(allocation?.amount).toBe(2000.00);
      expect(allocation?.applied.installments).toBe(250.00);
      expect(allocation?.applied.revolving).toBe(1750.00); // Remaining after installment
    });

    it('should handle payment smaller than minimum due', () => {
      const paymentTxn = {
        id: 'payment-3',
        date: '2025-11-15',
        amount: 50.00,
        transactionType: 'Credit Card Payment'
      };

      const allocation = applyPayment(testCard, paymentTxn);

      expect(allocation).toBeDefined();
      expect(allocation?.amount).toBe(50.00);
      expect(allocation?.applied.installments).toBe(50.00); // All to installment
      expect(allocation?.applied.revolving).toBe(0); // None to revolving
    });

    it('should return null when CC engine is disabled', () => {
      disableCCEngine();
      const paymentTxn = { id: 'payment-1', amount: 100.00 };
      const allocation = applyPayment(testCard, paymentTxn);
      expect(allocation).toBeNull();
    });
  });

  // ============================================================================
  // INSTALLMENT PLAN CREATION TESTS
  // ============================================================================

  describe('createInstallmentPlan', () => {
    it('should create installment plan correctly', () => {
      const plan = createInstallmentPlan(
        'Test Purchase',
        200.00,
        6,
        '2025-11-01'
      );

      expect(plan).toBeDefined();
      expect(plan.descriptor).toBe('Test Purchase');
      expect(plan.monthlyCharge).toBe(200.00);
      expect(plan.termMonths).toBe(6);
      expect(plan.remainingPayments).toBe(6);
      expect(plan.startDate).toBe('2025-11-01');
      expect(plan.status).toBe('active');
      expect(plan.source).toBe('inferred');
      expect(plan.confidence).toBe(0.7);
      expect(plan.planId).toMatch(/^plan_\d+_[a-z0-9]+$/);
    });

    it('should generate unique plan IDs', () => {
      const plan1 = createInstallmentPlan('Plan 1', 100, 3, '2025-11-01');
      const plan2 = createInstallmentPlan('Plan 2', 200, 6, '2025-11-01');

      expect(plan1.planId).not.toBe(plan2.planId);
    });
  });
});

// ============================================================================
// INTEGRATION TESTS
// ============================================================================

describe('Credit Card Engine Integration', () => {
  beforeEach(() => {
    enableCCEngine();
  });

  afterEach(() => {
    disableCCEngine();
  });

  it('should handle complete payment workflow', () => {
    // Create card with installment plan
    const card: CCCardEngineState = {
      cardId: 'integration-test',
      currency: 'USD',
      cycle: {
        closingDay: 25,
        graceApplies: true,
        nextCloseDate: '2025-11-25'
      },
      snapshot: {
        statementCloseDate: '2025-10-25',
        statementBalance: 1200.00,
        minimumDue: 60.00,
        revolvingBalance: 1000.00
      },
      installmentPlans: [
        createInstallmentPlan('Integration Test', 200.00, 6, '2025-10-01')
      ],
      reconciliation: { confidence: 1.0 }
    };

    // Compute amounts due
    const amounts = computeAmountsDue(card, new Date('2025-11-15'));
    expect(amounts?.installmentDue).toBe(200.00);
    expect(amounts?.totalDue).toBe(1200.00);

    // Apply payment
    const paymentTxn = {
      id: 'integration-payment',
      date: '2025-11-15',
      amount: 400.00,
      transactionType: 'Credit Card Payment'
    };

    const allocation = applyPayment(card, paymentTxn);
    expect(allocation?.applied.installments).toBe(200.00);
    expect(allocation?.applied.revolving).toBe(200.00);

    // Forecast future installments
    const forecasts = forecastInstallments(card, 3);
    expect(forecasts.length).toBeGreaterThan(0);
  });

  it('should maintain data consistency across operations', () => {
    const card: CCCardEngineState = {
      cardId: 'consistency-test',
      currency: 'USD',
      cycle: {
        closingDay: 25,
        graceApplies: true,
        nextCloseDate: '2025-11-25'
      },
      snapshot: {
        statementCloseDate: '2025-10-25',
        statementBalance: 1000.00,
        minimumDue: 50.00,
        revolvingBalance: 1000.00
      },
      installmentPlans: [],
      reconciliation: { confidence: 1.0 }
    };

    // Multiple operations should not corrupt data
    const amounts1 = computeAmountsDue(card, new Date());
    const amounts2 = computeAmountsDue(card, new Date());
    const forecasts = forecastInstallments(card, 6);

    expect(amounts1).toEqual(amounts2);
    expect(forecasts).toEqual([]);
    expect(card.installmentPlans).toEqual([]);
  });
});






