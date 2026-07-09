// 教育局 RAG Demo 使用的型別（從 mockEduRag.ts 轉移或同步點）
export interface Thread {
    id: string;
    title: string;
    updatedAt: string;
    preview: string;
}

export interface Message {
    id: string;
    role: 'user' | 'assistant';
    content: string;
    timestamp: string;
    citations?: Citation[];
}

export interface Citation {
    id: string;
    docName: string;
    page?: number;
    snippet: string;
    similarity: number;
}

export interface Doc {
    id: string;
    name: string;
    type: 'pdf' | 'docx' | 'txt' | string;
    year: string;
    status: 'indexed' | 'processing' | 'error';
    updatedAt: string;
    tags: string[];
}

export type UploadStatus = 'uploading' | 'parsing' | 'completed' | 'error';

// IndexedDB 中單一上傳文件的資料結構。
export type UploadRecord = {
    id: string;
    name: string;
    sizeBytes: number;
    type: string;
    updatedAt: number;
    status: UploadStatus;
    blob: Blob;
    errorMessage?: string;
};

const DB_NAME = 'edu-rag-uploads';
const DB_VERSION = 1;
const STORE_NAME = 'uploads';

// 開啟（或建立）IndexedDB 與 uploads store。
const openDb = (): Promise<IDBDatabase> => new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
            db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
});

// 以統一交易流程包裝 CRUD，減少重複的 transaction/request 處理。
const withStore = async <T>(mode: IDBTransactionMode, action: (store: IDBObjectStore) => IDBRequest<T>) => {
    const db = await openDb();
    return new Promise<T>((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, mode);
        const store = tx.objectStore(STORE_NAME);
        const request = action(store);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
        tx.oncomplete = () => db.close();
        tx.onerror = () => reject(tx.error);
    });
};

// 建立或覆蓋一筆上傳紀錄。
export const saveUpload = (record: UploadRecord) =>
    withStore('readwrite', store => store.put(record)).then(() => undefined);

// 依 id 更新部分欄位，並自動刷新 updatedAt。
export const updateUpload = async (id: string, patch: Partial<Omit<UploadRecord, 'id' | 'blob'>> & { blob?: Blob }) => {
    const current = await withStore<UploadRecord | undefined>('readonly', store => store.get(id));
    if (!current) return;
    const next: UploadRecord = {
        ...current,
        ...patch,
        updatedAt: patch.updatedAt ?? Date.now()
    };
    await withStore('readwrite', store => store.put(next));
};

// 取得所有上傳紀錄，並以最新更新時間排序（新到舊）。
export const listUploads = async (): Promise<UploadRecord[]> => {
    const items = await withStore<UploadRecord[]>('readonly', store => store.getAll());
    return items.sort((a, b) => b.updatedAt - a.updatedAt);
};

// 依 id 讀取單筆紀錄。
export const getUpload = (id: string) =>
    withStore<UploadRecord | undefined>('readonly', store => store.get(id));

// 依 id 刪除單筆紀錄。
export const deleteUpload = (id: string) =>
    withStore('readwrite', store => store.delete(id)).then(() => undefined);
