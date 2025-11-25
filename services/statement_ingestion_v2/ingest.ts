/**
 * Main Statement Ingestion Module for Statement Ingestion V2
 * 
 * Orchestrates the entire statement parsing pipeline:
 * 1. File type detection and text extraction
 * 2. Text normalization
 * 3. Template/issuer detection
 * 4. Field extraction
 * 5. Installment plan detection
 * 6. Confidence scoring
 * 7. Balance validation
 */

import { CanonicalStatement, StatementParseResult, ExtractionContext } from './types';
import { extractText, TextExtractionResult } from './extract_text';
import { normalizeText } from './normalize';
import { detectIssuer, applyIssuerSpecificPatterns } from './detect_templates';
import { extractAllFields } from './extract_fields';
import { extractInstallmentPlans } from './extract_installments';
import { analyzeConfidence, generateConfidenceReport } from './confidence';
import { isStatementIngestionV2Enabled } from './feature';

/**
 * Main ingestion function - processes a statement file and returns canonical data
 */
export async function ingestStatement(
  file: File, 
  cardId: string,
  context?: Partial<ExtractionContext>
): Promise<StatementParseResult> {
  
  // Check feature flag
  if (!isStatementIngestionV2Enabled()) {
    console.log('Statement Ingestion V2 is disabled');
    return {
      success: false,
      errors: ['Statement Ingestion V2 feature is disabled']
    };
  }
  
  console.log('🚀 Starting Statement Ingestion V2 for card:', cardId);
  console.log('📄 File:', file.name, 'Type:', file.type, 'Size:', file.size);
  
  try {
    // Step 1: Extract text from file
    console.log('📖 Step 1: Extracting text...');
    const textResult = await extractText(file, context);
    console.log(`✅ Text extracted using ${textResult.method}, confidence: ${(textResult.confidence * 100).toFixed(1)}%`);
    
    if (textResult.text.length < 100) {
      return {
        success: false,
        errors: ['Insufficient text extracted from file - file may be corrupted or unsupported']
      };
    }
    
    // Step 2: Normalize text
    console.log('🔧 Step 2: Normalizing text...');
    const normalizedResult = normalizeText(textResult.text);
    console.log(`✅ Text normalized: ${normalizedResult.originalLength} -> ${normalizedResult.normalizedLength} chars`);
    if (normalizedResult.changes.length > 0) {
      console.log('📝 Changes made:', normalizedResult.changes);
    }
    
    // Step 3: Detect issuer and language
    console.log('🏦 Step 3: Detecting issuer...');
    const issuerDetection = detectIssuer(normalizedResult.normalizedText);
    console.log(`✅ Issuer: ${issuerDetection.issuer || 'Unknown'}, Language: ${issuerDetection.language}, Confidence: ${(issuerDetection.confidence * 100).toFixed(1)}%`);
    
    // Apply issuer-specific adjustments
    const issuerAdjustments = issuerDetection.issuer 
      ? applyIssuerSpecificPatterns(normalizedResult.normalizedText, issuerDetection.issuer)
      : { adjustedText: normalizedResult.normalizedText, issuerHints: [] };
    
    if (issuerAdjustments.issuerHints.length > 0) {
      console.log('💡 Issuer hints:', issuerAdjustments.issuerHints);
    }
    
    // Step 4: Extract basic fields
    console.log('🔍 Step 4: Extracting fields...');
    const extractedFields = extractAllFields(issuerAdjustments.adjustedText, issuerDetection.issuer);
    console.log('✅ Fields extracted:', Object.keys(extractedFields.confidenceByField || {}));
    
    // Step 5: Extract installment plans
    console.log('📊 Step 5: Extracting installment plans...');
    const installmentPlans = extractInstallmentPlans(issuerAdjustments.adjustedText, extractedFields);
    console.log(`✅ Found ${installmentPlans.length} installment plan(s)`);
    
    // Step 6: Build canonical statement
    console.log('📋 Step 6: Building canonical statement...');
    const statement: CanonicalStatement = {
      issuer: issuerDetection.issuer,
      currency: extractedFields.currency || 'USD',
      statementPeriodStart: extractedFields.statementPeriodStart,
      statementPeriodEnd: extractedFields.statementPeriodEnd,
      closingDay: extractedFields.closingDay,
      paymentDueDate: extractedFields.paymentDueDate,
      previousBalance: extractedFields.previousBalance,
      statementBalance: extractedFields.statementBalance,
      minimumDue: extractedFields.minimumDue,
      paymentsAndCredits: extractedFields.paymentsAndCredits,
      purchases: extractedFields.purchases,
      cashAdvances: extractedFields.cashAdvances,
      fees: extractedFields.fees,
      interest: extractedFields.interest,
      creditLimit: extractedFields.creditLimit,
      availableCredit: extractedFields.availableCredit,
      aprPurchase: extractedFields.aprPurchase,
      aprCash: extractedFields.aprCash,
      aprInstallment: extractedFields.aprInstallment,
      installmentPlans: installmentPlans.map(plan => ({
        planId: plan.planId,
        descriptor: plan.descriptor || 'Installment Plan',
        startDate: plan.startDate,
        termMonths: plan.termMonths,
        monthsElapsed: plan.monthsElapsed,
        remainingPayments: plan.remainingPayments,
        monthlyCharge: plan.monthlyCharge,
        remainingPrincipal: plan.remainingPrincipal,
        planApr: plan.planApr,
        source: plan.source,
        confidence: plan.confidence
      })),
      rawTextLength: textResult.text.length,
      confidenceByField: extractedFields.confidenceByField || {},
      warnings: [
        ...(extractedFields.warnings || []),
        ...issuerAdjustments.issuerHints,
        ...normalizedResult.changes
      ],
      needsUserConfirm: false // Will be set by confidence analysis
    };
    
    // Step 7: Analyze confidence
    console.log('🎯 Step 7: Analyzing confidence...');
    const confidenceAnalysis = analyzeConfidence(statement);
    statement.needsUserConfirm = confidenceAnalysis.needsUserConfirm;
    
    console.log(`✅ Overall confidence: ${(confidenceAnalysis.overallConfidence * 100).toFixed(1)}%`);
    console.log(`✅ User confirmation needed: ${confidenceAnalysis.needsUserConfirm ? 'Yes' : 'No'}`);
    
    // Step 8: Generate detailed report
    const confidenceReport = generateConfidenceReport(confidenceAnalysis);
    console.log('📊 Confidence Report:');
    console.log(confidenceReport);
    
    // Step 9: Final validation
    const validationErrors = validateStatement(statement);
    if (validationErrors.length > 0) {
      console.warn('⚠️ Validation warnings:', validationErrors);
      statement.warnings.push(...validationErrors);
    }
    
    console.log('🎉 Statement ingestion completed successfully!');
    
    return {
      success: true,
      data: statement,
      warnings: statement.warnings
    };
    
  } catch (error) {
    console.error('❌ Statement ingestion failed:', error);
    return {
      success: false,
      errors: [`Statement ingestion failed: ${error.message}`]
    };
  }
}

/**
 * Validate extracted statement data
 */
function validateStatement(statement: CanonicalStatement): string[] {
  const errors: string[] = [];
  
  // Check critical fields
  if (!statement.statementBalance || statement.statementBalance <= 0) {
    errors.push('Statement balance is missing or invalid');
  }
  
  if (!statement.minimumDue || statement.minimumDue <= 0) {
    errors.push('Minimum payment is missing or invalid');
  }
  
  if (!statement.paymentDueDate) {
    errors.push('Payment due date is missing');
  }
  
  // Check date validity
  if (statement.paymentDueDate) {
    const dueDate = new Date(statement.paymentDueDate);
    if (isNaN(dueDate.getTime())) {
      errors.push('Payment due date is invalid');
    }
  }
  
  if (statement.statementPeriodEnd) {
    const statementDate = new Date(statement.statementPeriodEnd);
    if (isNaN(statementDate.getTime())) {
      errors.push('Statement period end date is invalid');
    }
  }
  
  // Check amount consistency
  if (statement.creditLimit && statement.statementBalance && statement.statementBalance > statement.creditLimit * 1.1) {
    errors.push('Statement balance exceeds credit limit by more than 10%');
  }
  
  // Check installment plans
  for (const plan of statement.installmentPlans) {
    if (!plan.descriptor || plan.descriptor.trim().length === 0) {
      errors.push('Installment plan descriptor is missing');
    }
    
    if (plan.monthlyCharge && plan.monthlyCharge <= 0) {
      errors.push(`Installment plan "${plan.descriptor}" has invalid monthly charge`);
    }
    
    if (plan.remainingPayments && plan.remainingPayments <= 0) {
      errors.push(`Installment plan "${plan.descriptor}" has invalid remaining payments`);
    }
  }
  
  return errors;
}

/**
 * Quick ingestion for testing/debugging
 */
export async function quickIngest(file: File, cardId: string): Promise<StatementParseResult> {
  console.log('🧪 Quick ingest for testing...');
  
  const result = await ingestStatement(file, cardId, {
    confidenceThreshold: 0.5 // Lower threshold for testing
  });
  
  if (result.success && result.data) {
    console.log('📊 Quick Ingest Results:');
    console.log(`  Issuer: ${result.data.issuer || 'Unknown'}`);
    console.log(`  Statement Balance: ${result.data.statementBalance || 'N/A'}`);
    console.log(`  Minimum Due: ${result.data.minimumDue || 'N/A'}`);
    console.log(`  Due Date: ${result.data.paymentDueDate || 'N/A'}`);
    console.log(`  Installment Plans: ${result.data.installmentPlans.length}`);
    console.log(`  Overall Confidence: ${(result.data.confidenceByField ? 
      Object.values(result.data.confidenceByField).reduce((sum, conf) => sum + conf, 0) / Object.values(result.data.confidenceByField).length * 100 : 0).toFixed(1)}%`);
  }
  
  return result;
}






