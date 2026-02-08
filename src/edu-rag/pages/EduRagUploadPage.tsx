import { useEffect, useRef, useState } from 'react';
import { Upload, FileType, CheckCircle2 } from 'lucide-react';
import { listUploads, saveUpload, updateUpload, type UploadRecord, type UploadStatus } from '../utils/uploadStore';

const EduRagUploadPage = () => {
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [uploads, setUploads] = useState<UploadRecord[]>([]);

    const steps = [
        { id: 0, label: '上傳' },
        { id: 1, label: '解析' },
        { id: 2, label: '完成' }
    ];

    const refreshUploads = async () => {
        const items = await listUploads();
        setUploads(items);
    };

    useEffect(() => {
        refreshUploads();
    }, []);

    const handleUploadClick = () => {
        fileInputRef.current?.click();
    };

    const updateStatus = async (id: string, status: UploadStatus) => {
        setUploads(prev => prev.map(item => item.id === id ? { ...item, status, updatedAt: Date.now() } : item));
        await updateUpload(id, { status, updatedAt: Date.now() });
    };

    const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        const files = Array.from(event.target.files ?? []);
        if (files.length === 0) return;

        const newItems: UploadRecord[] = files.map((file) => ({
            id: crypto?.randomUUID?.() ?? `${file.name}-${file.size}-${file.lastModified}`,
            name: file.name,
            sizeBytes: file.size,
            type: file.type || 'application/octet-stream',
            updatedAt: Date.now(),
            status: 'uploading',
            blob: file
        }));

        newItems.forEach(async (item) => {
            await saveUpload(item);
            setUploads((prev) => [item, ...prev]);
            setTimeout(() => { void updateStatus(item.id, 'parsing'); }, 600);
            setTimeout(() => { void updateStatus(item.id, 'completed'); }, 1800);
        });

        event.target.value = '';
    };

    const formatSize = (bytes: number) => `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    const statusLabel: Record<UploadStatus, string> = {
        uploading: '上傳中',
        parsing: '解析中',
        completed: '完成'
    };
    const statusStep: Record<UploadStatus, number> = {
        uploading: 0,
        parsing: 1,
        completed: 2
    };

    return (
        <div className="p-8 max-w-5xl mx-auto space-y-8">
            <h1 className="text-2xl font-semibold text-slate-800 dark:text-slate-200">文件上傳</h1>

            {/* Upload Area */}
            <div
                className="border-2 border-dashed border-slate-300 rounded-2xl bg-slate-50 p-12 text-center hover:bg-white hover:border-blue-400 transition-all cursor-pointer group"
                onClick={handleUploadClick}
            >
                <div className="w-16 h-16 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center mx-auto mb-4 group-hover:scale-110 transition-transform">
                    <Upload className="w-8 h-8" />
                </div>
                <h3 className="text-lg font-medium text-slate-700">點擊上傳文件</h3>
                <p className="text-slate-500 mt-2">支援 PDF, Word (.docx), TXT</p>
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
                <h2 className="text-lg font-medium text-slate-800 flex items-center dark:text-slate-200">
                    上傳隊列
                    <span className="ml-2 text-xs bg-slate-200 text-slate-600 px-2 py-0.5 rounded-full">{uploads.length}</span>
                </h2>

                <div className="bg-white rounded-xl shadow-sm border border-slate-200 divide-y divide-slate-100 overflow-hidden">
                    {uploads.length === 0 && (
                        <div className="p-8 text-center text-slate-500 text-sm">
                            尚未有上傳檔案
                        </div>
                    )}
                    {uploads.map(file => (
                        <div key={file.id} className="p-6">
                            <div className="flex items-center justify-between mb-6">
                                <div className="flex items-center space-x-4">
                                    <div className="w-10 h-10 bg-red-50 text-red-600 rounded-lg flex items-center justify-center">
                                        <FileType className="w-6 h-6" />
                                    </div>
                                    <div>
                                        <h4 className="font-medium text-slate-800">{file.name}</h4>
                                        <p className="text-sm text-slate-500">{formatSize(file.sizeBytes)}</p>
                                    </div>
                                </div>
                                <div className="flex items-center space-x-3">
                                    <span className="text-xs font-medium px-2.5 py-1 rounded-full bg-slate-100 text-slate-600">
                                        {statusLabel[file.status]}
                                    </span>
                                </div>
                            </div>

                            {/* Stepper */}
                            <div className="relative">
                                <div className="absolute top-1/2 left-0 w-full h-1 bg-slate-100 -translate-y-1/2 z-0"></div>
                                <div
                                    className="absolute top-1/2 left-0 h-1 bg-green-500 -translate-y-1/2 transition-all duration-500 z-0"
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
                                                        ? 'bg-white border-green-500 text-green-500'
                                                        : 'bg-white border-slate-300 text-slate-300'
                                                        } ${isCurrent ? 'ring-4 ring-green-100 scale-110' : ''}`}
                                                >
                                                    {isCompleted ? <CheckCircle2 className="w-5 h-5" /> : <span className="text-xs font-bold">{s.id + 1}</span>}
                                                </div>
                                                <span className={`mt-2 text-xs font-medium transition-colors ${isCompleted ? 'text-green-600' : 'text-slate-400'
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
