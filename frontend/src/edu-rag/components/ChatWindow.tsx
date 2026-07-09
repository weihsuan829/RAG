import React, { useRef, useEffect, useState } from "react";
import {
  Send,
  Mic,
  RotateCcw,
  MessageSquare,
  Square
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import type { Message } from "../mockEduRag";
import MessageSkeleton from './MessageSkeleton';
import { streamChat, type Citation as ApiCitation } from '../services/api';

type BrowserSpeechRecognitionEvent = {
  resultIndex: number;
  results: ArrayLike<
    {
      isFinal: boolean;
      0: { transcript: string };
    }
  >;
};

type BrowserSpeechRecognition = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((event: BrowserSpeechRecognitionEvent) => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
  start: () => void;
  stop: () => void;
};

type BrowserSpeechRecognitionCtor = new () => BrowserSpeechRecognition;

declare global {
  interface Window {
    SpeechRecognition?: BrowserSpeechRecognitionCtor;
    webkitSpeechRecognition?: BrowserSpeechRecognitionCtor;
  }
}

interface ChatWindowProps {
  messages: Message[];
  inputText: string;
  setInputText: (text: string) => void;
  onSendMessage: (message: Message) => void;
  onUpdateMessage?: (message: Message) => void;
  activeThreadId: string | null;
  onThreadCreated: (threadId: string) => void;
  // 串流結束時，若使用者已中途切換離開送出當下的對話，用來通知父層刷新左側列表
  // （不切換使用者當前畫面，僅更新 preview/updatedAt）。未提供時該情境靜默略過。
  onThreadListStale?: () => void;
  activeThreadTitle?: string;
  isLoading?: boolean;
}

const ChatWindow: React.FC<ChatWindowProps> = ({
  messages,
  inputText,
  setInputText,
  onSendMessage,
  onUpdateMessage,
  activeThreadId,
  onThreadCreated,
  onThreadListStale,
  activeThreadTitle = "對話區",
  isLoading = false,
}) => {
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const recognitionRef = useRef<any>(null);
  const inputTextRef = useRef(inputText);
  const listeningBaseTextRef = useRef("");
  const finalTranscriptRef = useRef("");
  // 追蹤「當下」的 activeThreadId（非閉包捕捉值），供串流 onDone 判斷使用者是否已中途切換對話。
  const activeThreadIdRef = useRef(activeThreadId);

  const [isListening, setIsListening] = useState(false);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, sending]);

  useEffect(() => {
    inputTextRef.current = inputText;
  }, [inputText]);

  useEffect(() => {
    activeThreadIdRef.current = activeThreadId;
  }, [activeThreadId]);

  const SpeechRecognitionCtor = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
  const speechSupported = Boolean(SpeechRecognitionCtor);

  const startListening = () => {
    if (!speechSupported || sending) return;
    listeningBaseTextRef.current = inputTextRef.current;
    finalTranscriptRef.current = "";
    
    if (!recognitionRef.current) {
      const recognition = new SpeechRecognitionCtor();
      recognition.lang = "zh-TW";
      recognition.continuous = true;
      recognition.interimResults = true;

      recognition.onresult = (event: any) => {
        let finalChunk = "";
        let interimChunk = "";
        for (let i = event.resultIndex; i < event.results.length; i++) {
          if (event.results[i].isFinal) finalChunk += event.results[i][0].transcript;
          else interimChunk += event.results[i][0].transcript;
        }
        if (finalChunk) finalTranscriptRef.current = `${finalTranscriptRef.current} ${finalChunk}`.trim();
        const base = listeningBaseTextRef.current.trim();
        const next = [base, finalTranscriptRef.current.trim(), interimChunk.trim()].filter(Boolean).join(" ");
        setInputText(next);
      };

      recognition.onend = () => setIsListening(false);
      recognition.onerror = () => setIsListening(false);
      recognitionRef.current = recognition;
    }

    try {
      recognitionRef.current.start();
      setIsListening(true);
    } catch {
      setIsListening(false);
    }
  };

  const stopListening = () => {
    recognitionRef.current?.stop();
    setIsListening(false);
  };

  const handleSend = async () => {
    if (!inputText.trim() || sending) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      role: "user",
      content: inputText,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };

    const messageText = inputText;
    onSendMessage(userMessage);
    setInputText("");
    setSending(true);

    const assistantId = (Date.now() + 1).toString();
    const assistantMessage: Message = {
      id: assistantId,
      role: "assistant",
      content: "",
      isThinking: true,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };

    onSendMessage(assistantMessage);

    // threadId 於串流期間固定：新對話送出後 onDone 才會拿到新建的 thread_id，
    // 不應在同一次請求中途改變送出的 threadId。
    const threadIdAtSend = activeThreadId;
    // 累積目前訊息的出處，讓後續 onUpdate/onDone 的整包更新不會把已收到的出處蓋掉。
    let latestCitations: Message['citations'];

    await streamChat(messageText, threadIdAtSend, {
      onCitations: (citations: ApiCitation[]) => {
        latestCitations = citations.map((c, i) => ({
          id: String(i),
          docName: c.doc_name,
          snippet: c.snippet,
          similarity: c.similarity,
        }));
        onUpdateMessage?.({ ...assistantMessage, content: "", citations: latestCitations });
      },
      onUpdate: (fullText) => {
        onUpdateMessage?.({ ...assistantMessage, content: fullText, citations: latestCitations });
      },
      onDone: ({ thread_id }) => {
        onUpdateMessage?.({ ...assistantMessage, isThinking: false, citations: latestCitations });
        if (!threadIdAtSend) {
          // 全新對話：一定要告知父層新建的 thread_id，讓左側列表出現這筆對話（會切換過去）。
          onThreadCreated(thread_id);
        } else if (activeThreadIdRef.current !== threadIdAtSend) {
          // 使用者在串流期間切換了對話，導致 handleUpdateMessage 在 messages 陣列裡找不到
          // 對應訊息而 no-op（訊息已被切換後的 setMessages 取代）。後端仍已把這則回覆存檔，
          // 只是目前畫面沒有反映最新的 preview/updatedAt。用 threadIdAtSend（送出當下捕捉的
          // 值，而非可能已改變的 activeThreadId prop）驅動一次「僅刷新列表、不搶走使用者當前
          // 畫面」的更新；使用者之後重新點回該對話時，fetchThread 會自我修復並補上這則訊息。
          onThreadListStale?.();
        }
        setSending(false);
      },
      onError: () => {
        onUpdateMessage?.({
          ...assistantMessage,
          content: '⚠️ 系統暫時無法取得資料，請稍後再試',
          isThinking: false,
        });
        setSending(false);
      },
    });
  };

  return (
    <div className="flex flex-col h-full card p-6 relative border border-slate-300 dark:border-neutral-700 bg-white dark:bg-neutral-900">
      <div className="flex items-start justify-between mb-6">
        <div>
          <AnimatePresence mode="wait">
            <motion.h2 
              key={activeThreadTitle}
              initial={{ y: 10, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: -10, opacity: 0 }}
              className="text-xl font-bold bg-gradient-to-r from-sky-600 to-indigo-600 dark:from-sky-300 dark:to-indigo-300 bg-clip-text text-transparent"
            >
              {activeThreadTitle}
            </motion.h2>
          </AnimatePresence>
          <div className="flex items-center text-sm text-neutral-500 mt-1 space-x-2">
            <span>AI agent</span>
          </div>
        </div>

        <div className="flex space-x-2 relative">
          <button className="p-2 rounded-xl bg-transparent hover:bg-slate-100 dark:hover:bg-neutral-800 text-neutral-500 transition-all">
            <RotateCcw className="w-5 h-5" />
          </button>
        </div>
      </div>

      <div className="flex-1 bg-slate-50/50 dark:bg-neutral-900/50 rounded-2xl border border-slate-200 dark:border-neutral-800 p-4 overflow-y-auto mb-4 scrollbar-none relative">
        {isLoading ? (
          <MessageSkeleton />
        ) : messages.length === 0 ? (
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="h-full flex flex-col items-center justify-center text-slate-400 space-y-4"
          >
            <div className="w-16 h-16 rounded-full bg-slate-100 dark:bg-neutral-800 flex items-center justify-center">
              <MessageSquare className="w-8 h-8 opacity-20" />
            </div>
            <p className="text-sm font-medium">您可以開始詢問任何問題</p>
          </motion.div>
        ) : (
          <div className="space-y-6">
            <AnimatePresence initial={false}>
              {messages.map((message, index) => {
                const isAssistant = message.role === "assistant";

                return (
                  <motion.div
                    key={message.id || index}
                    initial={{ opacity: 0, y: 10, scale: 0.98 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    className={`flex flex-col ${isAssistant ? "items-start" : "items-end"}`}
                  >
                    <div className={`max-w-[85%] rounded-2xl px-4 py-3 shadow-sm border ${isAssistant ? "bg-white dark:bg-neutral-800 border-slate-200 dark:border-neutral-700 text-neutral-800 dark:text-neutral-200" : "bg-sky-500 border-sky-400 text-white"}`}>
                      <p className="text-sm leading-relaxed whitespace-pre-wrap">
                        {isAssistant && message.isThinking && !message.content ? (
                          <span className="flex items-center space-x-1">
                            <span className="w-1.5 h-1.5 bg-sky-500 rounded-full animate-bounce [animation-delay:-0.3s]" />
                            <span className="w-1.5 h-1.5 bg-sky-500 rounded-full animate-bounce [animation-delay:-0.15s]" />
                            <span className="w-1.5 h-1.5 bg-sky-500 rounded-full animate-bounce" />
                          </span>
                        ) : message.content}
                      </p>

                      {isAssistant && message.citations && message.citations.length > 0 && (
                        <div className="mt-4 pt-3 border-t border-slate-100 dark:border-neutral-700/50 space-y-2">
                          {message.citations.map((c) => (
                            <div key={c.id} className="text-[10px] text-neutral-400 dark:text-neutral-500 hover:text-sky-500 transition-colors cursor-help">
                              📄 {c.docName}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                    {message.timestamp && (
                      <span className="mt-1 px-2 text-[10px] text-neutral-400">
                        {message.timestamp}
                      </span>
                    )}
                  </motion.div>
                );
              })}
            </AnimatePresence>
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      <div className="flex gap-4">
        <textarea
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          onKeyDown={(e) => {
            if (e.nativeEvent.isComposing) return;
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              handleSend();
            }
          }}
          placeholder="輸入問題..."
          className="flex-1 bg-white dark:bg-neutral-900 border-2 border-slate-300 dark:border-neutral-700 rounded-2xl p-4 text-black dark:text-white resize-none h-24 focus:border-sky-500/50 focus:ring-1 focus:ring-sky-500/20 outline-none transition-all placeholder-slate-500 dark:placeholder-neutral-500 shadow-sm shadow-slate-100"
        />
        <div className="flex flex-col gap-2">
          <button
            onClick={isListening ? stopListening : startListening}
            className={`flex-1 w-14 rounded-2xl flex items-center justify-center transition-all ${isListening ? "bg-rose-500 text-white shadow-lg animate-pulse" : "bg-slate-100 dark:bg-neutral-800 text-neutral-500 hover:bg-slate-200"}`}
          >
            {isListening ? <Square className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
          </button>
          <button
            onClick={handleSend}
            disabled={!inputText.trim() || sending}
            className={`flex-1 w-14 rounded-2xl flex items-center justify-center transition-all ${!inputText.trim() || sending ? "bg-slate-100 dark:bg-neutral-800 text-slate-300" : "bg-sky-500 text-white hover:bg-sky-600 shadow-xl"}`}
          >
            {sending ? <RotateCcw className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ChatWindow;
