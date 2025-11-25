/**
 * Statement Confirmation Modal for Statement Ingestion V2
 * 
 * Provides a user-friendly interface for reviewing and confirming
 * parsed statement data before applying to the credit card engine.
 */

import { CanonicalStatement } from '../../../services/statement_ingestion_v2/types';

export interface StatementConfirmOptions {
  statement: CanonicalStatement;
  cardId: string;
  onApply: (statement: CanonicalStatement) => Promise<void>;
  onCancel: () => void;
  onKeepEstimated?: () => void;
}

/**
 * Show statement confirmation modal
 */
export function showStatementConfirmModal(options: StatementConfirmOptions): void {
  const modal = createModal(options);
  document.body.appendChild(modal);
  
  // Animate in
  requestAnimationFrame(() => {
    modal.classList.add('show');
  });
}

/**
 * Create the modal element
 */
function createModal(options: StatementConfirmOptions): HTMLElement {
  const modal = document.createElement('div');
  modal.className = 'statement-confirm-modal';
  modal.innerHTML = generateModalHTML(options);
  
  // Add event listeners
  setupEventListeners(modal, options);
  
  // Add styles
  addModalStyles();
  
  return modal;
}

/**
 * Generate modal HTML
 */
function generateModalHTML(options: StatementConfirmOptions): string {
  const { statement } = options;
  
  return `
    <div class="modal-backdrop"></div>
    <div class="modal-content">
      <div class="modal-header">
        <h2>📄 Confirm Statement Data</h2>
        <button class="close-btn" type="button">&times;</button>
      </div>
      
      <div class="modal-body">
        <div class="statement-summary">
          <div class="summary-item">
            <strong>Issuer:</strong> ${statement.issuer || 'Unknown'}
          </div>
          <div class="summary-item">
            <strong>Card:</strong> ****${statement.cardLast4 || '0000'}
          </div>
          <div class="summary-item">
            <strong>Currency:</strong> ${statement.currency || 'USD'}
          </div>
        </div>
        
        <div class="data-grid">
          <div class="data-column">
            <h3>💰 Financial Data</h3>
            ${generateFinancialFieldsHTML(statement)}
          </div>
          
          <div class="data-column">
            <h3>📅 Dates & Limits</h3>
            ${generateDateLimitFieldsHTML(statement)}
          </div>
          
          <div class="data-column">
            <h3>📊 Installment Plans</h3>
            ${generateInstallmentPlansHTML(statement)}
          </div>
        </div>
        
        ${generateWarningsHTML(statement)}
        
        <div class="confidence-indicator">
          <h4>🎯 Parsing Confidence</h4>
          ${generateConfidenceHTML(statement)}
        </div>
      </div>
      
      <div class="modal-footer">
        <button type="button" class="btn btn-secondary" data-action="cancel">
          Cancel
        </button>
        <button type="button" class="btn btn-secondary" data-action="keep-estimated" 
                ${!statement.needsUserConfirm ? 'style="display:none"' : ''}>
          Keep as Estimated
        </button>
        <button type="button" class="btn btn-primary" data-action="apply">
          Apply to Card
        </button>
      </div>
    </div>
  `;
}

/**
 * Generate financial fields HTML
 */
function generateFinancialFieldsHTML(statement: CanonicalStatement): string {
  const fields = [
    {
      label: 'Statement Balance',
      value: statement.statementBalance,
      field: 'statementBalance',
      type: 'currency',
      required: true
    },
    {
      label: 'Minimum Payment',
      value: statement.minimumDue,
      field: 'minimumDue',
      type: 'currency',
      required: true
    },
    {
      label: 'Previous Balance',
      value: statement.previousBalance,
      field: 'previousBalance',
      type: 'currency'
    },
    {
      label: 'Payments & Credits',
      value: statement.paymentsAndCredits,
      field: 'paymentsAndCredits',
      type: 'currency'
    },
    {
      label: 'Purchases',
      value: statement.purchases,
      field: 'purchases',
      type: 'currency'
    },
    {
      label: 'Fees',
      value: statement.fees,
      field: 'fees',
      type: 'currency'
    },
    {
      label: 'Interest',
      value: statement.interest,
      field: 'interest',
      type: 'currency'
    }
  ];
  
  return fields.map(field => generateFieldHTML(field, statement)).join('');
}

/**
 * Generate date and limit fields HTML
 */
function generateDateLimitFieldsHTML(statement: CanonicalStatement): string {
  const fields = [
    {
      label: 'Payment Due Date',
      value: statement.paymentDueDate,
      field: 'paymentDueDate',
      type: 'date',
      required: true
    },
    {
      label: 'Statement Period End',
      value: statement.statementPeriodEnd,
      field: 'statementPeriodEnd',
      type: 'date'
    },
    {
      label: 'Closing Day',
      value: statement.closingDay,
      field: 'closingDay',
      type: 'number'
    },
    {
      label: 'Credit Limit',
      value: statement.creditLimit,
      field: 'creditLimit',
      type: 'currency'
    },
    {
      label: 'Available Credit',
      value: statement.availableCredit,
      field: 'availableCredit',
      type: 'currency'
    }
  ];
  
  return fields.map(field => generateFieldHTML(field, statement)).join('');
}

/**
 * Generate installment plans HTML
 */
function generateInstallmentPlansHTML(statement: CanonicalStatement): string {
  if (statement.installmentPlans.length === 0) {
    return '<div class="no-installments">No installment plans found</div>';
  }
  
  const plansHTML = statement.installmentPlans.map(plan => `
    <div class="installment-plan">
      <div class="plan-header">
        <strong>${plan.descriptor}</strong>
        <span class="plan-source">${plan.source}</span>
      </div>
      <div class="plan-details">
        <div>Monthly: ${formatCurrency(plan.monthlyCharge)}</div>
        <div>Remaining: ${plan.remainingPayments || 'Unknown'} payments</div>
        <div>Principal: ${formatCurrency(plan.remainingPrincipal)}</div>
        ${plan.planApr ? `<div>APR: ${plan.planApr}%</div>` : ''}
      </div>
      <div class="plan-confidence">
        Confidence: ${(plan.confidence * 100).toFixed(0)}%
      </div>
    </div>
  `).join('');
  
  return `<div class="installment-plans">${plansHTML}</div>`;
}

/**
 * Generate field HTML
 */
function generateFieldHTML(field: any, statement: CanonicalStatement): string {
  const confidence = statement.confidenceByField[field.field] || 0;
  const confidenceClass = confidence >= 0.8 ? 'high' : confidence >= 0.6 ? 'medium' : 'low';
  const confidenceIcon = confidence >= 0.8 ? '✅' : confidence >= 0.6 ? '⚠️' : '❌';
  
  let inputHTML = '';
  if (field.value !== undefined && field.value !== null) {
    if (field.type === 'currency') {
      inputHTML = `<input type="number" step="0.01" value="${field.value}" data-field="${field.field}" />`;
    } else if (field.type === 'date') {
      inputHTML = `<input type="date" value="${field.value}" data-field="${field.field}" />`;
    } else if (field.type === 'number') {
      inputHTML = `<input type="number" value="${field.value}" data-field="${field.field}" />`;
    } else {
      inputHTML = `<input type="text" value="${field.value}" data-field="${field.field}" />`;
    }
  } else {
    inputHTML = `<input type="${field.type === 'date' ? 'date' : field.type === 'currency' ? 'number' : 'text'}" 
                        placeholder="Not found" data-field="${field.field}" />`;
  }
  
  return `
    <div class="field-row ${field.required ? 'required' : ''}">
      <label>${field.label} ${field.required ? '*' : ''}</label>
      <div class="field-input">
        ${inputHTML}
        <span class="confidence-badge ${confidenceClass}">
          ${confidenceIcon} ${(confidence * 100).toFixed(0)}%
        </span>
      </div>
    </div>
  `;
}

/**
 * Generate warnings HTML
 */
function generateWarningsHTML(statement: CanonicalStatement): string {
  if (!statement.warnings || statement.warnings.length === 0) {
    return '';
  }
  
  const warningsHTML = statement.warnings.map(warning => `
    <div class="warning-item">
      <span class="warning-icon">⚠️</span>
      <span class="warning-text">${warning}</span>
    </div>
  `).join('');
  
  return `
    <div class="warnings-section">
      <h4>⚠️ Warnings & Notes</h4>
      <div class="warnings-list">
        ${warningsHTML}
      </div>
    </div>
  `;
}

/**
 * Generate confidence HTML
 */
function generateConfidenceHTML(statement: CanonicalStatement): string {
  const fields = Object.entries(statement.confidenceByField || {});
  const avgConfidence = fields.length > 0 
    ? fields.reduce((sum, [_, conf]) => sum + conf, 0) / fields.length 
    : 0;
  
  const confidenceClass = avgConfidence >= 0.8 ? 'high' : avgConfidence >= 0.6 ? 'medium' : 'low';
  
  return `
    <div class="confidence-summary ${confidenceClass}">
      <div class="confidence-bar">
        <div class="confidence-fill" style="width: ${avgConfidence * 100}%"></div>
      </div>
      <div class="confidence-text">
        Overall: ${(avgConfidence * 100).toFixed(1)}% 
        ${avgConfidence >= 0.8 ? '✅ High' : avgConfidence >= 0.6 ? '⚠️ Medium' : '❌ Low'}
      </div>
    </div>
  `;
}

/**
 * Setup event listeners
 */
function setupEventListeners(modal: HTMLElement, options: StatementConfirmOptions): void {
  const { statement, onApply, onCancel, onKeepEstimated } = options;
  
  // Close button
  modal.querySelector('.close-btn')?.addEventListener('click', () => {
    closeModal(modal);
    onCancel();
  });
  
  // Backdrop click
  modal.querySelector('.modal-backdrop')?.addEventListener('click', () => {
    closeModal(modal);
    onCancel();
  });
  
  // Action buttons
  modal.querySelector('[data-action="cancel"]')?.addEventListener('click', () => {
    closeModal(modal);
    onCancel();
  });
  
  modal.querySelector('[data-action="keep-estimated"]')?.addEventListener('click', () => {
    closeModal(modal);
    if (onKeepEstimated) onKeepEstimated();
  });
  
  modal.querySelector('[data-action="apply"]')?.addEventListener('click', async () => {
    const updatedStatement = collectFormData(modal, statement);
    closeModal(modal);
    await onApply(updatedStatement);
  });
  
  // Form field changes
  modal.addEventListener('input', (e) => {
    const target = e.target as HTMLInputElement;
    if (target.dataset.field) {
      updateStatementField(statement, target.dataset.field, target.value);
    }
  });
}

/**
 * Close modal with animation
 */
function closeModal(modal: HTMLElement): void {
  modal.classList.remove('show');
  setTimeout(() => {
    if (modal.parentNode) {
      modal.parentNode.removeChild(modal);
    }
  }, 300);
}

/**
 * Collect form data
 */
function collectFormData(modal: HTMLElement, originalStatement: CanonicalStatement): CanonicalStatement {
  const updatedStatement = { ...originalStatement };
  
  const inputs = modal.querySelectorAll('input[data-field]');
  inputs.forEach((input: HTMLInputElement) => {
    const field = input.dataset.field!;
    const value = input.value;
    
    if (value) {
      if (field.includes('Balance') || field.includes('Due') || field.includes('Limit') || 
          field.includes('Credit') || field.includes('Purchases') || field.includes('Fees') || 
          field.includes('Interest') || field.includes('Payments')) {
        (updatedStatement as any)[field] = parseFloat(value);
      } else if (field.includes('Date') || field.includes('Period')) {
        (updatedStatement as any)[field] = value;
      } else if (field === 'closingDay') {
        (updatedStatement as any)[field] = parseInt(value);
      } else {
        (updatedStatement as any)[field] = value;
      }
    }
  });
  
  return updatedStatement;
}

/**
 * Update statement field
 */
function updateStatementField(statement: CanonicalStatement, field: string, value: string): void {
  if (value) {
    if (field.includes('Balance') || field.includes('Due') || field.includes('Limit') || 
        field.includes('Credit') || field.includes('Purchases') || field.includes('Fees') || 
        field.includes('Interest') || field.includes('Payments')) {
      (statement as any)[field] = parseFloat(value);
    } else if (field.includes('Date') || field.includes('Period')) {
      (statement as any)[field] = value;
    } else if (field === 'closingDay') {
      (statement as any)[field] = parseInt(value);
    } else {
      (statement as any)[field] = value;
    }
  }
}

/**
 * Format currency
 */
function formatCurrency(amount?: number): string {
  if (amount === undefined || amount === null) return 'N/A';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD'
  }).format(amount);
}

/**
 * Add modal styles
 */
function addModalStyles(): void {
  if (document.getElementById('statement-confirm-modal-styles')) return;
  
  const styles = document.createElement('style');
  styles.id = 'statement-confirm-modal-styles';
  styles.textContent = `
    .statement-confirm-modal {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      z-index: 10000;
      opacity: 0;
      transition: opacity 0.3s ease;
    }
    
    .statement-confirm-modal.show {
      opacity: 1;
    }
    
    .modal-backdrop {
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(0, 0, 0, 0.5);
      cursor: pointer;
    }
    
    .modal-content {
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%) scale(0.9);
      background: white;
      border-radius: 12px;
      box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
      max-width: 900px;
      width: 90%;
      max-height: 90vh;
      overflow: hidden;
      transition: transform 0.3s ease;
    }
    
    .statement-confirm-modal.show .modal-content {
      transform: translate(-50%, -50%) scale(1);
    }
    
    .modal-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 20px 24px;
      border-bottom: 1px solid #e5e7eb;
      background: #f9fafb;
    }
    
    .modal-header h2 {
      margin: 0;
      font-size: 20px;
      font-weight: 600;
      color: #111827;
    }
    
    .close-btn {
      background: none;
      border: none;
      font-size: 24px;
      cursor: pointer;
      color: #6b7280;
      padding: 0;
      width: 32px;
      height: 32px;
      display: flex;
      align-items: center;
      justify-content: center;
      border-radius: 6px;
    }
    
    .close-btn:hover {
      background: #f3f4f6;
      color: #374151;
    }
    
    .modal-body {
      padding: 24px;
      max-height: 60vh;
      overflow-y: auto;
    }
    
    .statement-summary {
      display: flex;
      gap: 24px;
      margin-bottom: 24px;
      padding: 16px;
      background: #f3f4f6;
      border-radius: 8px;
    }
    
    .summary-item {
      font-size: 14px;
      color: #374151;
    }
    
    .data-grid {
      display: grid;
      grid-template-columns: 1fr 1fr 1fr;
      gap: 24px;
      margin-bottom: 24px;
    }
    
    .data-column h3 {
      margin: 0 0 16px 0;
      font-size: 16px;
      font-weight: 600;
      color: #111827;
      border-bottom: 2px solid #3b82f6;
      padding-bottom: 8px;
    }
    
    .field-row {
      margin-bottom: 12px;
    }
    
    .field-row.required label {
      font-weight: 600;
    }
    
    .field-row label {
      display: block;
      font-size: 14px;
      color: #374151;
      margin-bottom: 4px;
    }
    
    .field-input {
      display: flex;
      align-items: center;
      gap: 8px;
    }
    
    .field-input input {
      flex: 1;
      padding: 8px 12px;
      border: 1px solid #d1d5db;
      border-radius: 6px;
      font-size: 14px;
    }
    
    .field-input input:focus {
      outline: none;
      border-color: #3b82f6;
      box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
    }
    
    .confidence-badge {
      font-size: 12px;
      padding: 2px 6px;
      border-radius: 4px;
      font-weight: 500;
    }
    
    .confidence-badge.high {
      background: #dcfce7;
      color: #166534;
    }
    
    .confidence-badge.medium {
      background: #fef3c7;
      color: #92400e;
    }
    
    .confidence-badge.low {
      background: #fee2e2;
      color: #991b1b;
    }
    
    .installment-plan {
      border: 1px solid #e5e7eb;
      border-radius: 8px;
      padding: 12px;
      margin-bottom: 8px;
      background: #f9fafb;
    }
    
    .plan-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 8px;
    }
    
    .plan-source {
      font-size: 12px;
      padding: 2px 6px;
      background: #3b82f6;
      color: white;
      border-radius: 4px;
    }
    
    .plan-details {
      font-size: 13px;
      color: #6b7280;
      margin-bottom: 8px;
    }
    
    .plan-details div {
      margin-bottom: 2px;
    }
    
    .plan-confidence {
      font-size: 12px;
      color: #6b7280;
    }
    
    .no-installments {
      text-align: center;
      color: #6b7280;
      font-style: italic;
      padding: 20px;
    }
    
    .warnings-section {
      margin-bottom: 24px;
    }
    
    .warnings-section h4 {
      margin: 0 0 12px 0;
      font-size: 16px;
      color: #dc2626;
    }
    
    .warnings-list {
      background: #fef2f2;
      border: 1px solid #fecaca;
      border-radius: 8px;
      padding: 12px;
    }
    
    .warning-item {
      display: flex;
      align-items: flex-start;
      gap: 8px;
      margin-bottom: 8px;
    }
    
    .warning-item:last-child {
      margin-bottom: 0;
    }
    
    .warning-icon {
      font-size: 16px;
    }
    
    .warning-text {
      font-size: 14px;
      color: #991b1b;
    }
    
    .confidence-indicator {
      margin-bottom: 24px;
    }
    
    .confidence-indicator h4 {
      margin: 0 0 12px 0;
      font-size: 16px;
      color: #111827;
    }
    
    .confidence-summary {
      padding: 16px;
      border-radius: 8px;
      border: 1px solid;
    }
    
    .confidence-summary.high {
      background: #f0fdf4;
      border-color: #bbf7d0;
    }
    
    .confidence-summary.medium {
      background: #fffbeb;
      border-color: #fed7aa;
    }
    
    .confidence-summary.low {
      background: #fef2f2;
      border-color: #fecaca;
    }
    
    .confidence-bar {
      width: 100%;
      height: 8px;
      background: #e5e7eb;
      border-radius: 4px;
      overflow: hidden;
      margin-bottom: 8px;
    }
    
    .confidence-fill {
      height: 100%;
      background: #3b82f6;
      transition: width 0.3s ease;
    }
    
    .confidence-text {
      font-size: 14px;
      font-weight: 500;
    }
    
    .modal-footer {
      display: flex;
      justify-content: flex-end;
      gap: 12px;
      padding: 20px 24px;
      border-top: 1px solid #e5e7eb;
      background: #f9fafb;
    }
    
    .btn {
      padding: 10px 20px;
      border: none;
      border-radius: 6px;
      font-size: 14px;
      font-weight: 500;
      cursor: pointer;
      transition: all 0.2s ease;
    }
    
    .btn-primary {
      background: #3b82f6;
      color: white;
    }
    
    .btn-primary:hover {
      background: #2563eb;
    }
    
    .btn-secondary {
      background: #f3f4f6;
      color: #374151;
      border: 1px solid #d1d5db;
    }
    
    .btn-secondary:hover {
      background: #e5e7eb;
    }
    
    @media (max-width: 768px) {
      .data-grid {
        grid-template-columns: 1fr;
        gap: 16px;
      }
      
      .statement-summary {
        flex-direction: column;
        gap: 8px;
      }
      
      .modal-content {
        width: 95%;
        margin: 20px;
      }
    }
  `;
  
  document.head.appendChild(styles);
}






