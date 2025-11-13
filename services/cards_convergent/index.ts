// services/cards_convergent/index.ts
// Main Cards Convergent V2 orchestrator

import { isCardsConvergentV2Enabled } from './feature';
import { parseQuickSummary } from './quick_summary_parser';
import { ingestStructured } from './structured_ingestion';
import { mergeConvergentTruth, getConvergentTruth } from './truth_merge';
import { 
  ParseResult, 
  StructuredData, 
  CardSnapshot, 
  ConvergentTruth,
  ConfirmationData 
} from './types';

// Main Cards Convergent V2 API
export class CardsConvergentV2 {
  
  /**
   * S1 - Quick Summary Paste (highest reliability for UX)
   */
  static async processQuickSummary(text: string, cardId: string): Promise<ParseResult> {
    if (!isCardsConvergentV2Enabled()) {
      throw new Error('Cards Convergent V2 is disabled');
    }
    
    console.log('🚀 S1 - Processing Quick Summary Paste for card:', cardId);
    
    const result = parseQuickSummary(text);
    
    // Store as L1_summary
    const summaryData = {
      ...result,
      source: 'paste' as const,
      timestamp: new Date().toISOString()
    };
    
    localStorage.setItem(`card_${cardId}_L1_summary`, JSON.stringify(summaryData));
    
    // Trigger merge
    this.mergeTruth(cardId);
    
    console.log('✅ Quick Summary processed:', result);
    return result;
  }
  
  /**
   * S2 - CSV/OFX/QFX Upload (highly structured)
   */
  static async processStructuredFile(file: File, cardId: string): Promise<StructuredData> {
    if (!isCardsConvergentV2Enabled()) {
      throw new Error('Cards Convergent V2 is disabled');
    }
    
    console.log('🚀 S2 - Processing Structured File for card:', cardId);
    
    const result = await ingestStructured(file);
    
    // Store as L2_structured
    localStorage.setItem(`card_${cardId}_L2_structured`, JSON.stringify(result));
    
    // Trigger merge
    this.mergeTruth(cardId);
    
    console.log('✅ Structured file processed:', result);
    return result;
  }
  
  /**
   * S4 - PDF/Image Statement (best-effort, requires confirmation)
   */
  static async processPdfStatement(file: File, cardId: string): Promise<ConfirmationData> {
    if (!isCardsConvergentV2Enabled()) {
      throw new Error('Cards Convergent V2 is disabled');
    }
    
    console.log('🚀 S4 - Processing PDF Statement for card:', cardId);
    
    // Use existing statement ingestion wrapper for PDF processing
    if (typeof window !== 'undefined' && window.StatementIngestionWrapper) {
      const result = await window.StatementIngestionWrapper.ingestStatement(file, cardId);
      
      if (result.success) {
        // Convert to confirmation data format
        const confirmationData: ConfirmationData = {
          dueDate: result.data.dueDate || '',
          minimumDue: result.data.minimumDue || 0,
          statementBalance: result.data.statementBalance || 0,
          closingDate: result.data.closingDate || '',
          installments: [],
          fieldConfidence: {
            dueDate: 0.7,
            minimumDue: 0.7,
            statementBalance: 0.8,
            closingDate: 0.6
          },
          source: 'pdf'
        };
        
        return confirmationData;
      }
    }
    
    throw new Error('PDF processing failed');
  }
  
  /**
   * Confirm PDF-derived values (required before applying)
   */
  static confirmPdfData(cardId: string, confirmationData: ConfirmationData): void {
    if (!isCardsConvergentV2Enabled()) {
      throw new Error('Cards Convergent V2 is disabled');
    }
    
    console.log('✅ Confirming PDF data for card:', cardId);
    
    // Store as L3_pdf
    const pdfData = {
      dueDate: { value: confirmationData.dueDate, confidence: confirmationData.fieldConfidence.dueDate, source: 'pdf' },
      minimumDue: { value: confirmationData.minimumDue, confidence: confirmationData.fieldConfidence.minimumDue, source: 'pdf' },
      statementBalance: { value: confirmationData.statementBalance, confidence: confirmationData.fieldConfidence.statementBalance, source: 'pdf' },
      closingDate: { value: confirmationData.closingDate, confidence: confirmationData.fieldConfidence.closingDate, source: 'pdf' },
      timestamp: new Date().toISOString()
    };
    
    localStorage.setItem(`card_${cardId}_L3_pdf`, JSON.stringify(pdfData));
    localStorage.setItem(`pdf_confirmed_${cardId}`, 'true');
    
    // Trigger merge
    this.mergeTruth(cardId);
    
    console.log('✅ PDF data confirmed and stored');
  }
  
  /**
   * Get current card snapshot (UI adapter)
   */
  static getCardSnapshot(cardId: string): CardSnapshot | null {
    if (!isCardsConvergentV2Enabled()) {
      return null;
    }
    
    const truth = getConvergentTruth(cardId);
    return truth ? truth.merged : null;
  }
  
  /**
   * Merge truth layers
   */
  static mergeTruth(cardId: string): ConvergentTruth {
    if (!isCardsConvergentV2Enabled()) {
      throw new Error('Cards Convergent V2 is disabled');
    }
    
    return mergeConvergentTruth(cardId);
  }
  
  /**
   * Update transaction data (L0_tx)
   */
  static updateTransactions(cardId: string, transactions: any[]): void {
    if (!isCardsConvergentV2Enabled()) {
      return;
    }
    
    console.log('🔄 Updating transactions for card:', cardId);
    
    const txData = {
      periodStart: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
      periodEnd: new Date().toISOString().slice(0, 10),
      transactions: transactions.map(tx => ({
        date: tx.date,
        amount: tx.amount,
        description: tx.description,
        type: tx.type || 'purchase'
      })),
      timestamp: new Date().toISOString()
    };
    
    localStorage.setItem(`card_${cardId}_L0_tx`, JSON.stringify(txData));
    
    // Trigger merge
    this.mergeTruth(cardId);
    
    console.log('✅ Transactions updated');
  }
  
  /**
   * Calculate installment payments
   */
  static calculateInstallmentPayments(cardId: string, totalPayment: number) {
    if (!isCardsConvergentV2Enabled()) {
      return { minimumDue: totalPayment, installmentsDue: 0, revolvingPayment: totalPayment };
    }
    
    const snapshot = this.getCardSnapshot(cardId);
    if (!snapshot) {
      return { minimumDue: totalPayment, installmentsDue: 0, revolvingPayment: totalPayment };
    }
    
    const minimumDue = snapshot.minimumDue || 25;
    const installmentsDue = snapshot.includesInstallments ? 
      Math.min(totalPayment, snapshot.totalDue - minimumDue) : 0;
    const revolvingPayment = Math.max(0, totalPayment - installmentsDue);
    
    return {
      minimumDue: Math.min(minimumDue, totalPayment),
      installmentsDue,
      revolvingPayment,
      totalPayment,
      breakdown: {
        'Minimum Due': Math.min(minimumDue, totalPayment),
        'Installments': installmentsDue,
        'Extra Payment': Math.max(0, totalPayment - minimumDue - installmentsDue)
      }
    };
  }
  
  /**
   * Monthly AI accuracy improvement
   */
  static updateMonthlyAccuracy(cardId: string): boolean {
    if (!isCardsConvergentV2Enabled()) {
      return false;
    }
    
    try {
      console.log('🔄 Updating monthly AI accuracy for card:', cardId);
      
      const truth = getConvergentTruth(cardId);
      if (!truth) return false;
      
      const lastUpdate = new Date(truth.lastMerge);
      const now = new Date();
      const monthsDiff = (now.getFullYear() - lastUpdate.getFullYear()) * 12 + (now.getMonth() - lastUpdate.getMonth());
      
      if (monthsDiff >= 1) {
        console.log(`📅 New month detected (${monthsDiff} months since last update)`);
        
        // Increase confidence for stable data
        if (truth.merged.confidence >= 0.8) {
          truth.merged.confidence = Math.min(1.0, truth.merged.confidence + 0.05);
          truth.merged.lastUpdated = now.toISOString();
          
          // Store updated truth
          localStorage.setItem(`card_${cardId}_convergent_truth`, JSON.stringify(truth));
          
          console.log(`✅ Monthly accuracy update complete. New confidence: ${(truth.merged.confidence * 100).toFixed(0)}%`);
          return true;
        }
      }
      
      return false;
    } catch (error) {
      console.warn('Failed to update monthly accuracy:', error);
      return false;
    }
  }
  
  /**
   * Get system status
   */
  static getStatus() {
    return {
      enabled: isCardsConvergentV2Enabled(),
      version: '2.0.0',
      features: [
        'Quick Summary Paste (S1)',
        'Structured File Upload (S2)', 
        'PDF Statement Processing (S4)',
        'Truth Layer Merging',
        'AI Accuracy Tracking',
        'Installment Management'
      ]
    };
  }
}

// Global exposure for browser environment
if (typeof window !== 'undefined') {
  window.CardsConvergentV2 = CardsConvergentV2;
}