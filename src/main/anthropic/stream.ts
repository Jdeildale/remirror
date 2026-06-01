import { getAnthropicClient, getConfiguredModel, anthropicErrorMessage } from './client';
import { SYSTEM_PROMPT_V1, PROMPT_VERSION } from '../brief/prompts/v1';
import log from '../log';

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
}

/**
 * Streams a brief generation. Returns the assembled full Markdown plus usage.
 * Callers handle parsing, gating, retries.
 */
export async function streamBriefGeneration(
  userPayloadJson: string,
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
      messages: [{ role: 'user', content: userPayloadJson }],
    });

    stream.on('text', (delta: string) => {
      full += delta;
      callbacks.onTextDelta(delta);
    });

    const message = await stream.finalMessage();
    inputTokens = message.usage?.input_tokens ?? 0;
    outputTokens = message.usage?.output_tokens ?? 0;
    if (callbacks.onUsage) callbacks.onUsage({ inputTokens, outputTokens });

    return { rawMarkdown: full, inputTokens, outputTokens, model, promptVersion: PROMPT_VERSION };
  } catch (e) {
    const msg = anthropicErrorMessage(e);
    log.warn('Brief stream failed:', msg);
    throw new Error(msg);
  }
}
