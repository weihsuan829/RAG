import { useState, useEffect } from 'react';
import ThreadList from '../components/ThreadList';
import ChatWindow from '../components/ChatWindow';
import EduRagHeader from '../components/EduRagHeader';
import Footer from '../components/Footer';
import { MOCK_THREADS, type Message } from '../mockEduRag';

const EduRagChatPage = () => {
    const [activeThreadId, setActiveThreadId] = useState<string>('t1');
    const [messages, setMessages] = useState<Message[]>([]);
    const [inputText, setInputText] = useState('');
    const [isSending, setIsSending] = useState(false);
    // Redesign: Right panel is now modal or hidden in this layout, but we keep the state if needed later
    // For the screenshot match, the right panel (citations) wasn't explicitly shown, but we should keep logic safe.
    const [isRightPanelOpen, setIsRightPanelOpen] = useState(false);

    useEffect(() => {
        // Start with empty chat in the UI.
        setMessages([]);
    }, [activeThreadId]);

    const handleSend = () => {
        if (!inputText.trim()) return;

        // Add user message
        const userMsg: Message = {
            id: Date.now().toString(),
            role: 'user',
            content: inputText,
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        };

        setMessages(prev => [...prev, userMsg]);
        setInputText('');
        setIsSending(true);

        // Simulate AI response
        setTimeout(() => {
            const aiMsg: Message = {
                id: (Date.now() + 1).toString(),
                role: 'assistant',
                content: '這是一個模擬的回覆。我在 mock data 中找到了相關資訊。',
                timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                citations: [
                    { id: 'c-new', docName: '模擬檢索文件.pdf', page: 1, snippet: '模擬內容...', similarity: 0.88 }
                ]
            };
            setMessages(prev => [...prev, aiMsg]);
            setIsSending(false);
        }, 1500);
    };

    const handleNewThread = () => {
        alert('New Thread Clicked (Mock)');
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
                                threads={MOCK_THREADS}
                                activeThreadId={activeThreadId}
                                onSelectThread={setActiveThreadId}
                                onNewThread={handleNewThread}
                            />
                        </div>
                    </div>

                    {/* Center: Chat (Takes up more space now) */}
                    <div className="lg:col-span-9 h-full flex flex-col min-h-0 overflow-hidden">
                        {/* Chat Window is now the main card */}
                        <ChatWindow
                            messages={messages}
                            inputText={inputText}
                            setInputText={setInputText}
                            onSend={handleSend}
                            sending={isSending}
                            rightPanelInfo={{ isOpen: isRightPanelOpen, toggle: () => setIsRightPanelOpen(!isRightPanelOpen) }}
                        />
                    </div>
                </div>

                <Footer />
            </div>
        </div>
    );
};

export default EduRagChatPage;
