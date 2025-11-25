/**
 * Credit Card Engine Integration Example
 * 
 * This file shows how to integrate the CC Engine into your existing app
 * with minimal changes to existing code.
 */

// ============================================================================
// 1. INITIALIZATION (Add to app startup)
// ============================================================================

// Add this to your main app initialization (e.g., in app.js)
import { initializeCCEngine } from './services/creditcards/index.js';

// Initialize the CC Engine when your app starts
document.addEventListener('DOMContentLoaded', () => {
  // Your existing app initialization...
  
  // Initialize CC Engine
  initializeCCEngine({
    enabled: true,                    // Enable the engine
    syntheticTransactions: true,      // Generate synthetic installment transactions
    statementIngestion: true,         // Allow statement uploads
    planInference: true,              // Detect installment patterns
    reconciliation: true              // Enable balance reconciliation
  });
  
  console.log('✅ CC Engine initialized');
});

// ============================================================================
// 2. TRANSACTION PIPELINE INTEGRATION
// ============================================================================

// Add these imports to your existing transaction handling code
import { 
  hookTransactionSave, 
  hookTransactionUpdate, 
  hookTransactionDisplay,
  hookTransactionExport 
} from './services/creditcards/integration.js';

// In your existing saveTransaction function, add this line:
function saveTransaction(transaction) {
  // Your existing save logic (don't change this)
  AppState.saveItem('transactions', transaction);
  
  // Add this single line to hook into CC Engine
  hookTransactionSave(transaction);
  
  // Your existing post-save logic (don't change this)
  Utils.showToast('Transaction saved');
}

// In your existing updateTransaction function, add this line:
function updateTransaction(transaction) {
  // Your existing update logic (don't change this)
  AppState.saveItem('transactions', transaction);
  
  // Add this single line to hook into CC Engine
  hookTransactionUpdate(transaction);
  
  // Your existing post-update logic (don't change this)
  Utils.showToast('Transaction updated');
}

// In your existing getTransactionsForCard function, modify like this:
function getTransactionsForCard(cardId) {
  // Your existing logic to get transactions
  const transactions = AppState.State.transactions.filter(t => t.fromAccountId === cardId);
  
  // Add this single line to include synthetic installment transactions
  return hookTransactionDisplay(cardId, transactions);
}

// In your existing export function, modify like this:
function exportTransactions(transactions, options = {}) {
  // Add this single line to filter synthetic transactions from exports
  const filteredTransactions = hookTransactionExport(transactions, options);
  
  // Your existing export logic (don't change this)
  return generateExcelExport(filteredTransactions);
}

// ============================================================================
// 3. UI INTEGRATION (Optional - for enhanced card display)
// ============================================================================

// Add this import to your UI files that display credit cards
import { 
  useCardSnapshot,
  getFormattedDueDate,
  getPaymentUrgency,
  getInstallmentSummary,
  getCardStatusBadge 
} from './ui/creditcards/useCardSnapshot.js';

// In your existing account card rendering, you can enhance it like this:
function renderAccountCard(account) {
  // Your existing card rendering logic...
  
  // Only enhance credit card accounts
  if (account.type === 'credit-card') {
    const cardInfo = useCardSnapshot(account.id);
    const urgency = getPaymentUrgency(account.id);
    const installments = getInstallmentSummary(account.id);
    const badge = getCardStatusBadge(account.id);
    
    // Add CC Engine information to your card HTML
    const ccEngineHTML = `
      <div class="cc-engine-info">
        <div class="payment-urgency" style="color: ${urgency.color}">
          ${urgency.message}
        </div>
        ${installments.hasInstallments ? `
          <div class="installment-info">
            ${installments.message}
          </div>
        ` : ''}
        <div class="status-badge" style="background-color: ${badge.color}">
          ${badge.icon} ${badge.text}
        </div>
      </div>
    `;
    
    // Add to your existing card HTML
    return existingCardHTML + ccEngineHTML;
  }
  
  // Return existing card for non-credit cards
  return existingCardHTML;
}

// ============================================================================
// 4. STATEMENT UPLOAD (Optional - for statement ingestion)
// ============================================================================

// Add this to your settings or account management UI
import { ingestStatement } from './services/creditcards/index.js';

function addStatementUploadButton(cardId) {
  const uploadHTML = `
    <div class="statement-upload">
      <input type="file" id="statement-${cardId}" accept=".pdf,.csv,.ofx" />
      <button onclick="uploadStatement('${cardId}')">Upload Statement</button>
    </div>
  `;
  
  // Add to your card or settings UI
  document.getElementById(`card-${cardId}`).insertAdjacentHTML('beforeend', uploadHTML);
}

async function uploadStatement(cardId) {
  const fileInput = document.getElementById(`statement-${cardId}`);
  const file = fileInput.files[0];
  
  if (!file) {
    Utils.showToast('Please select a statement file');
    return;
  }
  
  try {
    Utils.showToast('Uploading statement...');
    
    const result = await ingestStatement(file, cardId, 'pdf');
    
    if (result.success) {
      Utils.showToast('Statement uploaded successfully');
      // Refresh the account display
      renderAccounts(accountsRoot);
    } else {
      Utils.showToast('Upload failed: ' + result.errors.join(', '));
    }
  } catch (error) {
    Utils.showToast('Upload error: ' + error.message);
  }
}

// ============================================================================
// 5. QUICK SETUP FOR NEW CARDS (Optional)
// ============================================================================

// Add this to your account creation form for credit cards
import { quickSetupCard } from './services/creditcards/index.js';

function enhanceCreditCardForm() {
  // Add CC Engine fields to your existing credit card form
  const ccEngineFields = `
    <div class="cc-engine-setup">
      <h4>Credit Card Engine Setup</h4>
      <label>
        Statement Balance (optional)
        <input type="number" id="ccStatementBalance" placeholder="0.00" />
      </label>
      <label>
        Minimum Due (optional)
        <input type="number" id="ccMinimumDue" placeholder="0.00" />
      </label>
      <button type="button" onclick="setupCCEngine()">Setup CC Engine</button>
    </div>
  `;
  
  // Add to your existing form
  document.getElementById('credit-card-form').insertAdjacentHTML('beforeend', ccEngineFields);
}

function setupCCEngine() {
  const cardId = document.getElementById('accId').value;
  const statementBalance = parseFloat(document.getElementById('ccStatementBalance').value) || undefined;
  const minimumDue = parseFloat(document.getElementById('ccMinimumDue').value) || undefined;
  
  if (cardId) {
    quickSetupCard(cardId, {
      statementBalance,
      minimumDue
    });
    
    Utils.showToast('CC Engine setup complete');
  }
}

// ============================================================================
// 6. DEBUGGING AND MONITORING (Optional)
// ============================================================================

// Add this to your developer tools or settings
import { getEngineStatus, logFeatureStatus } from './services/creditcards/index.js';

function addCCEngineDebugPanel() {
  const debugHTML = `
    <div class="cc-engine-debug">
      <h4>CC Engine Debug</h4>
      <button onclick="showCCEngineStatus()">Show Status</button>
      <button onclick="toggleCCEngine()">Toggle Engine</button>
      <div id="cc-engine-status"></div>
    </div>
  `;
  
  // Add to your settings or developer panel
  document.getElementById('settings-panel').insertAdjacentHTML('beforeend', debugHTML);
}

function showCCEngineStatus() {
  const status = getEngineStatus();
  const statusHTML = `
    <div class="status-info">
      <h5>Engine Status</h5>
      <p>Enabled: ${status.enabled}</p>
      <p>Features: ${JSON.stringify(status.features)}</p>
      <p>Migration: ${JSON.stringify(status.migration)}</p>
    </div>
  `;
  
  document.getElementById('cc-engine-status').innerHTML = statusHTML;
  logFeatureStatus();
}

function toggleCCEngine() {
  // This would be implemented based on your needs
  Utils.showToast('CC Engine toggle - implement as needed');
}

// ============================================================================
// 7. SUMMARY OF CHANGES NEEDED
// ============================================================================

/*
To integrate the CC Engine into your existing app, you need to make these minimal changes:

1. Add initialization call in your app startup
2. Add hookTransactionSave() call in your saveTransaction function
3. Add hookTransactionUpdate() call in your updateTransaction function  
4. Add hookTransactionDisplay() call in your getTransactionsForCard function
5. Add hookTransactionExport() call in your exportTransactions function

That's it! The engine is designed to be completely additive and safe.

Optional enhancements:
- Add UI integration for enhanced card display
- Add statement upload functionality
- Add quick setup for new cards
- Add debugging panel

The engine will work with zero changes to your existing data structures,
transaction logic, or UI components. Everything is backward compatible.
*/






