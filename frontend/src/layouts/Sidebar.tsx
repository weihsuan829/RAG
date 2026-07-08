import { useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import {
    LayoutDashboard,
    MessageSquare,
    Upload,
    FileText,
    ChevronDown,
    ChevronRight,
    BookOpen
} from 'lucide-react';
import clsx from 'clsx';

// 側邊欄：提供系統主要導覽入口與教育局 RAG 子選單。
const Sidebar = () => {
    const location = useLocation();
    // 控制教育局 RAG 區塊展開/收合。
    const [eduRagOpen, setEduRagOpen] = useState(true);

    // Highlight links by matching a route prefix.
    const isActive = (path: string) => location.pathname.startsWith(path);

    return (
        <div className="flex flex-col h-full w-full bg-transparent text-slate-900 dark:text-white">
            {/* Brand / title */}
            <div className="h-16 flex items-center px-6 border-b border-slate-200 dark:border-neutral-800 font-bold text-blue-500 dark:text-blue-400 text-xl tracking-wider uppercase">
                目錄
            </div>

            <div className="flex-1 overflow-y-auto py-4 space-y-1 px-3">
                {/* Primary navigation */}
                <NavLink
                    to="/app/dashboard"
                    className={({ isActive }) => clsx(
                        "flex items-center px-4 py-3 rounded-xl transition-all duration-200",
                        isActive
                            ? "bg-blue-50 text-blue-600 dark:bg-blue-500/10 dark:text-blue-400 font-medium"
                            : "text-slate-500 dark:text-neutral-400 hover:bg-slate-100 dark:hover:bg-neutral-800/50 hover:text-slate-900 dark:hover:text-white"
                    )}
                >
                    <LayoutDashboard className="w-5 h-5 mr-3" />
                    Dashboard
                </NavLink>

                {/* Education Bureau RAG Section */}
                <div className="pt-2">
                    {/* Section header + toggle */}
                    <button
                        onClick={() => setEduRagOpen(!eduRagOpen)}
                        className={clsx(
                            "w-full flex items-center px-4 py-3 rounded-xl transition-all duration-200 justify-between",
                            isActive('/app/edu-rag')
                                ? "text-blue-600 dark:text-blue-400"
                                : "text-slate-500 dark:text-neutral-400 hover:bg-slate-100 dark:hover:bg-neutral-800/50 hover:text-slate-900 dark:hover:text-white"
                        )}
                    >
                        <div className="flex items-center">
                            <BookOpen className={clsx("w-5 h-5 mr-3", isActive('/app/edu-rag') ? "text-blue-600 dark:text-blue-400" : "text-slate-400 dark:text-neutral-500")} />
                            <span className="font-medium">教育局 RAG</span>
                        </div>
                        {eduRagOpen ? <ChevronDown className="w-4 h-4 opacity-70" /> : <ChevronRight className="w-4 h-4 opacity-70" />}
                    </button>

                    <div className={`overflow-hidden transition-all duration-300 ${eduRagOpen ? 'max-h-96 opacity-100' : 'max-h-0 opacity-0'}`}>
                        <div className="space-y-1 mt-1 ml-4 border-l border-slate-200 dark:border-neutral-800 pl-2">
                            {/* Section links */}
                            <NavLink
                                to="/app/edu-rag/chat"
                                className={({ isActive }) => clsx(
                                    "flex items-center pl-3 pr-4 py-2.5 rounded-lg text-sm transition-all duration-200",
                                    isActive
                                        ? "bg-blue-50 text-blue-600 dark:bg-blue-500/10 dark:text-blue-400 font-medium"
                                        : "text-slate-500 dark:text-neutral-400 hover:bg-slate-100 dark:hover:bg-neutral-800/50 hover:text-slate-900 dark:hover:text-white"
                                )}
                            >
                                <MessageSquare className="w-4 h-4 mr-2" />
                                Chat 查詢
                            </NavLink>
                            <NavLink
                                to="/app/edu-rag/admin/docs"
                                className={({ isActive }) => clsx(
                                    "flex items-center pl-3 pr-4 py-2.5 rounded-lg text-sm transition-all duration-200",
                                    isActive
                                        ? "bg-blue-50 text-blue-600 dark:bg-blue-500/10 dark:text-blue-400 font-medium"
                                        : "text-slate-500 dark:text-neutral-400 hover:bg-slate-100 dark:hover:bg-neutral-800/50 hover:text-slate-900 dark:hover:text-white"
                                )}
                            >
                                <FileText className="w-4 h-4 mr-2" />
                                文件管理
                            </NavLink>
                            <NavLink
                                to="/app/edu-rag/admin/upload"
                                className={({ isActive }) => clsx(
                                    "flex items-center pl-3 pr-4 py-2.5 rounded-lg text-sm transition-all duration-200",
                                    isActive
                                        ? "bg-blue-50 text-blue-600 dark:bg-blue-500/10 dark:text-blue-400 font-medium"
                                        : "text-slate-500 dark:text-neutral-400 hover:bg-slate-100 dark:hover:bg-neutral-800/50 hover:text-slate-900 dark:hover:text-white"
                                )}
                            >
                                <Upload className="w-4 h-4 mr-2" />
                                上傳入庫
                            </NavLink>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default Sidebar;
