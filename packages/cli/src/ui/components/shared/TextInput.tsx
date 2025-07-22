/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useRef } from 'react';
import { Box, Text, useInput } from 'ink';
import { Colors } from '../../colors.js';

interface TextInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  isFocused?: boolean;
  label?: string;
}

export const TextInput = ({
  value,
  onChange,
  placeholder = '',
  isFocused = false,
  label,
}: TextInputProps) => {
  const [cursorOffset, setCursorOffset] = useState(value.length);
  const isMounted = useRef(false);

  useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
    };
  }, []);

  useEffect(() => {
    if (isFocused) {
      setCursorOffset(value.length);
    }
  }, [isFocused, value.length]);

  useInput((input, key) => {
    if (!isFocused) {
      return;
    }

    if (key.leftArrow) {
      setCursorOffset(Math.max(0, cursorOffset - 1));
    } else if (key.rightArrow) {
      setCursorOffset(Math.min(value.length, cursorOffset + 1));
    } else if (key.backspace || key.delete) {
      if (cursorOffset > 0) {
        const newValue =
          value.slice(0, cursorOffset - 1) + value.slice(cursorOffset);
        onChange(newValue);
        setCursorOffset(cursorOffset - 1);
      }
    } else if (key.return) {
      // Handle Enter key if needed, but typically handled by parent component
    } else if (input) {
      const newValue =
        value.slice(0, cursorOffset) + input + value.slice(cursorOffset);
      onChange(newValue);
      setCursorOffset(cursorOffset + input.length);
    }
  });

  const renderedValue = value.length > 0 ? value : placeholder;
  const cursorChar = isFocused ? '|' : '';

  return (
    <Box>
      {label && <Text>{label}: </Text>}
      <Text color={value.length > 0 ? Colors.Foreground : Colors.Gray}>
        {renderedValue.slice(0, cursorOffset)}
        <Text inverse>{cursorChar}</Text>
        {renderedValue.slice(cursorOffset)}
      </Text>
    </Box>
  );
};
