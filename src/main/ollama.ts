const BASE_URL = 'http://localhost:11434';

export interface OllamaStatus {
    connected: boolean;
    models: string[];
    activeModel: string | null;
}

export interface PullProgress {
    percent: number;
    status: string;
}

export interface ChatMessage {
    role: 'system' | 'user' | 'assistant';
    content: string;
}

export class OllamaManager {
    async getStatus(): Promise<OllamaStatus> {
        try {
            const res = await fetch(`${BASE_URL}/api/tags`);
            if (!res.ok) return { connected: false, models: [], activeModel: null };
            const data = await res.json() as { models: Array<{ name: string }> };
            return {
                connected: true,
                models: data.models.map(m => m.name),
                activeModel: null,
            };
        } catch {
            return { connected: false, models: [], activeModel: null };
        }
    }

    async pullModel(model: string, onProgress: (p: PullProgress) => void): Promise<void> {
        const res = await fetch(`${BASE_URL}/api/pull`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: model, stream: true }),
        });
        if (!res.ok) throw new Error(`Pull failed: ${res.status}`);
        await this._readStream(res, (line) => {
            const data = JSON.parse(line) as { status: string; completed?: number; total?: number };
            const percent = data.total ? Math.round((data.completed ?? 0) / data.total * 100) : 0;
            onProgress({ percent, status: data.status });
        });
    }

    async chat(
        messages: ChatMessage[],
        model: string,
        onToken: (token: string, done: boolean) => void
    ): Promise<void> {
        const res = await fetch(`${BASE_URL}/api/chat`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ model, messages, stream: true }),
        });
        if (!res.ok) throw new Error(`Chat failed: ${res.status}`);
        await this._readStream(res, (line) => {
            const data = JSON.parse(line) as { message?: { content: string }; done: boolean };
            onToken(data.message?.content ?? '', data.done);
        });
    }

    private async _readStream(res: Response, onLine: (line: string) => void): Promise<void> {
        if (!res.body) throw new Error('Response body is null');
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        for (;;) {
            const { value, done } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop() ?? '';
            for (const line of lines) {
                if (line.trim()) onLine(line.trim());
            }
        }
        if (buffer.trim()) onLine(buffer.trim());
    }
}
