import React from 'react';

const MessageSkeleton: React.FC = () => {
    return (
        <div className="space-y-6 animate-in fade-in duration-500">
            {/* Assistant Skeleton */}
            <div className="flex flex-col items-start">
                <div className="w-[70%] h-20 bg-slate-100 dark:bg-neutral-800 rounded-2xl animate-pulse border border-slate-200 dark:border-neutral-700 relative overflow-hidden">
                    <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent -translate-x-full animate-[shimmer_2s_infinite]"></div>
                </div>
                <div className="mt-2 ml-2 w-32 h-6 bg-slate-100 dark:bg-neutral-800 rounded-full animate-pulse"></div>
            </div>

            {/* User Skeleton */}
            <div className="flex flex-col items-end">
                <div className="w-[60%] h-16 bg-sky-50 dark:bg-sky-900/10 rounded-2xl animate-pulse border border-sky-100 dark:border-sky-900/20 relative overflow-hidden">
                    <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent -translate-x-full animate-[shimmer_2s_infinite]"></div>
                </div>
            </div>

            {/* Assistant Skeleton 2 */}
            <div className="flex flex-col items-start">
                <div className="w-[85%] h-24 bg-slate-100 dark:bg-neutral-800 rounded-2xl animate-pulse border border-slate-200 dark:border-neutral-700 relative overflow-hidden">
                    <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent -translate-x-full animate-[shimmer_2s_infinite]"></div>
                </div>
                <div className="mt-2 ml-2 w-40 h-6 bg-slate-100 dark:bg-neutral-800 rounded-full animate-pulse"></div>
            </div>
        </div>
    );
};

export default MessageSkeleton;
