// app.js — boot

// ============================================================================
// CREDIT CARD ENGINE INITIALIZATION
// ============================================================================

function initializeCCEngine() {
  console.log('🚀 Initializing Credit Card Engine...');
  
  // Simple CC Engine implementation for immediate testing
  window.CC_ENGINE_VERSION = '1.0.0';
  window.ccEngineEnabled = true;
  
  // Basic CC Engine functions
  window.isCCEngineEnabled = () => window.ccEngineEnabled;
  window.enableCCEngine = () => { window.ccEngineEnabled = true; console.log('✅ CC Engine enabled'); };
  window.disableCCEngine = () => { window.ccEngineEnabled = false; console.log('🚫 CC Engine disabled'); };
  
  window.getEngineStatus = () => ({
    enabled: window.ccEngineEnabled,
    features: {
      syntheticTransactions: true,
      statementIngestion: true,
      planInference: true,
      reconciliation: true
    },
    migration: { completed: true, migratedAccounts: 0 }
  });
  
  window.logFeatureStatus = () => {
    console.table({
      'CC Engine': window.ccEngineEnabled,
      'Synthetic Transactions': true,
      'Statement Ingestion': true,
      'Plan Inference': true,
      'Reconciliation': true
    });
  };
  
  // Quick setup function
  window.quickSetupCard = (cardId, info) => {
    console.log('⚡ Quick setup for card:', cardId, info);
    // Store in localStorage for now
    const ccCards = JSON.parse(localStorage.getItem('ccEngineCards') || '{}');
    ccCards[cardId] = {
      cardId,
      issuer: info.issuer,
      last4: info.last4,
      currency: info.currency || 'USD',
      cycle: { closingDay: info.closingDay || 25, graceApplies: true },
      snapshot: info.statementBalance !== undefined ? {
        statementCloseDate: new Date().toISOString().slice(0, 10),
        statementBalance: info.statementBalance,
        minimumDue: info.minimumDue || 0
      } : undefined,
      installmentPlans: [],
      reconciliation: { confidence: info.statementBalance !== undefined ? 0.8 : 0.5 }
    };
    localStorage.setItem('ccEngineCards', JSON.stringify(ccCards));
    console.log('✅ Card setup complete:', cardId);
  };
  
  // Card snapshot function
  window.useCardSnapshot = (cardId) => {
    if (!window.isCCEngineEnabled()) {
      return { dueDate: '—', totalDue: 0, minimumDue: 0, includesInstallments: 0, plansCount: 0, basedOn: 'estimated', warnings: [] };
    }
    
    const ccCards = JSON.parse(localStorage.getItem('ccEngineCards') || '{}');
    const card = ccCards[cardId];
    
    if (!card) {
      return { dueDate: '—', totalDue: 0, minimumDue: 0, includesInstallments: 0, plansCount: 0, basedOn: 'estimated', warnings: [] };
    }
    
    const dueDate = new Date();
    dueDate.setDate(dueDate.getDate() + 25); // 25 days from now
    
    return {
      dueDate: dueDate.toISOString().slice(0, 10),
      totalDue: card.snapshot?.statementBalance || 0,
      minimumDue: card.snapshot?.minimumDue || 0,
      includesInstallments: 0,
      plansCount: 0,
      basedOn: card.snapshot ? 'statement' : 'estimated',
      warnings: []
    };
  };
  
  console.log('✅ Credit Card Engine initialized');
  
  // Add simple toast fallback if Utils.showToast isn't available
  window.safeToast = function(message, type = 'info') {
    if (window.Utils && typeof Utils.showToast === 'function') {
      Utils.showToast(message, type);
    } else {
      console.log(`📢 ${message}`);
      // Create a simple visual notification
      const toast = document.createElement('div');
      toast.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: ${type === 'error' ? '#dc2626' : type === 'success' ? '#16a34a' : '#3b82f6'};
        color: white;
        padding: 12px 20px;
        border-radius: 6px;
        z-index: 10000;
        font-family: system-ui, -apple-system, sans-serif;
        font-size: 14px;
        box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
      `;
      toast.textContent = message;
      document.body.appendChild(toast);
      
      // Remove after 3 seconds
      setTimeout(() => {
        if (toast.parentNode) {
          toast.parentNode.removeChild(toast);
        }
      }, 3000);
    }
  };
  
  // Add debug function to analyze PDF content
  window.debugPDFContent = function(text) {
    console.log('🔍 PDF Content Debug Analysis');
    console.log('📄 Full text:', text);
    
    const screener = new StatementScreener(text);
    const results = screener.extractAllData();
    
    console.log('📊 Extraction Results:', results);
    console.log('⚠️ Warnings:', results.warnings);
    
    // Show line-by-line analysis
    console.log('📝 Line-by-line analysis:');
    text.split('\n').forEach((line, index) => {
      if (line.trim().length > 0) {
        console.log(`Line ${index + 1}: "${line.trim()}"`);
      }
    });
    
    return results;
  };
  
  // Enhanced debug function for the new parsing system
  window.debugEnhancedParsing = function(text) {
    console.log('🔍 Enhanced Parsing Debug Analysis');
    console.log('📄 Full text length:', text.length);
    console.log('📄 First 500 chars:', text.substring(0, 500));
    console.log('📄 Last 500 chars:', text.substring(text.length - 500));
    
    // Test all date patterns
    console.log('📅 Testing date patterns:');
    const datePatterns = [
      /(?:statement\s+date|closing\s+date|period\s+ending|statement\s+period)\s*[:\\s]*([\d\/\-]+)/gi,
      /(?:fecha\s+de\s+estado|fecha\s+de\s+corte|periodo\s+terminando)\s*[:\\s]*([\d\/\-]+)/gi,
      /(?:corte|closing)\s*[:\\s]*([\d\/\-]+)/gi,
      /([\d]{1,2}[\/\-][\d]{1,2}[\/\-][\d]{2,4})/g,
      /([\d]{4}[\/\-][\d]{1,2}[\/\-][\d]{1,2})/g
    ];
    
    datePatterns.forEach((pattern, index) => {
      const matches = text.match(pattern);
      if (matches) {
        console.log(`  Pattern ${index + 1} matches:`, matches);
      }
    });
    
    // Test balance patterns
    console.log('💰 Testing balance patterns:');
    const balancePatterns = [
      /(?:new|current|statement|total)\s+balance\s*[:\\s]*\$?([\d,]+\.?\d*)/gi,
      /(?:nuevo|saldo\s+nuevo|saldo\s+actual|saldo\s+del\s+estado|saldo\s+total)\s*[:\\s]*\$?([\d,]+\.?\d*)/gi,
      /balance\s*[:\\s]*\$?([\d,]+\.?\d*)/gi,
      /saldo\s*[:\\s]*\$?([\d,]+\.?\d*)/gi
    ];
    
    balancePatterns.forEach((pattern, index) => {
      const matches = text.match(pattern);
      if (matches) {
        console.log(`  Balance pattern ${index + 1} matches:`, matches);
      }
    });
    
    // Show all lines containing dates
    console.log('📅 Lines containing potential dates:');
    text.split('\n').forEach((line, index) => {
      if (line.match(/[\d]{1,2}[\/\-][\d]{1,2}[\/\-][\d]{2,4}/) || 
          line.match(/[\d]{4}[\/\-][\d]{1,2}[\/\-][\d]{1,2}/)) {
        console.log(`  Line ${index + 1}: "${line.trim()}"`);
      }
    });
    
    return parseStatementTextEnhanced(text, 'debug', 'debug');
  };

// Simple function to extract and show PDF content
window.extractPDFForDebug = async function(fileInput) {
  if (!fileInput || !fileInput.files || fileInput.files.length === 0) {
    console.log('❌ No file selected. Please select your PDF file first.');
    return;
  }
  
  const file = fileInput.files[0];
  console.log('📄 Extracting text from:', file.name);
  
  try {
    // Use the existing parsePDFStatement function
    const result = await parsePDFStatement(file, 'debug');
    
    if (result.success && result.text) {
      console.log('📄 ===== COMPLETE PDF TEXT EXTRACTED =====');
      console.log(result.text);
      console.log('📄 ===== END OF PDF TEXT =====');
      
      // Now run the enhanced parsing on this text
      console.log('🔍 Running enhanced parsing on extracted text...');
      const parseResult = parseStatementTextEnhanced(result.text, 'debug', file.name);
      console.log('📊 Parsing result:', parseResult);
      
      return result.text;
    } else {
      console.error('❌ Failed to extract text:', result.errors);
      return null;
    }
  } catch (error) {
    console.error('❌ Error extracting PDF text:', error);
    return null;
  }
};

// Even simpler function - just show the PDF text
window.showPDFText = async function() {
  const fileInput = document.getElementById('accStatementFile');
  if (!fileInput || !fileInput.files || fileInput.files.length === 0) {
    console.log('❌ No file selected. Please select your PDF file first in the form.');
    return;
  }
  
  console.log('📄 Extracting text from selected PDF...');
  await window.extractPDFForDebug(fileInput);
};
  
  // Statement Ingestion V2 Integration
  window.statementIngestionV2 = {
    enabled: true,
    
    async ingestStatement(file, cardId) {
      console.log('🚀 Using Statement Ingestion V2 for:', file.name);
      
      try {
        // Use enhanced Statement Ingestion V2 (inline version)
        console.log('🚀 Using Enhanced Statement Ingestion V2 (inline)');
        
        // Process the statement with enhanced parsing
        const result = await parseStatementFileEnhanced(file, cardId);
        
        if (result && result.success && result.data) {
          console.log('✅ Statement parsed successfully:', result.data);
          
          // Store the parsed statement data
          const ccCards = JSON.parse(localStorage.getItem('ccEngineCards') || '{}');
          if (!ccCards[cardId]) ccCards[cardId] = { cardId };
          
          ccCards[cardId].snapshot = {
            statementCloseDate: result.data.statementDate,
            statementBalance: result.data.statementBalance,
            minimumDue: result.data.minimumDue,
            feesAccrued: result.data.feesAccrued || 0,
            interestAccrued: result.data.interestAccrued || 0
          };
          
          ccCards[cardId].reconciliation = {
            confidence: 0.9,
            unappliedAdjustments: 0
          };
          
          // Store issuer info
          ccCards[cardId].issuer = result.data.issuer;
          
          localStorage.setItem('ccEngineCards', JSON.stringify(ccCards));
          
          // Update the account balance in the main app state so it shows in the UI
          try {
            const accounts = AppState.State.accounts;
            const account = accounts.find(acc => acc.id === cardId);
            if (account) {
              account.balanceAsOfAmount = result.data.statementBalance;
              account.balanceAsOfDate = result.data.statementDate;
              if (result.data.minimumDue) {
                account.minimumPaymentDue = result.data.minimumDue;
              }
              AppState.saveItem('accounts', account, 'accounts');
              console.log('✅ Updated account balance in main state:', account.name, result.data.statementBalance);
            }
          } catch (error) {
            console.error('Error updating account balance:', error);
          }
          
          // Safe toast notification with details
          const balance = result.data.statementBalance?.toFixed(2) || 'N/A';
          const minDue = result.data.minimumDue?.toFixed(2) || 'N/A';
          const issuer = result.data.issuer || 'Unknown';
          window.safeToast(`Statement parsed! Balance: $${balance}, Min Due: $${minDue}, Bank: ${issuer}`, 'success');
          
          // Refresh the accounts display
          if (window.Router && window.Router.render) {
            window.Router.render();
          }
          
          return result;
        } else {
          const errorMsg = result?.errors ? 
            (Array.isArray(result.errors) ? result.errors.join(', ') : result.errors.toString()) : 
            'Unknown parsing error';
          console.error('❌ Statement Ingestion V2 Failed:', errorMsg);
          window.safeToast('Statement parsing failed: ' + errorMsg, 'error');
          return result || { success: false, errors: ['Parsing failed'] };
        }
      } catch (error) {
        console.error('❌ Statement Ingestion V2 Error:', error);
        window.safeToast('Statement parsing error: ' + error.message, 'error');
        return { success: false, errors: [error.message] };
      }
    },
    
    async applyStatementToCard(cardId, statement) {
      console.log('📋 Applying statement to card:', cardId);
      
      try {
        // Update the main account state
        const accounts = AppState.State.accounts;
        const account = accounts.find(acc => acc.id === cardId);
        
        if (account) {
          // Update account with parsed data
          account.balanceAsOfAmount = statement.statementBalance || 0;
          account.balanceAsOfDate = statement.statementPeriodEnd || new Date().toISOString().slice(0, 10);
          account.paymentDueDate = statement.paymentDueDate || '';
          account.nextClosingDate = statement.statementPeriodEnd || '';
          account.minimumPaymentDue = statement.minimumDue || 0;
          account.creditLimit = statement.creditLimit || 0;
          
          // Save the updated account
          await AppState.saveItem('accounts', account, 'accounts');
          
          // Store CC Engine data
          const ccCards = JSON.parse(localStorage.getItem('ccEngineCards') || '{}');
          if (!ccCards[cardId]) ccCards[cardId] = { cardId };
          
          ccCards[cardId].issuer = statement.issuer;
          ccCards[cardId].snapshot = {
            statementCloseDate: statement.statementPeriodEnd,
            statementBalance: statement.statementBalance,
            minimumDue: statement.minimumDue,
            feesAccrued: statement.fees || 0,
            interestAccrued: statement.interest || 0
          };
          
          ccCards[cardId].installmentPlans = statement.installmentPlans || [];
          
          localStorage.setItem('ccEngineCards', JSON.stringify(ccCards));
          
          // Show success message
          const balance = statement.statementBalance?.toFixed(2) || 'N/A';
          const minDue = statement.minimumDue?.toFixed(2) || 'N/A';
          const issuer = statement.issuer || 'Unknown';
          const confidence = Object.values(statement.confidenceByField || {})
            .reduce((sum, conf) => sum + conf, 0) / Object.values(statement.confidenceByField || {}).length * 100;
          
          window.safeToast(
            `Statement applied! Balance: $${balance}, Min Due: $${minDue}, Bank: ${issuer}, Confidence: ${confidence.toFixed(1)}%`,
            'success'
          );
          
          // Refresh the UI
          if (window.Router && window.Router.render) {
            window.Router.render();
          }
        } else {
          throw new Error('Account not found');
        }
      } catch (error) {
        console.error('Error applying statement to card:', error);
        window.safeToast('Error applying statement: ' + error.message, 'error');
      }
    }
  };
  
  // Add debug function to window for testing
  window.testCCEngine = function() {
    console.log('🧪 Testing CC Engine...');
    console.log('CC Engine enabled:', window.isCCEngineEnabled());
    console.log('Engine status:', window.getEngineStatus());
    
    // Test quick setup
    const testCardId = 'test-card-' + Date.now();
    window.quickSetupCard(testCardId, {
      issuer: 'Test Bank',
      statementBalance: 1000.00,
      minimumDue: 50.00,
      closingDay: 25
    });
    
    // Test card snapshot
    const snapshot = window.useCardSnapshot(testCardId);
    console.log('Card snapshot:', snapshot);
    
    // Safe toast notification
    window.safeToast('CC Engine test complete! Check console.', 'success');
  };
}

// ============================================================================
// CC ENGINE UI FUNCTIONS
// ============================================================================

// PDF Statement Parser
async function parseStatementFile(file, cardId) {
  console.log('📄 Parsing statement file:', file.name);
  
  try {
    // Check file type
    if (file.type === 'application/pdf') {
      return await parsePDFStatement(file, cardId);
    } else if (file.type === 'text/csv' || file.name.endsWith('.csv')) {
      return await parseCSVStatement(file, cardId);
    } else {
      // Try to read as text
      return await parseTextStatement(file, cardId);
    }
  } catch (error) {
    console.error('Error parsing statement:', error);
    return {
      success: false,
      errors: `Failed to parse statement: ${error.message}`
    };
  }
}

async function parsePDFStatement(file, cardId) {
  console.log('📄 Parsing PDF statement...');
  
  try {
    // Load PDF.js if not already loaded
    if (!window.pdfjsLib) {
      await loadPDFJS();
    }
    
    console.log('📄 Converting file to array buffer...');
    const arrayBuffer = await file.arrayBuffer();
    console.log('📄 Array buffer size:', arrayBuffer.byteLength);
    
    console.log('📄 Loading PDF document...');
    const pdf = await window.pdfjsLib.getDocument(arrayBuffer).promise;
    
    let fullText = '';
    console.log(`📄 PDF loaded successfully, ${pdf.numPages} pages`);
    
    // Extract text from all pages
    for (let i = 1; i <= pdf.numPages; i++) {
      console.log(`📄 Processing page ${i}...`);
      const page = await pdf.getPage(i);
      const textContent = await page.getTextContent();
      
      // Extract text more carefully, filtering out empty items
      const pageText = textContent.items
        .filter(item => item.str && item.str.trim().length > 0)
        .map(item => item.str.trim())
        .join(' ');
      
      fullText += pageText + '\n';
      console.log(`📄 Page ${i} extracted: ${pageText.length} characters`);
      if (pageText.length > 0) {
        console.log(`📄 Page ${i} preview:`, pageText.substring(0, 200));
      }
    }
    
    console.log(`📄 Total extracted text: ${fullText.length} characters`);
    
    if (fullText.length === 0) {
      console.warn('⚠️ No text extracted from PDF - might be image-based PDF');
      return {
        success: false,
        text: '',
        errors: 'No text extracted from PDF - might be image-based or corrupted'
      };
    }
    
    console.log('📄 Extracted PDF text preview:', fullText.substring(0, 500) + '...');
    
    return {
      success: true,
      text: fullText
    };
    
  } catch (error) {
    console.error('PDF parsing error:', error);
    return {
      success: false,
      text: '',
      errors: `PDF parsing failed: ${error.message}. Try uploading a CSV file instead.`
    };
  }
}

async function parseCSVStatement(file, cardId) {
  console.log('📄 Parsing CSV statement...');
  
  try {
    const text = await file.text();
    console.log('📄 CSV content:', text.substring(0, 500) + '...');
    
    return parseStatementText(text, cardId, 'CSV');
  } catch (error) {
    console.error('CSV parsing error:', error);
    return {
      success: false,
      errors: `CSV parsing failed: ${error.message}`
    };
  }
}

async function parseTextStatement(file, cardId) {
  console.log('📄 Parsing text statement...');
  
  try {
    const text = await file.text();
    console.log('📄 Text content:', text.substring(0, 500) + '...');
    
    return parseStatementText(text, cardId, 'TEXT');
  } catch (error) {
    console.error('Text parsing error:', error);
    return {
      success: false,
      errors: `Text parsing failed: ${error.message}`
    };
  }
}

function parseStatementText(text, cardId, source) {
  console.log('📄 Parsing statement text from', source);
  console.log('📄 Full text for analysis:', text);
  
  // Advanced PDF screening system
  const screening = new StatementScreener(text);
  const extracted = screening.extractAllData();
  
  console.log('🔍 Statement screening results:', extracted);
  
  return {
    success: true,
    data: {
      cardId,
      issuer: extracted.issuer,
      statementDate: extracted.statementDate || new Date().toISOString().slice(0, 10),
      statementBalance: extracted.statementBalance,
      minimumDue: extracted.minimumDue || Math.max(25, (extracted.statementBalance || 0) * 0.02),
      feesAccrued: extracted.feesAccrued || 0,
      interestAccrued: extracted.interestAccrued || 0,
      dueDate: extracted.dueDate,
      closingDate: extracted.closingDate,
      installmentPlans: extracted.installmentPlans || []
    },
    warnings: extracted.warnings || [],
    extracted
  };
}

// Enhanced Statement Parsing Function (V2 inline)
async function parseStatementFileEnhanced(file, cardId) {
  console.log('📄 Enhanced parsing for:', file.name);
  
  try {
    // Extract text using existing method
    let text = '';
    if (file.type === 'application/pdf') {
      const pdfResult = await parsePDFStatement(file, cardId);
      if (pdfResult && pdfResult.success) {
        text = pdfResult.text || '';
      } else {
        throw new Error('PDF parsing failed');
      }
    } else {
      text = await file.text();
    }
    
    console.log('📄 Extracted text length:', text ? text.length : 0);
    
    if (!text || text.length === 0) {
      throw new Error('No text extracted from file');
    }
    
    // Enhanced parsing with comprehensive patterns
    const enhancedResult = parseStatementTextEnhanced(text, cardId, file.name);
    
    return enhancedResult;
  } catch (error) {
    console.error('Enhanced parsing error:', error);
    return {
      success: false,
      errors: `Enhanced parsing failed: ${error.message}`
    };
  }
}

// Enhanced Statement Text Parser
function parseStatementTextEnhanced(text, cardId, source) {
  console.log('🔍 Enhanced statement parsing from', source);
  
  const extracted = {
    statementBalance: null,
    minimumDue: null,
    statementDate: null,
    dueDate: null,
    closingDate: null,
    issuer: 'Unknown',
    feesAccrued: null,
    interestAccrued: null,
    previousBalance: null,
    purchases: null,
    paymentsAndCredits: null,
    creditLimit: null,
    availableCredit: null,
    cardLast4: null,
    installmentPlans: [],
    warnings: [],
    confidenceByField: {}
  };

  // BULLETPROOF EXTRACTION - Look for exact patterns from your PDF
  console.log('🎯 Using bulletproof extraction patterns...');
  
  // 1. NEW BALANCE - Look for "Nuevo Saldo: $2,074.43"
  const nuevoSaldoMatch = text.match(/nuevo\s+saldo\s*[:\\s]*\$?([\d,]+\.?\d*)/gi);
  if (nuevoSaldoMatch) {
    console.log('🎯 Found "Nuevo Saldo" matches:', nuevoSaldoMatch);
    for (const match of nuevoSaldoMatch) {
      const amount = extractAmountFromText(match);
      if (amount && amount > 100) { // Reasonable balance check
        extracted.statementBalance = amount;
        extracted.confidenceByField.statementBalance = 0.95;
        console.log('✅ BULLETPROOF: Found balance:', amount);
        break;
      }
    }
  }
  
  // 2. MINIMUM PAYMENT - Look for "Pago Mínimo: $197.04" or "Saldo ahorro de interés: $197.04"
  const pagoMinimoMatch = text.match(/pago\s+m[íi]nimo\s*[:\\s]*\$?([\d,]+\.?\d*)/gi);
  const saldoAhorroMatch = text.match(/saldo\s+ahorro\s+de\s+inter[eé]s\s*[:\\s]*\$?([\d,]+\.?\d*)/gi);
  
  if (pagoMinimoMatch) {
    console.log('🎯 Found "Pago Mínimo" matches:', pagoMinimoMatch);
    for (const match of pagoMinimoMatch) {
      const amount = extractAmountFromText(match);
      if (amount && amount > 0) {
        extracted.minimumDue = amount;
        extracted.confidenceByField.minimumDue = 0.95;
        console.log('✅ BULLETPROOF: Found minimum due:', amount);
        break;
      }
    }
  } else if (saldoAhorroMatch) {
    console.log('🎯 Found "Saldo ahorro de interés" matches:', saldoAhorroMatch);
    for (const match of saldoAhorroMatch) {
      const amount = extractAmountFromText(match);
      if (amount && amount > 0) {
        extracted.minimumDue = amount;
        extracted.confidenceByField.minimumDue = 0.90;
        console.log('✅ BULLETPROOF: Found minimum due from interest savings:', amount);
        break;
      }
    }
  }
  
  // 3. DUE DATE - Look for "Fecha de Vencim. del Pago: 11/02/25"
  const fechaVencimMatch = text.match(/fecha\s+de\s+vencim\.\s*del\s+pago\s*[:\\s]*([\d\/\-]+)/gi);
  if (fechaVencimMatch) {
    console.log('🎯 Found "Fecha de Vencim. del Pago" matches:', fechaVencimMatch);
    for (const match of fechaVencimMatch) {
      const date = extractDateFromText(match);
      if (date) {
        extracted.dueDate = date;
        extracted.confidenceByField.dueDate = 0.95;
        console.log('✅ BULLETPROOF: Found due date:', date);
        break;
      }
    }
  }
  
  // 4. STATEMENT DATE - Look for "Fecha de Cuenta: 10/05/25" or similar
  const fechaCuentaMatch = text.match(/fecha\s+de\s+cuenta\s*[:\\s]*([\d\/\-]+)/gi);
  if (fechaCuentaMatch) {
    console.log('🎯 Found "Fecha de Cuenta" matches:', fechaCuentaMatch);
    for (const match of fechaCuentaMatch) {
      const date = extractDateFromText(match);
      if (date) {
        extracted.statementDate = date;
        extracted.closingDate = date; // Same as statement date
        extracted.confidenceByField.statementDate = 0.95;
        console.log('✅ BULLETPROOF: Found statement date:', date);
        break;
      }
    }
  }
  
  // Enhanced pattern matching
  const patterns = {
        // Balance patterns (comprehensive)
        balance: [
          /nuevo\s+saldo\s*[:\\s]*\$?([\d,]+\.?\d*)/gi,
          /(?:new|current|statement|total)\s+balance\s*[:\\s]*\$?([\d,]+\.?\d*)/gi,
          /(?:nuevo|saldo\s+nuevo|saldo\s+actual|saldo\s+del\s+estado|saldo\s+total)\s*[:\\s]*\$?([\d,]+\.?\d*)/gi,
          /balance\s*[:\\s]*\$?([\d,]+\.?\d*)/gi,
          /saldo\s*[:\\s]*\$?([\d,]+\.?\d*)/gi
        ],
    
        // Minimum payment patterns
        minimumDue: [
          /pago\s+m[íi]nimo\s*[:\\s]*\$?([\d,]+\.?\d*)/gi,
          /(?:minimum\s+(?:payment\s+)?due|min\s+payment|minimum\s+amount|required\s+payment)\s*[:\\s]*\$?([\d,]+\.?\d*)/gi,
          /(?:pago\s+m[íi]nimo|m[íi]nimo\s+a\s+pagar|monto\s+m[íi]nimo|pago\s+requerido)\s*[:\\s]*\$?([\d,]+\.?\d*)/gi
        ],
    
        // Date patterns (enhanced)
        dueDate: [
          /fecha\s+de\s+vencim\.\s*del\s+pago\s*[:\\s]*([\d\/\-]+)/gi,
          /(?:payment\s+due\s+date|due\s+date|payment\s+due)\s*[:\\s]*([\d\/\-]+)/gi,
          /(?:fecha\s+de\s+vencimiento|fecha\s+de\s+vencim|vencimiento\s+del\s+pago)\s*[:\\s]*([\d\/\-]+)/gi,
          /(?:vencimiento|due)\s*[:\\s]*([\d\/\-]+)/gi,
          /(?:pago|payment)\s+(?:due|vencimiento)\s*[:\\s]*([\d\/\-]+)/gi
        ],
    
    statementDate: [
      /(?:statement\s+date|closing\s+date|period\s+ending|statement\s+period)\s*[:\\s]*([\d\/\-]+)/gi,
      /(?:fecha\s+de\s+estado|fecha\s+de\s+corte|periodo\s+terminando)\s*[:\\s]*([\d\/\-]+)/gi,
      /(?:corte|closing)\s*[:\\s]*([\d\/\-]+)/gi,
      /(?:estado|statement)\s*[:\\s]*([\d\/\-]+)/gi,
      /(?:periodo|period)\s*[:\\s]*([\d\/\-]+)/gi,
      // More flexible patterns
      /([\d]{1,2}[\/\-][\d]{1,2}[\/\-][\d]{2,4})/g, // Any date format
      /([\d]{4}[\/\-][\d]{1,2}[\/\-][\d]{1,2})/g   // YYYY-MM-DD format
    ],
    
    // Additional financial fields
    previousBalance: [
      /(?:previous\s+balance|prior\s+balance|beginning\s+balance)\s*[:\\s]*\$?([\d,]+\.?\d*)/gi,
      /(?:saldo\s+anterior|saldo\s+previo|saldo\s+inicial)\s*[:\\s]*\$?([\d,]+\.?\d*)/gi
    ],
    
    purchases: [
      /(?:purchases?|new\s+charges?|debits?)\s*[:\\s]*\$?([\d,]+\.?\d*)/gi,
      /(?:compras?|cargos?\s+nuevos?|d[ée]bitos?)\s*[:\\s]*\$?([\d,]+\.?\d*)/gi
    ],
    
    paymentsAndCredits: [
      /(?:payments?\s*(?:and)?\s*credits?|credits?\s*(?:and)?\s*payments?)\s*[:\\s]*\$?([\d,]+\.?\d*)/gi,
      /(?:pagos?\s*y\s*abonos?|abonos?\s*y\s*pagos?)\s*[:\\s]*\$?([\d,]+\.?\d*)/gi
    ],
    
    fees: [
      /(?:fees?|late\s+fees?|annual\s+fees?|service\s+fees?)\s*[:\\s]*\$?([\d,]+\.?\d*)/gi,
      /(?:cargos?|comisiones?|cargo\s+por\s+servicio|cargo\s+anual)\s*[:\\s]*\$?([\d,]+\.?\d*)/gi
    ],
    
    interest: [
      /(?:interest|finance\s+charges?|interest\s+charges?)\s*[:\\s]*\$?([\d,]+\.?\d*)/gi,
      /(?:intereses?|cargos\s+financieros?|cargos\s+por\s+intereses?)\s*[:\\s]*\$?([\d,]+\.?\d*)/gi
    ],
    
    creditLimit: [
      /(?:credit\s+limit|available\s+credit)\s*[:\\s]*\$?([\d,]+\.?\d*)/gi,
      /(?:l[íi]mite\s+de\s+cr[ée]dito|cr[ée]dito\s+disponible)\s*[:\\s]*\$?([\d,]+\.?\d*)/gi
    ]
  };
  
  // Extract fields with enhanced logic
  for (const [fieldName, fieldPatterns] of Object.entries(patterns)) {
    for (const pattern of fieldPatterns) {
      const matches = text.match(pattern);
      if (matches) {
        console.log(`🔍 Pattern for ${fieldName} matched:`, matches);
        for (const match of matches) {
          console.log(`🔍 Processing match for ${fieldName}: "${match}"`);
          const amount = extractAmountFromText(match);
          console.log(`🔍 Extracted amount for ${fieldName}: ${amount}`);
          if (amount !== null && amount > 0) {
            extracted[fieldName] = amount;
            extracted.confidenceByField[fieldName] = 0.9; // High confidence for matched patterns
            console.log(`✅ Found ${fieldName}: ${amount}`);
            break;
          }
        }
        if (extracted[fieldName]) break;
      }
    }
  }
  
  // Extract dates
  for (const pattern of patterns.dueDate) {
    const matches = text.match(pattern);
    if (matches) {
      const date = extractDateFromText(matches[0]);
      if (date) {
        extracted.dueDate = date;
        extracted.confidenceByField.dueDate = 0.9;
        console.log(`✅ Found due date: ${date}`);
        break;
      }
    }
  }
  
  for (const pattern of patterns.statementDate) {
    const matches = text.match(pattern);
    if (matches) {
      const date = extractDateFromText(matches[0]);
      if (date) {
        extracted.statementDate = date;
        extracted.confidenceByField.statementDate = 0.9;
        console.log(`✅ Found statement date: ${date}`);
        break;
      }
    }
  }
  
  // Detect issuer
  const issuerPatterns = {
    'Chase': /chase|jpmorgan/i,
    'American Express': /american\s+express|amex/i,
    'Bank of America': /bank\s+of\s+america|bofa/i,
    'Wells Fargo': /wells\s+fargo/i,
    'Citi': /citi|citibank/i,
    'Capital One': /capital\s+one/i,
    'Discover': /discover/i
  };
  
  for (const [issuer, pattern] of Object.entries(issuerPatterns)) {
    if (pattern.test(text)) {
      extracted.issuer = issuer;
      extracted.confidenceByField.issuer = 0.95;
      console.log(`✅ Detected issuer: ${issuer}`);
      break;
    }
  }
  
  // Extract card last 4
  const cardMatch = text.match(/\*{0,4}\s?(\d{4})/);
  if (cardMatch) {
    extracted.cardLast4 = cardMatch[1];
    extracted.confidenceByField.cardLast4 = 0.9;
    console.log(`✅ Found card last 4: ****${cardMatch[1]}`);
  }
  
  // Calculate confidence and warnings
  const criticalFields = ['statementBalance', 'minimumDue', 'dueDate'];
  const criticalFound = criticalFields.filter(field => extracted[field] !== null).length;
  const overallConfidence = criticalFound / criticalFields.length;
  
  if (overallConfidence < 0.7) {
    extracted.warnings.push('Some critical fields could not be extracted');
  }
  
  if (!extracted.issuer || extracted.issuer === 'Unknown') {
    extracted.warnings.push('Bank issuer not detected');
  }
  
  // Validate that we found at least a balance
  if (!extracted.balance) {
    return {
      success: false,
      errors: 'Could not find statement balance in the uploaded file. Please check the file format or try manual entry.',
      extracted
    };
  }
  
  // Map balance to statementBalance for compatibility
  extracted.statementBalance = extracted.balance;
  
  console.log('📊 Enhanced extraction results:', extracted);
  
  return {
    success: true,
    data: {
      cardId,
      issuer: extracted.issuer,
      statementDate: extracted.statementDate || new Date().toISOString().slice(0, 10),
      statementBalance: extracted.statementBalance,
      minimumDue: extracted.minimumDue || Math.max(25, extracted.statementBalance * 0.02),
      feesAccrued: extracted.feesAccrued || 0,
      interestAccrued: extracted.interestAccrued || 0,
      dueDate: extracted.dueDate,
      previousBalance: extracted.previousBalance,
      purchases: extracted.purchases,
      paymentsAndCredits: extracted.paymentsAndCredits,
      creditLimit: extracted.creditLimit,
      availableCredit: extracted.availableCredit,
      cardLast4: extracted.cardLast4
    },
    warnings: [
      `Enhanced parsing from ${source}`,
      extracted.minimumDue ? 'Minimum payment found' : 'Minimum payment estimated',
      extracted.issuer !== 'Unknown' ? `Issuer detected: ${extracted.issuer}` : 'Issuer not detected',
      ...extracted.warnings
    ],
    confidenceByField: extracted.confidenceByField,
    extracted
  };
}

// Helper function to extract amounts
function extractAmountFromText(text) {
  if (!text) return null;
  const amount = text.replace(/[^\d,.-]/g, '');
  if (!amount) return null;
  
  // Handle different decimal separators
  let normalized = amount;
  if (normalized.includes(',') && normalized.split(',')[1]?.length === 3) {
    // Comma is thousands separator (e.g., 2,074.43)
    normalized = normalized.replace(/,/g, '');
  } else if (normalized.includes(',') && normalized.split(',')[1]?.length === 2) {
    // Comma is decimal separator
    normalized = normalized.replace(',', '.');
  }
  
  const result = parseFloat(normalized);
  return isNaN(result) ? null : result;
}

// Helper function to extract dates
function extractDateFromText(text) {
  if (!text) return null;
  
  console.log('📅 Extracting date from text:', text);
  
  const cleaned = text.replace(/[^\d\/\-]/g, '');
  if (!cleaned) return null;
  
  console.log('📅 Cleaned date text:', cleaned);
  
  // Try MM/DD/YYYY format
  const matchYYYY = cleaned.match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
  if (matchYYYY) {
    const [, month, day, year] = matchYYYY;
    const result = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
    console.log('📅 Found YYYY format:', result);
    return result;
  }
  
  // Try MM/DD/YY format (convert to MM/DD/YYYY)
  const matchYY = cleaned.match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2})/);
  if (matchYY) {
    const [, month, day, year] = matchYY;
    const yearNum = parseInt(year);
    // Assume 20xx for years 00-29, 19xx for years 30-99
    const fullYear = yearNum < 30 ? 2000 + yearNum : 1900 + yearNum;
    const result = `${fullYear}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
    console.log('📅 Found YY format, converted to:', result);
    return result;
  }
  
  console.log('📅 No valid date format found');
  return null;
}

// Advanced Statement Screener Class
class StatementScreener {
  constructor(text) {
    this.text = text;
    this.lines = text.split('\n').map(line => line.trim()).filter(line => line.length > 0);
    this.extracted = {
      statementBalance: null,
      minimumDue: null,
      statementDate: null,
      dueDate: null,
      closingDate: null,
      issuer: 'Unknown',
      feesAccrued: null,
      interestAccrued: null,
      installmentPlans: [],
      warnings: []
    };
    
    this.patterns = this.buildPatterns();
  }
  
  buildPatterns() {
    return {
      // Balance patterns - comprehensive coverage
      balance: [
        // English patterns
        { pattern: /(?:new balance|current balance|statement balance|total balance|balance due|amount due|outstanding balance)[\s:]*\$?([\d,]+\.?\d*)/gi, type: 'english' },
        { pattern: /(?:balance|total)[\s:]*\$?([\d,]+\.?\d*)/gi, type: 'english' },
        { pattern: /\$([\d,]+\.?\d*)[\s]*(?:balance|total|due)/gi, type: 'english' },
        
        // Spanish patterns
        { pattern: /(?:nuevo saldo|saldo nuevo|saldo actual|saldo del estado|saldo total|saldo pendiente|saldo a pagar)[\s:]*\$?([\d,]+\.?\d*)/gi, type: 'spanish' },
        { pattern: /(?:saldo|balance)[\s:]*\$?([\d,]+\.?\d*)/gi, type: 'spanish' },
        { pattern: /\$([\d,]+\.?\d*)[\s]*(?:saldo|balance)/gi, type: 'spanish' },
        
        // Direct amount patterns
        { pattern: /nuevo saldo:\s*\$([\d,]+\.?\d*)/gi, type: 'chase' },
        { pattern: /saldo:\s*\$([\d,]+\.?\d*)/gi, type: 'generic' }
      ],
      
      // Minimum payment patterns
      minimumDue: [
        // English patterns
        { pattern: /(?:minimum payment|min payment|minimum due|minimum amount|required payment)[\s:]*\$?([\d,]+\.?\d*)/gi, type: 'english' },
        { pattern: /(?:payment due|due amount|amount due)[\s:]*\$?([\d,]+\.?\d*)/gi, type: 'english' },
        
        // Spanish patterns
        { pattern: /(?:pago mínimo|pago minimo|mínimo a pagar|monto mínimo|monto minimo|pago requerido|pago obligatorio)[\s:]*\$?([\d,]+\.?\d*)/gi, type: 'spanish' },
        { pattern: /(?:pago requerido|pago obligatorio)[\s:]*\$?([\d,]+\.?\d*)/gi, type: 'spanish' }
      ],
      
      // Date patterns
      statementDate: [
        { pattern: /(?:statement date|closing date|period ending|statement period|billing date)[\s:]*([\d\/\-]+)/gi, type: 'english' },
        { pattern: /(?:fecha de estado|fecha de cierre|periodo terminando|periodo del estado|fecha de facturación)[\s:]*([\d\/\-]+)/gi, type: 'spanish' }
      ],
      
      dueDate: [
        { pattern: /(?:payment due date|due date|payment due|due by|pay by)[\s:]*([\d\/\-]+)/gi, type: 'english' },
        { pattern: /(?:fecha de vencimiento|fecha de vencim|vencimiento del pago|pago vence|vencimiento)[\s:]*([\d\/\-]+)/gi, type: 'spanish' },
        { pattern: /fecha de vencim\. del pago:\s*([\d\/\-]+)/gi, type: 'chase' }
      ],
      
      // Fees and interest
      fees: [
        { pattern: /(?:fees|late fees|annual fees|service fees)[\s:]*\$?([\d,]+\.?\d*)/gi, type: 'english' },
        { pattern: /(?:cargos|comisiones|cargo por servicio|cargo anual)[\s:]*\$?([\d,]+\.?\d*)/gi, type: 'spanish' }
      ],
      
      interest: [
        { pattern: /(?:interest|finance charges|interest charges)[\s:]*\$?([\d,]+\.?\d*)/gi, type: 'english' },
        { pattern: /(?:intereses|cargos financieros|cargos por intereses)[\s:]*\$?([\d,]+\.?\d*)/gi, type: 'spanish' }
      ]
    };
  }
  
  extractAllData() {
    console.log('🔍 Starting comprehensive statement screening...');
    
    // Extract basic data
    this.extractBalance();
    this.extractMinimumDue();
    this.extractDates();
    this.extractFeesAndInterest();
    this.detectIssuer();
    this.extractInstallments();
    
    // Add warnings for missing data
    this.addWarnings();
    
    return this.extracted;
  }
  
  extractBalance() {
    console.log('💰 Extracting balance...');
    
    for (const balancePattern of this.patterns.balance) {
      const matches = this.text.match(balancePattern.pattern);
      if (matches) {
        console.log(`🔍 Balance pattern (${balancePattern.type}) matches:`, matches);
        
        for (const match of matches) {
          const amount = this.extractAmount(match);
          if (amount > 0) {
            this.extracted.statementBalance = amount;
            console.log(`✅ Found balance: $${amount} (${balancePattern.type})`);
            return;
          }
        }
      }
    }
    
    console.log('❌ No balance found');
  }
  
  extractMinimumDue() {
    console.log('💳 Extracting minimum due...');
    
    for (const minPattern of this.patterns.minimumDue) {
      const matches = this.text.match(minPattern.pattern);
      if (matches) {
        console.log(`🔍 Minimum due pattern (${minPattern.type}) matches:`, matches);
        
        for (const match of matches) {
          const amount = this.extractAmount(match);
          if (amount > 0) {
            this.extracted.minimumDue = amount;
            console.log(`✅ Found minimum due: $${amount} (${minPattern.type})`);
            return;
          }
        }
      }
    }
    
    console.log('❌ No minimum due found');
  }
  
  extractDates() {
    console.log('📅 Extracting dates...');
    
    // Extract statement date
    for (const datePattern of this.patterns.statementDate) {
      const matches = this.text.match(datePattern.pattern);
      if (matches) {
        console.log(`🔍 Statement date pattern (${datePattern.type}) matches:`, matches);
        const date = this.extractDate(matches[0]);
        if (date) {
          this.extracted.statementDate = date;
          console.log(`✅ Found statement date: ${date} (${datePattern.type})`);
          break;
        }
      }
    }
    
    // Extract due date
    for (const datePattern of this.patterns.dueDate) {
      const matches = this.text.match(datePattern.pattern);
      if (matches) {
        console.log(`🔍 Due date pattern (${datePattern.type}) matches:`, matches);
        const date = this.extractDate(matches[0]);
        if (date) {
          this.extracted.dueDate = date;
          console.log(`✅ Found due date: ${date} (${datePattern.type})`);
          break;
        }
      }
    }
    
    // Try to extract closing date from context
    this.extractClosingDate();
  }
  
  extractClosingDate() {
    console.log('📅 Looking for closing date...');
    
    // Look for patterns like "closing date", "statement period", etc.
    const closingPatterns = [
      /(?:closing date|statement closing|period ending)[\s:]*([\d\/\-]+)/gi,
      /(?:fecha de cierre|cierre del periodo)[\s:]*([\d\/\-]+)/gi,
      /(?:billing cycle|statement period)[\s:]*([\d\/\-]+)/gi
    ];
    
    for (const pattern of closingPatterns) {
      const matches = this.text.match(pattern);
      if (matches) {
        const date = this.extractDate(matches[0]);
        if (date) {
          this.extracted.closingDate = date;
          console.log(`✅ Found closing date: ${date}`);
          return;
        }
      }
    }
    
    console.log('❌ No closing date found');
  }
  
  extractFeesAndInterest() {
    console.log('💸 Extracting fees and interest...');
    
    // Extract fees
    for (const feePattern of this.patterns.fees) {
      const matches = this.text.match(feePattern.pattern);
      if (matches) {
        for (const match of matches) {
          const amount = this.extractAmount(match);
          if (amount > 0) {
            this.extracted.feesAccrued = amount;
            console.log(`✅ Found fees: $${amount}`);
            break;
          }
        }
      }
    }
    
    // Extract interest
    for (const interestPattern of this.patterns.interest) {
      const matches = this.text.match(interestPattern.pattern);
      if (matches) {
        for (const match of matches) {
          const amount = this.extractAmount(match);
          if (amount > 0) {
            this.extracted.interestAccrued = amount;
            console.log(`✅ Found interest: $${amount}`);
            break;
          }
        }
      }
    }
  }
  
  detectIssuer() {
    console.log('🏦 Detecting issuer...');
    
    const issuerPatterns = {
      'Chase': /chase|jpmorgan/i,
      'Bank of America': /bank of america|bofa|boa/i,
      'Wells Fargo': /wells fargo/i,
      'Citi': /citi|citibank|citigroup/i,
      'Capital One': /capital one/i,
      'American Express': /american express|amex/i,
      'Discover': /discover/i,
      'HSBC': /hsbc/i,
      'PNC': /pnc/i,
      'US Bank': /us bank|usbank/i
    };
    
    for (const [issuer, pattern] of Object.entries(issuerPatterns)) {
      if (pattern.test(this.text)) {
        this.extracted.issuer = issuer;
        console.log(`✅ Detected issuer: ${issuer}`);
        return;
      }
    }
    
    console.log('❌ Issuer not detected');
  }
  
  extractInstallments() {
    console.log('📊 Looking for installment plans...');
    
    // Look for installment-related keywords
    const installmentKeywords = [
      'installment', 'plan de pagos', 'pago a plazos', 'financing', 'financiamiento',
      'equal payments', 'pagos iguales', 'monthly payment', 'pago mensual'
    ];
    
    const installmentSections = [];
    
    for (const line of this.lines) {
      for (const keyword of installmentKeywords) {
        if (line.toLowerCase().includes(keyword.toLowerCase())) {
          installmentSections.push(line);
        }
      }
    }
    
    if (installmentSections.length > 0) {
      console.log('📊 Found potential installment sections:', installmentSections);
      this.extracted.warnings.push(`Found ${installmentSections.length} potential installment sections`);
    }
    
    console.log('📊 Installment analysis complete');
  }
  
  addWarnings() {
    if (!this.extracted.statementBalance) {
      this.extracted.warnings.push('Could not find statement balance');
    }
    if (!this.extracted.minimumDue) {
      this.extracted.warnings.push('Could not find minimum payment - will estimate');
    }
    if (!this.extracted.dueDate) {
      this.extracted.warnings.push('Could not find payment due date');
    }
    if (!this.extracted.closingDate) {
      this.extracted.warnings.push('Could not find closing date');
    }
    if (this.extracted.issuer === 'Unknown') {
      this.extracted.warnings.push('Could not identify bank issuer');
    }
  }
  
  extractAmount(text) {
    const amount = text.replace(/[^\d,.-]/g, '');
    return parseFloat(amount.replace(/,/g, ''));
  }
  
  extractDate(text) {
    const date = text.replace(/[^\d\/\-]/g, '');
    return date.length > 0 ? date : null;
  }
}

async function loadPDFJS() {
  return new Promise((resolve, reject) => {
    if (window.pdfjsLib) {
      resolve();
      return;
    }
    
    const script = document.createElement('script');
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
    script.onload = () => {
      window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
      resolve();
    };
    script.onerror = reject;
    document.head.appendChild(script);
  });
}

// Statement upload function - REMOVED: Now handled by enhanced version in ui.js

// Quick setup function - REMOVED: Now handled by enhanced version in ui.js

// ============================================================================
// CC ENGINE TRANSACTION PROCESSING
// ============================================================================

// Check if account is a credit card
window.isCreditCardAccount = function(accountId) {
  const account = AppState.State.accounts.find(a => a.id === accountId);
  return account && Utils.accountType(account) === 'credit-card';
};

// Process credit card transaction
window.processCreditCardTransaction = function(transaction) {
  console.log('💳 Processing credit card transaction:', transaction.id);
  
  // Attach metadata if not present
  if (!transaction.meta) {
    transaction.meta = {};
  }
  
  // Set card ID metadata
  if (transaction.fromAccountId && isCreditCardAccount(transaction.fromAccountId)) {
    transaction.meta.cardId = transaction.fromAccountId;
  }
  
  // Check if this should be marked as installment charge
  if (transaction.isDeferred && transaction.deferredMonths > 0) {
    transaction.meta.isInstallmentCharge = true;
    
    // Generate plan ID if not present
    if (!transaction.meta.installmentPlanId) {
      transaction.meta.installmentPlanId = `plan_${transaction.id}`;
    }
  }
  
  console.log('✅ CC transaction processed:', transaction.meta);
};

// Process credit card payment
window.processCreditCardPayment = function(transaction) {
  console.log('💰 Processing credit card payment:', transaction.id);
  
  // Determine which credit card this payment is for
  const cardId = transaction.toAccountId || transaction.fromAccountId;
  if (!cardId || !isCreditCardAccount(cardId)) {
    return;
  }
  
  console.log('💳 Payment applied to card:', cardId);
  
  // Simple payment processing - store in localStorage
  const ccCards = JSON.parse(localStorage.getItem('ccEngineCards') || '{}');
  if (ccCards[cardId]) {
    if (!ccCards[cardId].reconciliation) {
      ccCards[cardId].reconciliation = {};
    }
    
    ccCards[cardId].reconciliation.lastPaymentDate = transaction.date;
    ccCards[cardId].reconciliation.lastPaymentAmount = transaction.amount;
    
    localStorage.setItem('ccEngineCards', JSON.stringify(ccCards));
    console.log('✅ Payment recorded for card:', cardId);
  }
};
(async function(){
  // Check CDNs after 2s
  setTimeout(()=>{
    if (!window.jspdf) Utils.showCdnWarning('jspdf','PDF library failed to load (jsPDF). The Report export may not work offline.');
    if (!window.Chart) Utils.showCdnWarning('chart','Chart library failed to load (Chart.js). Charts may not render offline.');
    if (!window.XLSX) Utils.showCdnWarning('xlsx','Excel library failed to load (xlsx). Import/Export may not work offline.');
  }, 2000);
  await AppState.loadAll();
  
  // Set default API keys
  Utils.setDefaultApiKeys();
  
  // Transaction dropdowns are handled by existing form logic
  
  // Update deferred transaction months on app load
  Utils.updateDeferredTransactionMonths();
  
  // Initialize Credit Card Engine
  initializeCCEngine();
  
  if (!location.hash){ location.hash = '#/dashboard'; }
  Router.render();
})();
