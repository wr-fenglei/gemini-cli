/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, test, expect } from 'vitest';
import { extractJsonFromText, parseJsonFromText } from './jsonUtils.js';

describe('jsonUtils', () => {
  describe('extractJsonFromText', () => {
    test('should extract JSON from code blocks with json language tag', () => {
      const input = '```json\n{"key": "value"}\n```';
      const result = extractJsonFromText(input);
      expect(result).toBe('{"key": "value"}');
    });

    test('should extract JSON from code blocks without language tag', () => {
      const input = '```\n{"key": "value"}\n```';
      const result = extractJsonFromText(input);
      expect(result).toBe('{"key": "value"}');
    });

    test('should extract JSON from code blocks with extra text around', () => {
      const input = 'Here is the JSON:\n```json\n{"key": "value"}\n```\nThat was the JSON.';
      const result = extractJsonFromText(input);
      expect(result).toBe('{"key": "value"}');
    });

    test('should extract JSON object from plain text', () => {
      const input = 'The result is {"key": "value"} as shown above.';
      const result = extractJsonFromText(input);
      expect(result).toBe('{"key": "value"}');
    });

    test('should extract JSON array from plain text', () => {
      const input = 'The items are [1, 2, 3] in the list.';
      const result = extractJsonFromText(input);
      expect(result).toBe('[1, 2, 3]');
    });

    test('should handle nested JSON objects', () => {
      const input = 'Result: {"outer": {"inner": "value"}}';
      const result = extractJsonFromText(input);
      expect(result).toBe('{"outer": {"inner": "value"}}');
    });

    test('should handle nested JSON arrays', () => {
      const input = 'Data: [[1, 2], [3, 4]]';
      const result = extractJsonFromText(input);
      expect(result).toBe('[[1, 2], [3, 4]]');
    });

    test('should use smart bracket matching for complex JSON', () => {
      const input = 'The response is {"a": {"b": [1, 2]}, "c": "test"} and that completes it.';
      const result = extractJsonFromText(input);
      expect(result).toBe('{"a": {"b": [1, 2]}, "c": "test"}');
    });

    test('should return original text if no valid JSON found', () => {
      const input = 'This is just plain text with no JSON.';
      const result = extractJsonFromText(input);
      expect(result).toBe(input);
    });

    test('should handle whitespace correctly', () => {
      const input = '   \n  {"key": "value"}  \n  ';
      const result = extractJsonFromText(input);
      expect(result).toBe('{"key": "value"}');
    });

    test('should prefer valid JSON over invalid bracket matches', () => {
      const input = 'Invalid {not json} but valid {"key": "value"}';
      const result = extractJsonFromText(input);
      expect(result).toBe('{"key": "value"}');
    });

    test('should handle JSON with strings containing brackets', () => {
      const input = '{"message": "This contains { and } characters"}';
      const result = extractJsonFromText(input);
      expect(result).toBe('{"message": "This contains { and } characters"}');
    });

    test('should extract JSON from multiline text', () => {
      const input = `Here's the data:
      {
        "name": "test",
        "value": 123
      }
      End of data.`;
      const result = extractJsonFromText(input);
      expect(JSON.parse(result)).toEqual({ name: "test", value: 123 });
    });
  });

  describe('parseJsonFromText', () => {
    test('should parse extracted JSON successfully', () => {
      const input = '```json\n{"key": "value", "num": 42}\n```';
      const result = parseJsonFromText(input);
      expect(result).toEqual({ key: "value", num: 42 });
    });

    test('should parse array JSON successfully', () => {
      const input = 'The array is [1, 2, 3]';
      const result = parseJsonFromText(input);
      expect(result).toEqual([1, 2, 3]);
    });

    test('should throw error for invalid JSON', () => {
      const input = 'This is not JSON at all';
      expect(() => parseJsonFromText(input)).toThrow();
    });

    test('should handle complex nested structures', () => {
      const input = `
      {
        "users": [
          {"id": 1, "name": "Alice"},
          {"id": 2, "name": "Bob"}
        ],
        "meta": {"total": 2}
      }
      `;
      const result = parseJsonFromText(input);
      expect(result).toEqual({
        users: [
          { id: 1, name: "Alice" },
          { id: 2, name: "Bob" }
        ],
        meta: { total: 2 }
      });
    });
  });
}); 