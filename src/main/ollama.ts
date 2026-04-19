import { spawn, type ChildProcess } from 'child_process';

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
    role: 'system' | 'user' | 'assistant' | 'tool';
    content: string;
    tool_calls?: Array<{ function: { name: string; arguments: Record<string, any> } }>;
}

export class OllamaManager {
    private _proc: ChildProcess | null = null;

    async start(): Promise<OllamaStatus> {
        try {
            const proc = spawn('ollama', ['serve'], {
                detached: true,
                stdio: 'ignore',
                shell: process.platform === 'win32',
            });
            proc.unref();
            this._proc = proc;
            await new Promise(resolve => setTimeout(resolve, 1500));
            return this.getStatus();
        } catch {
            return { connected: false, models: [], activeModel: null };
        }
    }

    stop(): void {
        if (this._proc) {
            try { this._proc.kill(); } catch { /* already gone */ }
            this._proc = null;
        }
    }

    get managedByUs(): boolean {
        return this._proc !== null;
    }

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

    async chatOnce(messages: ChatMessage[], tools?: any[], model = 'llama3.1:8b'): Promise<any> {
        const body: any = { model, messages, stream: false };
        if (tools?.length) body.tools = tools;
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 300_000);
        try {
            const res = await fetch(`${BASE_URL}/api/chat`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
                signal: controller.signal,
            });
            if (!res.ok) throw new Error(`chatOnce failed: ${res.status} ${await res.text()}`);
            return await res.json();
        } finally {
            clearTimeout(timeout);
        }
    }

    async deleteModel(model: string): Promise<void> {
        const res = await fetch(`${BASE_URL}/api/delete`, {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: model }),
        });
        if (!res.ok) throw new Error(`Delete failed: ${res.status} ${await res.text()}`);
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
