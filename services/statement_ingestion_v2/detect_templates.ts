/**
 * Template Detection Module for Statement Ingestion V2
 * 
 * Detects statement templates/issuers and applies issuer-specific patterns.
 */

import { StatementTemplate } from './types';

export interface IssuerPattern {
  name: string;
  patterns: RegExp[];
  language: 'en' | 'es' | 'both';
  confidence: number;
}

/**
 * Known issuer patterns for template detection
 */
export const ISSUER_PATTERNS: IssuerPattern[] = [
  {
    name: 'American Express',
    patterns: [
      /american\s+express/gi,
      /amex/gi,
      /plan\s+it/gi,
      /express\s+pay/gi
    ],
    language: 'en',
    confidence: 0.95
  },
  {
    name: 'Chase',
    patterns: [
      /chase\s+bank/gi,
      /chase\s+freedom/gi,
      /chase\s+sapphire/gi,
      /chase\s+unlimited/gi,
      /jpmorgan\s+chase/gi,
      /fecha\s+de\s+vencim\.\s*del\s+pago/gi // Spanish Chase format
    ],
    language: 'both',
    confidence: 0.95
  },
  {
    name: 'Bank of America',
    patterns: [
      /bank\s+of\s+america/gi,
      /bofa/gi,
      /merrill\s+lynch/gi,
      /boa\s+credit/gi
    ],
    language: 'en',
    confidence: 0.95
  },
  {
    name: 'Wells Fargo',
    patterns: [
      /wells\s+fargo/gi,
      /wells\s+fargo\s+bank/gi,
      /wf\s+credit/gi
    ],
    language: 'en',
    confidence: 0.95
  },
  {
    name: 'Citi',
    patterns: [
      /citibank/gi,
      /citi\s+bank/gi,
      /citi\s+credit/gi,
      /citigroup/gi,
      /citi\s+double\s+cash/gi
    ],
    language: 'en',
    confidence: 0.95
  },
  {
    name: 'Capital One',
    patterns: [
      /capital\s+one/gi,
      /capitalone/gi,
      /quicksilver/gi,
      /venture\s+card/gi
    ],
    language: 'en',
    confidence: 0.95
  },
  {
    name: 'Discover',
    patterns: [
      /discover\s+card/gi,
      /discover\s+bank/gi,
      /discover\s+it/gi
    ],
    language: 'en',
    confidence: 0.95
  },
  {
    name: 'HSBC',
    patterns: [
      /hsbc\s+bank/gi,
      /hsbc\s+credit/gi,
      /hongkong\s+shanghai/gi
    ],
    language: 'both',
    confidence: 0.90
  },
  {
    name: 'PNC',
    patterns: [
      /pnc\s+bank/gi,
      /pnc\s+credit/gi,
      /pittsburgh\s+national/gi
    ],
    language: 'en',
    confidence: 0.90
  },
  {
    name: 'US Bank',
    patterns: [
      /us\s+bank/gi,
      /usbank/gi,
      /us\s+bancorp/gi
    ],
    language: 'en',
    confidence: 0.90
  },
  {
    name: 'Santander',
    patterns: [
      /santander\s+bank/gi,
      /banco\s+santander/gi,
      /santander\s+credit/gi
    ],
    language: 'both',
    confidence: 0.90
  },
  {
    name: 'BBVA',
    patterns: [
      /bbva\s+bank/gi,
      /banco\s+bilbao\s+vizcaya/gi,
      /bbva\s+credit/gi
    ],
    language: 'both',
    confidence: 0.90
  },
  {
    name: 'Scotiabank',
    patterns: [
      /scotiabank/gi,
      /scotia\s+bank/gi,
      /scotia\s+credit/gi
    ],
    language: 'both',
    confidence: 0.90
  },
  {
    name: 'Banorte',
    patterns: [
      /banorte/gi,
      /banco\s+banorte/gi,
      /banorte\s+credit/gi
    ],
    language: 'es',
    confidence: 0.90
  },
  {
    name: 'Liverpool',
    patterns: [
      /liverpool/gi,
      /tiendas\s+liverpool/gi,
      /liverpool\s+card/gi
    ],
    language: 'es',
    confidence: 0.85
  }
];

/**
 * Detect issuer from statement text
 */
export function detectIssuer(text: string): { issuer?: string; confidence: number; language: 'en' | 'es' | 'auto' } {
  let bestMatch: { issuer?: string; confidence: number; language: 'en' | 'es' | 'auto' } = {
    confidence: 0,
    language: 'auto'
  };
  
  for (const issuerPattern of ISSUER_PATTERNS) {
    for (const pattern of issuerPattern.patterns) {
      const match = text.match(pattern);
      if (match) {
        if (issuerPattern.confidence > bestMatch.confidence) {
          bestMatch = {
            issuer: issuerPattern.name,
            confidence: issuerPattern.confidence,
            language: issuerPattern.language === 'both' ? 'auto' : issuerPattern.language
          };
        }
      }
    }
  }
  
  // If no issuer detected, try to detect language
  if (!bestMatch.issuer) {
    bestMatch.language = detectLanguage(text);
  }
  
  return bestMatch;
}

/**
 * Detect language from text content
 */
function detectLanguage(text: string): 'en' | 'es' {
  const spanishKeywords = [
    'saldo', 'pago', 'fecha', 'mínimo', 'intereses', 'comisiones',
    'vencimiento', 'corte', 'estado', 'cuenta', 'crédito', 'débito',
    'meses', 'sin', 'intereses', 'plan', 'pagos', 'plazos'
  ];
  
  const englishKeywords = [
    'balance', 'payment', 'date', 'minimum', 'interest', 'fees',
    'due', 'statement', 'account', 'credit', 'debit',
    'monthly', 'installment', 'plan', 'financing'
  ];
  
  const lowerText = text.toLowerCase();
  
  const spanishScore = spanishKeywords.reduce((score, keyword) => {
    return score + (lowerText.includes(keyword) ? 1 : 0);
  }, 0);
  
  const englishScore = englishKeywords.reduce((score, keyword) => {
    return score + (lowerText.includes(keyword) ? 1 : 0);
  }, 0);
  
  return spanishScore > englishScore ? 'es' : 'en';
}

/**
 * Get issuer-specific template
 */
export function getIssuerTemplate(issuer: string): StatementTemplate | null {
  const templates: Record<string, StatementTemplate> = {
    'American Express': {
      issuer: 'American Express',
      language: 'en',
      patterns: {
        balance: [
          /new\s+balance\s*[:\\s]*${MONEY_PATTERN}/gi,
          /current\s+balance\s*[:\\s]*${MONEY_PATTERN}/gi
        ],
        minimumDue: [
          /minimum\s+payment\s+due\s*[:\\s]*${MONEY_PATTERN}/gi
        ],
        installmentSection: [
          /plan\s+it/gi,
          /flex\s+pay/gi
        ]
      },
      confidence: 0.95
    },
    'Chase': {
      issuer: 'Chase',
      language: 'both',
      patterns: {
        balance: [
          /new\s+balance\s*[:\\s]*${MONEY_PATTERN}/gi,
          /nuevo\s+saldo\s*[:\\s]*${MONEY_PATTERN}/gi
        ],
        minimumDue: [
          /minimum\s+payment\s+due\s*[:\\s]*${MONEY_PATTERN}/gi,
          /pago\s+mínimo\s*[:\\s]*${MONEY_PATTERN}/gi
        ],
        dueDate: [
          /payment\s+due\s+date\s*[:\\s]*${DATE_PATTERN}/gi,
          /fecha\s+de\s+vencim\.\s*del\s+pago\s*[:\\s]*${DATE_PATTERN}/gi
        ]
      },
      confidence: 0.95
    },
    'Bank of America': {
      issuer: 'Bank of America',
      language: 'en',
      patterns: {
        balance: [
          /new\s+balance\s*[:\\s]*${MONEY_PATTERN}/gi,
          /current\s+balance\s*[:\\s]*${MONEY_PATTERN}/gi
        ],
        minimumDue: [
          /minimum\s+payment\s*[:\\s]*${MONEY_PATTERN}/gi
        ]
      },
      confidence: 0.95
    }
  };
  
  return templates[issuer] || null;
}

/**
 * Apply issuer-specific patterns to extraction
 */
export function applyIssuerSpecificPatterns(
  text: string, 
  issuer: string
): { adjustedText: string; issuerHints: string[] } {
  const hints: string[] = [];
  let adjustedText = text;
  
  const template = getIssuerTemplate(issuer);
  if (!template) {
    return { adjustedText: text, issuerHints: [] };
  }
  
  // Apply issuer-specific adjustments
  switch (issuer) {
    case 'American Express':
      // AmEx often uses "Plan It" for installments
      if (text.includes('Plan It')) {
        hints.push('American Express Plan It detected');
      }
      break;
      
    case 'Chase':
      // Chase has specific Spanish format
      if (text.includes('fecha de vencim. del pago')) {
        hints.push('Chase Spanish format detected');
      }
      break;
      
    case 'Bank of America':
      // BofA specific patterns
      if (text.includes('Merrill Lynch')) {
        hints.push('Bank of America Merrill Lynch account');
      }
      break;
  }
  
  return { adjustedText, issuerHints: hints };
}






