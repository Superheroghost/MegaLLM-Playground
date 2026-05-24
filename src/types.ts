export interface Model {
  id: string;
  object: string;
  type: string;
  created_at: string;
  owned_by: string;
  display_name: string;
  capabilities: {
    supports_function_calling: boolean;
    supports_vision: boolean;
    supports_streaming: boolean;
    supports_structured_output: boolean;
  };
  pricing?: {
    input_tokens_cost_per_million: number;
    output_tokens_cost_per_million: number;
    currency: string;
  };
  context_length: number;
  max_output_tokens: number;
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
}

export interface Conversation {
  id: string;
  title: string;
  messages: ChatMessage[];
  updatedAt: number;
}

export interface AppState {
  models: Model[];
  selectedModel: string;
  systemPrompt: string;
  temperature: number;
  maxTokens: number;
  messages: ChatMessage[];
  isStreaming: boolean;
}
