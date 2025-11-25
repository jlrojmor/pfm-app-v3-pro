/**
 * Installment Plan Extraction Module for Statement Ingestion V2
 * 
 * Handles both explicit installment sections and inference from transaction patterns.
 */

import { CanonicalStatement, InstallmentPlanRaw } from './types';
import { MONEY_PATTERN, extractAmount, generatePlanId, calculateConfidence } from './utils';

export interface InstallmentSection {
  header: string;
  content: string[];
  startLine: number;
  endLine: number;
}

export interface TransactionLine {
  date?: string;
  description: string;
  amount?: number;
  lineNumber: number;
}

/**
 * Extract installment plans from statement text
 */
export function extractInstallmentPlans(
  text: string, 
  statement: Partial<CanonicalStatement>
): InstallmentPlanRaw[] {
  const plans: InstallmentPlanRaw[] = [];
  
  // First, try to find explicit installment sections
  const explicitPlans = extractExplicitInstallments(text);
  plans.push(...explicitPlans);
  
  // If no explicit plans found, try to infer from transaction patterns
  if (plans.length === 0) {
    const inferredPlans = inferInstallmentPlans(text, statement);
    plans.push(...inferredPlans);
  }
  
  return plans;
}

/**
 * Extract explicit installment sections
 */
function extractExplicitInstallments(text: string): InstallmentPlanRaw[] {
  const plans: InstallmentPlanRaw[] = [];
  
  // Find installment section headers
  const sectionHeaders = [
    /installment\s*(summary|plans?)/gi,
    /plan\s*it/gi,
    /flex\s*pay/gi,
    /equal\s*payment/gi,
    /msi/gi,
    /meses\s*sin\s*intereses/gi,
    /financing/gi,
    /payment\s*plans?/gi,
    /plan\s*de\s*pagos/gi,
    /pago\s*a\s*plazos/gi
  ];
  
  const lines = text.split('\n');
  
  for (const headerPattern of sectionHeaders) {
    for (let i = 0; i < lines.length; i++) {
      const match = lines[i].match(headerPattern);
      if (match) {
        const section = extractSectionContent(lines, i);
        const sectionPlans = parseInstallmentSection(section);
        plans.push(...sectionPlans);
      }
    }
  }
  
  return plans;
}

/**
 * Extract content from a section starting at header line
 */
function extractSectionContent(lines: string[], startLine: number): InstallmentSection {
  const content: string[] = [];
  let endLine = startLine;
  
  // Look for the end of the section (next major header or end of document)
  for (let i = startLine + 1; i < lines.length; i++) {
    const line = lines[i].trim();
    
    // Stop at next major section or empty line followed by new section
    if (line === '' && i + 1 < lines.length && lines[i + 1].trim().match(/^[A-Z][A-Z\s]+$/)) {
      break;
    }
    
    // Stop at obvious next section headers
    if (line.match(/^(account|payment|transaction|summary|total)/gi)) {
      break;
    }
    
    if (line.length > 0) {
      content.push(line);
      endLine = i;
    }
  }
  
  return {
    header: lines[startLine],
    content,
    startLine,
    endLine
  };
}

/**
 * Parse installment section content into plan objects
 */
function parseInstallmentSection(section: InstallmentSection): InstallmentPlanRaw[] {
  const plans: InstallmentPlanRaw[] = [];
  const content = section.content.join(' ');
  
  // Look for plan descriptors
  const descriptorPatterns = [
    /plan\s*it\s*([^:]+)/gi,
    /flex\s*pay\s*([^:]+)/gi,
    /equal\s*payment\s*([^:]+)/gi,
    /financing\s*([^:]+)/gi,
    /plan\s*de\s*pagos?\s*([^:]+)/gi,
    /pago\s*a\s*plazos?\s*([^:]+)/gi
  ];
  
  let descriptor = 'Installment Plan';
  for (const pattern of descriptorPatterns) {
    const match = content.match(pattern);
    if (match) {
      descriptor = match[1].trim();
      break;
    }
  }
  
  // Extract remaining payments
  const remainingPaymentsPatterns = [
    /(?:remaining\s*payments?|meses\s*restantes?)\s*[:\s]*(\d{1,3})/gi,
    /(\d{1,3})\s*(?:payments?|meses?)\s*(?:remaining|restantes?)/gi
  ];
  
  let remainingPayments: number | undefined;
  for (const pattern of remainingPaymentsPatterns) {
    const match = content.match(pattern);
    if (match) {
      remainingPayments = parseInt(match[1]);
      break;
    }
  }
  
  // Extract monthly charge
  const monthlyChargePatterns = [
    new RegExp(`(?:monthly\\s*(?:charge|payment)|pago\\s*mensual)\\s*[:\\s]*${MONEY_PATTERN}`, 'gi'),
    new RegExp(`(?:payment|pago)\\s*[:\\s]*${MONEY_PATTERN}`, 'gi')
  ];
  
  let monthlyCharge: number | undefined;
  for (const pattern of monthlyChargePatterns) {
    const matches = content.match(pattern);
    if (matches) {
      for (const match of matches) {
        const amount = extractAmount(match);
        if (amount && amount > 0) {
          monthlyCharge = amount;
          break;
        }
      }
      if (monthlyCharge) break;
    }
  }
  
  // Extract remaining principal
  const remainingPrincipalPatterns = [
    new RegExp(`(?:remaining\\s*(?:balance|principal)|saldo\\s*remanente)\\s*[:\\s]*${MONEY_PATTERN}`, 'gi'),
    new RegExp(`(?:balance|saldo)\\s*[:\\s]*${MONEY_PATTERN}`, 'gi')
  ];
  
  let remainingPrincipal: number | undefined;
  for (const pattern of remainingPrincipalPatterns) {
    const matches = content.match(pattern);
    if (matches) {
      for (const match of matches) {
        const amount = extractAmount(match);
        if (amount && amount > 0) {
          remainingPrincipal = amount;
          break;
        }
      }
      if (remainingPrincipal) break;
    }
  }
  
  // Extract plan APR
  const planAprPatterns = [
    /(?:plan\s*APR|tasa\s*del\s*plan)\s*[:\s]*(\d{1,2}[.,]?\d{0,2})\s?%/gi,
    /(\d{1,2}[.,]?\d{0,2})\s?%\s*(?:APR|tasa)/gi
  ];
  
  let planApr: number | undefined;
  for (const pattern of planAprPatterns) {
    const match = content.match(pattern);
    if (match) {
      planApr = parseFloat(match[1].replace(',', '.'));
      break;
    }
  }
  
  // Only create plan if we have meaningful data
  if (monthlyCharge || remainingPayments || remainingPrincipal) {
    const plan: InstallmentPlanRaw = {
      descriptor,
      monthlyCharge,
      remainingPayments,
      remainingPrincipal,
      planApr,
      source: "statement",
      confidence: 0.90 // High confidence for explicit sections
    };
    
    plans.push(plan);
  }
  
  return plans;
}

/**
 * Infer installment plans from transaction patterns
 */
function inferInstallmentPlans(
  text: string, 
  statement: Partial<CanonicalStatement>
): InstallmentPlanRaw[] {
  const plans: InstallmentPlanRaw[] = [];
  
  // Extract transaction lines
  const transactions = extractTransactionLines(text);
  
  // Group transactions by description patterns
  const transactionGroups = groupTransactionsByPattern(transactions);
  
  // Analyze groups for installment patterns
  for (const group of transactionGroups) {
    const plan = analyzeTransactionGroup(group, statement);
    if (plan) {
      plans.push(plan);
    }
  }
  
  return plans;
}

/**
 * Extract transaction lines from text
 */
function extractTransactionLines(text: string): TransactionLine[] {
  const lines = text.split('\n');
  const transactions: TransactionLine[] = [];
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    
    // Look for transaction patterns
    const transactionPatterns = [
      // Date + Description + Amount
      /(\d{1,2}[\/.-]\d{1,2}[\/.-]\d{2,4})\s+(.+?)\s+([$\d,.-]+)/,
      // Description + Amount (amount at end)
      /(.+?)\s+([$\d,.-]+)$/,
      // Amount + Description (amount at start)
      /^([$\d,.-]+)\s+(.+)$/
    ];
    
    for (const pattern of transactionPatterns) {
      const match = line.match(pattern);
      if (match) {
        let date: string | undefined;
        let description: string;
        let amount: number | undefined;
        
        if (match[1].includes('/') || match[1].includes('-') || match[1].includes('.')) {
          // Date first pattern
          date = match[1];
          description = match[2].trim();
          amount = extractAmount(match[3]);
        } else if (match[2].includes('$') || /\d/.test(match[2])) {
          // Amount at end pattern
          description = match[1].trim();
          amount = extractAmount(match[2]);
        } else {
          // Amount at start pattern
          amount = extractAmount(match[1]);
          description = match[2].trim();
        }
        
        if (description.length > 3 && description.length < 100) {
          transactions.push({
            date,
            description,
            amount,
            lineNumber: i
          });
        }
        break;
      }
    }
  }
  
  return transactions;
}

/**
 * Group transactions by similar descriptions
 */
function groupTransactionsByPattern(transactions: TransactionLine[]): Map<string, TransactionLine[]> {
  const groups = new Map<string, TransactionLine[]>();
  
  for (const transaction of transactions) {
    const normalizedDesc = normalizeDescription(transaction.description);
    const key = normalizedDesc;
    
    if (!groups.has(key)) {
      groups.set(key, []);
    }
    groups.get(key)!.push(transaction);
  }
  
  // Filter groups with multiple occurrences
  const filteredGroups = new Map<string, TransactionLine[]>();
  for (const [key, transactions] of groups) {
    if (transactions.length >= 2) {
      filteredGroups.set(key, transactions);
    }
  }
  
  return filteredGroups;
}

/**
 * Normalize transaction description for grouping
 */
function normalizeDescription(description: string): string {
  return description
    .toLowerCase()
    .replace(/[^\w\s]/g, '') // Remove punctuation
    .replace(/\s+/g, ' ')    // Normalize spaces
    .trim();
}

/**
 * Analyze a group of transactions for installment patterns
 */
function analyzeTransactionGroup(
  transactions: TransactionLine[],
  statement: Partial<CanonicalStatement>
): InstallmentPlanRaw | null {
  if (transactions.length < 2) return null;
  
  // Check if amounts are consistent (within 10% variance)
  const amounts = transactions.map(t => t.amount).filter(a => a !== undefined) as number[];
  if (amounts.length === 0) return null;
  
  const avgAmount = amounts.reduce((sum, amount) => sum + amount, 0) / amounts.length;
  const variance = amounts.every(amount => Math.abs(amount - avgAmount) / avgAmount < 0.1);
  
  if (!variance) return null;
  
  // Check if dates suggest monthly intervals (roughly 30 days apart)
  const dates = transactions
    .map(t => t.date)
    .filter(d => d !== undefined)
    .map(d => new Date(d!))
    .filter(d => !isNaN(d.getTime()))
    .sort((a, b) => a.getTime() - b.getTime());
  
  let isMonthly = true;
  if (dates.length >= 2) {
    for (let i = 1; i < dates.length; i++) {
      const daysDiff = (dates[i].getTime() - dates[i-1].getTime()) / (1000 * 60 * 60 * 24);
      if (daysDiff < 25 || daysDiff > 35) {
        isMonthly = false;
        break;
      }
    }
  }
  
  // Calculate confidence based on consistency
  let confidence = 0.6; // Base confidence for inferred
  if (variance) confidence += 0.1;
  if (isMonthly) confidence += 0.1;
  if (transactions.length >= 3) confidence += 0.1;
  
  // Generate plan ID
  const issuer = statement.issuer || 'Unknown';
  const cardLast4 = statement.cardLast4 || '0000';
  const descriptor = transactions[0].description;
  const planId = generatePlanId(issuer, cardLast4, descriptor, avgAmount);
  
  return {
    planId,
    descriptor: transactions[0].description,
    monthlyCharge: avgAmount,
    remainingPayments: undefined, // Can't determine from transaction history
    source: "inferred",
    confidence: Math.min(confidence, 0.8) // Cap at 0.8 for inferred
  };
}






