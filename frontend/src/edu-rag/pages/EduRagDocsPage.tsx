import { useEffect, useMemo, useRef, useState } from 'react';
import { Search, Filter, RefreshCw, Trash2, Download, Maximize2, Minimize2 } from 'lucide-react';
import { renderAsync } from 'docx-preview';
import * as XLSX from 'xlsx';
import { deleteUpload, getUpload, listUploads, type UploadRecord } from '../utils/uploadStore';
import { listDocuments, requestDownloadUrl } from '../services/api';
import { Link } from 'react-router-dom';

// 伺服器端已索引文件的顯示型別（key 為儲存用名稱，name 為顯示用真名，無本地 blob 可預覽）。
type ServerDoc = {
    id: string;
    key: string;
    name: string;
    type: string;
    updatedAt: number;
    sizeLabel: string;
    isServer: true;
};

// 文件管理頁：列表、搜尋、預覽、下載與刪除。
const EduRagDocsPage = () => {
    // 已上傳文件清單與搜尋字串。
    const [docs, setDocs] = useState<Array<UploadRecord | ServerDoc>>([]);
    const [query, setQuery] = useState('');
    // 預覽 modal 狀態（URL/檔名/類型/Blob）。
    const [previewUrl, setPreviewUrl] = useState<string | null>(null);
    const [previewName, setPreviewName] = useState<string>('');
    const [previewType, setPreviewType] = useState<string>('');
    const [previewBlob, setPreviewBlob] = useState<Blob | null>(null);
    const docxContainerRef = useRef<HTMLDivElement>(null);
    const [excelData, setExcelData] = useState<string[][] | null>(null);
    const [sheetNames, setSheetNames] = useState<string[]>([]);
    const [activeSheetName, setActiveSheetName] = useState<string>('');
    const [workbook, setWorkbook] = useState<XLSX.WorkBook | null>(null);
    // 刪除確認目標；有值時開啟確認 modal。
    const [confirmTarget, setConfirmTarget] = useState<UploadRecord | null>(null);
    const [isPreviewExpanded, setIsPreviewExpanded] = useState(false);
    // 正在請求下載連結的伺服器文件 id，避免重複點擊。
    const [downloadingId, setDownloadingId] = useState<string | null>(null);

    // 依副檔名判斷顯示用的檔案類型標籤。
    const inferType = (name: string) => {
        const lowerName = name.toLowerCase();
        if (lowerName.endsWith('.pdf')) return 'application/pdf';
        if (lowerName.endsWith('.docx')) return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
        if (lowerName.endsWith('.xlsx') || lowerName.endsWith('.xls')) return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
        return 'text/plain';
    };

    // 重新讀取文件資料：本地上傳紀錄（可預覽/刪除） + 伺服器已索引文件（唯讀清單）。
    const refreshDocs = async () => {
        const items = await listUploads();
        let serverDocs: ServerDoc[] = [];
        try {
            const remote = await listDocuments();
            serverDocs = remote.map((d) => {
                return {
                    id: `server-${d.name}`,
                    key: d.name,
                    name: d.display_name,
                    type: inferType(d.display_name),
                    updatedAt: new Date(d.updated_at).getTime(),
                    sizeLabel: `${(d.size_bytes / 1024).toFixed(0)} KB`,
                    isServer: true as const,
                };
            });
        } catch {
            serverDocs = [];
        }
        setDocs([...items, ...serverDocs]);
    };

    // 初次載入與視窗回焦時刷新，避免跨頁操作後資料過期。
    useEffect(() => {
        refreshDocs();
        const onFocus = () => { void refreshDocs(); };
        window.addEventListener('focus', onFocus);
        return () => window.removeEventListener('focus', onFocus);
    }, []);

    // 預覽 URL 清理：避免 object URL 泄漏。
    useEffect(() => {
        return () => {
            if (previewUrl) URL.revokeObjectURL(previewUrl);
        };
    }, [previewUrl]);

    // 僅顯示 completed 的本地上傳紀錄，以及所有伺服器已索引文件，並符合搜尋條件。
    const completedDocs = useMemo(() => {
        return docs
            .filter(doc => (doc as UploadRecord).status === 'completed' || (doc as ServerDoc).isServer)
            .filter(doc => doc.name.toLowerCase().includes(query.toLowerCase()));
    }, [docs, query]);

    // 開啟預覽：讀取紀錄並建立 object URL（伺服器已索引文件無本地 blob，不支援預覽）。
    const openPreview = async (id: string) => {
        const doc = docs.find(d => d.id === id);
        if (!doc || (doc as ServerDoc).isServer) return;

        if (previewUrl) URL.revokeObjectURL(previewUrl);

        const record = await getUpload(id);
        if (!record) return;
        const url = URL.createObjectURL(record.blob);
        setPreviewUrl(url);
        setPreviewName(record.name);
        setPreviewType(record.type || 'application/octet-stream');
        setPreviewBlob(record.blob);
    };

    // 關閉預覽：釋放 URL 並重置狀態。
    const closePreview = () => {
        if (previewUrl) URL.revokeObjectURL(previewUrl);
        setPreviewUrl(null);
        setPreviewName('');
        setPreviewType('');
        setPreviewBlob(null);
        setExcelData(null);
        setWorkbook(null);
        setSheetNames([]);
        setActiveSheetName('');
        setIsPreviewExpanded(false);
    };

    // DOCX 預覽：使用 docx-preview 渲染到容器。
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

    // Excel 預覽：解析整個 Workbook 並初始化分頁。
    useEffect(() => {
        const lowerName = previewName.toLowerCase();
        const isExcel = lowerName.endsWith('.xlsx') || lowerName.endsWith('.xls');
        if (!previewBlob || !isExcel) {
            setExcelData(null);
            setWorkbook(null);
            setSheetNames([]);
            setActiveSheetName('');
            return;
        }
        previewBlob.arrayBuffer().then((buffer) => {
            const wb = XLSX.read(buffer, { type: 'array' });
            setWorkbook(wb);
            setSheetNames(wb.SheetNames);
            const firstSheet = wb.SheetNames[0];
            setActiveSheetName(firstSheet);

            // 初始顯示第一張表
            const sheet = wb.Sheets[firstSheet];
            const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false }) as Array<Array<string | number | null | undefined>>;
            const normalized = rows.map((row) => row.map((cell) => (cell === null || cell === undefined) ? '' : String(cell)));
            setExcelData(normalized);
        });
    }, [previewBlob, previewName]);

    // 切換 Excel 分頁。
    const handleSheetChange = (name: string) => {
        if (!workbook) return;
        setActiveSheetName(name);
        const sheet = workbook.Sheets[name];
        const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false }) as Array<Array<string | number | null | undefined>>;
        const normalized = rows.map((row) => row.map((cell) => (cell === null || cell === undefined) ? '' : String(cell)));
        setExcelData(normalized);
    };

    // 刪除文件後刷新列表；若正在預覽則一併關閉。
    const handleDelete = async (id: string) => {
        const doc = docs.find(d => d.id === id);
        if ((doc as ServerDoc)?.isServer) {
            alert('已索引文件無法在此刪除');
            return;
        }
        await deleteUpload(id);
        await refreshDocs();
        if (previewUrl) closePreview();
    };

    // 下載文件：建立暫時下載連結並觸發 click（伺服器已索引文件無本地檔案可下載）。
    const handleDownload = async (id: string) => {
        const doc = docs.find(d => d.id === id);
        if (!doc || (doc as ServerDoc).isServer) return;

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

    // 下載伺服器已索引文件：向後端請求 presigned URL 後通過錨點點擊下載（保留原始檔名、繞過彈出式視窗阻止器）。
    const handleServerDownload = async (doc: ServerDoc) => {
        if (downloadingId === doc.id) return;
        setDownloadingId(doc.id);
        try {
            const { download_url } = await requestDownloadUrl(doc.key);
            const a = document.createElement('a');
            a.href = download_url;
            a.rel = 'noopener';
            document.body.appendChild(a);
            a.click();
            a.remove();
        } catch {
            alert('下載失敗，請稍後再試');
        } finally {
            setDownloadingId(null);
        }
    };

    // 依 MIME/type + 副檔名回傳顯示用類型標籤。
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
                <h1 className="text-2xl font-semibold text-black dark:text-white">文件管理</h1>
                <Link to="/app/edu-rag/admin/upload" className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition font-medium">
                    前往上傳
                </Link>
            </div>

            {/* Filters */}
            <div className="card p-4 flex flex-wrap gap-4 items-center">
                <div className="relative flex-1 min-w-[200px]">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 dark:text-neutral-400" />
                    <input
                        type="text"
                        placeholder="搜尋文件名稱..."
                        className="w-full pl-9 pr-4 py-2 border border-slate-300 dark:border-neutral-700 rounded-lg text-sm bg-transparent text-black dark:text-white placeholder:text-slate-500 dark:placeholder:text-neutral-500 focus:outline-none focus:ring-2 focus:ring-blue-500 font-sans"
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                    />
                </div>
                <button
                    className="flex items-center px-3 py-2 border border-slate-300 dark:border-neutral-700 rounded-lg text-sm text-slate-700 dark:text-neutral-300 hover:bg-slate-100 dark:hover:bg-neutral-800 transition"
                    onClick={refreshDocs}
                >
                    <RefreshCw className="w-4 h-4 mr-2" />
                    重新整理
                </button>
                <button className="flex items-center px-3 py-2 border border-slate-300 dark:border-neutral-700 rounded-lg text-sm text-slate-700 dark:text-neutral-300 hover:bg-slate-100 dark:hover:bg-neutral-800 transition">
                    <Filter className="w-4 h-4 mr-2" />
                    進階篩選
                </button>
            </div>

            {/* Table */}
            <div className="card overflow-hidden">
                <table className="w-full text-sm text-left">
                    <thead className="bg-slate-100 dark:bg-neutral-800 text-slate-700 dark:text-neutral-300 font-medium border-b border-slate-300 dark:border-neutral-700">
                        <tr>
                            <th className="px-6 py-4">文件名稱</th>
                            <th className="px-6 py-4">類型</th>
                            <th className="px-6 py-4">大小</th>
                            <th className="px-6 py-4">狀態</th>
                            <th className="px-6 py-4">更新時間</th>
                            <th className="px-6 py-4 text-right">操作</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 dark:divide-neutral-800">
                        {completedDocs.length === 0 && (
                            <tr>
                                <td className="px-6 py-8 text-center text-slate-500 dark:text-neutral-400" colSpan={6}>
                                    尚無完成入庫的文件
                                </td>
                            </tr>
                        )}
                        {completedDocs.map(doc => {
                            const isServer = (doc as ServerDoc).isServer === true;
                            const sizeLabel = isServer
                                ? (doc as ServerDoc).sizeLabel
                                : `${((doc as UploadRecord).sizeBytes / 1024).toFixed(0)} KB`;
                            return (
                                <tr key={doc.id} className="hover:bg-slate-50 dark:hover:bg-neutral-800/50 transition">
                                    <td className="px-6 py-4 font-medium text-black dark:text-white">
                                        {isServer ? (
                                            <button
                                                className="text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 hover:underline cursor-pointer disabled:cursor-wait disabled:opacity-60"
                                                onClick={() => handleServerDownload(doc as ServerDoc)}
                                                disabled={downloadingId === doc.id}
                                            >
                                                {doc.name}
                                            </button>
                                        ) : (
                                            <button
                                                className="text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 hover:underline"
                                                onClick={() => openPreview(doc.id)}
                                            >
                                                {doc.name}
                                            </button>
                                        )}
                                    </td>
                                    <td className="px-6 py-4">
                                        <span className="px-2 py-1 rounded text-xs font-medium bg-slate-200 dark:bg-neutral-700 text-slate-800 dark:text-neutral-200 uppercase">
                                            {typeLabel(doc.type, doc.name)}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4 text-slate-600 dark:text-neutral-400">
                                        {sizeLabel}
                                    </td>
                                    <td className="px-6 py-4">
                                        <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-400">
                                            已索引
                                        </span>
                                    </td>
                                    <td className="px-6 py-4 text-slate-600 dark:text-neutral-400">
                                        {new Date(doc.updatedAt).toLocaleDateString('zh-TW')}
                                    </td>
                                    <td className="px-6 py-4 text-right">
                                        <div className="flex items-center justify-end space-x-2">
                                            {isServer ? (
                                                <span className="p-1.5 text-slate-300 dark:text-neutral-600 cursor-not-allowed" title="已索引文件無法在此刪除">
                                                    <Trash2 className="w-4 h-4" />
                                                </span>
                                            ) : (
                                                <button
                                                    className="p-1.5 text-slate-500 dark:text-neutral-400 hover:text-red-600 dark:hover:text-red-400 rounded transition"
                                                    title="刪除"
                                                    onClick={() => setConfirmTarget(doc as UploadRecord)}
                                                >
                                                    <Trash2 className="w-4 h-4" />
                                                </button>
                                            )}
                                            <button
                                                className="p-1.5 rounded transition text-slate-500 dark:text-neutral-400 hover:text-blue-600 dark:hover:text-blue-400 disabled:opacity-60 disabled:cursor-wait"
                                                title="下載"
                                                disabled={isServer && downloadingId === doc.id}
                                                onClick={() => (isServer ? handleServerDownload(doc as ServerDoc) : handleDownload(doc.id))}
                                            >
                                                <Download className="w-4 h-4" />
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>

            {/* Preview Modal */}
            {previewUrl && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-md flex items-center justify-center z-50">
                    <div className={`bg-white dark:bg-neutral-900 rounded-2xl shadow-xl overflow-hidden flex flex-col border border-slate-300 dark:border-neutral-700 transition-all duration-300 ${isPreviewExpanded ? 'w-[98vw] h-[95vh]' : 'w-[90vw] h-[85vh] max-w-5xl'
                        }`}>
                        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-300 dark:border-neutral-700 shrink-0">
                            <div className="flex items-center gap-4 min-w-0">
                                <div className="font-semibold text-black dark:text-white truncate">{previewName}</div>
                                <button
                                    onClick={() => setIsPreviewExpanded(!isPreviewExpanded)}
                                    className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-neutral-800 text-slate-500 dark:text-neutral-400 transition-colors"
                                    title={isPreviewExpanded ? "縮小" : "放大"}
                                >
                                    {isPreviewExpanded ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
                                </button>
                            </div>
                            <button
                                className="text-slate-500 dark:text-neutral-400 hover:text-black dark:hover:text-white px-3 py-1 rounded-lg border border-slate-300 dark:border-neutral-700 text-sm font-medium hover:bg-slate-50 dark:hover:bg-neutral-800 transition-colors"
                                onClick={closePreview}
                            >
                                關閉
                            </button>
                        </div>
                        <div className="flex-1 bg-slate-50 dark:bg-black overflow-auto">
                            {previewType === 'application/pdf' || previewName.toLowerCase().endsWith('.pdf') ? (
                                <iframe
                                    title={previewName}
                                    src={`${previewUrl}#toolbar=0&navpanes=0&scrollbar=1`}
                                    className="w-full h-full"
                                />
                            ) : previewName.toLowerCase().endsWith('.docx') ? (
                                <div className="w-full min-h-full p-6 text-black dark:text-white">
                                    <div ref={docxContainerRef} />
                                </div>
                            ) : previewName.toLowerCase().endsWith('.xlsx') || previewName.toLowerCase().endsWith('.xls') ? (
                                <div className="w-full h-full flex flex-col overflow-hidden">
                                    {/* Sheet Tabs */}
                                    {sheetNames.length > 1 && (
                                        <div className="flex items-center space-x-1 px-6 py-2 bg-slate-100 dark:bg-neutral-800 border-b border-slate-300 dark:border-neutral-700 shrink-0 overflow-x-auto no-scrollbar">
                                            {sheetNames.map(name => (
                                                <button
                                                    key={name}
                                                    onClick={() => handleSheetChange(name)}
                                                    className={`px-4 py-1.5 text-xs font-medium rounded-t-lg border-b-2 transition-all shrink-0 ${activeSheetName === name
                                                        ? 'bg-white dark:bg-neutral-900 border-blue-500 text-blue-600 dark:text-blue-400 shadow-sm'
                                                        : 'bg-transparent border-transparent text-slate-500 dark:text-neutral-500 hover:text-slate-800 dark:hover:text-neutral-300'
                                                        }`}
                                                >
                                                    {name}
                                                </button>
                                            ))}
                                        </div>
                                    )}

                                    {/* Excel Table Area */}
                                    <div className="flex-1 p-6 overflow-auto">
                                        {excelData ? (
                                            <table className="min-w-full text-sm border-collapse bg-white dark:bg-neutral-900 text-black dark:text-white shadow-sm ring-1 ring-slate-200 dark:ring-neutral-800">
                                                <tbody>
                                                    {excelData.map((row, rowIndex) => (
                                                        <tr key={rowIndex} className="hover:bg-slate-50 dark:hover:bg-neutral-800/30">
                                                            {row.map((cell, cellIndex) => (
                                                                <td
                                                                    key={cellIndex}
                                                                    className="border border-slate-200 dark:border-neutral-800 px-3 py-2 whitespace-pre-wrap min-w-[100px]"
                                                                >
                                                                    {cell}
                                                                </td>
                                                            ))}
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        ) : (
                                            <div className="flex items-center justify-center h-full text-slate-600 dark:text-neutral-400 text-sm italic">
                                                正在載入 Excel 數據...
                                            </div>
                                        )}
                                    </div>
                                </div>
                            ) : (
                                <div className="p-6 text-slate-600 dark:text-neutral-400 text-sm">此檔案格式尚未支援預覽。</div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* Delete Confirm Modal */}
            {confirmTarget && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-md flex items-center justify-center z-50">
                    <div className="card w-[92vw] max-w-md overflow-hidden bg-white dark:bg-neutral-900 border border-slate-300 dark:border-neutral-700">
                        <div className="px-6 py-5 border-b border-slate-300 dark:border-neutral-700">
                            <div className="text-xl font-semibold text-black dark:text-white">確認刪除</div>
                            <div className="text-sm text-slate-600 dark:text-neutral-400 mt-2">
                                這個動作無法復原，請確認是否刪除以下文件：
                            </div>
                        </div>
                        <div className="px-6 py-4">
                            <div className="text-sm font-medium text-black dark:text-white break-all bg-slate-100 dark:bg-neutral-800 p-3 rounded-lg border border-slate-300 dark:border-neutral-700">
                                {confirmTarget.name}
                            </div>
                        </div>
                        <div className="px-6 py-4 bg-slate-50 dark:bg-neutral-900 border-t border-slate-300 dark:border-neutral-700 flex items-center justify-end gap-3">
                            <button
                                className="px-5 py-2 rounded-xl border border-slate-300 dark:border-neutral-700 font-medium text-slate-700 dark:text-neutral-300 hover:text-black dark:hover:text-white hover:bg-slate-100 dark:hover:bg-neutral-800 transition"
                                onClick={() => setConfirmTarget(null)}
                            >
                                取消
                            </button>
                            <button
                                className="px-5 py-2 rounded-xl bg-red-600 text-white font-medium hover:bg-red-700 active:scale-95 transition"
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
