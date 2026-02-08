import React, { type ReactNode } from 'react';

interface ChatLayoutProps {
    sidebar: ReactNode;
    chatWindow: ReactNode;
    rightPanel: ReactNode;
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
            <div className="w-[280px] flex-shrink-0 border-r border-gray-200 bg-white flex flex-col">
                {sidebar}
            </div>

            {/* Middle Column: Chat Window */}
            <div className="flex-1 flex flex-col items-stretch relative min-w-0 bg-white">
                {chatWindow}
            </div>

            {/* Right Column: Settings/Citations */}
            <div
                className={`flex-shrink-0 border-l border-gray-200 bg-gray-50 transition-all duration-300 ease-in-out ${rightPanelOpen ? 'w-[360px]' : 'w-0 overflow-hidden'
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
