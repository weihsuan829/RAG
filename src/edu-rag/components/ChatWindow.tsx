import React, { useRef, useEffect } from 'react';
import { Settings, RotateCcw } from 'lucide-react';
import type { Message } from '../mockEduRag';

interface ChatWindowProps {
    messages: Message[];
    inputText: string;
    setInputText: (text: string) => void;
    onSend: () => void;
    sending: boolean;
    rightPanelInfo: { isOpen: boolean, toggle: () => void };
}

// Main chat panel: message list + composer.
const ChatWindow: React.FC<ChatWindowProps> = ({
    messages,
    inputText,
    setInputText,
    onSend,
    sending,
}) => {
    const messagesEndRef = useRef<HTMLDivElement>(null);

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    };

    useEffect(() => {
        scrollToBottom();
    }, [messages, sending]);

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            onSend();
        }
    };

    return (
        <div className="flex flex-col h-full card p-6 relative">

            {/* Internal Card Header */}
            <div className="flex items-start justify-between mb-6">
                <div>
                    <h2 className="text-xl font-bold bg-gradient-to-r from-sky-500 to-indigo-500 dark:from-sky-300 dark:to-indigo-300 bg-clip-text text-transparent">對話區</h2>
                    <div className="flex items-center text-sm text-neutral-500 dark:text-neutral-400 mt-1 space-x-2">
                        <span>輸入問題</span>
                        <span>→</span>
                        <span>AI agent 回答</span>
                        <span>→</span>
                        <span>顯示對話</span>
                    </div>
                </div>
                <button className="p-2 text-gray-400 hover:text-white transition-colors">
                    <Settings className="w-5 h-5" />
                </button>
            </div>

            

            {/* Messages Area */}
            <div className="flex-1 !bg-white/60 dark:bg-white/5 backdrop-blur-md rounded-2xl border border-sky-100 dark:border-white/5 p-4 overflow-y-auto mb-4 scrollbar-default relative shadow-sm">
                {messages.length === 0 ? (
                    <div className="h-full flex flex-col items-center justify-center text-neutral-400 dark:text-neutral-600 text-sm">
                        等待輸入...
                    </div>
                ) : (
                    <div className="space-y-6">
                        {messages.map((msg) => (
                            <div key={msg.id} className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
                                <div className={`max-w-[85%] rounded-2xl p-4 shadow-sm ${msg.role === 'user'
                                    ? '!bg-white/70 text-sky-700 dark:bg-white/5 dark:text-sky-100 border !border-white/60 dark:border-white/5'
                                    : '!bg-white/70 text-neutral-800 dark:bg-white/5 dark:text-neutral-200 border !border-white/60 dark:border-white/5'
                                    }`}>
                                    <p className="whitespace-pre-wrap leading-relaxed">{msg.content}</p>
                                </div>
                                {msg.role === 'assistant' && msg.citations && (
                                    <div className="mt-2 ml-2 space-y-1">
                                        {msg.citations.map(c => (
                                            <div key={c.id} className="chip text-xs text-sky-500 dark:text-sky-400 hover:text-sky-600 dark:hover:text-sky-300 cursor-pointer transition-colors bg-white dark:bg-white/5 border-neutral-200 dark:border-white/5 shadow-sm">
                                                Reference: {c.docName} (p.{c.page})
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        ))}
                        {sending && <div className="text-neutral-500 text-sm animate-pulse ml-2">Thinking...</div>}
                        <div ref={messagesEndRef} />
                    </div>
                )}
            </div>

            {/* Input Area */}
            <div className="flex gap-4 h-24">
                <textarea
                    value={inputText}
                    onChange={(e) => setInputText(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="輸入問題..."
                    className="flex-1 !bg-white/60 dark:bg-white/5 backdrop-blur-md border border-neutral-200 dark:border-white/5 rounded-2xl p-4 text-neutral-800 dark:text-neutral-200 resize-none focus:border-sky-500/50 focus:ring-1 focus:ring-sky-500/20 outline-none transition-all placeholder-neutral-400 dark:placeholder-neutral-600 shadow-sm"
                />
                <button
                    onClick={onSend}
                    disabled={!inputText.trim() || sending}
                    className={`w-24 rounded-2xl flex items-center justify-center font-medium transition-all ${inputText.trim() && !sending
                        ? 'bg-sky-500 text-white hover:bg-sky-400 shadow-lg shadow-sky-500/20'
                        : '!bg-white/70 dark:bg-white/5 text-neutral-400 dark:text-neutral-600 cursor-not-allowed border border-neutral-200 dark:border-white/5'
                        }`}
                >
                    {sending ? <RotateCcw className="w-5 h-5 animate-spin" /> : '送出'}
                </button>
            </div>
        </div>
    );
};

export default ChatWindow;
