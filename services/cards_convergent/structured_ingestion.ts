// services/cards_convergent/structured_ingestion.ts
// CSV/OFX/QFX ingestion with high reliability

import { StructuredData } from './types';

export async function ingestStructured(file: File): Promise<StructuredData> {
  console.log('📊 Ingesting structured file:', file.name);
  
  const fileType = detectFileType(file.name);
  const text = await readFileAsText(file);
  
  switch (fileType) {
    case 'csv':
      return parseCSV(text);
    case 'ofx':
    case 'qfx':
      return parseOFX(text);
    default:
      throw new Error(`Unsupported file type: ${fileType}`);
  }
}

function detectFileType(filename: string): string {
  const ext = filename.toLowerCase().split('.').pop();
  switch (ext) {
    case 'csv':
      return 'csv';
    case 'ofx':
      return 'ofx';
    case 'qfx':
      return 'qfx';
    default:
      throw new Error(`Unknown file extension: ${ext}`);
  }
}

async function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsText(file);
  });
}

function parseCSV(text: string): StructuredData {
  console.log('📊 Parsing CSV file');
  
  const lines = text.split('\n').map(line => line.trim()).filter(line => line);
  const data: StructuredData = {
    periodStart: '',
    periodEnd: '',
    statementBalance: 0,
    minimumDue: 0,
    payments: 0,
    purchases: 0,
    fees: 0,
    interest: 0,
    aggregateInstallmentDue: undefined,
    confidence: 0.95, // High confidence for structured data
    source: 'csv',
    timestamp: new Date().toISOString()
  };
  
  // Parse CSV lines
  for (const line of lines) {
    const cells = parseCSVLine(line);
    
    // Look for common patterns
    const lineText = cells.join(' ').toLowerCase();
    
    // Statement balance patterns
    if (lineText.includes('statement balance') || lineText.includes('current balance')) {
      const amount = extractAmountFromCells(cells);
      if (amount !== null) {
        data.statementBalance = amount;
      }
    }
    
    // Minimum due patterns
    if (lineText.includes('minimum due') || lineText.includes('minimum payment')) {
      const amount = extractAmountFromCells(cells);
      if (amount !== null) {
        data.minimumDue = amount;
      }
    }
    
    // Installments due patterns
    if (lineText.includes('installments due') || lineText.includes('installment')) {
      const amount = extractAmountFromCells(cells);
      if (amount !== null) {
        data.aggregateInstallmentDue = amount;
      }
    }
    
    // Date patterns
    if (lineText.includes('statement date') || lineText.includes('period end')) {
      const date = extractDateFromCells(cells);
      if (date && !data.periodEnd) {
        data.periodEnd = date;
      }
    }
    
    if (lineText.includes('period start') || lineText.includes('billing period')) {
      const date = extractDateFromCells(cells);
      if (date && !data.periodStart) {
        data.periodStart = date;
      }
    }
    
    // Transaction categorization
    if (lineText.includes('payment') && !lineText.includes('minimum')) {
      const amount = extractAmountFromCells(cells);
      if (amount !== null && amount > 0) {
        data.payments += amount;
      }
    }
    
    if (lineText.includes('purchase') || lineText.includes('charge')) {
      const amount = extractAmountFromCells(cells);
      if (amount !== null && amount > 0) {
        data.purchases += amount;
      }
    }
    
    if (lineText.includes('fee') || lineText.includes('charge')) {
      const amount = extractAmountFromCells(cells);
      if (amount !== null && amount > 0) {
        data.fees += amount;
      }
    }
    
    if (lineText.includes('interest')) {
      const amount = extractAmountFromCells(cells);
      if (amount !== null && amount > 0) {
        data.interest += amount;
      }
    }
  }
  
  // Set default period if not found
  if (!data.periodStart || !data.periodEnd) {
    const today = new Date();
    const lastMonth = new Date(today.getFullYear(), today.getMonth() - 1, today.getDate());
    data.periodStart = lastMonth.toISOString().slice(0, 10);
    data.periodEnd = today.toISOString().slice(0, 10);
  }
  
  console.log('✅ CSV parsing complete:', data);
  return data;
}

function parseOFX(text: string): StructuredData {
  console.log('📊 Parsing OFX/QFX file');
  
  const data: StructuredData = {
    periodStart: '',
    periodEnd: '',
    statementBalance: 0,
    minimumDue: 0,
    payments: 0,
    purchases: 0,
    fees: 0,
    interest: 0,
    aggregateInstallmentDue: undefined,
    confidence: 0.95, // High confidence for structured data
    source: 'ofx',
    timestamp: new Date().toISOString()
  };
  
  // OFX parsing patterns
  const patterns = {
    statementBalance: /<BALAMT>([^<]+)<\/BALAMT>/i,
    minimumDue: /<MINPMTDUE>([^<]+)<\/MINPMTDUE>/i,
    periodStart: /<DTSTART>([^<]+)<\/DTSTART>/i,
    periodEnd: /<DTEND>([^<]+)<\/DTEND>/i,
    installmentDue: /<INSTALLMENTDUE>([^<]+)<\/INSTALLMENTDUE>/i
  };
  
  // Extract values using patterns
  for (const [field, pattern] of Object.entries(patterns)) {
    const match = text.match(pattern);
    if (match) {
      const value = match[1].trim();
      
      switch (field) {
        case 'statementBalance':
        case 'minimumDue':
        case 'installmentDue':
          const amount = parseFloat(value.replace(/[,$]/g, ''));
          if (!isNaN(amount)) {
            if (field === 'installmentDue') {
              data.aggregateInstallmentDue = amount;
            } else {
              data[field] = amount;
            }
          }
          break;
        
        case 'periodStart':
        case 'periodEnd':
          const date = parseOFXDate(value);
          if (date) {
            data[field] = date;
          }
          break;
      }
    }
  }
  
  // Parse transactions
  const transactionMatches = text.match(/<STMTTRN>[\s\S]*?<\/STMTTRN>/gi);
  if (transactionMatches) {
    for (const transaction of transactionMatches) {
      const trnType = transaction.match(/<TRNTYPE>([^<]+)<\/TRNTYPE>/i)?.[1]?.toLowerCase();
      const amount = parseFloat(transaction.match(/<TRNAMT>([^<]+)<\/TRNAMT>/i)?.[1]?.replace(/[,$]/g, '') || '0');
      
      if (!isNaN(amount)) {
        switch (trnType) {
          case 'payment':
          case 'credit':
            data.payments += Math.abs(amount);
            break;
          case 'debit':
          case 'purchase':
            data.purchases += Math.abs(amount);
            break;
          case 'fee':
            data.fees += Math.abs(amount);
            break;
          case 'interest':
            data.interest += Math.abs(amount);
            break;
        }
      }
    }
  }
  
  // Set default period if not found
  if (!data.periodStart || !data.periodEnd) {
    const today = new Date();
    const lastMonth = new Date(today.getFullYear(), today.getMonth() - 1, today.getDate());
    data.periodStart = lastMonth.toISOString().slice(0, 10);
    data.periodEnd = today.toISOString().slice(0, 10);
  }
  
  console.log('✅ OFX parsing complete:', data);
  return data;
}

function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;
  
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  
  result.push(current.trim());
  return result;
}

function extractAmountFromCells(cells: string[]): number | null {
  for (const cell of cells) {
    const amount = parseFloat(cell.replace(/[,$]/g, ''));
    if (!isNaN(amount) && amount > 0) {
      return amount;
    }
  }
  return null;
}

function extractDateFromCells(cells: string[]): string | null {
  for (const cell of cells) {
    const date = parseDateString(cell);
    if (date) {
      return date.toISOString().slice(0, 10);
    }
  }
  return null;
}

function parseDateString(dateStr: string): Date | null {
  // Handle various date formats
  const formats = [
    /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/,
    /^(\d{4})-(\d{1,2})-(\d{1,2})$/,
    /^(\d{1,2})-(\d{1,2})-(\d{4})$/
  ];
  
  for (const format of formats) {
    const match = dateStr.match(format);
    if (match) {
      let year, month, day;
      
      if (format.source.includes('\\d{4}')) {
        // YYYY-MM-DD format
        year = parseInt(match[1]);
        month = parseInt(match[2]);
        day = parseInt(match[3]);
      } else {
        // MM/DD/YYYY or MM-DD-YYYY format
        month = parseInt(match[1]);
        day = parseInt(match[2]);
        year = parseInt(match[3]);
      }
      
      const date = new Date(year, month - 1, day);
      if (!isNaN(date.getTime())) {
        return date;
      }
    }
  }
  
  return null;
}

function parseOFXDate(ofxDate: string): string | null {
  // OFX dates are typically YYYYMMDD format
  if (ofxDate.length === 8) {
    const year = ofxDate.slice(0, 4);
    const month = ofxDate.slice(4, 6);
    const day = ofxDate.slice(6, 8);
    
    const date = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
    if (!isNaN(date.getTime())) {
      return date.toISOString().slice(0, 10);
    }
  }
  
  return null;
}