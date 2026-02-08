import { useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import {
    LayoutDashboard,
    MessageSquare,
    Upload,
    FileText,
    Settings,
    ChevronDown,
    ChevronRight,
    BookOpen
} from 'lucide-react';
import clsx from 'clsx';

const Sidebar = () => {
    const location = useLocation();
    const [eduRagOpen, setEduRagOpen] = useState(true);

    // Highlight links by matching a route prefix.
    const isActive = (path: string) => location.pathname.startsWith(path);

    return (
        <div className="flex flex-col h-full w-full bg-transparent text-neutral-900 dark:text-neutral-300">
            {/* Brand / title */}
            <div className="h-16 flex items-center px-6 border-b border-neutral-800/50 font-bold text-sky-400 text-xl tracking-wider">
                目錄
            </div>

            <div className="flex-1 overflow-y-auto py-4 space-y-1 px-3">
                {/* Primary navigation */}
                <NavLink
                    to="/app/dashboard"
                    className={({ isActive }) => clsx(
                        "flex items-center px-4 py-3 rounded-xl transition-all duration-200",
                        isActive
                            ? "bg-sky-500/10 text-sky-500 dark:text-sky-300 border border-sky-500/30"
                            : "hover:bg-neutral-500/10 text-neutral-500 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white"
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
                            "w-full flex items-center px-4 py-3 rounded-xl hover:bg-neutral-500/10 transition-all duration-200 justify-between",
                            isActive('/app/edu-rag') ? "text-sky-500 dark:text-sky-300" : "text-neutral-500 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white"
                        )}
                    >
                        <div className="flex items-center">
                            <BookOpen className="w-5 h-5 mr-3 text-sky-500" />
                            <span className="font-medium">教育局 RAG</span>
                        </div>
                        {eduRagOpen ? <ChevronDown className="w-4 h-4 opacity-70" /> : <ChevronRight className="w-4 h-4 opacity-70" />}
                    </button>

                    <div className={`overflow-hidden transition-all duration-300 ${eduRagOpen ? 'max-h-96 opacity-100' : 'max-h-0 opacity-0'}`}>
                        <div className="space-y-1 mt-1 ml-4 border-l border-neutral-200 dark:border-neutral-800 pl-2">
                            {/* Section links */}
                            <NavLink
                                to="/app/edu-rag/chat"
                                className={({ isActive }) => clsx(
                                    "flex items-center pl-3 pr-4 py-2.5 rounded-lg text-sm transition-all duration-200",
                                    isActive
                                        ? "bg-neutral-200/50 dark:bg-neutral-800 text-sky-600 dark:text-sky-300 font-medium"
                                        : "text-neutral-500 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white hover:bg-neutral-500/10"
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
                                        ? "bg-neutral-200/50 dark:bg-neutral-800 text-sky-600 dark:text-sky-300 font-medium"
                                        : "text-neutral-500 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white hover:bg-neutral-500/10"
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
                                        ? "bg-neutral-200/50 dark:bg-neutral-800 text-sky-600 dark:text-sky-300 font-medium"
                                        : "text-neutral-500 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white hover:bg-neutral-500/10"
                                )}
                            >
                                <Upload className="w-4 h-4 mr-2" />
                                上傳入庫
                            </NavLink>
                        </div>
                    </div>
                </div>

                {/* Utility actions */}
                <div className="pt-4 mt-4 border-t border-neutral-200 dark:border-neutral-800/50 mx-2">
                    <div className="px-4 py-2 text-xs font-semibold text-neutral-400 dark:text-neutral-500 uppercase tracking-wider">
                        System
                    </div>
                    <a href="#" className="flex items-center px-4 py-3 rounded-xl hover:bg-neutral-500/10 transition-colors opacity-50 cursor-not-allowed text-neutral-500 dark:text-neutral-400">
                        <Settings className="w-5 h-5 mr-3" />
                        Settings
                    </a>
                </div>
            </div>
        </div>
    );
};

export default Sidebar;
