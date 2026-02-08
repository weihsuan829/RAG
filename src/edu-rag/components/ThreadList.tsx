import React from 'react';
import { Plus, Search, MessageSquare } from 'lucide-react';
import type { Thread } from '../mockEduRag';

interface ThreadListProps {
    threads: Thread[];
    activeThreadId: string;
    onSelectThread: (id: string) => void;
    onNewThread: () => void;
}

const ThreadList: React.FC<ThreadListProps> = ({
    threads,
    activeThreadId,
    onSelectThread,
    onNewThread
}) => {
    return (
        <div className="flex flex-col h-full bg-transparent">
            <div className="p-4 border-b border-neutral-200 dark:border-neutral-800">
                <button
                    onClick={onNewThread}
                    className="w-full flex items-center justify-center space-x-2 btn-primary transition-all shadow-lg shadow-sky-900/20"
                >
                    <Plus className="w-4 h-4" />
                    <span>新對話</span>
                </button>
                <div className="mt-4 relative">
                    <Search className="w-4 h-4 absolute left-3 top-1/2 transform -translate-y-1/2 text-neutral-400 dark:text-neutral-500" />
                    <input
                        type="text"
                        placeholder="搜尋紀錄"
                        className="w-full pl-9 pr-4 py-2 !bg-white/70 dark:bg-neutral-900/50 border border-neutral-200 dark:border-neutral-800 focus:border-sky-500/50 rounded-xl text-sm transition-all outline-none text-neutral-800 dark:text-neutral-200 placeholder-neutral-400 dark:placeholder-neutral-600 shadow-sm"
                    />
                </div>
            </div>

            <div className="flex-1 overflow-y-auto p-2 space-y-1 scrollbar-default">
                {threads.map(thread => (
                    <button
                        key={thread.id}
                        onClick={() => onSelectThread(thread.id)}
                        className={`w-full text-left p-3 rounded-xl flex items-start space-x-3 transition-colors ${activeThreadId === thread.id
                            ? 'bg-sky-50 text-sky-600 dark:bg-sky-500/10 dark:text-sky-300 ring-1 ring-sky-200 dark:ring-sky-500/20'
                            : 'hover:bg-white dark:hover:bg-neutral-800/50 text-neutral-500 dark:text-neutral-400 hover:text-neutral-800 dark:hover:text-neutral-200 hover:shadow-sm'
                            }`}
                    >
                        <MessageSquare className={`w-4 h-4 mt-1 flex-shrink-0 ${activeThreadId === thread.id ? 'text-sky-500 dark:text-sky-400' : 'text-neutral-400 dark:text-neutral-600'
                            }`} />
                        <div className="min-w-0">
                            <h3 className={`text-sm font-medium truncate ${activeThreadId === thread.id ? 'text-sky-600 dark:text-sky-300' : 'text-neutral-700 dark:text-neutral-300'
                                }`}>
                                {thread.title}
                            </h3>
                            <p className="text-xs text-neutral-400 dark:text-neutral-500 truncate mt-0.5 opacity-80">
                                {thread.preview}
                            </p>
                        </div>
                    </button>
                ))}
            </div>
        </div>
    );
};

export default ThreadList;
