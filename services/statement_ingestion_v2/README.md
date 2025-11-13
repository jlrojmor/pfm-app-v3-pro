# Statement Ingestion V2

Universal credit card statement ingestion pipeline that works across issuers, languages, and file formats.

## Features

- **Multi-format Support**: PDF (text & image), CSV, OFX, Images (JPEG/PNG)
- **Multi-language**: English and Spanish with automatic detection
- **Multi-issuer**: Chase, Amex, Bank of America, Wells Fargo, Citi, and more
- **Intelligent Extraction**: Balance, dates, payments, fees, installments, APRs
- **Confidence Scoring**: Per-field confidence with overall quality assessment
- **User Confirmation**: Editable confirmation modal for uncertain extractions
- **Installment Detection**: Both explicit sections and inferred from patterns
- **Balance Validation**: Mathematical consistency checks

## Quick Start

```javascript
import { ingestStatement } from './services/statement_ingestion_v2/index.js';

// Process a statement file
const result = await ingestStatement(file, cardId);

if (result.success) {
  console.log('Extracted data:', result.data);
  console.log('Confidence:', result.data.confidenceByField);
  console.log('Warnings:', result.warnings);
}
```

## Architecture

### Core Modules

1. **`ingest.ts`** - Main orchestration pipeline
2. **`extract_text.ts`** - Text extraction from various file formats
3. **`normalize.ts`** - Text cleaning and normalization
4. **`detect_templates.ts`** - Issuer and language detection
5. **`extract_fields.ts`** - Financial field extraction with regex patterns
6. **`extract_installments.ts`** - Installment plan detection and inference
7. **`confidence.ts`** - Confidence scoring and validation
8. **`utils.ts`** - Utility functions for parsing and validation

### Data Flow

```
File Upload → Text Extraction → Normalization → Template Detection
     ↓
Field Extraction → Installment Detection → Confidence Analysis
     ↓
User Confirmation (if needed) → Apply to Credit Card Engine
```

## Supported Fields

### Required Fields
- `statementBalance` - Current/new balance
- `minimumDue` - Minimum payment required
- `paymentDueDate` - When payment is due

### Optional Fields
- `previousBalance` - Balance from previous statement
- `paymentsAndCredits` - Payments made during period
- `purchases` - New charges
- `fees` - Annual, late, service fees
- `interest` - Finance charges
- `creditLimit` - Card credit limit
- `availableCredit` - Remaining available credit
- `statementPeriodEnd` - Statement closing date
- `closingDay` - Day of month when cycle closes

### Advanced Fields
- `aprPurchase` - Purchase APR
- `aprCash` - Cash advance APR
- `aprInstallment` - Installment APR
- `installmentPlans[]` - Array of payment plans

## Confidence Scoring

Each extracted field receives a confidence score (0-1):

- **0.95+ (High)**: Exact pattern match in labeled section
- **0.80+ (Good)**: Generic regex match near known sections
- **0.60+ (Fair)**: Inferred from context or arithmetic
- **<0.60 (Low)**: Uncertain extraction, user review recommended

## Installation Requirements

The system uses these external libraries (loaded dynamically):

```javascript
// PDF processing
"pdfjs-dist": "^4.5.0"

// OCR for image-based PDFs
"tesseract.js": "^5.0.0"

// CSV parsing
"csv-parse": "^5.5.6"

// OFX parsing
"ofx-js": "^2.0.0"
```

## Usage Examples

### Basic Usage

```javascript
// Upload a statement file
const file = document.getElementById('statement-file').files[0];
const result = await ingestStatement(file, 'card-123');

if (result.success) {
  // Show confirmation modal
  showStatementConfirmModal({
    statement: result.data,
    cardId: 'card-123',
    onApply: async (confirmedStatement) => {
      // Apply to credit card engine
      await applyStatementToCard('card-123', confirmedStatement);
    },
    onCancel: () => {
      console.log('User cancelled');
    }
  });
}
```

### Testing

```javascript
// Run basic tests in browser console
window.runStatementIngestionV2Tests();

// Test specific extraction
window.debugPDFContent("Nuevo Saldo: $2,074.43\nPago Mínimo: $45.00");
```

## Supported Issuers

### US Banks
- American Express (Plan It, Flex Pay)
- Chase (Freedom, Sapphire, Spanish format)
- Bank of America (Merrill Lynch)
- Wells Fargo
- Citi (Double Cash)
- Capital One (Quicksilver, Venture)
- Discover (It cards)
- HSBC, PNC, US Bank

### International Banks
- Santander (US & Mexico)
- BBVA (US & Mexico)
- Scotiabank
- Banorte (Mexico)
- Liverpool (Mexico)

## Pattern Examples

### Balance Extraction
```javascript
// English
"New Balance: $2,074.43"
"Current Balance: $1,500.00"

// Spanish
"Nuevo Saldo: $2,074.43"
"Saldo al Corte: $1,500.00"
```

### Date Extraction
```javascript
// English
"Payment Due Date: November 25, 2024"
"Statement Date: October 31, 2024"

// Spanish
"Fecha de Vencim. del Pago: 11/02/2025"
"Fecha de Corte: 31/10/2024"
```

### Installment Plans
```javascript
// Explicit sections
"PLAN IT
Plan It Laptop Purchase
Monthly Payment: $200.00
Remaining Payments: 8"

// Inferred from transactions
"LAPTOP PURCHASE PLAN IT 200.00" (repeated monthly)
```

## Error Handling

The system gracefully handles:

- **Corrupted files**: Returns error with specific message
- **Unsupported formats**: Attempts text extraction as fallback
- **Low confidence**: Shows confirmation modal for user review
- **Missing fields**: Uses safe defaults and estimates
- **Balance mismatches**: Warns user but allows override

## Performance

- **Small PDFs (<1MB)**: ~2-3 seconds
- **Large PDFs (5-10MB)**: ~5-10 seconds
- **Image OCR**: ~10-15 seconds
- **CSV/OFX**: <1 second

## Browser Compatibility

- **Modern browsers**: Full support with dynamic imports
- **PDF.js**: Requires ES6+ support
- **Tesseract.js**: Requires WebAssembly support
- **Fallback**: Legacy parsing for older browsers

## Security

- **Local processing**: All parsing happens client-side
- **No uploads**: Files never leave the user's device
- **Privacy**: No data sent to external services
- **Validation**: All inputs sanitized and validated

## Troubleshooting

### Common Issues

1. **"PDF parsing failed"**: Try uploading as CSV or image
2. **"Low confidence"**: Review extracted data in confirmation modal
3. **"Balance mismatch"**: Check if statement includes all transactions
4. **"Installment not detected"**: May need manual entry for complex plans

### Debug Mode

```javascript
// Enable detailed logging
window.statementIngestionV2.debug = true;

// Analyze specific text
window.debugPDFContent(extractedText);
```

## Contributing

When adding new patterns or issuers:

1. Add patterns to `extract_fields.ts`
2. Add issuer detection to `detect_templates.ts`
3. Add tests to `__tests__/`
4. Update this README

## License

Part of the Personal Finance Manager application.


