import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, FileText, Calendar, Tag, RefreshCw, Trash2, ChevronDown, ChevronUp } from 'lucide-react';
import { MOCK_DOCS, MOCK_CHUNKS } from '../mockEduRag';

const EduRagDocDetailPage = () => {
    const { id } = useParams<{ id: string }>();
    const doc = MOCK_DOCS.find(d => d.id === id) || MOCK_DOCS[0]; // Fallback for mock
    const [chunksExpanded, setChunksExpanded] = useState(true);

    if (!doc) return <div>Document not found</div>;

    return (
        <div className="p-8 max-w-5xl mx-auto space-y-6">
            <Link to="/app/edu-rag/admin/docs" className="flex items-center text-sm text-slate-500 hover:text-slate-800 transition mb-4">
                <ArrowLeft className="w-4 h-4 mr-1" />
                返回文件列表
            </Link>

            {/* Header */}
            <div className="bg-white p-8 rounded-xl border border-slate-200 shadow-sm">
                <div className="flex items-start justify-between">
                    <div className="flex items-start space-x-4">
                        <div className="w-12 h-12 bg-blue-50 text-blue-600 rounded-lg flex items-center justify-center">
                            <FileText className="w-6 h-6" />
                        </div>
                        <div>
                            <h1 className="text-xl font-bold text-slate-800">{doc.name}</h1>
                            <div className="flex items-center space-x-4 mt-2 text-sm text-slate-500">
                                <span className="flex items-center">
                                    <Calendar className="w-4 h-4 mr-1.5" />
                                    {doc.updatedAt}
                                </span>
                                <span className="flex items-center">
                                    <Tag className="w-4 h-4 mr-1.5" />
                                    {doc.tags.join(', ')}
                                </span>
                                <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 text-xs">
                                    {doc.year} 學年度
                                </span>
                            </div>
                        </div>
                    </div>
                    <div className="flex space-x-3">
                        <button className="flex items-center space-x-2 px-4 py-2 bg-white border border-slate-200 text-slate-700 rounded-lg hover:bg-slate-50 transition">
                            <RefreshCw className="w-4 h-4" />
                            <span>重新索引</span>
                        </button>
                        <button className="flex items-center space-x-2 px-4 py-2 bg-white border border-red-200 text-red-600 rounded-lg hover:bg-red-50 transition">
                            <Trash2 className="w-4 h-4" />
                            <span>刪除文件</span>
                        </button>
                    </div>
                </div>
            </div>

            {/* Chunk Preview */}
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                <div
                    className="p-6 border-b border-slate-200 flex items-center justify-between cursor-pointer hover:bg-slate-50 transition"
                    onClick={() => setChunksExpanded(!chunksExpanded)}
                >
                    <h3 className="font-semibold text-slate-800 flex items-center">
                        Chunk 抽樣預覽
                        <span className="ml-2 text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">{MOCK_CHUNKS.length} chunks</span>
                    </h3>
                    {chunksExpanded ? <ChevronUp className="w-5 h-5 text-slate-400" /> : <ChevronDown className="w-5 h-5 text-slate-400" />}
                </div>

                {chunksExpanded && (
                    <div className="divide-y divide-slate-100">
                        {MOCK_CHUNKS.map((chunk) => (
                            <div key={chunk.id} className="p-6 hover:bg-slate-50/50 transition">
                                <div className="flex items-center justify-between mb-2">
                                    <span className="text-xs font-mono text-slate-400">ID: {chunk.id}</span>
                                    <span className="text-xs font-medium text-slate-500 bg-slate-100 px-2 py-1 rounded">Page {chunk.page}</span>
                                </div>
                                <p className="text-sm text-slate-700 leading-relaxed font-mono">
                                    {chunk.content}
                                </p>
                            </div>
                        ))}
                        <div className="p-4 bg-slate-50 text-center text-xs text-slate-500 border-t border-slate-100">
                            僅顯示前 5 筆 Chunk 作為預覽
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default EduRagDocDetailPage;
