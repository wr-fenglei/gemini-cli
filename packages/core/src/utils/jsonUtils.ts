/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Helper function to extract JSON from a specific position using bracket matching
 */
function extractJsonFromPosition(text: string, startIndex: number): string | null {
  const char = text[startIndex];
  if (char !== '{' && char !== '[') {
    return null;
  }
  
  const isObject = char === '{';
  const openChar = isObject ? '{' : '[';
  const closeChar = isObject ? '}' : ']';
  
  let bracketCount = 0;
  let inString = false;
  let escapeNext = false;
  
  for (let i = startIndex; i < text.length; i++) {
    const currentChar = text[i];
    
    if (escapeNext) {
      escapeNext = false;
      continue;
    }
    
    if (currentChar === '\\') {
      escapeNext = true;
      continue;
    }
    
    if (currentChar === '"' && !escapeNext) {
      inString = !inString;
      continue;
    }
    
    if (!inString) {
      if (currentChar === openChar) {
        bracketCount++;
      } else if (currentChar === closeChar) {
        bracketCount--;
        if (bracketCount === 0) {
          return text.substring(startIndex, i + 1);
        }
      }
    }
  }
  
  return null; // Unmatched brackets
}

/**
 * Extracts JSON content from text that may be wrapped in various formats.
 * Handles cases where LLM returns JSON wrapped in code blocks, with extra text, etc.
 * 
 * This function attempts multiple strategies to extract valid JSON:
 * 1. JSON wrapped in code blocks (```json or just ```)
 * 2. JSON objects/arrays within text
 * 3. Smart bracket matching
 * 4. Context-aware extraction
 * 
 * @param text The text containing JSON content
 * @returns The extracted JSON string, or the original text if no valid JSON is found
 */
export function extractJsonFromText(text: string): string {
  // Trim whitespace
  const trimmed = text.trim();
  
  // Pattern 1: JSON wrapped in code blocks (```json or just ```)
  const codeBlockPattern = /^```(?:json|JSON)?\s*\n?([\s\S]*?)\n?```$/;
  let match = trimmed.match(codeBlockPattern);
  if (match) {
    return match[1].trim();
  }
  
  // Pattern 2: JSON wrapped in code blocks with extra text around
  const codeBlockWithTextPattern = /```(?:json|JSON)?\s*\n?([\s\S]*?)\n?```/;
  match = trimmed.match(codeBlockWithTextPattern);
  if (match) {
    return match[1].trim();
  }
  
  // Pattern 3: Find JSON object/array within the text using smart matching
  // Find all potential JSON start positions and try each one
  const jsonCandidates: string[] = [];
  
  // Look for { and [ characters as potential JSON starts
  for (let i = 0; i < trimmed.length; i++) {
    const char = trimmed[i];
    if (char === '{' || char === '[') {
      // Try to extract valid JSON from this position
      const candidate = extractJsonFromPosition(trimmed, i);
      if (candidate) {
        jsonCandidates.push(candidate);
      }
    }
  }
  
  // Sort candidates by length (longest first) to prefer more complete JSON
  jsonCandidates.sort((a, b) => b.length - a.length);
  
  // Return the first (longest) valid JSON candidate
  for (const candidate of jsonCandidates) {
    try {
      JSON.parse(candidate);
      return candidate;
    } catch {
      // Continue to next candidate
    }
  }
  
  // Pattern 4: Smart prefix/suffix removal
  // Look for the first occurrence of { or [ and try from there
  let cleaned = trimmed;
  
  // Find the first potential JSON start
  const jsonStartMatch = cleaned.match(/[\{\[]/);
  if (jsonStartMatch) {
    const startIndex = jsonStartMatch.index!;
    const candidateFromStart = cleaned.substring(startIndex);
    
    // Try to find matching closing bracket
    let bracketCount = 0;
    let endIndex = -1;
    const isObject = candidateFromStart[0] === '{';
    const openChar = isObject ? '{' : '[';
    const closeChar = isObject ? '}' : ']';
    
    for (let i = 0; i < candidateFromStart.length; i++) {
      const char = candidateFromStart[i];
      if (char === openChar) {
        bracketCount++;
      } else if (char === closeChar) {
        bracketCount--;
        if (bracketCount === 0) {
          endIndex = i;
          break;
        }
      }
    }
    
    if (endIndex !== -1) {
      const candidate = candidateFromStart.substring(0, endIndex + 1);
      try {
        JSON.parse(candidate);
        return candidate;
      } catch {
        // If bracket matching approach fails, continue to next pattern
      }
    }
  }
  
  // Pattern 5: Remove text before and after likely JSON boundaries
  // Look for patterns where JSON is preceded by explanatory text
  const jsonWithContextPattern = /^.*?(\{[\s\S]*\}|\[[\s\S]*\]).*?$/;
  const contextMatch = cleaned.match(jsonWithContextPattern);
  if (contextMatch) {
    const candidate = contextMatch[1].trim();
    try {
      JSON.parse(candidate);
      return candidate;
    } catch {
      // Continue if this doesn't work
    }
  }
  
  // Return original text if no patterns matched or extraction failed
  return trimmed;
}

/**
 * Safely parses JSON from text that may contain extra formatting or text.
 * Combines extractJsonFromText with JSON.parse for convenient usage.
 * 
 * @param text The text containing JSON content
 * @returns The parsed JSON object
 * @throws Error if the extracted text cannot be parsed as JSON
 */
export function parseJsonFromText(text: string): unknown {
  const jsonString = extractJsonFromText(text);
  return JSON.parse(jsonString);
} 