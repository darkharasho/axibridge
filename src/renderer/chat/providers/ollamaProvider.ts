import type { ChatMessage, OllamaChatResponse } from '../../global';
import type { ChatProvider } from './types';

export function createOllamaProvider(): ChatProvider {
    return {
        async chatOnce(messages: ChatMessage[], tools: any[]): Promise<OllamaChatResponse> {
            return window.electronAPI.chatOnce(messages, tools);
        },

        async streamChat(messages: ChatMessage[], onToken: (token: string, done: boolean) => void): Promise<void> {
            await new Promise<void>((resolve, reject) => {
                const unsub = window.electronAPI.onOllamaChatToken(({ token, done }: { token: string; done: boolean }) => {
                    onToken(token, done);
                    if (done) { unsub(); resolve(); }
                });
                window.electronAPI.ollamaChat(messages).catch((err: any) => {
                    unsub();
                    reject(err);
                });
            });
        },
    };
}
