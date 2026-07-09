const BASE = import.meta.env.VITE_API_BASE_URL ?? 'http://127.0.0.1:8010';

export const getToken = () => localStorage.getItem('auth_token');
export const setToken = (t: string) => localStorage.setItem('auth_token', t);
export const clearToken = () => localStorage.removeItem('auth_token');

const authHeaders = (): Record<string, string> => {
    const token = getToken();
    return token ? { Authorization: `Bearer ${token}` } : {};
};

const handleUnauthorized = () => {
    clearToken();
    window.location.href = '/login';
};

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
    const res = await fetch(`${BASE}${path}`, {
        ...options,
        headers: { 'Content-Type': 'application/json', ...authHeaders(), ...options.headers },
    });
    if (res.status === 401) {
        handleUnauthorized();
        throw new Error('unauthorized');
    }
    if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.detail ?? `HTTP ${res.status}`);
    }
    if (res.status === 204) return undefined as T;
    return res.json();
}

export interface Citation {
    doc_name: string;
    snippet: string;
    similarity: number;
}
export interface ThreadSummary {
    id: string;
    title: string;
    updated_at: string;
    preview: string;
}
export interface ApiMessage {
    id: number;
    role: 'user' | 'assistant';
    content: string;
    citations: Citation[] | null;
    created_at: string;
}

export const login = (username: string, password: string) =>
    request<{ access_token: string; display_name: string }>('/api/v1/auth/login', {
        method: 'POST',
        body: JSON.stringify({ username, password }),
    });

export const fetchMe = () =>
    request<{ username: string; display_name: string }>('/api/v1/auth/me');

export const listThreads = () => request<ThreadSummary[]>('/api/v1/threads');
export const fetchThread = (id: string) =>
    request<{ id: string; title: string; messages: ApiMessage[] }>(`/api/v1/threads/${id}`);
export const deleteThreadApi = (id: string) =>
    request<void>(`/api/v1/threads/${id}`, { method: 'DELETE' });

export interface StreamHandlers {
    onCitations: (citations: Citation[]) => void;
    onUpdate: (fullText: string) => void;
    onDone: (meta: { thread_id: string; message_id: number }) => void;
    onError: (error: unknown) => void;
}

export async function streamChat(
    message: string,
    threadId: string | null,
    handlers: StreamHandlers,
) {
    try {
        const res = await fetch(`${BASE}/api/v1/chat`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...authHeaders() },
            body: JSON.stringify({ message, thread_id: threadId }),
        });
        if (res.status === 401) {
            handleUnauthorized();
            return;
        }
        if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);

        const reader = res.body.getReader();
        const decoder = new TextDecoder('utf-8');
        let buffer = '';
        let fullText = '';

        const dispatch = (block: string) => {
            const eventLine = block.split('\n').find((l) => l.startsWith('event: '));
            const dataLine = block.split('\n').find((l) => l.startsWith('data: '));
            if (!eventLine || !dataLine) return;
            const event = eventLine.slice(7).trim();
            const data = JSON.parse(dataLine.slice(6));
            if (event === 'citations') handlers.onCitations(data);
            else if (event === 'delta') {
                fullText += data.text;
                handlers.onUpdate(fullText);
            } else if (event === 'done') handlers.onDone(data);
            else if (event === 'error') handlers.onError(new Error(data.message));
        };

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });
            const blocks = buffer.split('\n\n');
            buffer = blocks.pop() ?? '';
            blocks.forEach(dispatch);
        }
    } catch (error) {
        handlers.onError(error);
    }
}

export const requestUploadUrl = (file: File) =>
    request<{ key: string; upload_url: string; required_headers: Record<string, string> }>(
        '/api/v1/uploads',
        {
            method: 'POST',
            body: JSON.stringify({
                content_type: file.type || 'text/plain',
                file_name: file.name,
                size_bytes: file.size,
            }),
        },
    );

export async function uploadToR2(
    file: File,
    res: { upload_url: string; required_headers: Record<string, string> },
) {
    const put = await fetch(res.upload_url, {
        method: 'PUT',
        headers: res.required_headers,
        body: file,
    });
    if (!put.ok) throw new Error(`上傳失敗（HTTP ${put.status}）`);
}

export const listDocuments = () =>
    request<{ name: string; size_bytes: number; updated_at: string }[]>('/api/v1/documents');
