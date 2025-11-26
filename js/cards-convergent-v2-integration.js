// js/cards-convergent-v2-integration.js
// Complete Cards Convergent V2 integration for the main app

console.log('🚀 Loading Cards Convergent V2 Integration...');

// Feature flag check
const FEATURE_CARDS_CONVERGENT_V2 = true;

if (!FEATURE_CARDS_CONVERGENT_V2) {
  console.log('🚫 Cards Convergent V2 disabled');
  window.CardsConvergentV2 = null;
} else {
  console.log('✅ Cards Convergent V2 enabled');

  // Quick Summary Parser (S1)
  function parseQuickSummary(text) {
    console.log('🔍 Parsing quick summary:', text);
    
    const result = {
      minimumDue: undefined,
      dueDate: undefined,
      statementBalance: undefined,
      closingDate: undefined,
      confidence: 0,
      matchedFields: [],
      warnings: []
    };
    
    // Clean the text
    const cleanText = text.trim().replace(/\s+/g, ' ');
    
    // Money patterns
    const moneyPatterns = [
      /\$([-+]?[\d,]+\.?\d*)/g,
      /([-+]?[\d,]+\.?\d*)\s*dollars?/gi
    ];
    
    // Date patterns
    const datePatterns = [
      /(\d{1,2}[\/.-]\d{1,2}[\/.-]\d{2,4})/g,
      /([A-Za-z]{3,9}\s+\d{1,2},\s*\d{4})/g
    ];
    
    // Extract money amounts
    const amounts = [];
    for (const pattern of moneyPatterns) {
      const matches = Array.from(cleanText.matchAll(pattern));
      for (const match of matches) {
        const amount = parseFloat(match[1].replace(/,/g, ''));
        if (!isNaN(amount) && amount > 0 && amount <= 1000000) {
          amounts.push(amount);
        }
      }
    }
    
    // Extract dates
    const dates = [];
    for (const pattern of datePatterns) {
      const matches = Array.from(cleanText.matchAll(pattern));
      for (const match of matches) {
        const date = parseDateString(match[1]);
        if (date) {
          dates.push(date.toISOString().slice(0, 10));
        }
      }
    }
    
    // Field-specific extraction patterns
    const patterns = {
      minimumDue: [
        /(minimum\s*(payment\s*)?due|pago\s*m[íi]nimo)\s*[:\s]*\$?([-+]?[\d,]+\.?\d*)/iu,
        /due\s*\$?([-+]?[\d,]+\.?\d*)/iu,
        /m[íi]nimo\s*\$?([-+]?[\d,]+\.?\d*)/iu
      ],
      dueDate: [
        /(payment\s*due\s*date|due\s*date|fecha\s*l[íi]mite)\s*[:\s]*(\d{1,2}[\/.-]\d{1,2}[\/.-]\d{2,4})/iu,
        /due\s*(\d{1,2}[\/.-]\d{1,2}[\/.-]\d{2,4})/iu,
        /para\s*el\s*(\d{1,2}[\/.-]\d{1,2}[\/.-]\d{2,4})/iu
      ],
      statementBalance: [
        /((new|statement|current)\s*balance|saldo\s*(al\s*corte|total|nuevo))\s*[:\s]*\$?([-+]?[\d,]+\.?\d*)/iu,
        /(new|current|nuevo)\s*\$?([-+]?[\d,]+\.?\d*)/iu
      ],
      closingDate: [
        /(statement\s*(closing)?\s*date|fecha\s*de\s*(corte|cierre))\s*[:\s]*(\d{1,2}[\/.-]\d{1,2}[\/.-]\d{2,4})/iu,
        /corte\s*(\d{1,2}[\/.-]\d{1,2}[\/.-]\d{2,4})/iu
      ]
    };
    
    // Extract fields using patterns
    for (const [fieldName, fieldPatterns] of Object.entries(patterns)) {
      for (const pattern of fieldPatterns) {
        const match = cleanText.match(pattern);
        if (match) {
          const value = extractFieldValue(fieldName, match, cleanText);
          if (value !== null) {
            result[fieldName] = value;
            result.matchedFields.push(fieldName);
            console.log(`✅ Matched ${fieldName}:`, value);
            break;
          }
        }
      }
    }
    
    // Calculate confidence
    const criticalFields = ['minimumDue', 'dueDate', 'statementBalance'];
    const matchedCritical = criticalFields.filter(field => result.matchedFields.includes(field));
    result.confidence = matchedCritical.length / criticalFields.length;
    
    if (result.confidence < 0.5) {
      result.warnings.push('Low confidence: Only partial data extracted');
    }
    
    console.log('📊 Parse result:', result);
    return result;
  }
  
  function extractFieldValue(fieldName, match, text) {
    switch (fieldName) {
      case 'minimumDue':
      case 'statementBalance':
        return extractMoney(match, text);
      case 'dueDate':
      case 'closingDate':
        return extractDate(match, text);
      default:
        return null;
    }
  }
  
  function extractMoney(match, context) {
    const moneyPattern = /\$?([-+]?[\d,]+\.?\d*)/g;
    const matches = Array.from(context.matchAll(moneyPattern));
    
    for (const moneyMatch of matches) {
      const amount = parseFloat(moneyMatch[1].replace(/,/g, ''));
      if (!isNaN(amount) && amount >= 0 && amount <= 1000000) {
        return amount;
      }
    }
    return null;
  }
  
  function extractDate(match, context) {
    const datePattern = /(\d{1,2}[\/.-]\d{1,2}[\/.-]\d{2,4}|[A-Za-z]{3,9}\s+\d{1,2},\s*\d{4})/g;
    const matches = Array.from(context.matchAll(datePattern));
    
    for (const dateMatch of matches) {
      const dateStr = dateMatch[1];
      const parsedDate = parseDateString(dateStr);
      if (parsedDate && isValidDate(parsedDate)) {
        return parsedDate.toISOString().slice(0, 10);
      }
    }
    return null;
  }
  
  function parseDateString(dateStr) {
    // Handle MM/DD/YYYY, MM-DD-YYYY, MM.DD.YYYY formats
    const slashMatch = dateStr.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2,4})$/);
    if (slashMatch) {
      let month = parseInt(slashMatch[1]);
      let day = parseInt(slashMatch[2]);
      let year = parseInt(slashMatch[3]);
      
      // Handle 2-digit years
      if (year < 100) {
        year += year < 50 ? 2000 : 1900;
      }
      
      // Swap month/day if month > 12
      if (month > 12 && day <= 12) {
        [month, day] = [day, month];
      }
      
      return new Date(year, month - 1, day);
    }
    
    // Handle "Month Day, Year" format
    const monthMatch = dateStr.match(/^([A-Za-z]{3,9})\s+(\d{1,2}),\s*(\d{4})$/);
    if (monthMatch) {
      const monthName = monthMatch[1];
      const day = parseInt(monthMatch[2]);
      const year = parseInt(monthMatch[3]);
      
      const monthMap = {
        'january': 0, 'jan': 0, 'enero': 0,
        'february': 1, 'feb': 1, 'febrero': 1,
        'march': 2, 'mar': 2, 'marzo': 2,
        'april': 3, 'apr': 3, 'abril': 3,
        'may': 4, 'mayo': 4,
        'june': 5, 'jun': 5, 'junio': 5,
        'july': 6, 'jul': 6, 'julio': 6,
        'august': 7, 'aug': 7, 'agosto': 7,
        'september': 8, 'sep': 8, 'sept': 8, 'septiembre': 8,
        'october': 9, 'oct': 9, 'octubre': 9,
        'november': 10, 'nov': 10, 'noviembre': 10,
        'december': 11, 'dec': 11, 'diciembre': 11
      };
      
      const monthIndex = monthMap[monthName.toLowerCase()];
      if (monthIndex !== undefined) {
        return new Date(year, monthIndex, day);
      }
    }
    
    return null;
  }
  
  function isValidDate(date) {
    const year = date.getFullYear();
    return year >= 2000 && year <= 2030 && !isNaN(date.getTime());
  }
  
  // Truth Layers Management
  function storeTruthLayer(cardId, layer, data) {
    const key = `card_${cardId}_${layer}`;
    localStorage.setItem(key, JSON.stringify({
      ...data,
      timestamp: new Date().toISOString()
    }));
    console.log(`✅ Stored ${layer} for card ${cardId}`);
  }
  
  function loadTruthLayer(cardId, layer) {
    const key = `card_${cardId}_${layer}`;
    const data = localStorage.getItem(key);
    if (data) {
      try {
        return JSON.parse(data);
      } catch (error) {
        console.warn(`Failed to parse ${layer}:`, error);
      }
    }
    return null;
  }
  
  function mergeTruthLayers(cardId) {
    console.log('🔄 Merging truth layers for card:', cardId);
    
    const layers = {
      L1_summary: loadTruthLayer(cardId, 'L1_summary'),
      L2_structured: loadTruthLayer(cardId, 'L2_structured'),
      L3_pdf: loadTruthLayer(cardId, 'L3_pdf'),
      L0_tx: loadTruthLayer(cardId, 'L0_tx'),
      Lx_inferred: loadTruthLayer(cardId, 'Lx_inferred')
    };
    
    const merged = {
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
    
    // Merge with precedence: L2_structured ≥0.9 → L1_summary ≥0.8 → L3_pdf ≥0.7 → Lx_inferred → defaults
    
    // Due Date
    if (layers.L2_structured?.confidence >= 0.9) {
      merged.dueDate = calculateDueDate(layers.L2_structured.periodEnd);
      merged.basedOn = 'structured';
      merged.confidence = layers.L2_structured.confidence;
    } else if (layers.L1_summary?.confidence >= 0.8 && layers.L1_summary.dueDate) {
      merged.dueDate = layers.L1_summary.dueDate;
      merged.basedOn = 'summary';
      merged.confidence = layers.L1_summary.confidence;
    } else if (layers.L3_pdf && isPdfConfirmed(cardId)) {
      const pdfDueDate = layers.L3_pdf.dueDate;
      if (pdfDueDate && pdfDueDate.confidence >= 0.7) {
        merged.dueDate = pdfDueDate.value;
        merged.basedOn = 'pdf-confirmed';
        merged.confidence = pdfDueDate.confidence;
      }
    } else if (layers.Lx_inferred) {
      merged.dueDate = layers.Lx_inferred.estimatedCycle?.dueDate || calculateDefaultDueDate();
      merged.basedOn = 'inferred';
      merged.confidence = layers.Lx_inferred.confidence;
    } else {
      merged.dueDate = calculateDefaultDueDate();
      merged.basedOn = 'defaults';
      merged.confidence = 0.5;
    }
    
    // Statement Balance and Minimum Due
    if (layers.L2_structured?.confidence >= 0.9) {
      merged.minimumDue = layers.L2_structured.minimumDue;
      merged.totalDue = layers.L2_structured.statementBalance;
      merged.basedOn = 'structured';
    } else if (layers.L1_summary?.confidence >= 0.8) {
      if (layers.L1_summary.minimumDue) {
        merged.minimumDue = layers.L1_summary.minimumDue;
      }
      if (layers.L1_summary.statementBalance) {
        merged.totalDue = layers.L1_summary.statementBalance;
      }
      merged.basedOn = 'summary';
    } else if (layers.L3_pdf && isPdfConfirmed(cardId)) {
      const pdfBalance = layers.L3_pdf.statementBalance;
      const pdfMinDue = layers.L3_pdf.minimumDue;
      if (pdfBalance && pdfBalance.confidence >= 0.7) {
        merged.totalDue = pdfBalance.value;
      }
      if (pdfMinDue && pdfMinDue.confidence >= 0.7) {
        merged.minimumDue = pdfMinDue.value;
      }
      merged.basedOn = 'pdf-confirmed';
    } else if (layers.Lx_inferred) {
      merged.minimumDue = layers.Lx_inferred.estimatedCycle?.minimumDue || 25;
      merged.totalDue = merged.minimumDue;
      merged.basedOn = 'inferred';
    } else {
      merged.minimumDue = 25;
      merged.totalDue = 25;
      merged.basedOn = 'defaults';
    }
    
    // Store merged result
    localStorage.setItem(`card_${cardId}_convergent_truth`, JSON.stringify({
      cardId,
      layers,
      merged,
      lastMerge: new Date().toISOString()
    }));
    
    console.log('✅ Truth merge complete:', merged);
    return merged;
  }
  
  function calculateDueDate(periodEnd) {
    const endDate = new Date(periodEnd);
    endDate.setDate(endDate.getDate() + 25);
    return endDate.toISOString().slice(0, 10);
  }
  
  function calculateDefaultDueDate() {
    const today = new Date();
    today.setDate(today.getDate() + 25);
    return today.toISOString().slice(0, 10);
  }
  
  function isPdfConfirmed(cardId) {
    return localStorage.getItem(`pdf_confirmed_${cardId}`) === 'true';
  }
  
  // Main Cards Convergent V2 API
  window.CardsConvergentV2 = {
    // S1 - Quick Summary Paste
    processQuickSummary: function(text, cardId) {
      console.log('🚀 S1 - Processing Quick Summary Paste for card:', cardId);
      
      const result = parseQuickSummary(text);
      
      // Store as L1_summary
      storeTruthLayer(cardId, 'L1_summary', {
        ...result,
        source: 'paste'
      });
      
      // Trigger merge
      this.mergeTruth(cardId);
      
      return result;
    },
    
    // S2 - Structured File Upload
    processStructuredFile: async function(file, cardId) {
      console.log('🚀 S2 - Processing Structured File for card:', cardId);
      
      // For now, use existing statement ingestion wrapper
      if (window.StatementIngestionWrapper) {
        const result = await window.StatementIngestionWrapper.ingestStatement(file, cardId);
        
        if (result.success) {
          const structuredData = {
            periodStart: result.data.periodStart || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
            periodEnd: result.data.periodEnd || new Date().toISOString().slice(0, 10),
            statementBalance: result.data.statementBalance,
            minimumDue: result.data.minimumDue,
            payments: 0,
            purchases: 0,
            fees: result.data.feesAccrued || 0,
            interest: result.data.interestAccrued || 0,
            confidence: 0.95,
            source: 'csv'
          };
          
          // Store as L2_structured
          storeTruthLayer(cardId, 'L2_structured', structuredData);
          
          // Trigger merge
          this.mergeTruth(cardId);
          
          return structuredData;
        }
      }
      
      throw new Error('Structured file processing failed');
    },
    
    // S4 - PDF Statement Processing
    processPdfStatement: async function(file, cardId) {
      console.log('🚀 S4 - Processing PDF Statement for card:', cardId);
      
      if (window.StatementIngestionWrapper) {
        const result = await window.StatementIngestionWrapper.ingestStatement(file, cardId);
        
        if (result.success) {
          return {
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
        }
      }
      
      throw new Error('PDF processing failed');
    },
    
    // Confirm PDF-derived values
    confirmPdfData: function(cardId, confirmationData) {
      console.log('✅ Confirming PDF data for card:', cardId);
      
      const pdfData = {
        dueDate: { value: confirmationData.dueDate, confidence: confirmationData.fieldConfidence.dueDate, source: 'pdf' },
        minimumDue: { value: confirmationData.minimumDue, confidence: confirmationData.fieldConfidence.minimumDue, source: 'pdf' },
        statementBalance: { value: confirmationData.statementBalance, confidence: confirmationData.fieldConfidence.statementBalance, source: 'pdf' },
        closingDate: { value: confirmationData.closingDate, confidence: confirmationData.fieldConfidence.closingDate, source: 'pdf' }
      };
      
      // Store as L3_pdf
      storeTruthLayer(cardId, 'L3_pdf', pdfData);
      localStorage.setItem(`pdf_confirmed_${cardId}`, 'true');
      
      // Trigger merge
      this.mergeTruth(cardId);
    },
    
    // Get card snapshot
    getCardSnapshot: function(cardId) {
      const truth = localStorage.getItem(`card_${cardId}_convergent_truth`);
      if (truth) {
        try {
          const parsed = JSON.parse(truth);
          return parsed.merged;
        } catch (error) {
          console.warn('Failed to parse convergent truth:', error);
        }
      }
      return null;
    },
    
    // Merge truth layers
    mergeTruth: function(cardId) {
      return mergeTruthLayers(cardId);
    },
    
    // Calculate installment payments
    calculateInstallmentPayments: function(cardId, totalPayment) {
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
    },
    
    // Monthly AI accuracy improvement
    updateMonthlyAccuracy: function(cardId) {
      try {
        console.log('🔄 Updating monthly AI accuracy for card:', cardId);
        
        const truth = localStorage.getItem(`card_${cardId}_convergent_truth`);
        if (!truth) return false;
        
        const parsed = JSON.parse(truth);
        const lastUpdate = new Date(parsed.lastMerge);
        const now = new Date();
        const monthsDiff = (now.getFullYear() - lastUpdate.getFullYear()) * 12 + (now.getMonth() - lastUpdate.getMonth());
        
        if (monthsDiff >= 1) {
          console.log(`📅 New month detected (${monthsDiff} months since last update)`);
          
          if (parsed.merged.confidence >= 0.8) {
            parsed.merged.confidence = Math.min(1.0, parsed.merged.confidence + 0.05);
            parsed.merged.lastUpdated = now.toISOString();
            
            localStorage.setItem(`card_${cardId}_convergent_truth`, JSON.stringify(parsed));
            
            console.log(`✅ Monthly accuracy update complete. New confidence: ${(parsed.merged.confidence * 100).toFixed(0)}%`);
            return true;
          }
        }
        
        return false;
      } catch (error) {
        console.warn('Failed to update monthly accuracy:', error);
        return false;
      }
    },
    
    // Get system status
    getStatus: function() {
      return {
        enabled: FEATURE_CARDS_CONVERGENT_V2,
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
  };
  
  // Initialize monthly checks
  function initializeMonthlyChecks() {
    const today = new Date().toISOString().slice(0, 10);
    const lastCheck = localStorage.getItem('lastMonthlyCheck');
    
    if (lastCheck !== today) {
      console.log('📅 Running daily monthly accuracy checks...');
      
      // Update all cards
      const keys = Object.keys(localStorage);
      let updatedCount = 0;
      
      keys.forEach(key => {
        if (key.startsWith('card_') && key.endsWith('_convergent_truth')) {
          const cardId = key.replace('card_', '').replace('_convergent_truth', '');
          if (window.CardsConvergentV2.updateMonthlyAccuracy(cardId)) {
            updatedCount++;
          }
        }
      });
      
      console.log(`✅ Monthly accuracy update complete. Updated ${updatedCount} cards.`);
      localStorage.setItem('lastMonthlyCheck', today);
    }
  }
  
  // Initialize on load
  initializeMonthlyChecks();
  
  console.log('✅ Cards Convergent V2 Integration loaded successfully');
}





