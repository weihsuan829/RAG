import { useRef, useState } from 'react';
import { Upload, FileType, CheckCircle2 } from 'lucide-react';
import { saveUpload, updateUpload, type UploadRecord, type UploadStatus } from '../utils/uploadStore';
import { requestUploadUrl, uploadToR2 } from '../services/api';

// 前端白名單：五種允許的 MIME 類型（PDF、Word、Excel、純文字、Markdown）。
const ALLOWED = new Set([
    'text/plain', 'text/markdown', 'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
]);
const MAX_BYTES = 4 * 1024 * 1024;

// 文件上傳頁：負責選檔、入庫、狀態更新與隊列顯示。
const EduRagUploadPage = () => {
    // 隱藏 input[type=file] 的 ref，透過按區塊觸發 click。
    const fileInputRef = useRef<HTMLInputElement>(null);
    // 本地上傳隊列（僅在當下畫面有效，切換頁面即清空）。
    const [uploads, setUploads] = useState<UploadRecord[]>([]);

    // 上傳流程步驟定義（供 UI stepper 使用）。
    const steps = [
        { id: 0, label: '上傳' },
        { id: 1, label: '解析' },
        { id: 2, label: '完成' }
    ];

    // 點擊上傳區塊時，改觸發隱藏檔案選擇器。
    const handleUploadClick = () => {
        fileInputRef.current?.click();
    };

    // 更新單一檔案狀態（同時更新畫面狀態與儲存至資料庫）。
    const updateStatus = async (id: string, status: UploadStatus, errorMessage?: string) => {
        setUploads(prev => prev.map(item => item.id === id ? { ...item, status, errorMessage, updatedAt: Date.now() } : item));
        await updateUpload(id, { status, errorMessage, updatedAt: Date.now() });
    };

    // 單一檔案的真實上傳流程：前端驗證 → 取得預簽名 URL → PUT 至 R2 → 更新狀態。
    const processFile = async (file: File, itemId: string) => {
        if (!ALLOWED.has(file.type)) {
            await updateStatus(itemId, 'error', '不支援的檔案格式（限 PDF、Word、Excel、文字檔）');
            return;
        }
        if (file.size > MAX_BYTES) {
            await updateStatus(itemId, 'error', '檔案超過 4MB 上限');
            return;
        }
        try {
            const res = await requestUploadUrl(file);
            await updateStatus(itemId, 'parsing'); // 顯示為「上傳中」
            await uploadToR2(file, res);
            await updateStatus(itemId, 'completed'); // 顯示為「已上傳，索引處理中」
        } catch (err) {
            await updateStatus(itemId, 'error', err instanceof Error ? err.message : '上傳失敗');
        }
    };

    // 檔案選擇後：
    // 1) 建立上傳紀錄 (暫存於 state 並寫入 DB)
    // 2) 依序驗證與呼叫後端 API 完成真實上傳
    const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        const files = Array.from(event.target.files ?? []);
        if (files.length === 0) return;

        const newItems: Array<{ record: UploadRecord; file: File }> = files.map((file) => ({
            record: {
                id: crypto?.randomUUID?.() ?? `${file.name}-${file.size}-${file.lastModified}`,
                name: file.name,
                sizeBytes: file.size,
                type: file.type || 'application/octet-stream',
                updatedAt: Date.now(),
                status: 'uploading',
                blob: file
            },
            file
        }));

        newItems.forEach(async ({ record, file }) => {
            await saveUpload(record);
            setUploads((prev) => [record, ...prev]);
            void processFile(file, record.id);
        });

        event.target.value = '';
    };

    // 將 bytes 轉為 MB 顯示。
    const formatSize = (bytes: number) => `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    const statusLabel: Record<UploadStatus, string> = {
        uploading: '上傳中',
        parsing: '上傳中',
        completed: '已上傳，索引處理中',
        error: '失敗'
    };
    const statusStep: Record<UploadStatus, number> = {
        uploading: 0,
        parsing: 1,
        completed: 2,
        error: 0
    };

    return (
        <div className="p-8 max-w-5xl mx-auto space-y-8">
            <h1 className="text-2xl font-semibold text-black dark:text-white">文件上傳</h1>

            {/* Upload Area */}
            <div
                className="border-2 border-dashed border-slate-300 dark:border-neutral-700 rounded-2xl bg-white dark:bg-neutral-900 p-12 text-center hover:bg-slate-50 dark:hover:bg-neutral-800 hover:border-blue-500 dark:hover:border-blue-400 transition-all cursor-pointer group"
                onClick={handleUploadClick}
            >
                <div className="w-16 h-16 bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 rounded-full flex items-center justify-center mx-auto mb-4 group-hover:scale-110 transition-transform">
                    <Upload className="w-8 h-8" />
                </div>
                <h3 className="text-lg font-medium text-black dark:text-white">點擊上傳文件</h3>
                <p className="text-black dark:text-neutral-400 mt-2">支援 PDF, Word (.docx), TXT</p>
            </div>
            <input
                ref={fileInputRef}
                type="file"
                className="hidden"
                accept=".pdf,.docx,.txt,.xlsx,.xls,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,text/plain"
                multiple
                onChange={handleFileChange}
            />

            {/* Queue */}
            <div className="space-y-4">
                <h2 className="text-lg font-medium text-black dark:text-white flex items-center">
                    上傳隊列
                    <span className="ml-2 text-xs bg-slate-200 dark:bg-neutral-800 text-black dark:text-neutral-300 px-2 flex items-center h-5 rounded-full">{uploads.length}</span>
                </h2>

                <div className="bg-white dark:bg-neutral-900 rounded-xl shadow-sm border-2 border-slate-300 dark:border-neutral-700 divide-y divide-slate-200 dark:divide-neutral-800 overflow-hidden">
                    {uploads.length === 0 && (
                        <div className="p-8 text-center text-black dark:text-neutral-400 text-sm">
                            尚未有上傳檔案
                        </div>
                    )}
                    {uploads.map(file => (
                        <div key={file.id} className="p-6">
                            <div className="flex items-center justify-between mb-6">
                                <div className="flex items-center space-x-4">
                                    <div className="w-10 h-10 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 rounded-lg flex items-center justify-center">
                                        <FileType className="w-6 h-6" />
                                    </div>
                                    <div>
                                        <h4 className="font-medium text-black dark:text-white">{file.name}</h4>
                                        <p className="text-sm text-black dark:text-neutral-400">{formatSize(file.sizeBytes)}</p>
                                    </div>
                                </div>
                                <div className="flex items-center space-x-3">
                                    <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${file.status === 'error'
                                        ? 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400'
                                        : 'bg-slate-100 dark:bg-neutral-800 text-black dark:text-neutral-300'
                                        }`}>
                                        {statusLabel[file.status]}
                                    </span>
                                </div>
                            </div>

                            {file.status === 'error' && file.errorMessage && (
                                <p className="text-sm text-red-600 dark:text-red-400 mb-4">{file.errorMessage}</p>
                            )}

                            {/* Stepper */}
                            <div className="relative">
                                <div className="absolute top-1/2 left-0 w-full h-1 bg-slate-200 dark:bg-neutral-800 -translate-y-1/2 z-0"></div>
                                <div
                                    className={`absolute top-1/2 left-0 h-1 -translate-y-1/2 transition-all duration-500 z-0 ${file.status === 'error' ? 'bg-red-500' : 'bg-green-500'}`}
                                    style={{ width: `${(statusStep[file.status] / 2) * 100}%` }}
                                ></div>

                                <div className="relative z-10 flex justify-between">
                                    {steps.map(s => {
                                        const currentStep = statusStep[file.status];
                                        const isCompleted = currentStep >= s.id;
                                        const isCurrent = currentStep === s.id;

                                        return (
                                            <div key={s.id} className="flex flex-col items-center group">
                                                <div
                                                    className={`w-8 h-8 rounded-full flex items-center justify-center border-2 transition-all duration-300 ${isCompleted
                                                        ? 'bg-white dark:bg-neutral-900 border-green-500 text-green-500'
                                                        : 'bg-white dark:bg-neutral-900 border-slate-300 dark:border-neutral-700 text-black dark:text-neutral-500'
                                                        } ${isCurrent ? 'ring-4 ring-green-100 dark:ring-green-900/30 scale-110' : ''}`}
                                                >
                                                    {isCompleted ? <CheckCircle2 className="w-5 h-5" /> : <span className="text-xs font-bold">{s.id + 1}</span>}
                                                </div>
                                                <span className={`mt-2 text-xs font-medium transition-colors ${isCompleted ? 'text-green-600 dark:text-green-400' : 'text-black dark:text-neutral-500'
                                                    }`}>
                                                    {s.label}
                                                </span>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
};

export default EduRagUploadPage;
