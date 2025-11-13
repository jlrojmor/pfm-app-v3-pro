// services/cards_convergent/feature.ts
// Feature flag for Cards Convergent V2 system

export const FEATURE_CARDS_CONVERGENT_V2 = true; // dev default true

export function isCardsConvergentV2Enabled(): boolean {
  return FEATURE_CARDS_CONVERGENT_V2;
}

export function getFeatureInfo() {
  return {
    enabled: FEATURE_CARDS_CONVERGENT_V2,
    version: '2.0.0',
    description: 'Multi-source credit card ingestion with AI accuracy tracking'
  };
}