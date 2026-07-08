import React, { type ReactNode } from 'react';

interface ChatLayoutProps {
    // 左側欄位（通常是對話列表）。
    sidebar: ReactNode;
    // 中央欄位（聊天主視窗）。
    chatWindow: ReactNode;
    // 右側欄位（引用/設定）。
    rightPanel: ReactNode;
    // 右側欄位是否展開。
    rightPanelOpen: boolean;
}

// 3-column layout wrapper for the chat experience.
const ChatLayout: React.FC<ChatLayoutProps> = ({
    sidebar,
    chatWindow,
    rightPanel,
    rightPanelOpen
}) => {
    return (
        <div className="flex h-[calc(100vh-3.5rem)] overflow-hidden">
            {/* Left Column: Threads */}
            <div className="w-[280px] flex-shrink-0 border-r border-slate-300 dark:border-neutral-700 bg-transparent flex flex-col">
                {sidebar}
            </div>

            {/* Middle Column: Chat Window */}
            <div className="flex-1 flex flex-col items-stretch relative min-w-0 bg-transparent">
                {chatWindow}
            </div>

            {/* Right Column: Settings/Citations */}
            <div
                className={`flex-shrink-0 border-l border-slate-300 dark:border-neutral-700 bg-slate-50 dark:bg-neutral-900 transition-all duration-300 ease-in-out ${rightPanelOpen ? 'w-[360px]' : 'w-0 overflow-hidden'
                    }`}
            >
                {/* Inner container keeps width stable during animation */}
                <div className="w-[360px] h-full">
                    {rightPanel}
                </div>
            </div>
        </div>
    );
};

export default ChatLayout;
