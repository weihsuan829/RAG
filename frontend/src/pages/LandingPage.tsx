import { useNavigate } from 'react-router-dom';
import { Database, Search, FileText, ArrowRight, ShieldCheck } from 'lucide-react';

const LandingPage = () => {
    const navigate = useNavigate();

    return (
        <div className="min-h-screen bg-slate-50 dark:bg-neutral-950 flex flex-col items-center justify-center p-6 text-center font-sans tracking-wide">
            <div className="max-w-4xl space-y-10 animate-fadeIn w-full">
                {/* App Icon */}
                <div className="w-20 h-20 bg-blue-600 text-white rounded-2xl flex items-center justify-center mx-auto shadow-xl shadow-blue-500/20">
                    <Database className="w-10 h-10" />
                </div>

                {/* Hero Text */}
                <div className="space-y-4">
                    <h1 className="text-4xl md:text-5xl font-bold text-black dark:text-white tracking-tight leading-tight">
                        新北市教育局 <br className="md:hidden" />
                        <span className="text-blue-600 dark:text-blue-400">RAG 檢索系統</span>
                    </h1>
                    <p className="text-lg text-slate-600 dark:text-neutral-400 font-medium max-w-xl mx-auto leading-relaxed">
                        知識庫提供精準解答與自動化文檔解析
                    </p>
                </div>

                {/* CTA */}
                <div className="pt-4 pb-12">
                    <button
                        onClick={() => navigate('/app/dashboard')}
                        className="btn-primary px-8 py-4 text-lg rounded-2xl group flex items-center mx-auto shadow-lg shadow-blue-500/20"
                    >
                        進入系統
                        <ArrowRight className="w-5 h-5 ml-2 group-hover:translate-x-1 transition-transform" />
                    </button>
                </div>

                {/* Features Bento Grid */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-12 border-t border-slate-200 dark:border-neutral-800 text-left">
                    <div className="bg-white dark:bg-neutral-900 border border-slate-200 dark:border-neutral-800 p-6 rounded-2xl shadow-sm hover:-translate-y-1 transition-transform">
                        <div className="w-12 h-12 bg-blue-50 dark:bg-neutral-800 text-blue-500 rounded-xl flex items-center justify-center mb-4">
                            <Search className="w-6 h-6" />
                        </div>
                        <h3 className="text-lg font-bold text-black dark:text-white mb-2">智能問答檢索</h3>
                        <p className="text-sm text-slate-500 dark:text-neutral-400 leading-relaxed">高速比對教育局各項法規、計畫與公文，精準擷取片段提供自然語言回覆。</p>
                    </div>

                    <div className="bg-white dark:bg-neutral-900 border border-slate-200 dark:border-neutral-800 p-6 rounded-2xl shadow-sm hover:-translate-y-1 transition-transform">
                        <div className="w-12 h-12 bg-blue-50 dark:bg-neutral-800 text-blue-500 rounded-xl flex items-center justify-center mb-4">
                            <FileText className="w-6 h-6" />
                        </div>
                        <h3 className="text-lg font-bold text-black dark:text-white mb-2">混合知識庫解析</h3>
                        <p className="text-sm text-slate-500 dark:text-neutral-400 leading-relaxed">支援 PDF、Word、Excel 等多種辦公格式的自動化解析與向量化儲存機制。</p>
                    </div>

                    <div className="bg-white dark:bg-neutral-900 border border-slate-200 dark:border-neutral-800 p-6 rounded-2xl shadow-sm hover:-translate-y-1 transition-transform">
                        <div className="w-12 h-12 bg-blue-50 dark:bg-neutral-800 text-blue-500 rounded-xl flex items-center justify-center mb-4">
                            <ShieldCheck className="w-6 h-6" />
                        </div>
                        <h3 className="text-lg font-bold text-black dark:text-white mb-2">封閉權限隔離</h3>
                        <p className="text-sm text-slate-500 dark:text-neutral-400 leading-relaxed">限定經由內部認證核准的帳號登入存取，確保機敏公文檔案僅限內部調閱。</p>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default LandingPage;
