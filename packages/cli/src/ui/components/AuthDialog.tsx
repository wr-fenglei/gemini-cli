/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { Box, Text, useInput } from 'ink';
import { Colors } from '../colors.js';
import { RadioButtonSelect } from './shared/RadioButtonSelect.js';
import { TextInput } from './shared/TextInput.js';
import { LoadedSettings, SettingScope } from '../../config/settings.js';
import { AuthType } from '@google/gemini-cli-core';
import { validateAuthMethod, AuthValidationResult } from '../../config/auth.js';

interface AuthDialogProps {
  onSelect: (authMethod: AuthType | undefined, scope: SettingScope) => void;
  settings: LoadedSettings;
  initialErrorMessage?: string | null;
}

function parseDefaultAuthType(
  defaultAuthType: string | undefined,
): AuthType | null {
  if (
    defaultAuthType &&
    Object.values(AuthType).includes(defaultAuthType as AuthType)
  ) {
    return defaultAuthType as AuthType;
  }
  return null;
}

export function AuthDialog({
  onSelect,
  settings,
}: AuthDialogProps): React.JSX.Element {
  const [authError, setAuthError] = useState<AuthValidationResult | null>(null);

  const [inputValues, setInputValues] = useState<Record<string, string>>({});
  const [focusedInputIndex, setFocusedInputIndex] = useState(0);

  const items = [
    {
      label: 'Login with Google',
      value: AuthType.LOGIN_WITH_GOOGLE,
    },
    ...(process.env.CLOUD_SHELL === 'true'
      ? [
          {
            label: 'Use Cloud Shell user credentials',
            value: AuthType.CLOUD_SHELL,
          },
        ]
      : []),
    {
      label: 'Use Gemini API Key',
      value: AuthType.USE_GEMINI,
    },
    { label: 'Vertex AI', value: AuthType.USE_VERTEX_AI },
    { label: 'Azure OpenAI', value: AuthType.AZURE_OPENAI },
  ];

  const initialAuthIndex = items.findIndex((item) => {
    if (settings.merged.selectedAuthType) {
      return item.value === settings.merged.selectedAuthType;
    }

    const defaultAuthType = parseDefaultAuthType(
      process.env.GEMINI_DEFAULT_AUTH_TYPE,
    );
    if (defaultAuthType) {
      return item.value === defaultAuthType;
    }

    if (process.env.GEMINI_API_KEY) {
      return item.value === AuthType.USE_GEMINI;
    }

    return item.value === AuthType.LOGIN_WITH_GOOGLE;
  });

  const handleAuthSelect = (authMethod: AuthType) => {
    const error = validateAuthMethod(authMethod);
    if (error) {
      setAuthError(error);
      setInputValues({}); // Clear previous inputs on new error
      setFocusedInputIndex(0); // Focus first input
    } else {
      setAuthError(null);
      onSelect(authMethod, SettingScope.User);
    }
  };

  const handleInputChange = (key: string, value: string) => {
    console.log(`Input changed: ${key} = ${value}`);
    setInputValues((prev) => ({ ...prev, [key]: value }));
  };

  const handleRetry = () => {
    // set user provided values into env.
    for (const [key, value] of Object.entries(inputValues)) {
      process.env[key] = value;
    }
    const selectedAuthMethod = items[initialAuthIndex].value;
    handleAuthSelect(selectedAuthMethod);
  };

  useInput((_input, key) => {
    if (authError && authError.missing.length > 0) {
      if (key.return) {
        if (focusedInputIndex < authError.missing.length - 1) {
          setFocusedInputIndex((prev) => prev + 1);
        } else {
          handleRetry();
        }
      } else if (key.upArrow) {
        setFocusedInputIndex((prev) => Math.max(0, prev - 1));
      } else if (key.downArrow) {
        setFocusedInputIndex((prev) =>
          Math.min(prev + 1, authError.missing.length - 1),
        );
      }
      return;
    }

    if (key.escape) {
      // Prevent exit if there is an error message.
      // This means they user is not authenticated yet.
      if (authError) {
        return;
      }
      if (settings.merged.selectedAuthType === undefined) {
        // Prevent exiting if no auth method is set
        setAuthError({
          message:
            'You must select an auth method to proceed. Press Ctrl+C twice to exit.',
          missing: [],
        });
        return;
      }
      onSelect(undefined, SettingScope.User);
    }
  });

  return (
    <Box
      borderStyle="round"
      borderColor={Colors.Gray}
      flexDirection="column"
      padding={1}
      width="100%"
    >
      <Text bold>Get started</Text>
      <Box marginTop={1}>
        <Text>How would you like to authenticate for this project?</Text>
      </Box>
      <Box marginTop={1}>
        <RadioButtonSelect
          items={items}
          initialIndex={initialAuthIndex}
          onSelect={handleAuthSelect}
          isFocused={!authError || authError.missing.length === 0}
        />
      </Box>
      {authError && (
        <Box marginTop={1}>
          <Text color={Colors.AccentRed}>{authError.message}</Text>
          {authError.missing.length > 0 && (
            <Box flexDirection="column" marginTop={1}>
              <Text>Please provide the missing environment variables:</Text>
              {authError.missing.map((key, index) => (
                <TextInput
                  key={key}
                  label={key}
                  value={inputValues[key] || ''}
                  onChange={(value) => handleInputChange(key, value)}
                  isFocused={focusedInputIndex === index}
                />
              ))}
              <Box marginTop={1}>
                <Text color={Colors.Gray}>
                  (Press Enter to move to next field or retry)
                </Text>
              </Box>
            </Box>
          )}
        </Box>
      )}
      {!authError && (
        <Box marginTop={1}>
          <Text color={Colors.Gray}>(Use Enter to select)</Text>
        </Box>
      )}
      <Box marginTop={1}>
        <Text>Terms of Services and Privacy Notice for Gemini CLI</Text>
      </Box>
      <Box marginTop={1}>
        <Text color={Colors.AccentBlue}>
          {
            'https://github.com/google-gemini/gemini-cli/blob/main/docs/tos-privacy.md'
          }
        </Text>
      </Box>
    </Box>
  );
}
