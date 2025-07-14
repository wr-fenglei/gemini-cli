/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  CountTokensResponse,
  GenerateContentResponse,
  GenerateContentParameters,
  CountTokensParameters,
  EmbedContentResponse,
  EmbedContentParameters,
  GoogleGenAI,
} from '@google/genai';
import { createCodeAssistContentGenerator } from '../code_assist/codeAssist.js';
import { DEFAULT_GEMINI_MODEL, DEFAULT_DEEPSEEK_MODEL, DEFAULT_OPENAI_LIKE_MODEL } from '../config/models.js';
import { getEffectiveModel } from './modelCheck.js';
import { DeepSeekContentGenerator } from './deepseekContentGenerator.js';
import { OpenAILikeContentGenerator, OpenAILikeConfig } from './openaiLikeContentGenerator.js';
import { AzureOpenAIContentGenerator } from './azureOpenaiContentGenerator.js';

/**
 * Interface abstracting the core functionalities for generating content and counting tokens.
 */
export interface ContentGenerator {
  generateContent(
    request: GenerateContentParameters,
  ): Promise<GenerateContentResponse>;

  generateContentStream(
    request: GenerateContentParameters,
  ): Promise<AsyncGenerator<GenerateContentResponse>>;

  countTokens(request: CountTokensParameters): Promise<CountTokensResponse>;

  embedContent(request: EmbedContentParameters): Promise<EmbedContentResponse>;
}

export enum AuthType {
  LOGIN_WITH_GOOGLE_PERSONAL = 'oauth-personal',
  USE_GEMINI = 'gemini-api-key',
  USE_VERTEX_AI = 'vertex-ai',
  USE_DEEPSEEK = 'deepseek-api-key',
  USE_OPENAI_LIKE = 'openai-like-api',
  USE_AZURE_OPENAI = 'azure-openai',
}

export type ContentGeneratorConfig = {
  model: string;
  apiKey?: string;
  vertexai?: boolean;
  authType?: AuthType | undefined;
  openaiLikeConfig?: OpenAILikeConfig;
};

export async function createContentGeneratorConfig(
  model: string | undefined,
  authType: AuthType | undefined,
  config?: { getModel?: () => string },
): Promise<ContentGeneratorConfig> {
  const geminiApiKey = process.env.GEMINI_API_KEY;
  const deepseekApiKey = process.env.DEEPSEEK_API_KEY;
  const openaiLikeApiKey = process.env.OPENAI_LIKE_API_KEY;
  const openaiLikeBaseUrl = process.env.OPENAI_LIKE_BASE_URL;
  const openaiLikeModel = process.env.OPENAI_LIKE_MODEL;
  const googleApiKey = process.env.GOOGLE_API_KEY;
  const googleCloudProject = process.env.GOOGLE_CLOUD_PROJECT;
  const googleCloudLocation = process.env.GOOGLE_CLOUD_LOCATION;

  // Use runtime model from config if available, otherwise fallback to parameter or default
  const effectiveModel = config?.getModel?.() || model || DEFAULT_GEMINI_MODEL;

  const contentGeneratorConfig: ContentGeneratorConfig = {
    model: effectiveModel,
    authType,
  };

  // if we are using google auth nothing else to validate for now
  if (authType === AuthType.LOGIN_WITH_GOOGLE_PERSONAL) {
    return contentGeneratorConfig;
  }

  if (authType === AuthType.USE_GEMINI && geminiApiKey) {
    contentGeneratorConfig.apiKey = geminiApiKey;
    contentGeneratorConfig.model = await getEffectiveModel(
      contentGeneratorConfig.apiKey,
      contentGeneratorConfig.model,
    );

    return contentGeneratorConfig;
  }

  if (authType === AuthType.USE_DEEPSEEK && deepseekApiKey) {
    contentGeneratorConfig.apiKey = deepseekApiKey;
    // DeepSeek doesn't need the same model fallback logic as Gemini
    // Use deepseek-chat as default model if not specified
    if (!contentGeneratorConfig.model || contentGeneratorConfig.model === DEFAULT_GEMINI_MODEL) {
      contentGeneratorConfig.model = DEFAULT_DEEPSEEK_MODEL;
    }

    return contentGeneratorConfig;
  }

  if (authType === AuthType.USE_OPENAI_LIKE && openaiLikeApiKey && openaiLikeBaseUrl) {
    contentGeneratorConfig.openaiLikeConfig = {
      apiKey: openaiLikeApiKey,
      baseUrl: openaiLikeBaseUrl,
      modelName: openaiLikeModel || DEFAULT_OPENAI_LIKE_MODEL
    };
    // Use the configured model or default
    contentGeneratorConfig.model = openaiLikeModel || DEFAULT_OPENAI_LIKE_MODEL;

    return contentGeneratorConfig;
  }

  if (authType === AuthType.USE_AZURE_OPENAI && process.env.AZURE_OPENAI_API_KEY && process.env.AZURE_OPENAI_BASE_URL) {
    contentGeneratorConfig.openaiLikeConfig = {
      apiKey: process.env.AZURE_OPENAI_API_KEY,
      baseUrl: process.env.AZURE_OPENAI_BASE_URL,
      modelName: openaiLikeModel || DEFAULT_OPENAI_LIKE_MODEL
    };
    contentGeneratorConfig.model = effectiveModel || DEFAULT_OPENAI_LIKE_MODEL;

    return contentGeneratorConfig;
  }

  if (
    authType === AuthType.USE_VERTEX_AI &&
    !!googleApiKey &&
    googleCloudProject &&
    googleCloudLocation
  ) {
    contentGeneratorConfig.apiKey = googleApiKey;
    contentGeneratorConfig.vertexai = true;
    contentGeneratorConfig.model = await getEffectiveModel(
      contentGeneratorConfig.apiKey,
      contentGeneratorConfig.model,
    );

    return contentGeneratorConfig;
  }

  return contentGeneratorConfig;
}

export async function createContentGenerator(
  config: ContentGeneratorConfig,
): Promise<ContentGenerator> {
  const version = process.env.CLI_VERSION || process.version;
  const httpOptions = {
    headers: {
      'User-Agent': `GeminiCLI/${version} (${process.platform}; ${process.arch})`,
    },
  };
  if (config.authType === AuthType.LOGIN_WITH_GOOGLE_PERSONAL) {
    return createCodeAssistContentGenerator(httpOptions, config.authType);
  }

  if (
    config.authType === AuthType.USE_GEMINI ||
    config.authType === AuthType.USE_VERTEX_AI
  ) {
    const googleGenAI = new GoogleGenAI({
      apiKey: config.apiKey === '' ? undefined : config.apiKey,
      vertexai: config.vertexai,
      httpOptions,
    });

    return googleGenAI.models;
  }

  if (config.authType === AuthType.USE_DEEPSEEK) {
    if (!config.apiKey) {
      throw new Error('DeepSeek API key is required');
    }
    return new DeepSeekContentGenerator(config.apiKey);
  }

  if (config.authType === AuthType.USE_OPENAI_LIKE) {
    if (!config.openaiLikeConfig) {
      throw new Error('OpenAI-like API configuration is required');
    }
    return new OpenAILikeContentGenerator(config.openaiLikeConfig);
  }

  if (config.authType === AuthType.USE_AZURE_OPENAI) {
    if (!config.openaiLikeConfig) {
      throw new Error('Azure OpenAI configuration is required');
    }
    return new AzureOpenAIContentGenerator(config.openaiLikeConfig);
  }

  throw new Error(
    `Error creating contentGenerator: Unsupported authType: ${config.authType}`,
  );
}
