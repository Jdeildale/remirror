import { getAnthropicClient, getConfiguredModel, anthropicErrorMessage } from './client';
import { SYSTEM_PROMPT_V1, PROMPT_VERSION } from '../brief/prompts/v1';
import type Anthropic from '@anthropic-ai/sdk';
import log from '../log';

/** Minimal interface for aborting an in-flight Anthropic message stream. */
export interface AbortableStream {
  abort(): void;
}

export interface StreamMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface StreamCallbacks {
  onTextDelta: (delta: string) => void;
  onUsage?: (usage: { inputTokens: number; outputTokens: number }) => void;
}

export interface StreamResult {
  rawMarkdown: string;
  inputTokens: number;
  outputTokens: number;
  model: string;
  promptVersion: string;
  /** The MessageStream object — callers may call .abort() on it for early exit. */
  stream?: AbortableStream;
}

/**
 * Streams a brief generation. Accepts a messages array to support multi-turn
 * regen context (prior assistant output + user correction request).
 * Returns the assembled full Markdown plus usage.
 * Callers handle parsing, gating, retries.
 */
export async function streamBriefGeneration(
  messages: StreamMessage[],
  callbacks: StreamCallbacks,
  systemPromptOverride?: string,
): Promise<StreamResult> {
  const client = getAnthropicClient();
  const model = getConfiguredModel();

  let full = '';
  let inputTokens = 0;
  let outputTokens = 0;

  try {
    const stream = client.messages.stream({
      model,
      max_tokens: 4096,
      system: systemPromptOverride ?? SYSTEM_PROMPT_V1,
      messages: messages as Anthropic.MessageParam[],
    });

    stream.on('text', (delta: string) => {
      full += delta;
      callbacks.onTextDelta(delta);
    });

    const message = await stream.finalMessage();
    inputTokens = message.usage?.input_tokens ?? 0;
    outputTokens = message.usage?.output_tokens ?? 0;
    if (callbacks.onUsage) callbacks.onUsage({ inputTokens, outputTokens });

    return { rawMarkdown: full, inputTokens, outputTokens, model, promptVersion: PROMPT_VERSION, stream };
  } catch (e) {
    const msg = anthropicErrorMessage(e);
    log.warn('Brief stream failed:', msg);
    throw new Error(msg);
  }
}
