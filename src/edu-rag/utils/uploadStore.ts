export type UploadStatus = 'uploading' | 'parsing' | 'completed';

export type UploadRecord = {
    id: string;
    name: string;
    sizeBytes: number;
    type: string;
    updatedAt: number;
    status: UploadStatus;
    blob: Blob;
};

const DB_NAME = 'edu-rag-uploads';
const DB_VERSION = 1;
const STORE_NAME = 'uploads';

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

export const saveUpload = (record: UploadRecord) =>
    withStore('readwrite', store => store.put(record)).then(() => undefined);

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

export const listUploads = async (): Promise<UploadRecord[]> => {
    const items = await withStore<UploadRecord[]>('readonly', store => store.getAll());
    return items.sort((a, b) => b.updatedAt - a.updatedAt);
};

export const getUpload = (id: string) =>
    withStore<UploadRecord | undefined>('readonly', store => store.get(id));

export const deleteUpload = (id: string) =>
    withStore('readwrite', store => store.delete(id)).then(() => undefined);
