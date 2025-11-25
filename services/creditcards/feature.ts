/**
 * Credit Card Engine Feature Flag System
 * 
 * Controls all CC engine functionality through a single feature flag.
 * When disabled, all functions return safe defaults and existing behavior is preserved.
 */

import type { CCFeatureConfig } from './types.js';

// ============================================================================
// FEATURE FLAG CONFIGURATION
// ============================================================================

const DEFAULT_CONFIG: CCFeatureConfig = {
  enabled: true,                    // Default to enabled in development
  syntheticTransactions: true,
  statementIngestion: true,
  planInference: true,
  reconciliation: true,
};

let _config: CCFeatureConfig = { ...DEFAULT_CONFIG };

/**
 * Initialize the feature flag configuration
 * @param config - Feature configuration object
 */
export function initializeFeatureFlags(config?: Partial<CCFeatureConfig>): void {
  if (config) {
    _config = { ...DEFAULT_CONFIG, ...config };
  }
  
  console.log('🏗️ CC Engine Feature Flags:', _config);
}

/**
 * Get the current feature flag configuration
 */
export function getFeatureConfig(): CCFeatureConfig {
  return { ..._config };
}

/**
 * Check if the CC engine is enabled
 */
export function isCCEngineEnabled(): boolean {
  return _config.enabled;
}

/**
 * Check if synthetic transactions are enabled
 */
export function isSyntheticTransactionsEnabled(): boolean {
  return _config.enabled && _config.syntheticTransactions;
}

/**
 * Check if statement ingestion is enabled
 */
export function isStatementIngestionEnabled(): boolean {
  return _config.enabled && _config.statementIngestion;
}

/**
 * Check if plan inference is enabled
 */
export function isPlanInferenceEnabled(): boolean {
  return _config.enabled && _config.planInference;
}

/**
 * Check if reconciliation is enabled
 */
export function isReconciliationEnabled(): boolean {
  return _config.enabled && _config.reconciliation;
}

/**
 * Disable the CC engine (for testing or emergency fallback)
 */
export function disableCCEngine(): void {
  _config.enabled = false;
  console.warn('⚠️ CC Engine disabled');
}

/**
 * Enable the CC engine
 */
export function enableCCEngine(): void {
  _config.enabled = true;
  console.log('✅ CC Engine enabled');
}

// ============================================================================
// SAFE DEFAULT HELPERS
// ============================================================================

/**
 * Execute a function only if CC engine is enabled, otherwise return default
 * @param fn - Function to execute
 * @param defaultValue - Default value to return if disabled
 */
export function withFeatureFlag<T>(
  fn: () => T, 
  defaultValue: T
): T {
  if (!isCCEngineEnabled()) {
    return defaultValue;
  }
  return fn();
}

/**
 * Execute an async function only if CC engine is enabled, otherwise return default
 * @param fn - Async function to execute
 * @param defaultValue - Default value to return if disabled
 */
export async function withFeatureFlagAsync<T>(
  fn: () => Promise<T>, 
  defaultValue: T
): Promise<T> {
  if (!isCCEngineEnabled()) {
    return defaultValue;
  }
  return await fn();
}

// ============================================================================
// FEATURE-SPECIFIC GUARDS
// ============================================================================

/**
 * Guard function that returns early if CC engine is disabled
 * @param feature - Specific feature to check
 * @param action - Action description for logging
 */
export function requireFeature(feature: keyof CCFeatureConfig, action: string): boolean {
  if (!_config.enabled) {
    console.debug(`🚫 CC Engine disabled, skipping: ${action}`);
    return false;
  }
  
  if (!_config[feature]) {
    console.debug(`🚫 Feature ${feature} disabled, skipping: ${action}`);
    return false;
  }
  
  return true;
}

// ============================================================================
// DEVELOPMENT HELPERS
// ============================================================================

/**
 * Get feature flag status for debugging
 */
export function getFeatureStatus(): Record<string, boolean> {
  return {
    'CC Engine': _config.enabled,
    'Synthetic Transactions': _config.syntheticTransactions,
    'Statement Ingestion': _config.statementIngestion,
    'Plan Inference': _config.planInference,
    'Reconciliation': _config.reconciliation,
  };
}

/**
 * Log feature flag status
 */
export function logFeatureStatus(): void {
  console.table(getFeatureStatus());
}

// Initialize with default config
initializeFeatureFlags();






