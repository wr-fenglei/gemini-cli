/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { AuthType } from '@google/gemini-cli-core';
import { loadEnvironment } from './settings.js';

export interface AuthValidationResult {
  message: string;
  missing: string[];
}

export const validateAuthMethod = (
  authMethod: string | AuthType,
): AuthValidationResult | null => {
  loadEnvironment();
  console.log(`Current environment variables: ${JSON.stringify(process.env)}`);
  if (authMethod === AuthType.CLOUD_SHELL) {
    return null;
  }

  if (authMethod === AuthType.LOGIN_WITH_GOOGLE) {
    if (!process.env.GOOGLE_CLOUD_PROJECT) {
      return {
        message:
          'GOOGLE_CLOUD_PROJECT environment variable not found. Add that to your environment and try again (no reload needed if using .env)!',
        missing: ['GOOGLE_CLOUD_PROJECT'],
      };
    }
    return null;
  }

  if (authMethod === AuthType.USE_GEMINI) {
    if (!process.env.GEMINI_API_KEY) {
      return {
        message:
          'GEMINI_API_KEY environment variable not found. Add that to your environment and try again (no reload needed if using .env)!',
        missing: ['GEMINI_API_KEY'],
      };
    }
    return null;
  }

  if (authMethod === AuthType.USE_VERTEX_AI) {
    const hasVertexProjectLocationConfig =
      !!process.env.GOOGLE_CLOUD_PROJECT && !!process.env.GOOGLE_CLOUD_LOCATION;
    const hasGoogleApiKey = !!process.env.GOOGLE_API_KEY;
    if (!hasVertexProjectLocationConfig && !hasGoogleApiKey) {
      const missing: string[] = [];
      if (!process.env.GOOGLE_CLOUD_PROJECT)
        missing.push('GOOGLE_CLOUD_PROJECT');
      if (!process.env.GOOGLE_CLOUD_LOCATION)
        missing.push('GOOGLE_CLOUD_LOCATION');
      if (!process.env.GOOGLE_API_KEY) missing.push('GOOGLE_API_KEY');

      return {
        message:
          'When using Vertex AI, you must specify either:\n' +
          '• GOOGLE_CLOUD_PROJECT and GOOGLE_CLOUD_LOCATION environment variables.\n' +
          '• GOOGLE_API_KEY environment variable (if using express mode).\n' +
          'Update your environment and try again (no reload needed if using .env)!',
        missing,
      };
    }
    return null;
  }

  if (authMethod === AuthType.AZURE_OPENAI) {
    const missing: string[] = [];
    if (!process.env.AZURE_OPENAI_API_KEY) {
      missing.push('AZURE_OPENAI_API_KEY');
    }
    if (!process.env.AZURE_OPENAI_ENDPOINT) {
      missing.push('AZURE_OPENAI_ENDPOINT');
    }
    if (missing.length > 0) {
      return {
        message:
          'When using Azure OpenAI, you must specify the following environment variables:\n' +
          '• AZURE_OPENAI_API_KEY\n' +
          '• AZURE_OPENAI_ENDPOINT\n' +
          'Update your environment and try again (no reload needed if using .env)!',
        missing,
      };
    }
    return null;
  }

  if (authMethod === AuthType.AZURE_OPENAI) {
    const missing: string[] = [];
    if (!process.env.AZURE_OPENAI_API_KEY) {
      missing.push('AZURE_OPENAI_API_KEY');
    }
    if (!process.env.AZURE_OPENAI_ENDPOINT) {
      missing.push('AZURE_OPENAI_ENDPOINT');
    }
    if (!process.env.AZURE_OPENAI_MODEL) {
      missing.push('AZURE_OPENAI_MODEL');
    }
    if (missing.length > 0) {
      return {
        message:
          'When using Azure OpenAI, you must specify the following environment variables:\n' +
          '• AZURE_OPENAI_API_KEY\n' +
          '• AZURE_OPENAI_ENDPOINT\n' +
          '• AZURE_OPENAI_MODEL\n' +
          'Update your environment and try again (no reload needed if using .env)!',
        missing,
      };
    }
    return null;
  }

  return {
    message: 'Invalid auth method selected.',
    missing: [],
  };
};
