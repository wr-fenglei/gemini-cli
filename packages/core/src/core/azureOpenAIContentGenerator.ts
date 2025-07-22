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
  Content,
  Part,
  ContentListUnion,
  PartUnion,
  FunctionDeclaration,
} from '@google/genai';
import {
  ContentGenerator,
  ContentGeneratorConfig,
} from './contentGenerator.js';

/**
 * Helper function to convert ContentListUnion to Content[]
 */
function toContents(contents: ContentListUnion): Content[] {
  if (Array.isArray(contents)) {
    // it's a Content[] or a PartUnion[]
    return contents.map(toContent);
  }
  // it's a Content or a PartUnion
  return [toContent(contents)];
}

function toContent(content: Content | PartUnion): Content {
  if (Array.isArray(content)) {
    // This shouldn't happen in our context, but handle it
    throw new Error('Array content not supported in this context');
  }
  if (typeof content === 'string') {
    // it's a string
    return {
      role: 'user',
      parts: [{ text: content }],
    };
  }
  if (typeof content === 'object' && content !== null && 'parts' in content) {
    // it's a Content
    return content;
  }
  // it's a Part
  return {
    role: 'user',
    parts: [content as Part],
  };
}

interface OpenAILikeMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | null;
  tool_calls?: Array<{
    id: string;
    type: 'function';
    function: {
      name: string;
      arguments: string;
    };
  }>;
  tool_call_id?: string;
}

interface OpenAILikeTool {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

interface OpenAILikeRequest {
  model: string;
  messages: OpenAILikeMessage[];
  stream?: boolean;
  temperature?: number;
  max_completion_tokens?: number;
  top_p?: number;
  tools?: OpenAILikeTool[];
  tool_choice?:
    | 'auto'
    | 'none'
    | { type: 'function'; function: { name: string } };
}

interface OpenAILikeResponse {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: Array<{
    index: number;
    message: {
      role: string;
      content: string | null;
      tool_calls?: Array<{
        id: string;
        type: 'function';
        function: {
          name: string;
          arguments: string;
        };
      }>;
    };
    finish_reason: string;
  }>;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

interface OpenAILikeStreamChunk {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: Array<{
    index: number;
    delta: {
      role?: string;
      content?: string;
      tool_calls?: Array<{
        index?: number;
        id?: string;
        type?: 'function';
        function?: {
          name?: string;
          arguments?: string;
        };
      }>;
    };
    finish_reason: string | null;
  }>;
}

/**
 * Azure OpenAI Content Generator that implements Azure OpenAI-compatible API
 * Supports any API that follows OpenAI's chat completions format including function calls
 */
export class AzureOpenAIContentGenerator implements ContentGenerator {
  private apiKey: string;
  private endpoint: string;
  private model: string;

  constructor(config: ContentGeneratorConfig) {
    this.apiKey = config.apiKey!;
    this.endpoint = config.endpoint!.replace(/\/$/, ''); // Remove trailing slash
    this.model = config.model!;
  }

  /**
   * Convert Gemini Content format to OpenAI-like messages format
   */
  private convertToOpenAIMessages(contents: Content[]): OpenAILikeMessage[] {
    const messages: OpenAILikeMessage[] = [];

    for (const content of contents) {
      const role =
        content.role === 'model'
          ? 'assistant'
          : (content.role as 'system' | 'user' | 'tool');
      const parts = content.parts || [];

      // Handle function calls in assistant messages
      const functionCalls = parts.filter(
        (part: Part) =>
          typeof part === 'object' && part !== null && 'functionCall' in part,
      );

      // Handle function responses in user messages
      const functionResponses = parts.filter(
        (part: Part) =>
          typeof part === 'object' &&
          part !== null &&
          'functionResponse' in part,
      );

      const textParts = parts.filter(
        (part: Part): part is { text: string } =>
          typeof part === 'object' && part !== null && 'text' in part,
      );

      if (functionCalls.length > 0) {
        // Convert Gemini function calls to OpenAI tool_calls
        const tool_calls = functionCalls.map((part: any, index: number) => ({
          id: part.functionCall.id || `call_${Date.now()}_${index}`,
          type: 'function' as const,
          function: {
            name: part.functionCall.name,
            arguments: JSON.stringify(part.functionCall.args || {}),
          },
        }));

        const combinedText = textParts
          .map((part: { text: string }) => part.text)
          .join('\n');
        messages.push({
          role,
          content: combinedText || null,
          tool_calls,
        });
      } else if (functionResponses.length > 0) {
        // Convert function responses to tool result messages
        for (const part of functionResponses) {
          const functionResponse = (part as any).functionResponse;
          messages.push({
            role: 'tool',
            content: JSON.stringify(functionResponse.response),
            tool_call_id: functionResponse.id,
          });
        }
      } else if (textParts.length > 0) {
        const combinedText = textParts
          .map((part: { text: string }) => part.text)
          .join('\n');
        messages.push({
          role,
          content: combinedText,
        });
      }
    }

    return messages;
  }

  /**
   * Recursively traverses a JSON schema and converts the 'type' property
   * to lowercase.
   */
  private convertSchemaTypeToLowerCase(schema: any): void {
    if (!schema || typeof schema !== 'object') {
      return;
    }

    if (typeof schema.type === 'string') {
      schema.type = schema.type.toLowerCase();
    }

    if (schema.properties) {
      for (const key in schema.properties) {
        this.convertSchemaTypeToLowerCase(schema.properties[key]);
      }
    }

    if (schema.items) {
      this.convertSchemaTypeToLowerCase(schema.items);
    }

    if (Array.isArray(schema.anyOf)) {
      schema.anyOf.forEach((s: any) => this.convertSchemaTypeToLowerCase(s));
    }
    if (Array.isArray(schema.allOf)) {
      schema.allOf.forEach((s: any) => this.convertSchemaTypeToLowerCase(s));
    }
    if (Array.isArray(schema.oneOf)) {
      schema.oneOf.forEach((s: any) => this.convertSchemaTypeToLowerCase(s));
    }
  }

  /**
   * Convert Gemini function declarations to OpenAI tools format
   */
  private convertToOpenAITools(
    functionDeclarations?: FunctionDeclaration[],
  ): OpenAILikeTool[] {
    if (!functionDeclarations) return [];

    const functions = functionDeclarations.map((declaration) => {
      // Deep copy parameters to avoid modifying the original object
      const parameters = JSON.parse(JSON.stringify(
        declaration.parameters || {}
      ));

      // Convert schema types to lowercase
      this.convertSchemaTypeToLowerCase(parameters);

      return {
        type: 'function' as const,
        function: {
          name: declaration.name || 'unknown_function',
          description: declaration.description || '',
          parameters: parameters as Record<string, unknown>,
        },
      };
    });

    return functions;
  }

  /**
   * Convert OpenAI-like response to Gemini format
   */
  private convertToGeminiResponse(
    response: OpenAILikeResponse,
  ): GenerateContentResponse {
    const choice = response.choices[0];
    if (!choice) {
      throw new Error('No choices in OpenAI-like API response');
    }

    const geminiResponse = new GenerateContentResponse();

    // Handle tool calls in the response
    if (choice.message.tool_calls && choice.message.tool_calls.length > 0) {
      const parts = [];

      // Add text content if present
      if (choice.message.content) {
        parts.push({ text: choice.message.content });
      }

      // Add function calls
      const functionCalls = choice.message.tool_calls.map((toolCall) => ({
        functionCall: {
          id: toolCall.id,
          name: toolCall.function.name,
          args: JSON.parse(toolCall.function.arguments || '{}'),
        },
      }));
      parts.push(...functionCalls);

      geminiResponse.candidates = [
        {
          content: {
            parts,
            role: 'model',
          },
          finishReason: choice.finish_reason as any,
          index: 0,
          safetyRatings: [],
        },
      ];

      // Add functionCalls property using defineProperty to bypass readonly
      const functionCallsArray = choice.message.tool_calls.map((toolCall) => ({
        id: toolCall.id,
        name: toolCall.function.name,
        args: JSON.parse(toolCall.function.arguments || '{}'),
      }));

      Object.defineProperty(geminiResponse, 'functionCalls', {
        value: functionCallsArray,
        writable: false,
        enumerable: true,
        configurable: true,
      });

      return geminiResponse;
    } else {
      // Regular text response
      geminiResponse.candidates = [
        {
          content: {
            parts: [{ text: choice.message.content || '' }],
            role: 'model',
          },
          finishReason: choice.finish_reason as any,
          index: 0,
          safetyRatings: [],
        },
      ];
    }

    geminiResponse.usageMetadata = {
      promptTokenCount: response.usage.prompt_tokens,
      candidatesTokenCount: response.usage.completion_tokens,
      totalTokenCount: response.usage.total_tokens,
    };

    return geminiResponse;
  }

  async generateContent(
    request: GenerateContentParameters,
  ): Promise<GenerateContentResponse> {
    // console.log(JSON.stringify(request, null, 2));
    const contentsArray = toContents(request.contents);
    const messages = this.convertToOpenAIMessages(contentsArray);
    console.log(JSON.stringify(messages, null, 2));

    // Extract tools from config if available
    const allDeclarations: FunctionDeclaration[] = [];
    if (request.config?.tools) {
      for (const tool of request.config.tools) {
        // Handle different tool types from @google/genai
        if (
          'functionDeclarations' in tool &&
          Array.isArray(tool.functionDeclarations)
        ) {
          allDeclarations.push(...tool.functionDeclarations);
        }
      }
    }
    console.log(`allDeclarations: ${JSON.stringify(allDeclarations, null, 2)}`);
    const openaiTools = this.convertToOpenAITools(allDeclarations);
    console.log(`openaiTools: ${JSON.stringify(openaiTools, null, 2)}`);

    const openaiRequest: OpenAILikeRequest = {
      model: this.model,
      messages,
      stream: false,
      // temperature: request.config?.temperature,
      max_completion_tokens: request.config?.maxOutputTokens,
      top_p: request.config?.topP,
      ...(openaiTools.length > 0 && {
        tools: openaiTools,
        tool_choice: 'auto',
      }),
    };

    const response = await fetch(this.endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify(openaiRequest),
      signal: request.config?.abortSignal,
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `OpenAI-like API error: ${response.status} ${response.statusText} - ${errorText}`,
      );
    }

    const data: OpenAILikeResponse = await response.json();
    return this.convertToGeminiResponse(data);
  }

  async generateContentStream(
    request: GenerateContentParameters,
  ): Promise<AsyncGenerator<GenerateContentResponse>> {
    const contentsArray = toContents(request.contents);
    const messages = this.convertToOpenAIMessages(contentsArray);
    console.log(JSON.stringify(messages, null, 2));

    // Extract tools from config if available
    const allDeclarations: FunctionDeclaration[] = [];
    if (request.config?.tools) {
      for (const tool of request.config.tools) {
        // Handle different tool types from @google/genai
        if (
          'functionDeclarations' in tool &&
          Array.isArray(tool.functionDeclarations)
        ) {
          allDeclarations.push(...tool.functionDeclarations);
        }
      }
    }
    console.log(
      `stream allDeclarations: ${JSON.stringify(allDeclarations, null, 2)}`,
    );
    const openaiTools = this.convertToOpenAITools(allDeclarations);
    console.log(`stream openaiTools: ${JSON.stringify(openaiTools, null, 2)}`);

    const openaiRequest: OpenAILikeRequest = {
      model: this.model,
      messages,
      stream: true,
      // temperature: request.config?.temperature,
      max_completion_tokens: request.config?.maxOutputTokens,
      top_p: request.config?.topP,
      ...(openaiTools.length > 0 && {
        tools: openaiTools,
        tool_choice: 'auto',
      }),
    };
    console.log(
      `stream openaiRequest: ${JSON.stringify(openaiRequest, null, 2)}`,
    );

    const response = await fetch(this.endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify(openaiRequest),
      signal: request.config?.abortSignal,
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `OpenAI-like API error: ${response.status} ${response.statusText} - ${errorText}`,
      );
    }

    if (!response.body) {
      throw new Error('No response body for streaming');
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    const generator =
      async function* (): AsyncGenerator<GenerateContentResponse> {
        // State for accumulating tool calls across chunks
        const accumulatedToolCalls = new Map<
          number,
          {
            id?: string;
            type?: string;
            function?: { name?: string; arguments?: string };
          }
        >();
        let accumulatedContent = '';

        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop() || '';

            for (const line of lines) {
              const trimmed = line.trim();
              if (trimmed === '' || trimmed === 'data: [DONE]') continue;

              if (trimmed.startsWith('data: ')) {
                try {
                  const jsonStr = trimmed.slice(6);
                  const chunk: OpenAILikeStreamChunk = JSON.parse(jsonStr);

                  if (chunk.choices && chunk.choices[0]) {
                    const choice = chunk.choices[0];

                    // Handle content delta
                    if (choice.delta.content) {
                      accumulatedContent += choice.delta.content;

                      const geminiResponse = new GenerateContentResponse();
                      geminiResponse.candidates = [
                        {
                          content: {
                            parts: [{ text: choice.delta.content }],
                            role: 'model',
                          },
                          finishReason: choice.finish_reason as any,
                          index: 0,
                          safetyRatings: [],
                        },
                      ];

                      yield geminiResponse;
                    }

                    // Handle tool calls delta
                    if (choice.delta.tool_calls) {
                      for (const toolCallDelta of choice.delta.tool_calls) {
                        const index = toolCallDelta.index ?? 0;

                        if (!accumulatedToolCalls.has(index)) {
                          accumulatedToolCalls.set(index, {});
                        }

                        const accumulated = accumulatedToolCalls.get(index)!;

                        if (toolCallDelta.id) {
                          accumulated.id = toolCallDelta.id;
                        }
                        if (toolCallDelta.type) {
                          accumulated.type = toolCallDelta.type;
                        }
                        if (toolCallDelta.function) {
                          if (!accumulated.function) {
                            accumulated.function = {};
                          }
                          if (toolCallDelta.function.name) {
                            accumulated.function.name =
                              (accumulated.function.name || '') +
                              toolCallDelta.function.name;
                          }
                          if (toolCallDelta.function.arguments) {
                            accumulated.function.arguments =
                              (accumulated.function.arguments || '') +
                              toolCallDelta.function.arguments;
                          }
                        }
                      }
                    }

                    // Check if stream is finished
                    if (choice.finish_reason && choice.finish_reason !== null) {
                      // If we have accumulated tool calls, send them
                      if (accumulatedToolCalls.size > 0) {
                        const parts = [];

                        // Add accumulated content if any
                        if (accumulatedContent) {
                          parts.push({ text: accumulatedContent });
                        }

                        // Add completed tool calls
                        const functionCalls = Array.from(
                          accumulatedToolCalls.values(),
                        )
                          .filter(
                            (toolCall) =>
                              toolCall.id && toolCall.function?.name,
                          )
                          .map((toolCall) => ({
                            functionCall: {
                              id: toolCall.id!,
                              name: toolCall.function!.name!,
                              args: JSON.parse(
                                toolCall.function!.arguments || '{}',
                              ),
                            },
                          }));

                        parts.push(...functionCalls);

                        const geminiResponse = new GenerateContentResponse();
                        geminiResponse.candidates = [
                          {
                            content: {
                              parts,
                              role: 'model',
                            },
                            finishReason: choice.finish_reason as any,
                            index: 0,
                            safetyRatings: [],
                          },
                        ];

                        // Add functionCalls property using defineProperty to bypass readonly
                        const functionCallsArray = Array.from(
                          accumulatedToolCalls.values(),
                        )
                          .filter(
                            (toolCall) =>
                              toolCall.id && toolCall.function?.name,
                          )
                          .map((toolCall) => ({
                            id: toolCall.id!,
                            name: toolCall.function!.name!,
                            args: JSON.parse(
                              toolCall.function!.arguments || '{}',
                            ),
                          }));

                        Object.defineProperty(geminiResponse, 'functionCalls', {
                          value: functionCallsArray,
                          writable: false,
                          enumerable: true,
                          configurable: true,
                        });

                        yield geminiResponse;
                      } else {
                        // Send a final empty response with the finish reason to signal completion
                        const geminiResponse = new GenerateContentResponse();
                        geminiResponse.candidates = [
                          {
                            content: {
                              parts: [],
                              role: 'model',
                            },
                            finishReason: choice.finish_reason as any,
                            index: 0,
                            safetyRatings: [],
                          },
                        ];

                        yield geminiResponse;
                      }
                      return; // End the generator
                    }
                  }
                } catch (parseError) {
                  console.warn('Failed to parse streaming chunk:', trimmed);
                }
              }
            }
          }
        } finally {
          reader.releaseLock();
        }
      };

    return generator();
  }

  async countTokens(
    request: CountTokensParameters,
  ): Promise<CountTokensResponse> {
    const contentsArray = toContents(request.contents);

    // Most OpenAI-like APIs don't have a dedicated token counting endpoint
    // We'll estimate based on the text length (rough approximation: 4 chars per token)
    const messages = this.convertToOpenAIMessages(contentsArray);
    const totalText = messages.map((m) => m.content || '').join(' ');
    const estimatedTokens = Math.ceil(totalText.length / 4);

    return {
      totalTokens: estimatedTokens,
    };
  }

  async embedContent(
    request: EmbedContentParameters,
  ): Promise<EmbedContentResponse> {
    // Most OpenAI-like APIs don't provide embedding endpoints, so we'll throw an error
    throw new Error(
      'This OpenAI-like API does not support embeddings. Please use Gemini for embedding operations.',
    );
  }
}
