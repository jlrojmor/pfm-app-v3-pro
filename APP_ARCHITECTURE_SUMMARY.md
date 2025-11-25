# Joe's Financial Manager V5 - Complete Application Architecture Summary

## Application Overview

**Joe's Financial Manager V5** is a client-side personal financial management (PFM) web application built with vanilla JavaScript. It runs entirely in the browser using IndexedDB/localStorage for data persistence, with no backend server required. The application helps users track accounts, transactions, budgets, and financial metrics across multiple currencies.

---

## Technology Stack

- **Frontend**: Vanilla JavaScript (ES6+), HTML5, CSS3
- **Storage**: IndexedDB (primary) with localStorage fallback
- **Libraries**:
  - Chart.js (v4.4.1) - Data visualization
  - jsPDF (v2.5.1) - PDF generation
  - XLSX (v0.18.5) - Excel import/export
  - html2canvas - Screenshot capture for PDFs
- **Architecture**: Single Page Application (SPA) with hash-based routing
- **Build**: No build step required - runs directly in browser

---

## Application Structure

### File Organization

```
pfm-app-v3-pro/
├── index.html              # Main HTML entry point
├── css/
│   └── styles.css         # Application styles
├── js/
│   ├── app.js             # Application bootstrap & CC Engine init
│   ├── database.js        # IndexedDB/localStorage abstraction
│   ├── state.js           # Application state management
│   ├── utils.js           # Utility functions (FX rates, formatting, etc.)
│   ├── ui.js              # UI rendering functions (all pages)
│   ├── router.js          # Hash-based routing
│   ├── validation.js      # Form validation
│   ├── charts.js          # Chart rendering
│   ├── pdf.js             # PDF export
│   ├── excel.js           # Excel import/export
│   └── [other modules]
├── services/
│   ├── creditcards/       # Credit Card Engine (TypeScript)
│   ├── statement_ingestion_v2/  # Statement parsing
│   └── cards_convergent/  # Convergent card system
└── ui/
    ├── creditcards/       # CC Engine UI adapters
    └── cards_convergent/  # Convergent UI components
```

---

## Core Data Models

### 1. Application State (`AppState.State`)

The application maintains in-memory state with the following collections:

```javascript
{
  accounts: [],        // Financial accounts (checking, savings, credit cards)
  categories: [],      // Expense/income categories (hierarchical)
  transactions: [],    // All financial transactions
  budgets: [],         // Budget series (recurring budgets)
  snapshots: [],       // Net worth snapshots over time
  fxRates: [],         // Cached exchange rates
  settings: {          // User preferences
    fiscalStartDay: 1,
    preferredCurrency: 'USD',
    dateFormat: 'US',
    numberFormat: 'US',
    // ... API keys, manual FX rates, etc.
  }
}
```

### 2. Account Model

```javascript
{
  id: string,                    // UUID
  name: string,                 // Account name
  accountType: string,          // 'checking' | 'savings' | 'credit-card' | 'investment'
  currency: string,              // 'USD' | 'MXN' | etc.
  country: string,              // 'USA' | 'MEX' | etc.
  balanceAsOfAmount: number,    // Last known balance
  balanceAsOfDate: string,      // Date of last balance (YYYY-MM-DD)
  creditLimit: number,          // For credit cards
  nextClosingDate: string,      // Next billing cycle close
  paymentDueDate: string,       // Payment due date
  last4: string,                // Last 4 digits of account/card
  debitCards: []                // Sub-items for checking accounts
}
```

### 3. Transaction Model

```javascript
{
  id: string,                   // UUID
  date: string,                 // YYYY-MM-DD
  transactionType: string,      // 'Expense' | 'Income' | 'Transfer' | 'Credit Card Payment'
  amount: number,               // Original amount in transaction currency
  currency: string,             // Original currency ('USD', 'MXN', etc.)
  fxRate: number,               // Exchange rate used (legacy)
  
  // FROZEN AMOUNTS (calculated at save time, never change)
  amountUSD: number,            // USD equivalent at transaction date
  amountPreferred: number,      // Preferred currency equivalent at transaction date
  preferredCurrencyAtSave: string, // Which preferred currency was active when saved
  
  // Account references
  fromAccountId: string,        // Source account
  toAccountId: string,          // Destination account (for transfers/payments)
  categoryId: string,           // Category ID
  
  description: string,          // Transaction description
  
  // Credit card deferred payment fields
  isDeferred: boolean,
  deferredMonths: number,
  monthlyPaymentAmount: number,
  remainingMonths: number,
  
  // Recurrent payment fields
  isRecurrent: boolean,
  recurrentDayOfMonth: number,  // 1-31
  recurrentDisabled: boolean
}
```

### 4. Budget Model

```javascript
{
  id: string,
  type: string,                 // 'expense' | 'income'
  categoryId: string,
  amount: number,
  currency: string,             // 'USD' | 'MXN'
  fxRate: number,               // USD per MXN if currency is MXN
  cadence: string,              // 'monthly' | 'semimonthly' | 'biweekly' | 'weekly' | 'bimonthly'
  anchorDate: string,           // YYYY-MM-DD - controls repeat alignment
  repeatUntil: string,          // YYYY-MM-DD | '' (empty = forever)
  createdAt: string
}
```

### 5. FX Rate Model

```javascript
{
  date: string,                 // YYYY-MM-DD
  from: string,                 // Source currency
  to: string,                   // Target currency
  rate: number,                 // Exchange rate
  isFallback: boolean,           // true if API failed and fallback used
  // Legacy support
  usdPerMXN?: number            // For MXN->USD conversions
}
```

### 6. Category Model (Hierarchical)

```javascript
{
  id: string,
  name: string,
  type: string,                 // 'expense' | 'income'
  parentCategoryId: string      // '' for top-level categories
}
```

---

## Application Pages/Features

### 1. Dashboard (`#/dashboard`)
- **Purpose**: Overview of financial health
- **Features**:
  - Key Performance Indicators (KPIs): Total Income, Total Expenses, Net Cash Flow
  - Largest expense and top category
  - Average daily spending
  - Transaction count
  - Cash flow chart (income vs expenses)
  - Spending by category pie chart
  - Income by category pie chart
  - Date range filtering

### 2. Accounts (`#/accounts`)
- **Purpose**: Manage financial accounts
- **Features**:
  - List all accounts (checking, savings, credit cards, investments)
  - Add/edit/delete accounts
  - Set account balances and dates
  - Credit card specific fields (closing dates, due dates, credit limits)
  - Debit card management (sub-items of checking accounts)
  - Account currency selection
  - Balance tracking

### 3. Transactions (`#/transactions`)
- **Purpose**: Record and manage all financial transactions
- **Features**:
  - Quick Add form (left panel)
  - Transaction History list (right panel)
  - Transaction types: Expense, Income, Transfer, Credit Card Payment
  - Multi-currency support with automatic FX conversion
  - Category assignment
  - Account linking (from/to accounts)
  - Recurrent payment setup (monthly recurring)
  - Credit card deferred payment tracking
  - Bulk operations (select, delete, export)
  - Filtering (date range, type, amount, account, category)
  - Sorting (date, amount, description)
  - Edit/Copy/Delete individual transactions
  - Monthly summaries (Income, Expenses, Net)

### 4. Budget (`#/budget`)
- **Purpose**: Create and track budgets
- **Features**:
  - Budget vs Actual (BVA) analysis
  - Create budget series (recurring budgets)
  - Budget types: Expense, Income
  - Cadence options: Monthly, Semimonthly, Biweekly, Weekly, Bimonthly
  - Monthly view with variance calculations
  - Series view (all budget series)
  - Category-based budgeting
  - Multi-currency support
  - Anchor date for repeat alignment
  - Repeat until date (optional end date)

### 5. Categories (`#/categories`)
- **Purpose**: Manage expense and income categories
- **Features**:
  - Hierarchical category structure (parent/child)
  - Default categories pre-populated
  - Add/edit/delete categories
  - Category types: Expense, Income
  - Visual tree structure

### 6. Account Overview (`#/overview`)
- **Purpose**: Detailed view of individual accounts
- **Features**:
  - Account selection dropdown
  - Current balance display
  - Transaction list for selected account
  - Balance calculation (starting balance + transaction deltas)
  - Account-specific filtering

### 7. Net Worth (`#/networth`)
- **Purpose**: Track net worth over time
- **Features**:
  - Net worth calculation (all assets - all liabilities)
  - Snapshot creation (save net worth at specific date)
  - Net worth chart over time
  - Account breakdown
  - Historical tracking

### 8. Reports (`#/reports`)
- **Purpose**: Generate financial reports
- **Features**:
  - Date range selection
  - Export to PDF
  - Export to Excel
  - Cash flow reports
  - Category spending reports
  - Transaction lists

### 9. Settings (`#/settings`)
- **Purpose**: Application configuration
- **Features**:
  - Preferred currency selection (USD, MXN, EUR, GBP, CAD, AUD, COP)
  - Date format (US/MX)
  - Number format (US/MX)
  - Fiscal year start day
  - Manual FX rate override
  - API key management (multiple FX rate APIs)
  - Default transaction date mode
  - "Fix All Transaction FX Rates" button (recalculates all transactions)
  - Data export/import
  - Clear all data

---

## Exchange Rate System

### Core Concepts

1. **Preferred Currency**: User-selected currency for display (stored in `settings.preferredCurrency`)
2. **Frozen Amounts**: Transaction amounts converted to USD and preferred currency at save time, stored in transaction record, never recalculated
3. **FX Rate Caching**: Rates fetched from APIs are cached in `AppState.State.fxRates` array
4. **Fallback Rate**: Hardcoded 20 MXN/USD (0.05 USD/MXN) used when all APIs fail (marked with `isFallback: true`)

### FX Rate APIs (Tried in Order)

1. ExchangeRate.host (Free) - Primary free API
2. ExchangeRate.host (Convert endpoint)
3. Frankfurter (Free)
4. ExchangeRate-API (Latest - only for today)
5. ExchangeRatesAPI.io (Requires API key)
6. ExchangeRate-API (Historical - only for today on free tier)
7. Fixer.io (Requires API key)
8. CurrencyAPI (Requires API key)

### Key Functions

- `fetchHistoricalFXRate(from, to, date)`: Tries all APIs, returns rate or throws error
- `ensureFxRateForPair(from, to, date)`: Gets cached rate or fetches from API
- `toPreferredCurrency(amount, fromCurrency, date)`: Async conversion to preferred currency
- `toPreferredCurrencySync(amount, fromCurrency, date)`: Sync conversion (uses cache/fallback)
- `formatTransactionAmount(transaction)`: Formats transaction for display, uses frozen `amountPreferred`
- `recalculateAllTransactionAmounts()`: Recalculates all transactions with fresh API rates

### Current Issues

1. **Infinite Loop Problem**: Recalculation triggers page reload, which triggers check again
2. **Console Spam**: `formatTransactionAmount()` checks every transaction for "wrong" rates on every render
3. **Rate Detection**: Checks if `amountPreferred / amount ≈ 20` to detect fallback rates
4. **Multiple Triggers**: Both `renderTransactions()` and `formatTransactionAmount()` trigger recalculations

---

## Credit Card Engine

### Overview

A TypeScript-based system for managing credit card cycles, installment plans, statement ingestion, and payment reconciliation. Located in `services/creditcards/`.

### Features

1. **Cycle Management**: Automatic billing cycle calculations based on closing day
2. **Installment Plans**: Track deferred purchases with monthly payments
3. **Statement Ingestion**: Parse PDF, CSV, OFX, or manual entry
4. **Payment Reconciliation**: Balance verification and discrepancy detection
5. **Synthetic Transactions**: Automatic installment charge creation
6. **Balance Prediction**: Estimate balances without statements
7. **Guard System**: Data validation and sanity checks
8. **Migration Support**: Backward-compatible data migration
9. **Feature Flags**: Safe deployment and rollback

### Integration

- Initialized in `app.js` via `initializeCCEngine()`
- Hooks into transaction save/update/display pipeline
- Uses localStorage for card state (temporary, should migrate to AppState)
- UI adapters in `ui/creditcards/useCardSnapshot.ts`

### Statement Ingestion V2

Located in `services/statement_ingestion_v2/`, provides:
- PDF text extraction
- Template detection (Chase, Bank of America, etc.)
- Field extraction (dates, amounts, balances)
- Installment plan detection
- Confidence scoring

---

## Data Persistence

### Storage Layer (`database.js`)

- **Primary**: IndexedDB (database name: `pfmdb-v5`, store: `kv`)
- **Fallback**: localStorage (if IndexedDB unavailable)
- **Key Format**: `pfm:{collection}` (e.g., `pfm:transactions`, `pfm:accounts`)

### State Management (`state.js`)

- In-memory state object (`AppState.State`)
- Loads all data on app initialization
- `AppState.saveItem(collection, item, collectionKey)`: Saves individual items
- `AppState.saveAll()`: Saves entire state
- `AppState.loadAll()`: Loads all collections from storage

---

## Routing System

### Hash-Based Router (`router.js`)

- Uses browser hash (`#/route`) for navigation
- Routes defined in `routes` object mapping route names to render functions
- Active route highlighting in navigation
- Mobile tab bar support
- Default route: `dashboard`

### Routes

```javascript
{
  'dashboard': UI.renderDashboard,
  'accounts': UI.renderAccounts,
  'transactions': UI.renderTransactions,
  'budget': UI.renderBudget,
  'categories': UI.renderCategories,
  'overview': UI.renderOverview,
  'networth': UI.renderNetWorth,
  'reports': UI.renderReports,
  'settings': UI.renderSettings
}
```

---

## UI Rendering System

### Main Renderer (`ui.js`)

All page rendering functions are in `UI` object:
- `UI.renderDashboard(root)`
- `UI.renderAccounts(root)`
- `UI.renderTransactions(root)`
- `UI.renderBudget(root)`
- `UI.renderCategories(root)`
- `UI.renderOverview(root)`
- `UI.renderNetWorth(root)`
- `UI.renderReports(root)`
- `UI.renderSettings(root)`

### Template System

- HTML templates defined in `index.html` using `<template id="tpl-*">` tags
- Templates cloned and populated with data
- Event listeners attached after rendering

---

## Utility Functions (`utils.js`)

### Currency & Formatting

- `getPreferredCurrency()`: Returns user's preferred currency
- `formatMoneyPreferred(amount)`: Formats amount in preferred currency
- `formatMoney(amount, currency)`: Formats amount in specific currency
- `formatTransactionAmount(transaction)`: Formats transaction with dual currency display

### FX Rate Functions

- `fetchHistoricalFXRate(from, to, date)`: Fetches rate from APIs
- `ensureFxRateForPair(from, to, date)`: Gets or fetches rate
- `toPreferredCurrency(amount, fromCurrency, date)`: Async conversion
- `toPreferredCurrencySync(amount, fromCurrency, date)`: Sync conversion
- `recalculateAllTransactionAmounts()`: Recalculates all transactions
- `prefetchFxRatesForTransactions(transactions)`: Pre-fetches rates for date range

### Date Functions

- `todayISO()`: Returns today's date as YYYY-MM-DD
- Date formatting based on user preferences (US/MX)

### Account Functions

- `currentBalanceNative(account)`: Calculates current balance from transactions
- `creditLimitUSD(account)`: Converts credit limit to USD

### Credit Card Functions

- `calculateCreditCardPaymentDue(card, dueDate)`: Calculates payment amounts
- `calculateGracePeriod(closingDate, dueDate)`: Calculates grace period days
- `nextDueDates(account, months)`: Calculates future due dates

---

## Import/Export System

### Excel Export (`excel.js`)

- `Excel.exportAll()`: Exports all data to XLSX file
- Exports: accounts, transactions, categories, budgets, snapshots, fxRates, settings
- Uses XLSX library

### Excel Import (`excel.js`)

- `Excel.importAll(file)`: Imports data from XLSX file
- Maps account names to IDs
- Creates missing accounts/categories
- Validates data structure

### PDF Export (`pdf.js`)

- Uses jsPDF and html2canvas
- Generates reports as PDF
- Includes charts and tables

---

## Chart System (`charts.js`)

- Uses Chart.js library
- Functions:
  - `Charts.renderCashFlow(chartId, transactions, startDate, endDate)`
  - `Charts.renderPieByCategory(chartId, transactions, categories, title)`
  - Net worth charts
  - Budget vs Actual charts

---

## Validation System (`validation.js`)

- Form validation functions
- Date validation
- Amount validation
- Required field checks

---

## Application Initialization Flow

1. **HTML Loads**: `index.html` loads all script files
2. **Database Init**: `PFMDB.dbInit()` - Opens IndexedDB or falls back to localStorage
3. **State Load**: `AppState.loadAll()` - Loads all collections from storage
4. **Default Setup**: Creates default categories if none exist
5. **API Keys**: `Utils.setDefaultApiKeys()` - Sets default FX API keys
6. **Deferred Transactions**: `Utils.updateDeferredTransactionMonths()` - Updates remaining months
7. **CC Engine Init**: `initializeCCEngine()` - Initializes credit card engine
8. **Router Init**: `Router.render()` - Renders initial route (default: dashboard)

---

## Key Design Patterns

1. **Module Pattern**: All modules use IIFE (Immediately Invoked Function Expression)
2. **Singleton State**: `AppState` is a singleton managing global state
3. **Template Cloning**: HTML templates cloned and populated
4. **Event Delegation**: Event listeners attached after DOM updates
5. **Async/Await**: Modern async handling for API calls and storage
6. **Fallback Chains**: Multiple fallbacks (IndexedDB → localStorage, API → API → fallback rate)

---

## Current Known Issues

1. **FX Rate Infinite Loop**: Recalculation triggers reload, which triggers check again (partially fixed with sessionStorage flag)
2. **Console Spam**: Every transaction render checks for wrong rates
3. **CC Engine Storage**: Uses localStorage instead of AppState (temporary)
4. **Rate Detection**: Hardcoded check for rate ≈ 20 (should be more flexible)
5. **Multiple Recalculation Triggers**: Both page load and display functions trigger recalculations

---

## Browser Compatibility

- Modern browsers with IndexedDB support
- ES6+ JavaScript features required
- CDN dependencies (Chart.js, jsPDF, XLSX) - works offline after initial load

---

## Development Notes

- No build step required - edit files directly
- Version query strings on CSS/JS files for cache busting (e.g., `?v=4.1`)
- Console logging for debugging
- DEV PREVIEW build timestamp in console

---

This summary provides a complete overview of the application architecture, data models, features, and systems. Use this as a reference for understanding the codebase and making modifications.



