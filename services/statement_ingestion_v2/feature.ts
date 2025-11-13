/**
 * Feature Flag for Statement Ingestion V2
 * 
 * Controls whether the new universal statement ingestion pipeline is enabled.
 */

export const FEATURE_STATEMENT_INGESTION_V2 = true; // Default true in dev

export function isStatementIngestionV2Enabled(): boolean {
  // In a real app, this would check environment variables or user settings
  return FEATURE_STATEMENT_INGESTION_V2;
}

export function logFeatureStatus(): void {
  console.log('🔧 Statement Ingestion V2 Feature Status:');
  console.log(`  Enabled: ${isStatementIngestionV2Enabled()}`);
  console.log(`  Version: 2.0.0`);
}


