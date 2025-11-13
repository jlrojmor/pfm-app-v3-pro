/**
 * Text Extraction Module for Statement Ingestion V2
 * 
 * Handles extraction of text from various file formats:
 * - PDF (text and image-based)
 * - CSV/TSV
 * - OFX/QFX
 * - Images (JPEG/PNG)
 */

import { ExtractionContext } from './types';

export interface TextExtractionResult {
  text: string;
  method: 'pdf-text' | 'pdf-image' | 'csv' | 'ofx' | 'image-ocr' | 'raw-text';
  confidence: number;
  metadata?: {
    pageCount?: number;
    language?: string;
    encoding?: string;
  };
}

/**
 * Main text extraction function
 */
export async function extractText(file: File, context?: Partial<ExtractionContext>): Promise<TextExtractionResult> {
  const fileType = detectFileType(file);
  
  try {
    switch (fileType) {
      case 'pdf':
        return await extractFromPDF(file);
      case 'csv':
        return await extractFromCSV(file);
      case 'ofx':
        return await extractFromOFX(file);
      case 'image':
        return await extractFromImage(file);
      default:
        return await extractAsText(file);
    }
  } catch (error) {
    console.error('Text extraction failed:', error);
    throw new Error(`Failed to extract text from ${fileType} file: ${error.message}`);
  }
}

/**
 * Detect file type from file object
 */
function detectFileType(file: File): 'pdf' | 'csv' | 'ofx' | 'image' | 'text' {
  const name = file.name.toLowerCase();
  const type = file.type.toLowerCase();
  
  if (type === 'application/pdf' || name.endsWith('.pdf')) {
    return 'pdf';
  }
  
  if (type === 'text/csv' || name.endsWith('.csv') || name.endsWith('.tsv')) {
    return 'csv';
  }
  
  if (name.endsWith('.ofx') || name.endsWith('.qfx')) {
    return 'ofx';
  }
  
  if (type.startsWith('image/') || name.match(/\.(jpg|jpeg|png|gif|bmp)$/)) {
    return 'image';
  }
  
  return 'text';
}

/**
 * Extract text from PDF files
 */
async function extractFromPDF(file: File): Promise<TextExtractionResult> {
  // Try PDF.js first for text-based PDFs
  try {
    if (typeof window !== 'undefined' && window.pdfjsLib) {
      return await extractFromPDFWithPDFJS(file);
    }
  } catch (error) {
    console.log('PDF.js extraction failed, trying fallback:', error);
  }
  
  // Fallback: try to load PDF.js dynamically
  try {
    await loadPDFJS();
    return await extractFromPDFWithPDFJS(file);
  } catch (error) {
    console.log('PDF.js not available, using image OCR fallback');
    return await extractFromImage(file); // Treat as image
  }
}

/**
 * Extract text using PDF.js
 */
async function extractFromPDFWithPDFJS(file: File): Promise<TextExtractionResult> {
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await window.pdfjsLib.getDocument(arrayBuffer).promise;
  
  let fullText = '';
  
  // Extract text from all pages
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const textContent = await page.getTextContent();
    const pageText = textContent.items.map(item => item.str).join(' ');
    fullText += pageText + '\n';
  }
  
  // Check if we got meaningful text
  if (fullText.trim().length < 50) {
    throw new Error('PDF appears to be image-based, no extractable text found');
  }
  
  return {
    text: fullText,
    method: 'pdf-text',
    confidence: 0.95,
    metadata: {
      pageCount: pdf.numPages,
      language: detectLanguage(fullText)
    }
  };
}

/**
 * Extract text from CSV files
 */
async function extractFromCSV(file: File): Promise<TextExtractionResult> {
  const text = await file.text();
  
  // Convert CSV to readable text format
  const lines = text.split('\n');
  const csvText = lines
    .filter(line => line.trim())
    .map(line => line.replace(/,/g, ' | '))
    .join('\n');
  
  return {
    text: csvText,
    method: 'csv',
    confidence: 0.90,
    metadata: {
      language: detectLanguage(csvText)
    }
  };
}

/**
 * Extract text from OFX files
 */
async function extractFromOFX(file: File): Promise<TextExtractionResult> {
  const text = await file.text();
  
  // Parse OFX structure and extract relevant text
  const ofxText = parseOFXToText(text);
  
  return {
    text: ofxText,
    method: 'ofx',
    confidence: 0.85,
    metadata: {
      language: detectLanguage(ofxText)
    }
  };
}

/**
 * Extract text from images using OCR
 */
async function extractFromImage(file: File): Promise<TextExtractionResult> {
  // Try Tesseract.js if available
  try {
    if (typeof window !== 'undefined' && window.Tesseract) {
      return await extractFromImageWithTesseract(file);
    }
  } catch (error) {
    console.log('Tesseract not available:', error);
  }
  
  // Fallback: try to load Tesseract dynamically
  try {
    await loadTesseract();
    return await extractFromImageWithTesseract(file);
  } catch (error) {
    throw new Error('OCR not available for image extraction');
  }
}

/**
 * Extract text using Tesseract.js OCR
 */
async function extractFromImageWithTesseract(file: File): Promise<TextExtractionResult> {
  const { createWorker } = window.Tesseract;
  const worker = createWorker();
  
  await worker.load();
  await worker.loadLanguage('eng+spa'); // English + Spanish
  await worker.initialize('eng+spa');
  
  const { data: { text, confidence } } = await worker.recognize(file);
  await worker.terminate();
  
  return {
    text,
    method: 'image-ocr',
    confidence: confidence / 100, // Convert to 0-1 scale
    metadata: {
      language: detectLanguage(text)
    }
  };
}

/**
 * Extract text from plain text files
 */
async function extractAsText(file: File): Promise<TextExtractionResult> {
  const text = await file.text();
  
  return {
    text,
    method: 'raw-text',
    confidence: 0.95,
    metadata: {
      language: detectLanguage(text)
    }
  };
}

/**
 * Parse OFX structure to readable text
 */
function parseOFXToText(ofxContent: string): string {
  // Extract key OFX tags and convert to readable format
  const tags = [
    'DTPOSTED', 'TRNAMT', 'NAME', 'MEMO', 'BALAMT', 'DTSTART', 'DTEND',
    'PAYMENTDUE', 'MINPAYMENT', 'CREDITLIMIT', 'AVAILABLEBAL'
  ];
  
  const extracted: string[] = [];
  
  for (const tag of tags) {
    const regex = new RegExp(`<${tag}>([^<]*)</${tag}>`, 'gi');
    const matches = ofxContent.match(regex);
    if (matches) {
      matches.forEach(match => {
        const value = match.replace(new RegExp(`</?${tag}>`, 'gi'), '');
        if (value.trim()) {
          extracted.push(`${tag}: ${value.trim()}`);
        }
      });
    }
  }
  
  return extracted.join('\n');
}

/**
 * Detect language from text
 */
function detectLanguage(text: string): string {
  // Simple language detection based on common words
  const spanishWords = ['saldo', 'pago', 'fecha', 'mínimo', 'intereses', 'comisiones'];
  const englishWords = ['balance', 'payment', 'date', 'minimum', 'interest', 'fees'];
  
  const lowerText = text.toLowerCase();
  
  const spanishCount = spanishWords.reduce((count, word) => 
    count + (lowerText.includes(word) ? 1 : 0), 0);
  const englishCount = englishWords.reduce((count, word) => 
    count + (lowerText.includes(word) ? 1 : 0), 0);
  
  return spanishCount > englishCount ? 'es' : 'en';
}

/**
 * Load PDF.js library dynamically
 */
async function loadPDFJS(): Promise<void> {
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

/**
 * Load Tesseract.js library dynamically
 */
async function loadTesseract(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (window.Tesseract) {
      resolve();
      return;
    }
    
    const script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js';
    script.onload = () => resolve();
    script.onerror = reject;
    document.head.appendChild(script);
  });
}

// Type declarations for external libraries
declare global {
  interface Window {
    pdfjsLib?: any;
    Tesseract?: any;
  }
}


