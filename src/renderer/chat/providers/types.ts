import type { ChatMessage, OllamaChatResponse } from '../../global';

export interface ChatProvider {
    chatOnce(messages: ChatMessage[], tools: any[]): Promise<OllamaChatResponse>;
    streamChat(messages: ChatMessage[], onToken: (token: string, done: boolean) => void): Promise<void>;
}
