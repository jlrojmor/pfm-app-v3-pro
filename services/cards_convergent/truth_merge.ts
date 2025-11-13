// services/cards_convergent/truth_merge.ts
// Truth layers and merge logic for Cards Convergent V2

import { 
  TruthLayers, 
  ConvergentTruth, 
  CardSnapshot, 
  SummaryData, 
  StructuredData, 
  PdfData,
  TransactionData,
  InferredData,
  InstallmentPlan
} from './types';

export function mergeConvergentTruth(cardId: string): ConvergentTruth {
  console.log('🔄 Merging truth layers for card:', cardId);
  
  const layers = loadTruthLayers(cardId);
  const merged = mergeLayers(layers, cardId);
  const reconciliation = reconcileAgainstCycle(cardId, merged);
  
  const result: ConvergentTruth = {
    cardId,
    layers,
    merged,
    reconciliation,
    lastMerge: new Date().toISOString()
  };
  
  // Store merged result
  storeConvergentTruth(cardId, result);
  
  console.log('✅ Truth merge complete:', result);
  return result;
}

function loadTruthLayers(cardId: string): TruthLayers {
  const layers: TruthLayers = {};
  
  // Load L1_summary (Quick Summary Paste)
  const summaryData = localStorage.getItem(`card_${cardId}_L1_summary`);
  if (summaryData) {
    try {
      layers.L1_summary = JSON.parse(summaryData);
    } catch (error) {
      console.warn('Failed to parse L1_summary:', error);
    }
  }
  
  // Load L2_structured (CSV/OFX)
  const structuredData = localStorage.getItem(`card_${cardId}_L2_structured`);
  if (structuredData) {
    try {
      layers.L2_structured = JSON.parse(structuredData);
    } catch (error) {
      console.warn('Failed to parse L2_structured:', error);
    }
  }
  
  // Load L3_pdf (PDF with confirmation)
  const pdfData = localStorage.getItem(`card_${cardId}_L3_pdf`);
  if (pdfData) {
    try {
      layers.L3_pdf = JSON.parse(pdfData);
    } catch (error) {
      console.warn('Failed to parse L3_pdf:', error);
    }
  }
  
  // Load L0_tx (Live transactions)
  const txData = localStorage.getItem(`card_${cardId}_L0_tx`);
  if (txData) {
    try {
      layers.L0_tx = JSON.parse(txData);
    } catch (error) {
      console.warn('Failed to parse L0_tx:', error);
    }
  }
  
  // Load Lx_inferred (AI inference)
  const inferredData = localStorage.getItem(`card_${cardId}_Lx_inferred`);
  if (inferredData) {
    try {
      layers.Lx_inferred = JSON.parse(inferredData);
    } catch (error) {
      console.warn('Failed to parse Lx_inferred:', error);
    }
  }
  
  return layers;
}

function mergeLayers(layers: TruthLayers, cardId: string): CardSnapshot {
  console.log('🔀 Merging layers with precedence:', layers);
  
  const snapshot: CardSnapshot = {
    cardId,
    dueDate: '',
    minimumDue: 0,
    totalDue: 0,
    includesInstallments: false,
    plansCount: 0,
    basedOn: 'defaults',
    warnings: [],
    confidence: 0,
    lastUpdated: new Date().toISOString()
  };
  
  // Merge cycle fields with precedence: L2_structured ≥0.9 → L1_summary ≥0.8 → L3_pdf ≥0.7 (confirmed) → Lx_inferred → defaults
  
  // Due Date
  if (layers.L2_structured?.confidence >= 0.9) {
    snapshot.dueDate = calculateDueDate(layers.L2_structured.periodEnd);
    snapshot.basedOn = 'structured';
    snapshot.confidence = layers.L2_structured.confidence;
  } else if (layers.L1_summary?.confidence >= 0.8 && layers.L1_summary.dueDate) {
    snapshot.dueDate = layers.L1_summary.dueDate;
    snapshot.basedOn = 'summary';
    snapshot.confidence = layers.L1_summary.confidence;
  } else if (layers.L3_pdf && isPdfConfirmed(cardId)) {
    const pdfDueDate = layers.L3_pdf.dueDate;
    if (pdfDueDate && pdfDueDate.confidence >= 0.7) {
      snapshot.dueDate = pdfDueDate.value;
      snapshot.basedOn = 'pdf-confirmed';
      snapshot.confidence = pdfDueDate.confidence;
    }
  } else if (layers.Lx_inferred) {
    snapshot.dueDate = layers.Lx_inferred.estimatedCycle.dueDate;
    snapshot.basedOn = 'inferred';
    snapshot.confidence = layers.Lx_inferred.confidence;
  } else {
    // Default: 25 days after closing day
    snapshot.dueDate = calculateDefaultDueDate();
    snapshot.basedOn = 'defaults';
    snapshot.confidence = 0.5;
  }
  
  // Statement Balance
  if (layers.L2_structured?.confidence >= 0.9) {
    snapshot.minimumDue = layers.L2_structured.minimumDue;
    snapshot.totalDue = layers.L2_structured.statementBalance;
    snapshot.basedOn = 'structured';
  } else if (layers.L1_summary?.confidence >= 0.8) {
    if (layers.L1_summary.minimumDue) {
      snapshot.minimumDue = layers.L1_summary.minimumDue;
    }
    if (layers.L1_summary.statementBalance) {
      snapshot.totalDue = layers.L1_summary.statementBalance;
    }
    snapshot.basedOn = 'summary';
  } else if (layers.L3_pdf && isPdfConfirmed(cardId)) {
    const pdfBalance = layers.L3_pdf.statementBalance;
    const pdfMinDue = layers.L3_pdf.minimumDue;
    if (pdfBalance && pdfBalance.confidence >= 0.7) {
      snapshot.totalDue = pdfBalance.value;
    }
    if (pdfMinDue && pdfMinDue.confidence >= 0.7) {
      snapshot.minimumDue = pdfMinDue.value;
    }
    snapshot.basedOn = 'pdf-confirmed';
  } else if (layers.Lx_inferred) {
    snapshot.minimumDue = layers.Lx_inferred.estimatedCycle.minimumDue;
    snapshot.totalDue = layers.Lx_inferred.estimatedCycle.minimumDue; // Fallback
    snapshot.basedOn = 'inferred';
  } else {
    snapshot.minimumDue = 25; // Default minimum
    snapshot.totalDue = 25;
    snapshot.basedOn = 'defaults';
  }
  
  // Installments
  const installments = mergeInstallments(layers);
  snapshot.includesInstallments = installments.length > 0;
  snapshot.plansCount = installments.length;
  
  if (installments.length > 0) {
    const installmentDue = installments.reduce((sum, plan) => sum + plan.monthlyCharge, 0);
    snapshot.totalDue += installmentDue;
    snapshot.warnings.push(`${installments.length} installment plan(s) totaling $${installmentDue.toFixed(2)}`);
  }
  
  return snapshot;
}

function mergeInstallments(layers: TruthLayers): InstallmentPlan[] {
  const plans: InstallmentPlan[] = [];
  
  // Priority: explicit plans (any source) → aggregate "Installments due this cycle" → inferred plans
  
  // Check for explicit installment plans in all layers
  const explicitPlans: InstallmentPlan[] = [];
  
  // L2_structured aggregate installments
  if (layers.L2_structured?.aggregateInstallmentDue) {
    explicitPlans.push({
      id: 'aggregate_structured',
      descriptor: 'Installments due this cycle',
      monthlyCharge: layers.L2_structured.aggregateInstallmentDue,
      remainingPayments: null,
      source: 'structured',
      confidence: 0.9
    });
  }
  
  // Lx_inferred plans
  if (layers.Lx_inferred?.installmentPlans) {
    explicitPlans.push(...layers.Lx_inferred.installmentPlans);
  }
  
  // Return explicit plans if found, otherwise inferred plans
  return explicitPlans.length > 0 ? explicitPlans : (layers.Lx_inferred?.installmentPlans || []);
}

function calculateDueDate(periodEnd: string): string {
  // Calculate due date (typically 21-25 days after period end)
  const endDate = new Date(periodEnd);
  endDate.setDate(endDate.getDate() + 25);
  return endDate.toISOString().slice(0, 10);
}

function calculateDefaultDueDate(): string {
  // Default due date (25 days from now)
  const today = new Date();
  today.setDate(today.getDate() + 25);
  return today.toISOString().slice(0, 10);
}

function isPdfConfirmed(cardId: string): boolean {
  const confirmation = localStorage.getItem(`pdf_confirmed_${cardId}`);
  return confirmation === 'true';
}

function reconcileAgainstCycle(cardId: string, snapshot: CardSnapshot) {
  console.log('🔍 Reconciling against cycle for card:', cardId);
  
  // Load transaction data
  const txData = localStorage.getItem(`card_${cardId}_L0_tx`);
  if (!txData) {
    return {
      balanceMatch: true,
      driftAmount: 0,
      warnings: []
    };
  }
  
  try {
    const transactions = JSON.parse(txData);
    
    // Calculate computed ending balance
    let computedEnding = 0;
    let payments = 0;
    let purchases = 0;
    let fees = 0;
    let interest = 0;
    
    for (const txn of transactions.transactions || []) {
      switch (txn.type) {
        case 'payment':
          payments += txn.amount;
          break;
        case 'purchase':
          purchases += txn.amount;
          break;
        case 'fee':
          fees += txn.amount;
          break;
        case 'interest':
          interest += txn.amount;
          break;
      }
    }
    
    computedEnding = purchases + fees + interest - payments;
    
    // Compare with statement balance
    const difference = Math.abs(computedEnding - snapshot.totalDue);
    const threshold = Math.max(0.5, 0.005 * snapshot.totalDue);
    
    const warnings: string[] = [];
    if (difference > threshold) {
      warnings.push(`Balance mismatch: computed $${computedEnding.toFixed(2)} vs statement $${snapshot.totalDue.toFixed(2)}`);
    }
    
    return {
      balanceMatch: difference <= threshold,
      driftAmount: difference,
      warnings
    };
    
  } catch (error) {
    console.warn('Reconciliation failed:', error);
    return {
      balanceMatch: true,
      driftAmount: 0,
      warnings: ['Reconciliation data unavailable']
    };
  }
}

function storeConvergentTruth(cardId: string, truth: ConvergentTruth) {
  localStorage.setItem(`card_${cardId}_convergent_truth`, JSON.stringify(truth));
}

export function getConvergentTruth(cardId: string): ConvergentTruth | null {
  const data = localStorage.getItem(`card_${cardId}_convergent_truth`);
  if (data) {
    try {
      return JSON.parse(data);
    } catch (error) {
      console.warn('Failed to parse convergent truth:', error);
    }
  }
  return null;
}