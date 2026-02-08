import { useEffect, useMemo, useRef, useState } from 'react';
import { Search, Filter, RefreshCw, Trash2, Download } from 'lucide-react';
import { renderAsync } from 'docx-preview';
import * as XLSX from 'xlsx';
import { deleteUpload, getUpload, listUploads, type UploadRecord } from '../utils/uploadStore';
import { Link } from 'react-router-dom';

const EduRagDocsPage = () => {
    const [docs, setDocs] = useState<UploadRecord[]>([]);
    const [query, setQuery] = useState('');
    const [previewUrl, setPreviewUrl] = useState<string | null>(null);
    const [previewName, setPreviewName] = useState<string>('');
    const [previewType, setPreviewType] = useState<string>('');
    const [previewBlob, setPreviewBlob] = useState<Blob | null>(null);
    const docxContainerRef = useRef<HTMLDivElement>(null);
    const [excelData, setExcelData] = useState<string[][] | null>(null);
    const [confirmTarget, setConfirmTarget] = useState<UploadRecord | null>(null);

    const refreshDocs = async () => {
        const items = await listUploads();
        setDocs(items);
    };

    useEffect(() => {
        refreshDocs();
        const onFocus = () => { void refreshDocs(); };
        window.addEventListener('focus', onFocus);
        return () => window.removeEventListener('focus', onFocus);
    }, []);

    useEffect(() => {
        return () => {
            if (previewUrl) URL.revokeObjectURL(previewUrl);
        };
    }, [previewUrl]);

    const completedDocs = useMemo(() => {
        return docs
            .filter(doc => doc.status === 'completed')
            .filter(doc => doc.name.toLowerCase().includes(query.toLowerCase()));
    }, [docs, query]);

    const openPreview = async (id: string) => {
        const record = await getUpload(id);
        if (!record) return;
        if (previewUrl) URL.revokeObjectURL(previewUrl);
        const url = URL.createObjectURL(record.blob);
        setPreviewUrl(url);
        setPreviewName(record.name);
        setPreviewType(record.type || 'application/octet-stream');
        setPreviewBlob(record.blob);
    };

    const closePreview = () => {
        if (previewUrl) URL.revokeObjectURL(previewUrl);
        setPreviewUrl(null);
        setPreviewName('');
        setPreviewType('');
        setPreviewBlob(null);
        setExcelData(null);
    };

    useEffect(() => {
        const isDocx = previewName.toLowerCase().endsWith('.docx');
        if (!previewBlob || !isDocx || !docxContainerRef.current) return;
        docxContainerRef.current.innerHTML = '';
        previewBlob.arrayBuffer().then((buffer) => {
            if (!docxContainerRef.current) return;
            void renderAsync(buffer, docxContainerRef.current, undefined, {
                className: 'docx-preview'
            });
        });
    }, [previewBlob, previewName]);

    useEffect(() => {
        const lowerName = previewName.toLowerCase();
        const isExcel = lowerName.endsWith('.xlsx') || lowerName.endsWith('.xls');
        if (!previewBlob || !isExcel) {
            setExcelData(null);
            return;
        }
        previewBlob.arrayBuffer().then((buffer) => {
            const workbook = XLSX.read(buffer, { type: 'array' });
            const sheetName = workbook.SheetNames[0];
            const sheet = workbook.Sheets[sheetName];
            const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false }) as Array<Array<string | number | null | undefined>>;
            const normalized = rows.map((row) => row.map((cell) => (cell === null || cell === undefined) ? '' : String(cell)));
            setExcelData(normalized);
        });
    }, [previewBlob, previewName]);

    const handleDelete = async (id: string) => {
        await deleteUpload(id);
        await refreshDocs();
        if (previewUrl) closePreview();
    };

    const handleDownload = async (id: string) => {
        const record = await getUpload(id);
        if (!record) return;
        const url = URL.createObjectURL(record.blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = record.name;
        document.body.appendChild(link);
        link.click();
        link.remove();
        URL.revokeObjectURL(url);
    };

    const typeLabel = (type: string, name: string) => {
        const lowerName = name.toLowerCase();
        if (type === 'application/pdf' || lowerName.endsWith('.pdf')) return 'pdf';
        if (type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' || lowerName.endsWith('.docx')) return 'word';
        if (type === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' || type === 'application/vnd.ms-excel' || lowerName.endsWith('.xlsx') || lowerName.endsWith('.xls')) return 'excel';
        return type || 'file';
    };

    return (
        <div className="p-8 max-w-7xl mx-auto space-y-6">
            <div className="flex items-center justify-between">
                <h1 className="text-2xl font-semibold text-slate-800">文件管理</h1>
                <Link to="/app/edu-rag/admin/upload" className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition">
                    前往上傳
                </Link>
            </div>

            {/* Filters */}
            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-wrap gap-4 items-center">
                <div className="relative flex-1 min-w-[200px]">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input
                        type="text"
                        placeholder="搜尋文件名稱..."
                        className="w-full pl-9 pr-4 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                    />
                </div>
                <button
                    className="flex items-center px-3 py-2 border border-slate-200 rounded-lg text-sm text-slate-600 hover:bg-slate-50"
                    onClick={refreshDocs}
                >
                    <RefreshCw className="w-4 h-4 mr-2" />
                    重新整理
                </button>
                <button className="flex items-center px-3 py-2 border border-slate-200 rounded-lg text-sm text-slate-600 hover:bg-slate-50">
                    <Filter className="w-4 h-4 mr-2" />
                    進階篩選
                </button>
            </div>

            {/* Table */}
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                <table className="w-full text-sm text-left">
                    <thead className="bg-slate-50 text-slate-500 font-medium border-b border-slate-200">
                        <tr>
                            <th className="px-6 py-4">文件名稱</th>
                            <th className="px-6 py-4">類型</th>
                            <th className="px-6 py-4">狀態</th>
                            <th className="px-6 py-4">更新時間</th>
                            <th className="px-6 py-4 text-right">操作</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                        {completedDocs.length === 0 && (
                            <tr>
                                <td className="px-6 py-8 text-center text-slate-500" colSpan={5}>
                                    尚無完成入庫的文件
                                </td>
                            </tr>
                        )}
                        {completedDocs.map(doc => (
                            <tr key={doc.id} className="hover:bg-slate-50/50 transition">
                                <td className="px-6 py-4 font-medium text-slate-800">
                                    <button
                                        className="text-blue-600 hover:text-blue-700"
                                        onClick={() => openPreview(doc.id)}
                                    >
                                        {doc.name}
                                    </button>
                                </td>
                                <td className="px-6 py-4">
                                    <span className="px-2 py-1 rounded text-xs font-medium bg-slate-100 text-slate-600 uppercase">
                                        {typeLabel(doc.type, doc.name)}
                                    </span>
                                </td>
                                <td className="px-6 py-4">
                                    <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-50 text-green-700">
                                        完成
                                    </span>
                                </td>
                                <td className="px-6 py-4 text-slate-500">
                                    {new Date(doc.updatedAt).toLocaleString()}
                                </td>
                                <td className="px-6 py-4 text-right">
                                    <div className="flex items-center justify-end space-x-2">
                                        <button
                                            className="p-1.5 text-slate-400 hover:text-red-600 rounded transition"
                                            title="刪除"
                                            onClick={() => setConfirmTarget(doc)}
                                        >
                                            <Trash2 className="w-4 h-4" />
                                        </button>
                                        <button
                                            className="p-1.5 text-slate-400 hover:text-blue-600 rounded transition"
                                            title="下載"
                                            onClick={() => handleDownload(doc.id)}
                                        >
                                            <Download className="w-4 h-4" />
                                        </button>
                                    </div>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {/* Preview Modal */}
            {previewUrl && (
                <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50">
                    <div className="bg-white rounded-2xl shadow-xl w-[90vw] h-[85vh] max-w-5xl overflow-hidden flex flex-col">
                        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
                            <div className="font-medium text-slate-800 truncate">{previewName}</div>
                            <button
                                className="text-slate-500 hover:text-slate-700"
                                onClick={closePreview}
                            >
                                關閉
                            </button>
                        </div>
                        <div className="flex-1 bg-slate-50 overflow-auto">
                            {previewType === 'application/pdf' || previewName.toLowerCase().endsWith('.pdf') ? (
                                <iframe
                                    title={previewName}
                                    src={`${previewUrl}#toolbar=0&navpanes=0&scrollbar=1`}
                                    className="w-full h-full"
                                />
                            ) : previewName.toLowerCase().endsWith('.docx') ? (
                                <div className="w-full min-h-full p-6">
                                    <div ref={docxContainerRef} />
                                </div>
                            ) : previewName.toLowerCase().endsWith('.xlsx') || previewName.toLowerCase().endsWith('.xls') ? (
                                <div className="w-full min-h-full p-6 overflow-auto">
                                    {excelData ? (
                                        <table className="min-w-full text-xs border-collapse">
                                            <tbody>
                                                {excelData.map((row, rowIndex) => (
                                                    <tr key={rowIndex}>
                                                        {row.map((cell, cellIndex) => (
                                                            <td
                                                                key={cellIndex}
                                                                className="border border-slate-200 px-2 py-1 whitespace-pre-wrap"
                                                            >
                                                                {cell}
                                                            </td>
                                                        ))}
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    ) : (
                                        <div className="text-slate-500 text-sm">正在載入 Excel...</div>
                                    )}
                                </div>
                            ) : (
                                <div className="p-6 text-slate-600 text-sm">此檔案格式尚未支援預覽。</div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* Delete Confirm Modal */}
            {confirmTarget && (
                <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50">
                    <div className="bg-white rounded-2xl shadow-xl w-[92vw] max-w-md overflow-hidden">
                        <div className="px-6 py-5 border-b border-slate-200">
                            <div className="text-lg font-semibold text-slate-800">確認刪除</div>
                            <div className="text-sm text-slate-500 mt-1">
                                這個動作無法復原，請確認是否刪除以下文件：
                            </div>
                        </div>
                        <div className="px-6 py-4">
                            <div className="text-sm font-medium text-slate-700 break-all">
                                {confirmTarget.name}
                            </div>
                        </div>
                        <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex items-center justify-end gap-3">
                            <button
                                className="px-4 py-2 rounded-lg text-slate-600 hover:text-slate-800 hover:bg-white transition"
                                onClick={() => setConfirmTarget(null)}
                            >
                                取消
                            </button>
                            <button
                                className="px-4 py-2 rounded-lg bg-red-600 text-white hover:bg-red-500 transition"
                                onClick={async () => {
                                    const id = confirmTarget.id;
                                    setConfirmTarget(null);
                                    await handleDelete(id);
                                }}
                            >
                                確定刪除
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default EduRagDocsPage;
