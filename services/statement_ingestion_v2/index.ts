/**
 * Statement Ingestion V2 - Main Module
 * 
 * Universal statement ingestion pipeline for credit card statements.
 * Supports multiple file formats, languages, and issuers.
 */

export * from './types';
export * from './feature';
export * from './ingest';
export * from './extract_text';
export * from './normalize';
export * from './detect_templates';
export * from './extract_fields';
export * from './extract_installments';
export * from './confidence';
export * from './utils';

// Main exports for easy importing
export { ingestStatement, quickIngest } from './ingest';
export { isStatementIngestionV2Enabled, logFeatureStatus } from './feature';
export { analyzeConfidence, generateConfidenceReport } from './confidence';
export { extractText } from './extract_text';
export { normalizeText } from './normalize';
export { detectIssuer } from './detect_templates';
export { extractAllFields } from './extract_fields';
export { extractInstallmentPlans } from './extract_installments';






