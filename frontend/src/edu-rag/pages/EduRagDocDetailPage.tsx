import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, FileText, Calendar, Tag, RefreshCw, Trash2, ChevronDown, ChevronUp } from 'lucide-react';
import { MOCK_DOCS, MOCK_CHUNKS } from '../mockEduRag';

// 文件詳情頁（目前為 mock 資料展示）：顯示基本資訊與 chunk 抽樣。
const EduRagDocDetailPage = () => {
    // 從路由動態參數抓文件 id。
    const { id } = useParams<{ id: string }>();
    // 以 mock 資料匹配文件，找不到時回退第一筆。
    const doc = MOCK_DOCS.find(d => d.id === id) || MOCK_DOCS[0]; // Fallback for mock
    // 控制 chunk 區塊是否展開。
    const [chunksExpanded, setChunksExpanded] = useState(true);

    if (!doc) return <div>Document not found</div>;

    return (
        <div className="p-8 max-w-5xl mx-auto space-y-6">
            <Link to="/app/edu-rag/admin/docs" className="flex items-center text-sm text-slate-600 dark:text-neutral-400 hover:text-black dark:hover:text-white transition mb-4">
                <ArrowLeft className="w-4 h-4 mr-1" />
                返回文件列表
            </Link>

            {/* Header */}
            <div className="card p-8 bg-white dark:bg-neutral-900 border border-slate-300 dark:border-neutral-700">
                <div className="flex items-start justify-between">
                    <div className="flex items-start space-x-4">
                        <div className="w-12 h-12 bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 rounded-lg flex items-center justify-center">
                            <FileText className="w-6 h-6" />
                        </div>
                        <div>
                            <h1 className="text-xl font-bold text-black dark:text-white">{doc.name}</h1>
                            <div className="flex items-center space-x-4 mt-2 text-sm text-slate-600 dark:text-neutral-400">
                                <span className="flex items-center">
                                    <Calendar className="w-4 h-4 mr-1.5" />
                                    {doc.updatedAt}
                                </span>
                                <span className="flex items-center">
                                    <Tag className="w-4 h-4 mr-1.5" />
                                    {doc.tags.join(', ')}
                                </span>
                                <span className="px-2 py-0.5 rounded-full bg-slate-100 dark:bg-neutral-800 text-slate-700 dark:text-neutral-300 text-xs">
                                    {doc.year} 學年度
                                </span>
                            </div>
                        </div>
                    </div>
                    <div className="flex space-x-3">
                        <button className="flex items-center space-x-2 px-4 py-2 bg-white dark:bg-neutral-900 border border-slate-300 dark:border-neutral-700 text-slate-700 dark:text-neutral-300 rounded-lg hover:bg-slate-50 dark:hover:bg-neutral-800 transition">
                            <RefreshCw className="w-4 h-4" />
                            <span>重新索引</span>
                        </button>
                        <button className="flex items-center space-x-2 px-4 py-2 bg-white dark:bg-neutral-900 border border-red-300 dark:border-red-900/50 text-red-600 dark:text-red-400 rounded-lg hover:bg-red-50 dark:hover:bg-red-950/30 transition">
                            <Trash2 className="w-4 h-4" />
                            <span>刪除文件</span>
                        </button>
                    </div>
                </div>
            </div>

            {/* Chunk Preview */}
            <div className="card overflow-hidden bg-white dark:bg-neutral-900 border border-slate-300 dark:border-neutral-700">
                <div
                    className="p-6 border-b border-slate-300 dark:border-neutral-700 flex items-center justify-between cursor-pointer hover:bg-slate-50 dark:hover:bg-neutral-800 transition"
                    onClick={() => setChunksExpanded(!chunksExpanded)}
                >
                    <h3 className="font-semibold text-black dark:text-white flex items-center">
                        Chunk 抽樣預覽
                        <span className="ml-2 text-xs bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 px-2 flex items-center h-5 rounded-full">{MOCK_CHUNKS.length} chunks</span>
                    </h3>
                    {chunksExpanded ? <ChevronUp className="w-5 h-5 text-slate-500 dark:text-neutral-400" /> : <ChevronDown className="w-5 h-5 text-slate-500 dark:text-neutral-400" />}
                </div>

                {chunksExpanded && (
                    <div className="divide-y divide-slate-200 dark:divide-neutral-800">
                        {MOCK_CHUNKS.map((chunk) => (
                            <div key={chunk.id} className="p-6 hover:bg-slate-50 dark:hover:bg-neutral-800/50 transition">
                                <div className="flex items-center justify-between mb-2">
                                    <span className="text-xs font-mono text-slate-500 dark:text-neutral-500">ID: {chunk.id}</span>
                                    <span className="text-xs font-medium text-slate-600 dark:text-neutral-400 bg-slate-100 dark:bg-neutral-800 px-2 py-1 rounded">Page {chunk.page}</span>
                                </div>
                                <p className="text-sm text-black dark:text-white leading-relaxed font-mono">
                                    {chunk.content}
                                </p>
                            </div>
                        ))}
                        <div className="p-4 bg-slate-50 dark:bg-neutral-900 text-center text-xs text-slate-600 dark:text-neutral-400 border-t border-slate-300 dark:border-neutral-700">
                            僅顯示前 5 筆 Chunk 作為預覽
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default EduRagDocDetailPage;
