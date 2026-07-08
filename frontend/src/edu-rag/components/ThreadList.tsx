import { useState } from 'react';
import { Plus, Search, MessageSquare, Trash2, Edit3, Check, X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import type { Thread } from '../mockEduRag';

interface ThreadListProps {
    // 對話列表資料來源。
    threads: Thread[];
    // 目前選中的對話 id。
    activeThreadId: string;
    // 切換對話事件。
    onSelectThread: (id: string) => void;
    // 新增對話事件。
    onNewThread: () => void;
    // 刪除對話事件。
    onDeleteThread: (id: string, e: React.MouseEvent) => void;
    // 重新命名事件。
    onRenameThread: (id: string, newTitle: string) => void;
}

// 左側對話清單：提供新建對話、搜尋欄與對話切換。
const ThreadList: React.FC<ThreadListProps> = ({
    threads,
    activeThreadId,
    onSelectThread,
    onNewThread,
    onDeleteThread,
    onRenameThread
}) => {
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editValue, setEditValue] = useState("");

    const startEditing = (id: string, title: string, e: React.MouseEvent) => {
        e.stopPropagation();
        setEditingId(id);
        setEditValue(title);
    };

    const cancelEditing = (e?: React.MouseEvent) => {
        e?.stopPropagation();
        setEditingId(null);
        setEditValue("");
    };

    const saveEditing = (id: string, e?: React.MouseEvent | React.KeyboardEvent) => {
        e?.stopPropagation();
        if (editValue.trim()) {
            onRenameThread(id, editValue);
        }
        setEditingId(null);
        setEditValue("");
    };

    return (
        <div className="flex flex-col h-full bg-transparent">
            <div className="p-4 border-b border-neutral-200 dark:border-neutral-800">
                <button
                    onClick={onNewThread}
                    className="w-full flex items-center justify-center space-x-2 btn-primary transition-all shadow-lg shadow-sky-500/10 hover:shadow-sky-500/20"
                >
                    <Plus className="w-4 h-4" />
                    <span>新對話</span>
                </button>
                <div className="mt-4 relative group">
                    <Search className="w-4 h-4 absolute left-3 top-1/2 transform -translate-y-1/2 text-neutral-400 group-focus-within:text-sky-500 transition-colors" />
                    <input
                        type="text"
                        placeholder="搜尋紀錄"
                        className="w-full pl-9 pr-4 py-2 !bg-slate-100/50 dark:!bg-neutral-800/50 border border-transparent focus:border-sky-500/30 rounded-xl text-sm transition-all outline-none text-black dark:text-white placeholder-neutral-400 focus:ring-4 focus:ring-sky-500/5"
                    />
                </div>
            </div>

            <div className="flex-1 overflow-y-auto p-2 space-y-1 scrollbar-none">
                {/* 對話項目清單 */}
                <AnimatePresence initial={false}>
                    {threads.map(thread => {
                        const isActive = activeThreadId === thread.id;
                        const isEditing = editingId === thread.id;
                        return (
                            <motion.div
                                layout
                                initial={{ opacity: 0, x: -10 }}
                                animate={{ opacity: 1, x: 0 }}
                                exit={{ opacity: 0, scale: 0.95 }}
                                key={thread.id}
                            >
                                <div
                                    role="button"
                                    tabIndex={0}
                                    onClick={() => !isEditing && onSelectThread(thread.id)}
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter' || e.key === ' ') {
                                            !isEditing && onSelectThread(thread.id);
                                        }
                                    }}
                                    className={`w-full text-left p-3 rounded-xl flex items-start space-x-3 transition-all relative group overflow-hidden cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-sky-500 ${isActive
                                        ? 'text-sky-700 dark:text-sky-300'
                                        : 'hover:bg-slate-100/80 dark:hover:bg-neutral-800/50 text-neutral-500 dark:text-neutral-400 hover:text-black dark:hover:text-white'
                                        }`}
                                >
                                    {/* Premium Selection Indicator (Animated) */}
                                    {isActive && (
                                        <motion.div
                                            layoutId="active-pill"
                                            className="absolute inset-0 bg-sky-500/10 dark:bg-sky-500/15 border border-sky-500/20 dark:border-sky-500/30 rounded-xl z-0"
                                            transition={{ type: "spring", bounce: 0.25, duration: 0.5 }}
                                        />
                                    )}

                                    {/* Selection Highlight Bar */}
                                    {isActive && (
                                        <motion.div
                                            layoutId="active-bar"
                                            className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-6 bg-sky-500 rounded-r-full z-10"
                                            transition={{ type: "spring", bounce: 0.2, duration: 0.6 }}
                                        />
                                    )}

                                    <div className="relative z-10 flex items-start space-x-3 w-full">
                                        <div className={`flex-shrink-0 mt-1 w-8 h-8 rounded-lg flex items-center justify-center transition-colors ${isActive ? 'bg-sky-500/20 text-sky-600' : 'bg-slate-100 dark:bg-neutral-800 text-neutral-400 group-hover:bg-white dark:group-hover:bg-neutral-700'
                                            }`}>
                                            <MessageSquare className="w-4 h-4" />
                                        </div>
                                        <div className="min-w-0 flex-1">
                                            {isEditing ? (
                                                <div className="flex items-center space-x-1" onClick={e => e.stopPropagation()}>
                                                    <input
                                                        autoFocus
                                                        value={editValue}
                                                        onChange={e => setEditValue(e.target.value)}
                                                        onKeyDown={e => {
                                                            if (e.key === 'Enter') saveEditing(thread.id);
                                                            if (e.key === 'Escape') cancelEditing();
                                                        }}
                                                        className="w-full bg-white dark:bg-neutral-800 border-2 border-sky-500 rounded-md px-1 py-0.5 text-sm text-black dark:text-white outline-none"
                                                    />
                                                    <button onClick={() => saveEditing(thread.id)} className="p-1 hover:text-green-500"><Check className="w-4 h-4" /></button>
                                                    <button onClick={() => cancelEditing()} className="p-1 hover:text-red-500"><X className="w-4 h-4" /></button>
                                                </div>
                                            ) : (
                                                <>
                                                    <h3 className={`text-sm font-semibold truncate ${isActive ? 'text-sky-800 dark:text-sky-200' : 'text-neutral-900 dark:text-neutral-100'}`}>
                                                        {thread.title}
                                                    </h3>
                                                    <p className="text-xs text-neutral-500 dark:text-neutral-500 truncate mt-0.5 opacity-80">
                                                        {thread.preview}
                                                    </p>
                                                </>
                                            )}
                                        </div>

                                        {/* Action Buttons (Visible on hover or when active) */}
                                        <div className={`flex-shrink-0 flex items-center space-x-1 opacity-0 group-hover:opacity-100 transition-opacity ${isEditing ? 'hidden' : ''}`}>
                                            <button
                                                onClick={(e) => startEditing(thread.id, thread.title, e)}
                                                className="p-1 hover:bg-slate-200 dark:hover:bg-neutral-700 rounded-md transition-colors text-neutral-400 hover:text-sky-500"
                                            >
                                                <Edit3 className="w-3.5 h-3.5" />
                                            </button>
                                            <button
                                                onClick={(e) => onDeleteThread(thread.id, e)}
                                                className="p-1 hover:bg-slate-200 dark:hover:bg-neutral-700 rounded-md transition-colors text-neutral-400 hover:text-rose-500"
                                            >
                                                <Trash2 className="w-3.5 h-3.5" />
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            </motion.div>
                        );
                    })}
                </AnimatePresence>
            </div>
        </div>
    );
};

export default ThreadList;
