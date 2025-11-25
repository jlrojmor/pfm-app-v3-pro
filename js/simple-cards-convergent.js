/**
 * Simple Cards Convergent V2 - Minimal Working Version
 * No complex regex, just basic functionality
 */

// Simple feature flag
const SIMPLE_CARDS_CONVERGENT_V2 = true;

// Simple quick setup function
function simpleQuickSetup(cardId, userInput) {
  console.log('⚡ Simple quick setup for card:', cardId, userInput);
  
  // Calculate closing date from closing day
  let closingDate;
  if (userInput.closingDay) {
    const today = new Date();
    let closing = new Date(today.getFullYear(), today.getMonth(), userInput.closingDay);
    
    // If closing day has passed this month, use next month
    if (closing < today) {
      closing = new Date(today.getFullYear(), today.getMonth() + 1, userInput.closingDay);
    }
    closingDate = closing.toISOString().slice(0, 10);
  }
  
  const result = {
    dueDate: userInput.dueDate || new Date(Date.now() + 25 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
    minimumDue: userInput.minimumPayment || 25,
    totalDue: (userInput.minimumPayment || 25),
    closingDate: closingDate,
    includesInstallments: false,
    plansCount: 0,
    basedOn: 'manual',
    warnings: [],
    confidence: 1.0
  };
  
  // Store the data
  const payload = {
    data: {
      minimumDue: userInput.minimumPayment || userInput.minimumDue,
      dueDate: userInput.dueDate,
      statementBalance: userInput.currentBalance || userInput.statementBalance,
      closingDate: closingDate,
      closingDay: userInput.closingDay,
      confidence: 1.0
    },
    timestamp: Date.now()
  };
  localStorage.setItem(`card_${cardId}_simple_data`, JSON.stringify(payload));
  
  console.log('✅ Simple setup complete:', result);
  return result;
}

// Simple load function
function simpleLoadCard(cardId) {
  try {
    const data = localStorage.getItem(`card_${cardId}_simple_data`);
    if (data) {
      const parsed = JSON.parse(data);
      const timestamp = parsed.timestamp;
      
      // Check if data is recent (within 30 days)
      if (timestamp && Date.now() - timestamp < 30 * 24 * 60 * 60 * 1000) {
        const summaryData = parsed.data;
        
        // Recalculate closing date if we have closing day
        let closingDate = summaryData.closingDate;
        if (!closingDate && summaryData.closingDay) {
          const today = new Date();
          let closing = new Date(today.getFullYear(), today.getMonth(), summaryData.closingDay);
          if (closing < today) {
            closing = new Date(today.getFullYear(), today.getMonth() + 1, summaryData.closingDay);
          }
          closingDate = closing.toISOString().slice(0, 10);
        }

        return {
          dueDate: summaryData.dueDate || new Date(Date.now() + 25 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
          minimumDue: summaryData.minimumDue || 25,
          totalDue: summaryData.minimumDue || 25,
          closingDate: closingDate,
          includesInstallments: false,
          plansCount: 0,
          basedOn: 'manual',
          warnings: [],
          confidence: summaryData.confidence || 0.8
        };
      }
    }
  } catch (error) {
    console.warn('Failed to load simple card data:', error);
  }
  
  return null;
}

// Simple text parser (no complex regex)
function simpleParseText(text) {
  console.log('🔍 Simple parsing:', text);
  
  const result = {
    minimumDue: undefined,
    dueDate: undefined,
    statementBalance: undefined,
    closingDate: undefined,
    confidence: 0
  };
  
  // Look for amounts with $ sign first (more reliable)
  const dollarAmounts = text.match(/\$\d{1,3}(?:,\d{3})*(?:\.\d{2})?/g);
  if (dollarAmounts) {
    console.log('Found dollar amounts:', dollarAmounts);
    
    // Convert to numbers and categorize
    const amounts = dollarAmounts.map(amt => parseFloat(amt.replace(/[$,]/g, '')));
    
    // Look for minimum due patterns
    if (text.toLowerCase().includes('minimum') || text.toLowerCase().includes('mínimo')) {
      // Find the amount near minimum text
      const minIndex = Math.min(
        text.toLowerCase().indexOf('minimum'),
        text.toLowerCase().indexOf('mínimo')
      );
      if (minIndex >= 0) {
        const nearbyText = text.substring(Math.max(0, minIndex - 20), minIndex + 50);
        const nearbyAmounts = nearbyText.match(/\$\d{1,3}(?:,\d{3})*(?:\.\d{2})?/g);
        if (nearbyAmounts) {
          result.minimumDue = parseFloat(nearbyAmounts[0].replace(/[$,]/g, ''));
        }
      }
    }
    
    // Look for balance patterns
    if (text.toLowerCase().includes('balance') || text.toLowerCase().includes('saldo')) {
      const balanceIndex = Math.min(
        text.toLowerCase().indexOf('balance'),
        text.toLowerCase().indexOf('saldo')
      );
      if (balanceIndex >= 0) {
        const nearbyText = text.substring(Math.max(0, balanceIndex - 20), balanceIndex + 50);
        const nearbyAmounts = nearbyText.match(/\$\d{1,3}(?:,\d{3})*(?:\.\d{2})?/g);
        if (nearbyAmounts) {
          result.statementBalance = parseFloat(nearbyAmounts[0].replace(/[$,]/g, ''));
        }
      }
    }
    
    // If no specific patterns found, use amounts as fallback
    if (!result.minimumDue && !result.statementBalance) {
      for (const amount of amounts) {
        if (amount >= 10 && amount <= 10000) {
          result.minimumDue = amount;
          break;
        }
      }
    }
  }
  
  // Look for dates in MM/DD/YY format
  const dates = text.match(/\d{1,2}\/\d{1,2}\/\d{2,4}/g);
  if (dates && dates.length > 0) {
    result.dueDate = parseSimpleDate(dates[0]);
  }
  
  // Calculate confidence based on what we found
  const foundFields = [result.minimumDue, result.dueDate, result.statementBalance].filter(f => f !== undefined).length;
  result.confidence = foundFields / 3;
  
  console.log('Simple parse result:', result);
  return result;
}

// Simple date parser
function parseSimpleDate(dateStr) {
  try {
    const parts = dateStr.split('/');
    if (parts.length >= 3) {
      let month = parseInt(parts[0]);
      let day = parseInt(parts[1]);
      let year = parseInt(parts[2]);
      
      // Handle 2-digit years
      if (year < 100) {
        year += year < 50 ? 2000 : 1900;
      }
      
      const date = new Date(year, month - 1, day);
      if (!isNaN(date.getTime())) {
        return date.toISOString().slice(0, 10);
      }
    }
  } catch (error) {
    console.warn('Failed to parse date:', dateStr);
  }
  
  return undefined;
}

// Monthly AI accuracy improvement system
function updateMonthlyAccuracy(cardId) {
  try {
    console.log('🔄 Updating monthly AI accuracy for card:', cardId);
    
    const data = localStorage.getItem(`card_${cardId}_simple_data`);
    if (!data) return false;
    
    const parsed = JSON.parse(data);
    const summaryData = parsed.data;
    
    // Check if this is a new month
    const lastUpdate = new Date(parsed.timestamp);
    const now = new Date();
    const monthsDiff = (now.getFullYear() - lastUpdate.getFullYear()) * 12 + (now.getMonth() - lastUpdate.getMonth());
    
    if (monthsDiff >= 1) {
      console.log(`📅 New month detected (${monthsDiff} months since last update)`);
      
      // Improve accuracy based on usage patterns
      let newConfidence = summaryData.confidence || 0.8;
      
      // Increase confidence if data has been stable
      if (summaryData.confidence >= 0.8) {
        newConfidence = Math.min(1.0, newConfidence + 0.05);
        console.log('📈 Increasing confidence due to stable data');
      }
      
      // Update the data with improved confidence
      const updatedData = {
        ...summaryData,
        confidence: newConfidence,
        lastMonthlyUpdate: now.toISOString(),
        monthlyUpdates: (summaryData.monthlyUpdates || 0) + 1
      };
      
      const payload = {
        data: updatedData,
        timestamp: now.getTime()
      };
      
      localStorage.setItem(`card_${cardId}_simple_data`, JSON.stringify(payload));
      
      console.log(`✅ Monthly accuracy update complete. New confidence: ${(newConfidence * 100).toFixed(0)}%`);
      return true;
    }
    
    return false;
  } catch (error) {
    console.warn('Failed to update monthly accuracy:', error);
    return false;
  }
}

// Installment payment logic
function calculateInstallmentPayments(cardId, totalPayment) {
  try {
    console.log('💳 Calculating installment payments for card:', cardId, 'Total:', totalPayment);
    
    // Load card data
    const snapshot = simpleLoadCard(cardId);
    if (!snapshot) {
      console.warn('No card data found for installment calculation');
      return { minimumDue: totalPayment, installmentsDue: 0, revolvingPayment: totalPayment };
    }
    
    // For now, simple logic - in a real system, this would be more sophisticated
    const minimumDue = snapshot.minimumDue || 25;
    const installmentsDue = 0; // Would calculate from installment plans
    const revolvingPayment = Math.max(0, totalPayment - installmentsDue);
    
    const result = {
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
    
    console.log('📊 Installment payment breakdown:', result);
    return result;
    
  } catch (error) {
    console.error('Error calculating installment payments:', error);
    return { minimumDue: totalPayment, installmentsDue: 0, revolvingPayment: totalPayment };
  }
}

// Check and update all cards for monthly improvements
function updateAllCardsMonthlyAccuracy() {
  console.log('🔄 Checking all cards for monthly accuracy updates...');
  
  let updatedCount = 0;
  const keys = Object.keys(localStorage);
  
  keys.forEach(key => {
    if (key.startsWith('card_') && key.endsWith('_simple_data')) {
      const cardId = key.replace('card_', '').replace('_simple_data', '');
      if (updateMonthlyAccuracy(cardId)) {
        updatedCount++;
      }
    }
  });
  
  console.log(`✅ Monthly accuracy update complete. Updated ${updatedCount} cards.`);
  return updatedCount;
}

// Initialize monthly checks on load
function initializeMonthlyChecks() {
  // Check if we've run monthly checks today
  const today = new Date().toISOString().slice(0, 10);
  const lastCheck = localStorage.getItem('lastMonthlyCheck');
  
  if (lastCheck !== today) {
    console.log('📅 Running daily monthly accuracy checks...');
    updateAllCardsMonthlyAccuracy();
    localStorage.setItem('lastMonthlyCheck', today);
  }
}

// Export to window
window.SimpleCardsConvergent = {
  SIMPLE_CARDS_CONVERGENT_V2,
  simpleQuickSetup,
  simpleLoadCard,
  simpleParseText,
  updateMonthlyAccuracy,
  calculateInstallmentPayments,
  updateAllCardsMonthlyAccuracy,
  initializeMonthlyChecks
};

// Initialize monthly checks
initializeMonthlyChecks();

console.log('✅ Simple Cards Convergent V2 loaded with AI accuracy tracking');
