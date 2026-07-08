import { useState, useEffect } from 'react';
import ThreadList from '../components/ThreadList';
import ChatWindow from '../components/ChatWindow';
import EduRagHeader from '../components/EduRagHeader';
import Footer from '../components/Footer';
import { MOCK_THREADS, type Message } from '../mockEduRag';
import { motion, AnimatePresence } from 'framer-motion';

// EDU-RAG 聊天主頁：整合左側對話列表與中間聊天視窗。
const EduRagChatPage = () => {
    // 對話列表狀態。
    const [threads, setThreads] = useState(MOCK_THREADS);
    // 目前選中的對話。
    const [activeThreadId, setActiveThreadId] = useState<string>('t1');
    // 目前對話訊息。
    const [messages, setMessages] = useState<Message[]>([]);
    // 是否正在初始載入（用於顯示骨架屏）。
    const [isInitialLoading, setIsInitialLoading] = useState(false);
    // 使用者輸入框內容。
    const [inputText, setInputText] = useState('');

    useEffect(() => {
        // 切換對話時，先進入讀取狀態，產生「跳轉感」。
        setIsInitialLoading(true);
        // 清空目前訊息，模擬從後端抓取新資料。
        setMessages([]);
        
        // 模擬延遲（約 400ms），讓使用者能看到骨架屏並感受過渡。
        const timer = setTimeout(() => {
            setIsInitialLoading(false);
            // 隨機帶入一點 mock 訊息，模擬載入完成。
            const activeThread = threads.find(t => t.id === activeThreadId);
            if (activeThread) {
                // 如果是新對話(t1)或完全空的對話，我們保持空，其他則給點模擬內容。
                if (activeThreadId !== 't1' && !activeThreadId.startsWith('new-')) {
                   setMessages([
                     { id: 'm1', role: 'assistant', content: `您好，這是關於「${activeThread.title}」的歷史紀錄內容。`, timestamp: '10:00 AM' }
                   ]);
                }
            }
        }, 400);

        return () => clearTimeout(timer);
    }, [activeThreadId]);

    const handleNewThread = () => {
        const newId = `new-${Date.now()}`;
        const newThread = {
            id: newId,
            title: `新對話 ${threads.length + 1}`,
            preview: '尚未有訊息...',
            timestamp: '剛剛',
            updatedAt: new Date().toISOString()
        };
        setThreads(prev => [newThread, ...prev]);
        setActiveThreadId(newId);
    };
    // 送出訊息流程：直接加入訊息，由服務層處理串流。
    const handleSendMessage = (msg: Message) => {
        setMessages(prev => [...prev, msg]);
    };

    // 更新訊息內容 (用於串流)
    const handleUpdateMessage = (updatedMsg: Message) => {
        setMessages(prev => {
            const index = prev.findIndex(m => m.id === updatedMsg.id || (m.role === updatedMsg.role && m.isThinking));
            if (index !== -1) {
                const newMessages = [...prev];
                newMessages[index] = updatedMsg;
                return newMessages;
            }
            return prev;
        });
    };

    // 刪除對話。
    const handleDeleteThread = (id: string, e: React.MouseEvent) => {
        e.stopPropagation(); // 避免觸發選中對話。
        const remaining = threads.filter(t => t.id !== id);
        setThreads(remaining);
        
        // 如果刪除的是目前選中的，則選取剩餘的第一個或設為預設。
        if (activeThreadId === id) {
            if (remaining.length > 0) {
                setActiveThreadId(remaining[0].id);
            } else {
                setActiveThreadId('t1'); // Fallback to default mock or similar
            }
        }
    };

    // 重新命名對話。
    const handleRenameThread = (id: string, newTitle: string) => {
        setThreads(prev => prev.map(t => t.id === id ? { ...t, title: newTitle } : t));
    };

    return (
        <div className="flex flex-col min-h-full font-sans overflow-hidden h-full">
            <div className="flex-1 flex flex-col p-4 sm:p-6 lg:p-8 max-w-[1600px] mx-auto w-full h-full">
                <EduRagHeader />

                {/* Main Grid Layout */}
                <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 gap-8 min-h-0 h-full overflow-hidden">

                    {/* Left Col: Threads (Hidden on small screens) */}
                    <div className="hidden lg:block lg:col-span-3 h-full overflow-hidden">
                        <div className="h-full card overflow-hidden flex flex-col">
                            <ThreadList
                                threads={threads}
                                activeThreadId={activeThreadId}
                                onSelectThread={setActiveThreadId}
                                onNewThread={handleNewThread}
                                onDeleteThread={handleDeleteThread}
                                onRenameThread={handleRenameThread}
                            />
                        </div>
                    </div>

                    {/* Center: Chat (Takes up more space now) */}
                    <div className="lg:col-span-9 h-full flex flex-col min-h-0 overflow-hidden relative">
                        {/* Chat Window is now the main card with Shared Element Transition */}
                        <AnimatePresence mode="wait">
                            <motion.div
                                key={activeThreadId}
                                initial={{ opacity: 0, x: 20, scale: 0.98 }}
                                animate={{ opacity: 1, x: 0, scale: 1 }}
                                exit={{ opacity: 0, x: -20, scale: 0.98 }}
                                transition={{ duration: 0.3, ease: [0.23, 1, 0.32, 1] }}
                                className="h-full w-full"
                            >
                                <ChatWindow
                                    messages={messages}
                                    inputText={inputText}
                                    setInputText={setInputText}
                                    onSendMessage={handleSendMessage}
                                    onUpdateMessage={handleUpdateMessage}
                                    activeThreadTitle={threads.find(t => t.id === activeThreadId)?.title || "對話區"}
                                    isLoading={isInitialLoading}
                                />
                            </motion.div>
                        </AnimatePresence>
                    </div>
                </div>

                <Footer />
            </div>
        </div>
    );
};

export default EduRagChatPage;
