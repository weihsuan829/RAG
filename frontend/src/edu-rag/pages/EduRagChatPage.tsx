import { useState, useEffect } from 'react';
import ThreadList from '../components/ThreadList';
import ChatWindow from '../components/ChatWindow';
import EduRagHeader from '../components/EduRagHeader';
import Footer from '../components/Footer';
import type { Message, Thread } from '../mockEduRag';
import { listThreads, fetchThread, deleteThreadApi } from '../services/api';
import { motion, AnimatePresence } from 'framer-motion';

// EDU-RAG 聊天主頁：整合左側對話列表與中間聊天視窗。
const EduRagChatPage = () => {
    // 對話列表狀態。
    const [threads, setThreads] = useState<Thread[]>([]);
    // 目前選中的對話（null 代表尚未建立的新對話）。
    const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
    // 目前對話訊息。
    const [messages, setMessages] = useState<Message[]>([]);
    // 是否正在初始載入（用於顯示骨架屏）。
    const [isInitialLoading, setIsInitialLoading] = useState(false);
    // 使用者輸入框內容。
    const [inputText, setInputText] = useState('');

    // 從後端載入對話列表。
    const refreshThreads = async () => {
        const list = await listThreads();
        setThreads(list.map(t => ({
            id: t.id,
            title: t.title,
            updatedAt: t.updated_at,
            preview: t.preview,
        })));
    };

    useEffect(() => {
        void refreshThreads();
    }, []);

    useEffect(() => {
        if (!activeThreadId) {
            setMessages([]);
            return;
        }
        setIsInitialLoading(true);
        fetchThread(activeThreadId)
            .then(detail => setMessages(detail.messages.map(m => ({
                id: String(m.id),
                role: m.role,
                content: m.content,
                timestamp: new Date(m.created_at).toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit' }),
                citations: m.citations?.map((c, i) => ({
                    id: String(i),
                    docName: c.doc_name,
                    snippet: c.snippet,
                    similarity: c.similarity,
                    url: c.url,
                })),
                source: m.source,
            }))))
            .finally(() => setIsInitialLoading(false));
    }, [activeThreadId]);

    const handleNewThread = () => {
        setActiveThreadId(null);
        setMessages([]);
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
            // 找不到對應訊息：通常是使用者在串流期間切換到別的對話，
            // 此時 messages 陣列已被 setActiveThreadId → fetchThread 換掉，
            // 送出當下那則 assistant 訊息已不在畫面上，這裡的更新是刻意被丟棄（intentional drop）。
            // 後端仍會把完整回覆存檔；使用者之後重新點回原本的對話時，
            // fetchThread 會重新抓取完整訊息與 citations，達到自我修復（self-heal）。
            // ChatWindow 的 onDone 也會在偵測到這種情況時呼叫 onThreadListStale 刷新左側列表。
            return prev;
        });
    };

    // 新對話建立完成：後端已回傳 thread_id，設為 active 並刷新列表。
    const handleThreadCreated = (threadId: string) => {
        setActiveThreadId(threadId);
        void refreshThreads();
    };

    // 刪除對話。
    const handleDeleteThread = async (id: string, e: React.MouseEvent) => {
        e.stopPropagation(); // 避免觸發選中對話。
        await deleteThreadApi(id);
        await refreshThreads();

        if (activeThreadId === id) {
            setActiveThreadId(null);
        }
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
                            />
                        </div>
                    </div>

                    {/* Center: Chat (Takes up more space now) */}
                    <div className="lg:col-span-9 h-full flex flex-col min-h-0 overflow-hidden relative">
                        {/* Chat Window is now the main card with Shared Element Transition */}
                        <AnimatePresence mode="wait">
                            <motion.div
                                key={activeThreadId ?? 'new'}
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
                                    activeThreadId={activeThreadId}
                                    onThreadCreated={handleThreadCreated}
                                    onThreadListStale={() => void refreshThreads()}
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
