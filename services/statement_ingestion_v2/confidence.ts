/**
 * Confidence Scoring Module for Statement Ingestion V2
 * 
 * Calculates confidence scores for extracted fields and overall statement quality.
 */

import { CanonicalStatement, StatementTemplate } from './types';
import { validateBalanceEquation } from './normalize';

export interface ConfidenceAnalysis {
  overallConfidence: number;
  fieldConfidences: Record<string, number>;
  qualityFactors: {
    balanceEquationValid: boolean;
    criticalFieldsPresent: boolean;
    issuerDetected: boolean;
    dateConsistency: boolean;
    amountConsistency: boolean;
  };
  warnings: string[];
  needsUserConfirm: boolean;
}

/**
 * Analyze confidence for a parsed statement
 */
export function analyzeConfidence(statement: CanonicalStatement): ConfidenceAnalysis {
  const fieldConfidences = { ...statement.confidenceByField };
  const warnings: string[] = [...(statement.warnings || [])];
  
  // Validate balance equation
  const balanceValidation = validateBalanceEquation(
    statement.previousBalance || 0,
    statement.paymentsAndCredits || 0,
    statement.purchases || 0,
    statement.fees || 0,
    statement.interest || 0,
    statement.cashAdvances || 0,
    statement.statementBalance || 0
  );
  
  if (!balanceValidation.isValid) {
    warnings.push(balanceValidation.warning || 'Balance equation mismatch');
    fieldConfidences.statementBalance = Math.min(fieldConfidences.statementBalance || 1, 0.6);
  }
  
  // Check critical fields
  const criticalFields = ['statementBalance', 'minimumDue', 'paymentDueDate'];
  const criticalFieldsPresent = criticalFields.every(field => 
    fieldConfidences[field] && fieldConfidences[field] > 0.5
  );
  
  // Check issuer detection
  const issuerDetected = !!statement.issuer && statement.issuer !== 'Unknown';
  
  // Check date consistency
  const dateConsistency = checkDateConsistency(statement);
  if (!dateConsistency) {
    warnings.push('Date consistency issues detected');
  }
  
  // Check amount consistency
  const amountConsistency = checkAmountConsistency(statement);
  if (!amountConsistency) {
    warnings.push('Amount consistency issues detected');
  }
  
  // Calculate overall confidence
  const overallConfidence = calculateOverallConfidence(fieldConfidences, {
    balanceEquationValid: balanceValidation.isValid,
    criticalFieldsPresent,
    issuerDetected,
    dateConsistency,
    amountConsistency
  });
  
  // Determine if user confirmation is needed
  const needsUserConfirm = determineUserConfirmationNeeded(
    fieldConfidences,
    overallConfidence,
    warnings
  );
  
  return {
    overallConfidence,
    fieldConfidences,
    qualityFactors: {
      balanceEquationValid: balanceValidation.isValid,
      criticalFieldsPresent,
      issuerDetected,
      dateConsistency,
      amountConsistency
    },
    warnings,
    needsUserConfirm
  };
}

/**
 * Calculate overall confidence score
 */
function calculateOverallConfidence(
  fieldConfidences: Record<string, number>,
  qualityFactors: ConfidenceAnalysis['qualityFactors']
): number {
  // Weight critical fields more heavily
  const criticalFields = ['statementBalance', 'minimumDue', 'paymentDueDate'];
  const importantFields = ['previousBalance', 'purchases', 'fees', 'interest'];
  const otherFields = Object.keys(fieldConfidences).filter(
    field => !criticalFields.includes(field) && !importantFields.includes(field)
  );
  
  let weightedSum = 0;
  let totalWeight = 0;
  
  // Critical fields weight: 3
  for (const field of criticalFields) {
    if (fieldConfidences[field]) {
      weightedSum += fieldConfidences[field] * 3;
      totalWeight += 3;
    }
  }
  
  // Important fields weight: 2
  for (const field of importantFields) {
    if (fieldConfidences[field]) {
      weightedSum += fieldConfidences[field] * 2;
      totalWeight += 2;
    }
  }
  
  // Other fields weight: 1
  for (const field of otherFields) {
    if (fieldConfidences[field]) {
      weightedSum += fieldConfidences[field] * 1;
      totalWeight += 1;
    }
  }
  
  const baseConfidence = totalWeight > 0 ? weightedSum / totalWeight : 0;
  
  // Apply quality factor adjustments
  let adjustedConfidence = baseConfidence;
  
  if (!qualityFactors.balanceEquationValid) {
    adjustedConfidence *= 0.8; // Reduce confidence for balance equation issues
  }
  
  if (!qualityFactors.criticalFieldsPresent) {
    adjustedConfidence *= 0.7; // Reduce confidence if critical fields missing
  }
  
  if (!qualityFactors.issuerDetected) {
    adjustedConfidence *= 0.9; // Slight reduction for missing issuer
  }
  
  if (!qualityFactors.dateConsistency) {
    adjustedConfidence *= 0.85; // Reduce for date issues
  }
  
  if (!qualityFactors.amountConsistency) {
    adjustedConfidence *= 0.9; // Slight reduction for amount issues
  }
  
  return Math.max(0, Math.min(1, adjustedConfidence));
}

/**
 * Check date consistency
 */
function checkDateConsistency(statement: CanonicalStatement): boolean {
  // Check if due date is after statement date
  if (statement.paymentDueDate && statement.statementPeriodEnd) {
    const dueDate = new Date(statement.paymentDueDate);
    const statementDate = new Date(statement.statementPeriodEnd);
    
    if (dueDate <= statementDate) {
      return false;
    }
    
    // Check if due date is within reasonable range (10-45 days)
    const daysDiff = (dueDate.getTime() - statementDate.getTime()) / (1000 * 60 * 60 * 24);
    if (daysDiff < 10 || daysDiff > 45) {
      return false;
    }
  }
  
  // Check if closing day is reasonable (1-28)
  if (statement.closingDay && (statement.closingDay < 1 || statement.closingDay > 28)) {
    return false;
  }
  
  return true;
}

/**
 * Check amount consistency
 */
function checkAmountConsistency(statement: CanonicalStatement): boolean {
  // Check if statement balance is positive (debt)
  if (statement.statementBalance && statement.statementBalance < 0) {
    return false;
  }
  
  // Check if minimum due is reasonable (typically 1-10% of balance)
  if (statement.statementBalance && statement.minimumDue) {
    const percentage = statement.minimumDue / statement.statementBalance;
    if (percentage < 0.005 || percentage > 0.5) { // 0.5% to 50%
      return false;
    }
  }
  
  // Check if credit limit is reasonable
  if (statement.creditLimit && statement.statementBalance) {
    if (statement.statementBalance > statement.creditLimit * 1.1) { // Allow 10% over limit
      return false;
    }
  }
  
  // Check if available credit calculation makes sense
  if (statement.creditLimit && statement.availableCredit && statement.statementBalance) {
    const expectedAvailable = statement.creditLimit - statement.statementBalance;
    const difference = Math.abs(expectedAvailable - statement.availableCredit);
    if (difference > 10) { // Allow $10 difference
      return false;
    }
  }
  
  return true;
}

/**
 * Determine if user confirmation is needed
 */
function determineUserConfirmationNeeded(
  fieldConfidences: Record<string, number>,
  overallConfidence: number,
  warnings: string[]
): boolean {
  // Always need confirmation if overall confidence is low
  if (overallConfidence < 0.7) {
    return true;
  }
  
  // Check critical fields
  const criticalFields = ['statementBalance', 'minimumDue', 'paymentDueDate'];
  const criticalFieldConfidence = criticalFields.reduce((sum, field) => {
    return sum + (fieldConfidences[field] || 0);
  }, 0) / criticalFields.length;
  
  if (criticalFieldConfidence < 0.8) {
    return true;
  }
  
  // Check for serious warnings
  const seriousWarnings = warnings.filter(warning => 
    warning.includes('mismatch') || 
    warning.includes('inconsistent') ||
    warning.includes('invalid')
  );
  
  if (seriousWarnings.length > 0) {
    return true;
  }
  
  return false;
}

/**
 * Generate confidence report for debugging
 */
export function generateConfidenceReport(analysis: ConfidenceAnalysis): string {
  const report = [];
  
  report.push('=== Statement Confidence Analysis ===');
  report.push(`Overall Confidence: ${(analysis.overallConfidence * 100).toFixed(1)}%`);
  report.push('');
  
  report.push('Quality Factors:');
  report.push(`  Balance Equation Valid: ${analysis.qualityFactors.balanceEquationValid ? '✅' : '❌'}`);
  report.push(`  Critical Fields Present: ${analysis.qualityFactors.criticalFieldsPresent ? '✅' : '❌'}`);
  report.push(`  Issuer Detected: ${analysis.qualityFactors.issuerDetected ? '✅' : '❌'}`);
  report.push(`  Date Consistency: ${analysis.qualityFactors.dateConsistency ? '✅' : '❌'}`);
  report.push(`  Amount Consistency: ${analysis.qualityFactors.amountConsistency ? '✅' : '❌'}`);
  report.push('');
  
  report.push('Field Confidences:');
  for (const [field, confidence] of Object.entries(analysis.fieldConfidences)) {
    const status = confidence >= 0.8 ? '✅' : confidence >= 0.6 ? '⚠️' : '❌';
    report.push(`  ${field}: ${(confidence * 100).toFixed(1)}% ${status}`);
  }
  report.push('');
  
  if (analysis.warnings.length > 0) {
    report.push('Warnings:');
    for (const warning of analysis.warnings) {
      report.push(`  ⚠️ ${warning}`);
    }
    report.push('');
  }
  
  report.push(`User Confirmation Required: ${analysis.needsUserConfirm ? 'Yes' : 'No'}`);
  
  return report.join('\n');
}


