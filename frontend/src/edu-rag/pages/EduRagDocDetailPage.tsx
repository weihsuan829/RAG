import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, FileText, Calendar } from 'lucide-react';
import { listDocuments } from '../services/api';

type DocInfo = { name: string; size_bytes: number; updated_at: string };

// 文件詳情頁：僅顯示基本資訊（名稱/大小/更新時間），資料來源為後端已索引文件清單。
const EduRagDocDetailPage = () => {
    // 從路由動態參數抓文件名稱（DocsPage 目前以 `server-<name>` 作為 id 連結至此）。
    const { id } = useParams<{ id: string }>();
    const [doc, setDoc] = useState<DocInfo | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        let cancelled = false;
        listDocuments()
            .then((docs) => {
                if (cancelled) return;
                const targetName = id?.startsWith('server-') ? id.slice('server-'.length) : id;
                const found = docs.find((d) => d.name === targetName || d.name.split('/').pop() === targetName);
                setDoc(found ?? null);
            })
            .catch(() => { if (!cancelled) setDoc(null); })
            .finally(() => { if (!cancelled) setLoading(false); });
        return () => { cancelled = true; };
    }, [id]);

    return (
        <div className="p-8 max-w-5xl mx-auto space-y-6">
            <Link to="/app/edu-rag/admin/docs" className="flex items-center text-sm text-slate-600 dark:text-neutral-400 hover:text-black dark:hover:text-white transition mb-4">
                <ArrowLeft className="w-4 h-4 mr-1" />
                返回文件列表
            </Link>

            {/* Header */}
            <div className="card p-8 bg-white dark:bg-neutral-900 border border-slate-300 dark:border-neutral-700">
                {loading ? (
                    <div className="text-sm text-slate-500 dark:text-neutral-400">載入中...</div>
                ) : !doc ? (
                    <div className="text-sm text-slate-500 dark:text-neutral-400">找不到此文件</div>
                ) : (
                    <div className="flex items-start space-x-4">
                        <div className="w-12 h-12 bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 rounded-lg flex items-center justify-center">
                            <FileText className="w-6 h-6" />
                        </div>
                        <div>
                            <h1 className="text-xl font-bold text-black dark:text-white">{doc.name.split('/').pop()}</h1>
                            <div className="flex items-center space-x-4 mt-2 text-sm text-slate-600 dark:text-neutral-400">
                                <span className="flex items-center">
                                    <Calendar className="w-4 h-4 mr-1.5" />
                                    {new Date(doc.updated_at).toLocaleDateString('zh-TW')}
                                </span>
                                <span className="px-2 py-0.5 rounded-full bg-slate-100 dark:bg-neutral-800 text-slate-700 dark:text-neutral-300 text-xs">
                                    {(doc.size_bytes / 1024).toFixed(0)} KB
                                </span>
                                <span className="px-2 py-0.5 rounded-full bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-400 text-xs">
                                    已索引
                                </span>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default EduRagDocDetailPage;
