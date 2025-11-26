// user-profile.js - User authentication and profile management
// This module can be easily removed by deleting this file and removing the import from index.html

(function() {
  'use strict';

  // Configuration for custom messages based on birth date
  // Month is 0-indexed: 0=Jan, 1=Feb, 2=Mar, 3=Apr, 4=May, 5=Jun, 6=Jul, 7=Aug, 8=Sep, 9=Oct, 10=Nov, 11=Dec
  const CUSTOM_MESSAGES = [
    {
      month: 9, // October (0-indexed: 9=Oct)
      day: 16,
      message: "🎉 Especialmente con opción de moneda COP para la colombiana más guapa, inteligente, linda y crack que hay."
    }
    // Add more custom messages here as needed
    // { month: 10, day: 24, message: "November 24th message" }
  ];

  // Generate a simple user ID hash from name and birth date
  function generateUserId(name, birthDate) {
    const str = `${name || 'user'}_${birthDate}`;
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash).toString(36);
  }

  // Get user profile from localStorage
  function getUserProfile() {
    try {
      const stored = localStorage.getItem('userProfile');
      return stored ? JSON.parse(stored) : null;
    } catch (e) {
      console.error('Error reading user profile:', e);
      return null;
    }
  }

  // Save user profile to localStorage
  function saveUserProfile(profile) {
    try {
      localStorage.setItem('userProfile', JSON.stringify(profile));
      return true;
    } catch (e) {
      console.error('Error saving user profile:', e);
      return false;
    }
  }

  // Get analytics data
  function getAnalytics() {
    try {
      const stored = localStorage.getItem('userAnalytics');
      return stored ? JSON.parse(stored) : null;
    } catch (e) {
      return null;
    }
  }

  // Save analytics data
  function saveAnalytics(analytics) {
    try {
      localStorage.setItem('userAnalytics', JSON.stringify(analytics));
      return true;
    } catch (e) {
      console.error('Error saving analytics:', e);
      return false;
    }
  }

  // Track a page view or feature usage
  function trackUsage(type, details = {}) {
    const analytics = getAnalytics() || {
      userId: null,
      firstVisit: null,
      lastVisit: null,
      pageViews: 0,
      features: {}
    };

    const profile = getUserProfile();
    if (profile) {
      analytics.userId = profile.userId;
    }

    const now = new Date().toISOString();
    if (!analytics.firstVisit) {
      analytics.firstVisit = now;
    }
    analytics.lastVisit = now;

    if (type === 'pageView') {
      analytics.pageViews = (analytics.pageViews || 0) + 1;
    } else if (type === 'feature') {
      const featureName = details.feature || 'unknown';
      if (!analytics.features[featureName]) {
        analytics.features[featureName] = { count: 0, lastUsed: null };
      }
      analytics.features[featureName].count++;
      analytics.features[featureName].lastUsed = now;
    }

    saveAnalytics(analytics);
  }

  // Check if birth date matches any custom message condition
  function getCustomMessage(birthDate) {
    if (!birthDate) return null;

    // Parse date string (YYYY-MM-DD format from date input)
    // Use UTC to avoid timezone issues
    const dateStr = birthDate.split('T')[0]; // Remove time if present
    const [year, monthStr, dayStr] = dateStr.split('-');
    const month = parseInt(monthStr, 10) - 1; // Convert to 0-indexed (1-12 -> 0-11)
    const day = parseInt(dayStr, 10);

    console.log('🔍 getCustomMessage Debug:', { birthDate, dateStr, month, day, monthStr, dayStr });

    for (const customMsg of CUSTOM_MESSAGES) {
      if (customMsg.month === month && customMsg.day === day) {
        return customMsg.message;
      }
    }

    return null;
  }

  // Check if custom message banner was dismissed
  function isCustomMessageDismissed(messageKey) {
    try {
      const dismissed = localStorage.getItem('dismissedMessages');
      if (!dismissed) return false;
      const dismissedList = JSON.parse(dismissed);
      return dismissedList.includes(messageKey);
    } catch (e) {
      return false;
    }
  }

  // Mark custom message as dismissed
  function dismissCustomMessage(messageKey) {
    try {
      const dismissed = localStorage.getItem('dismissedMessages');
      let dismissedList = dismissed ? JSON.parse(dismissed) : [];
      if (!dismissedList.includes(messageKey)) {
        dismissedList.push(messageKey);
        localStorage.setItem('dismissedMessages', JSON.stringify(dismissedList));
      }
      return true;
    } catch (e) {
      console.error('Error dismissing message:', e);
      return false;
    }
  }

  // Show first visit modal
  function showFirstVisitModal() {
    const modal = document.createElement('div');
    modal.id = 'firstVisitModal';
    modal.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(0, 0, 0, 0.8);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 10000;
      padding: 20px;
    `;

    modal.innerHTML = `
      <div style="
        background: var(--card-bg, #1a1a2e);
        border-radius: 12px;
        padding: 2rem;
        max-width: 500px;
        width: 100%;
        box-shadow: 0 10px 40px rgba(0, 0, 0, 0.5);
        border: 1px solid var(--border, #2d2d44);
      ">
        <h2 style="
          color: white;
          margin: 0 0 1.5rem 0;
          font-size: 1.5rem;
          font-weight: 700;
        ">Welcome! 👋</h2>
        <p style="
          color: rgba(255, 255, 255, 0.8);
          margin: 0 0 1.5rem 0;
          line-height: 1.6;
        ">To personalize your experience, please enter your information:</p>
        
        <div style="margin-bottom: 1rem;">
          <label style="
            display: block;
            color: white;
            margin-bottom: 0.5rem;
            font-weight: 500;
          ">Name (optional)</label>
          <input 
            type="text" 
            id="userNameInput"
            placeholder="Enter your name"
            style="
              width: 100%;
              padding: 0.75rem;
              border: 1px solid var(--border, #2d2d44);
              border-radius: 6px;
              background: var(--muted-bg, #252538);
              color: white;
              font-size: 1rem;
              box-sizing: border-box;
            "
          />
        </div>

        <div style="margin-bottom: 1.5rem;">
          <label style="
            display: block;
            color: white;
            margin-bottom: 0.5rem;
            font-weight: 500;
          ">Birth Date <span style="color: #ff6b6b;">*</span></label>
          <input 
            type="date" 
            id="userBirthDateInput"
            required
            style="
              width: 100%;
              padding: 0.75rem;
              border: 1px solid var(--border, #2d2d44);
              border-radius: 6px;
              background: var(--muted-bg, #252538);
              color: white;
              font-size: 1rem;
              box-sizing: border-box;
            "
          />
        </div>

        <div style="
          display: flex;
          gap: 1rem;
          justify-content: flex-end;
        ">
          <button 
            id="submitUserInfoBtn"
            style="
              background: var(--primary, #10b981);
              color: white;
              border: none;
              padding: 0.75rem 1.5rem;
              border-radius: 6px;
              font-weight: 600;
              cursor: pointer;
              font-size: 1rem;
            "
          >Continue</button>
        </div>
      </div>
    `;

    document.body.appendChild(modal);

    // Handle form submission
    const submitBtn = modal.querySelector('#submitUserInfoBtn');
    const nameInput = modal.querySelector('#userNameInput');
    const birthDateInput = modal.querySelector('#userBirthDateInput');

    submitBtn.addEventListener('click', () => {
      const name = nameInput.value.trim() || 'User';
      const birthDate = birthDateInput.value;

      if (!birthDate) {
        alert('Please enter your birth date');
        return;
      }

      // Create user profile
      const userId = generateUserId(name, birthDate);
      const profile = {
        name: name,
        birthDate: birthDate,
        userId: userId,
        firstVisitDate: new Date().toISOString()
      };

      // Save profile
      if (saveUserProfile(profile)) {
        // Track initial login
        trackUsage('pageView');
        
        // Remove modal
        modal.remove();
        
        // Update app title
        updateAppTitle(name);
        
        // Check for custom message
        checkAndShowCustomMessage(birthDate);
      } else {
        alert('Error saving your information. Please try again.');
      }
    });

    // Allow Enter key to submit
    birthDateInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        submitBtn.click();
      }
    });
  }

  // Update app title with user's name
  function updateAppTitle(name) {
    if (!name || name === 'User') {
      return; // Keep default title
    }

    // Update header title - wait for DOM to be ready
    function updateTitleElement() {
      const headerTitle = document.querySelector('.brand h1');
      if (headerTitle) {
        headerTitle.innerHTML = `${name}'s Financial Manager <span class="tag">V5</span>`;
      } else {
        // Retry if element not found yet
        setTimeout(updateTitleElement, 100);
      }
    }
    updateTitleElement();

    // Update page title
    document.title = `${name}'s Financial Manager`;
  }

  // Check and show custom message if applicable
  function checkAndShowCustomMessage(birthDate) {
    const customMessage = getCustomMessage(birthDate);
    if (!customMessage) return;

    // Create message key from birth date
    const date = new Date(birthDate);
    const messageKey = `msg_${date.getMonth()}_${date.getDate()}`;

    // Check if already dismissed
    if (isCustomMessageDismissed(messageKey)) return;

    // Show banner
    showCustomMessageBanner(customMessage, messageKey);
  }

  // Show custom message banner
  function showCustomMessageBanner(message, messageKey) {
    const banner = document.createElement('div');
    banner.id = 'customMessageBanner';
    banner.style.cssText = `
      position: fixed;
      top: 80px;
      left: 50%;
      transform: translateX(-50%);
      background: linear-gradient(135deg, var(--primary, #10b981) 0%, #059669 100%);
      color: white;
      padding: 1rem 1.5rem;
      border-radius: 8px;
      box-shadow: 0 4px 20px rgba(16, 185, 129, 0.3);
      z-index: 9999;
      max-width: 90%;
      display: flex;
      align-items: center;
      gap: 1rem;
      animation: slideDown 0.3s ease-out;
    `;

    // Add animation
    const style = document.createElement('style');
    style.textContent = `
      @keyframes slideDown {
        from {
          opacity: 0;
          transform: translateX(-50%) translateY(-20px);
        }
        to {
          opacity: 1;
          transform: translateX(-50%) translateY(0);
        }
      }
    `;
    document.head.appendChild(style);

    banner.innerHTML = `
      <span style="flex: 1; font-weight: 500;">${message}</span>
      <button 
        id="dismissMessageBtn"
        style="
          background: rgba(255, 255, 255, 0.2);
          border: none;
          color: white;
          padding: 0.5rem 1rem;
          border-radius: 6px;
          cursor: pointer;
          font-weight: 600;
          transition: background 0.2s;
        "
        onmouseover="this.style.background='rgba(255,255,255,0.3)'"
        onmouseout="this.style.background='rgba(255,255,255,0.2)'"
      >✕</button>
    `;

    document.body.appendChild(banner);

    // Handle dismiss
    const dismissBtn = banner.querySelector('#dismissMessageBtn');
    dismissBtn.addEventListener('click', () => {
      dismissCustomMessage(messageKey);
      banner.style.animation = 'slideDown 0.3s ease-out reverse';
      setTimeout(() => banner.remove(), 300);
    });

    // Auto-dismiss after 10 seconds (optional)
    setTimeout(() => {
      if (banner.parentNode) {
        dismissCustomMessage(messageKey);
        banner.style.animation = 'slideDown 0.3s ease-out reverse';
        setTimeout(() => banner.remove(), 300);
      }
    }, 10000);
  }

  // Initialize user profile system
  function initUserProfile() {
    const profile = getUserProfile();

    if (!profile) {
      // First visit - show modal
      showFirstVisitModal();
    } else {
      // Returning user - update title and check for custom message
      updateAppTitle(profile.name);
      
      // Track page view
      trackUsage('pageView');
      
      // Check for custom message (only show once per day)
      const today = new Date().toISOString().slice(0, 10);
      const lastMessageDate = localStorage.getItem('lastCustomMessageDate');
      if (lastMessageDate !== today) {
        checkAndShowCustomMessage(profile.birthDate);
        localStorage.setItem('lastCustomMessageDate', today);
      }
    }
  }

  // Track feature usage (call this from other parts of the app)
  function trackFeature(featureName) {
    trackUsage('feature', { feature: featureName });
  }

  // Get user profile (for use in other modules)
  function getCurrentUserProfile() {
    return getUserProfile();
  }

  // Get analytics summary (for display in Settings)
  function getAnalyticsSummary() {
    const analytics = getAnalytics();
    const profile = getUserProfile();

    if (!analytics || !profile) {
      return null;
    }

    return {
      userId: analytics.userId,
      name: profile.name,
      birthDate: profile.birthDate,
      firstVisit: analytics.firstVisit,
      lastVisit: analytics.lastVisit,
      totalPageViews: analytics.pageViews || 0,
      featuresUsed: Object.keys(analytics.features || {}).length,
      featureDetails: analytics.features || {}
    };
  }

  // Update user profile (for Settings page)
  function updateUserProfile(updates) {
    const profile = getUserProfile();
    if (!profile) return false;

    if (updates.name !== undefined) {
      profile.name = updates.name;
      updateAppTitle(updates.name);
    }

    if (updates.birthDate !== undefined) {
      profile.birthDate = updates.birthDate;
      // Regenerate user ID if birth date changes
      profile.userId = generateUserId(profile.name, updates.birthDate);
      
      // Check for custom message when birth date changes
      // Clear the dismissal so message can show again
      const date = new Date(updates.birthDate);
      const messageKey = `msg_${date.getMonth()}_${date.getDate()}`;
      // Remove from dismissed list if it exists
      try {
        const dismissed = localStorage.getItem('dismissedMessages');
        if (dismissed) {
          let dismissedList = JSON.parse(dismissed);
          dismissedList = dismissedList.filter(key => key !== messageKey);
          localStorage.setItem('dismissedMessages', JSON.stringify(dismissedList));
        }
      } catch (e) {
        // Ignore errors
      }
    }

    return saveUserProfile(profile);
  }

  // Preview custom message for a given birth date (for testing)
  function previewCustomMessage(birthDate) {
    if (!birthDate) {
      const profile = getUserProfile();
      if (!profile || !profile.birthDate) {
        alert('Please enter a birth date first');
        return;
      }
      birthDate = profile.birthDate;
    }
    
    // Parse date string directly to avoid timezone issues
    const dateStr = birthDate.split('T')[0]; // Remove time if present
    const [year, monthStr, dayStr] = dateStr.split('-');
    const month = parseInt(monthStr, 10) - 1; // Convert to 0-indexed (1-12 -> 0-11)
    const day = parseInt(dayStr, 10);
    
    // Debug logging
    console.log('🔍 Preview Custom Message Debug:');
    console.log('  Birth Date:', birthDate);
    console.log('  Parsed Month (0-indexed):', month, `(${month === 9 ? 'October' : 'NOT October'})`);
    console.log('  Parsed Day:', day);
    console.log('  CUSTOM_MESSAGES:', CUSTOM_MESSAGES);
    
    const customMessage = getCustomMessage(birthDate);
    console.log('  Found Message:', customMessage);
    
    if (customMessage) {
      // Clear dismissal to show message
      const messageKey = `msg_${month}_${day}`;
      try {
        const dismissed = localStorage.getItem('dismissedMessages');
        if (dismissed) {
          let dismissedList = JSON.parse(dismissed);
          dismissedList = dismissedList.filter(key => key !== messageKey);
          localStorage.setItem('dismissedMessages', JSON.stringify(dismissedList));
          console.log('  Cleared dismissal for:', messageKey);
        }
      } catch (e) {
        console.error('Error clearing dismissal:', e);
      }
      
      // Remove any existing banner first
      const existingBanner = document.getElementById('customMessageBanner');
      if (existingBanner) {
        existingBanner.remove();
      }
      
      // Show the message
      console.log('  Showing message banner...');
      showCustomMessageBanner(customMessage, messageKey);
    } else {
      alert(`No custom message configured for birth date: ${birthDate}\n\nMonth: ${month} (${month === 9 ? 'October' : 'NOT October'}), Day: ${day}\n\nTo add one, edit the CUSTOM_MESSAGES array in user-profile.js`);
    }
  }

  // Export public API
  window.UserProfile = {
    init: initUserProfile,
    trackFeature: trackFeature,
    getProfile: getCurrentUserProfile,
    getAnalytics: getAnalyticsSummary,
    updateProfile: updateUserProfile,
    previewMessage: previewCustomMessage,
    // For testing/debugging
    _getCustomMessage: getCustomMessage
  };

  // Auto-initialize when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initUserProfile);
  } else {
    // DOM already loaded
    initUserProfile();
  }
})();

