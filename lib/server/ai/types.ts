import "server-only";
import type { ChatItem, ToolCall, ToolDef } from "@/lib/ai/tools";

export interface ProviderResult {
  raw: unknown;
  text: string;
  toolCalls: ToolCall[];
  usage: { inputTokens: number; outputTokens: number; cacheReadTokens: number };
  stop: string;
  model: string;
}

export interface ProviderInput {
  items: ChatItem[];
  tools: ToolDef[];
}

export class ProviderError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}
