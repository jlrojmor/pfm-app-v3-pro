# Credit Card Engine

A bulletproof credit card cycle & installment engine that works with minimal user input, optionally ingests statements, and integrates seamlessly with existing transaction logic.

## Features

- ✅ **Credit Card Cycle Management** - Automatic billing cycle calculations
- ✅ **Installment Plan Tracking** - Support for installment payments and deferred purchases
- ✅ **Statement Ingestion** - Parse PDF, CSV, OFX, or manual entry
- ✅ **Payment Reconciliation** - Balance verification and discrepancy detection
- ✅ **Synthetic Transaction Generation** - Automatic installment charge creation
- ✅ **Balance Prediction** - Estimate balances without statements
- ✅ **Guard System** - Data validation and sanity checks
- ✅ **Migration Support** - Backward-compatible data migration
- ✅ **Feature Flags** - Safe deployment and rollback capability

## Quick Start

### 1. Initialize the Engine

```javascript
import { initializeCCEngine } from './services/creditcards/index.js';

// Initialize with default settings
initializeCCEngine();

// Or with custom configuration
initializeCCEngine({
  enabled: true,
  syntheticTransactions: true,
  statementIngestion: true,
  planInference: true,
  reconciliation: true
});
```

### 2. Quick Card Setup

```javascript
import { quickSetupCard } from './services/creditcards/index.js';

// Setup a new credit card
quickSetupCard('my-chase-card', {
  issuer: 'Chase',
  last4: '1234',
  closingDay: 5,
  statementBalance: 1500.00,
  minimumDue: 75.00
});
```

### 3. Integrate with Existing Transaction Pipeline

```javascript
import { 
  hookTransactionSave, 
  hookTransactionUpdate, 
  hookTransactionDisplay,
  hookTransactionExport 
} from './services/creditcards/index.js';

// In your existing transaction save function
function saveTransaction(transaction) {
  // Your existing save logic...
  AppState.saveItem('transactions', transaction);
  
  // Hook into CC engine
  hookTransactionSave(transaction);
}

// In your existing transaction display function
function getTransactionsForCard(cardId) {
  const transactions = AppState.State.transactions.filter(t => t.fromAccountId === cardId);
  
  // Hook into CC engine for synthetic transactions
  return hookTransactionDisplay(cardId, transactions);
}

// In your existing export function
function exportTransactions(transactions, options = {}) {
  // Hook into CC engine for synthetic transaction filtering
  const filteredTransactions = hookTransactionExport(transactions, options);
  
  // Your existing export logic...
  return generateExcelExport(filteredTransactions);
}
```

### 4. Use UI Adapter

```javascript
import { useCardSnapshot } from './ui/creditcards/useCardSnapshot.js';

// Get card information for UI display
const cardInfo = useCardSnapshot('my-chase-card');

console.log(cardInfo);
// {
//   dueDate: '2025-12-02',
//   totalDue: 1500.00,
//   minimumDue: 75.00,
//   includesInstallments: 250.00,
//   plansCount: 1,
//   basedOn: 'statement',
//   warnings: []
// }
```

## Integration Points

### Transaction Pipeline Hooks

The engine provides safe hooks that don't modify existing functionality:

- `hookTransactionSave(transaction)` - Called when saving transactions
- `hookTransactionUpdate(transaction)` - Called when updating transactions  
- `hookTransactionDisplay(cardId, transactions)` - Called when displaying transactions
- `hookTransactionExport(transactions, options)` - Called when exporting transactions

### UI Integration

Use the UI adapter for consistent card information display:

```javascript
import { 
  useCardSnapshot,
  getFormattedDueDate,
  getPaymentUrgency,
  getInstallmentSummary,
  getCardStatusBadge 
} from './ui/creditcards/useCardSnapshot.js';

// In your card component
const cardInfo = useCardSnapshot(cardId);
const urgency = getPaymentUrgency(cardId);
const installments = getInstallmentSummary(cardId);
const badge = getCardStatusBadge(cardId);
```

## Statement Ingestion

### Upload Statement

```javascript
import { ingestStatement } from './services/creditcards/index.js';

// Upload PDF statement
const fileInput = document.getElementById('statement-file');
const file = fileInput.files[0];

const result = await ingestStatement(file, 'my-chase-card', 'pdf');

if (result.success) {
  console.log('Statement ingested successfully:', result.data);
} else {
  console.error('Ingestion failed:', result.errors);
}
```

### Manual Entry

```javascript
import { createManualEntryTemplate, ingestStatement } from './services/creditcards/index.js';

// Create manual entry
const manualData = createManualEntryTemplate();
manualData.cycle.closingDay = 5;
manualData.snapshot.statementBalance = 1500.00;
manualData.snapshot.minimumDue = 75.00;

const result = await ingestStatement(manualData, 'my-chase-card', 'manual');
```

## Installment Plan Management

### Create Installment Plan

```javascript
import { createInstallmentPlan } from './services/creditcards/index.js';

const plan = createInstallmentPlan(
  'Laptop Purchase',  // descriptor
  250.00,             // monthly charge
  12,                 // term months
  '2025-11-01'        // start date
);
```

### Get Installment Information

```javascript
import { getInstallmentSummary } from './ui/creditcards/useCardSnapshot.js';

const summary = getInstallmentSummary('my-chase-card');
console.log(summary);
// {
//   hasInstallments: true,
//   totalMonthly: 250.00,
//   activePlans: 1,
//   message: '1 installment • $250.00/month'
// }
```

## Payment Processing

### Apply Payment

```javascript
import { applyPayment } from './services/creditcards/index.js';

const paymentTransaction = {
  id: 'payment-1',
  date: '2025-11-15',
  amount: 500.00,
  transactionType: 'Credit Card Payment'
};

const allocation = applyPayment(card, paymentTransaction);
console.log(allocation);
// {
//   paymentId: 'payment-1',
//   date: '2025-11-15',
//   amount: 500.00,
//   applied: {
//     fees: 0,
//     installments: 250.00,
//     revolving: 250.00
//   }
// }
```

## Reconciliation

### Check Balance Accuracy

```javascript
import { reconcileAgainstStatement } from './services/creditcards/index.js';

const statement = {
  statementCloseDate: '2025-11-05',
  statementBalance: 1500.00,
  minimumDue: 75.00
};

const result = reconcileAgainstStatement('my-chase-card', statement);

if (result.ok) {
  console.log('Balance reconciliation successful');
} else {
  console.log('Balance discrepancy:', result.diff);
  console.log('Notes:', result.notes);
}
```

## Feature Flags

### Control Engine Behavior

```javascript
import { 
  isCCEngineEnabled, 
  disableCCEngine, 
  enableCCEngine,
  getFeatureStatus 
} from './services/creditcards/index.js';

// Check if engine is enabled
if (isCCEngineEnabled()) {
  console.log('CC Engine is active');
}

// Disable engine (for testing or emergency)
disableCCEngine();

// Re-enable engine
enableCCEngine();

// Get feature status
const status = getFeatureStatus();
console.table(status);
```

## Migration

### Migrate Existing Cards

```javascript
import { migrateExistingCreditCards, getMigrationStatus } from './services/creditcards/index.js';

// Run migration (usually called during app initialization)
migrateExistingCreditCards();

// Check migration status
const status = getMigrationStatus();
console.log('Migration completed:', status.completed);
console.log('Migrated accounts:', status.migratedAccounts);
```

## Testing

### Run Tests

```bash
# Run all CC engine tests
npm test services/creditcards

# Run specific test suites
npm test services/creditcards/__tests__/engine.test.ts
npm test services/creditcards/__tests__/integration.test.ts
```

### Test Scenarios

The test suite covers:

- ✅ Cycle computation accuracy
- ✅ Installment plan creation and management
- ✅ Payment allocation logic
- ✅ Synthetic transaction generation
- ✅ Statement reconciliation
- ✅ Feature flag behavior
- ✅ Integration with existing pipeline
- ✅ Error handling and edge cases

## Architecture

### File Structure

```
services/creditcards/
├── index.ts                    # Main export file
├── types.ts                    # Type definitions
├── feature.ts                  # Feature flag management
├── engine.ts                   # Core engine logic
├── ingestStatement.ts          # Statement parsing
├── inferPlans.ts              # Installment plan inference
├── reconcile.ts               # Balance reconciliation
├── guards.ts                  # Data validation
├── integration.ts             # Pipeline integration
├── migration.ts               # Data migration
└── __tests__/                 # Test suite
    ├── engine.test.ts
    └── integration.test.ts

ui/creditcards/
└── useCardSnapshot.ts         # UI adapter
```

### Design Principles

1. **Additive Only** - Never modifies existing functionality
2. **Feature Flagged** - Can be safely disabled
3. **Backward Compatible** - Works with existing data
4. **Isolated** - Self-contained modules
5. **Testable** - Comprehensive test coverage
6. **Safe** - Graceful error handling

## Troubleshooting

### Common Issues

1. **Engine Not Working**
   - Check if `isCCEngineEnabled()` returns true
   - Verify feature flags are properly initialized
   - Check browser console for errors

2. **Transactions Not Appearing**
   - Ensure integration hooks are called
   - Check if synthetic transactions are enabled
   - Verify card state exists

3. **Balance Discrepancies**
   - Run reconciliation checks
   - Review guard warnings
   - Check for unapplied adjustments

4. **Migration Issues**
   - Check migration status
   - Verify existing account data
   - Run force re-migration if needed

### Debug Mode

```javascript
import { getEngineStatus, logFeatureStatus } from './services/creditcards/index.js';

// Get complete engine status
const status = getEngineStatus();
console.log('Engine Status:', status);

// Log feature flag status
logFeatureStatus();
```

## Support

For issues or questions:

1. Check the test suite for usage examples
2. Review the integration points documentation
3. Enable debug logging to trace execution
4. Verify feature flags are properly configured

The engine is designed to be bulletproof and safe - it will never break existing functionality, even if disabled or misconfigured.


