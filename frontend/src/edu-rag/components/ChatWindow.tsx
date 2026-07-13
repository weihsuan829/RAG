import React, { useRef, useEffect, useState } from "react";
import {
  Send,
  Mic,
  RotateCcw,
  MessageSquare,
  Square,
  ChevronDown,
  ChevronRight
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

// 逐字打字機：串流中（active）以基礎速率 25 字/秒逐步顯示 content 的前綴；
// 若累積落後（實際內容長度－已顯示長度）超過門檻，加速追趕，避免視覺上落後串流過久。
// active 由 true 轉為 false（串流結束）時，立即補齊剩餘文字。
// 非串流（歷史訊息 isThinking undefined、或錯誤文案）從掛載當下就直接顯示完整內容，無動畫。
const TYPEWRITER_TICK_MS = 50;
const TYPEWRITER_BASE_CPS = 25;
const TYPEWRITER_BACKLOG_THRESHOLD = 60;

const TypewriterText: React.FC<{ content: string; active: boolean }> = ({ content, active }) => {
  const [displayed, setDisplayed] = useState<string>(() => (active ? "" : content));
  const contentRef = useRef(content);
  contentRef.current = content;
  const accRef = useRef(0);

  useEffect(() => {
    if (!active) {
      // 串流結束（或本來就不是串流訊息）：立即補齊，不做動畫。
      setDisplayed(contentRef.current);
      return;
    }

    accRef.current = 0;
    const interval = setInterval(() => {
      setDisplayed((prev) => {
        const full = contentRef.current;
        // 防禦性 clamp：理論上串流內容只會增長，但若某次更新造成長度變短
        // （例如整包重送同樣內容），避免索引越界或顯示錯亂。
        if (prev.length > full.length) return full;
        if (prev.length >= full.length) return prev;

        const backlog = full.length - prev.length;
        if (backlog > TYPEWRITER_BACKLOG_THRESHOLD) {
          // 落後太多：一次追趕一半，避免感覺卡在字串尾端太久。
          return full.slice(0, prev.length + Math.ceil(backlog / 2));
        }

        accRef.current += TYPEWRITER_BASE_CPS * (TYPEWRITER_TICK_MS / 1000);
        const step = Math.floor(accRef.current);
        if (step < 1) return prev;
        accRef.current -= step;
        return full.slice(0, Math.min(full.length, prev.length + step));
      });
    }, TYPEWRITER_TICK_MS);

    return () => clearInterval(interval);
  }, [active]);

  return <>{displayed}</>;
};

// 自動網路搜尋門檻：KB 回覆最高相似度低於此值（或完全沒有出處）視為「查無資料」，
// 觸發自動網路搜尋補充。實測：直接命中≈0.80、弱相關≈0.57，故取 0.45 作為分界。
const AUTO_WEB_THRESHOLD = 0.45;

const AUTO_WEB_FALLBACK_STORAGE_KEY = 'auto_web_fallback';

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
  // 參考來源收合：per-message 展開狀態，純畫面用，不持久化，重新整理即重置為全部收合。
  const [expandedCitations, setExpandedCitations] = useState<Set<string>>(new Set());
  // 「查無資料時自動網路搜尋」開關，per-browser 記憶於 localStorage，預設關閉。
  const [autoWebFallback, setAutoWebFallback] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return window.localStorage.getItem(AUTO_WEB_FALLBACK_STORAGE_KEY) === '1';
  });

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, sending]);

  useEffect(() => {
    inputTextRef.current = inputText;
  }, [inputText]);

  useEffect(() => {
    activeThreadIdRef.current = activeThreadId;
  }, [activeThreadId]);

  useEffect(() => {
    window.localStorage.setItem(AUTO_WEB_FALLBACK_STORAGE_KEY, autoWebFallback ? '1' : '0');
  }, [autoWebFallback]);

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

  // 共用的送出流程：新增 user 氣泡（可選，web 補充時省略）＋assistant 佔位＋streamChat。
  // mode 決定走 kb（知識庫）或 web（網路搜尋補充）。
  // threadIdOverride：僅供「查無資料時自動網路搜尋」在新對話情境下使用──此時
  // activeThreadId prop 尚未因 onThreadCreated 而更新，需改用 onDone 直接回傳的
  // thread_id，避免以過期的 null 送出而重複建立新對話。手動 🌐 按鈕不傳此參數，
  // 行為與過去完全相同（沿用 activeThreadId）。
  const sendMessage = async (
    messageText: string,
    mode: 'kb' | 'web',
    userMessage: Message | null,
    threadIdOverride?: string,
  ) => {
    if (sending) return;

    if (userMessage) {
      onSendMessage(userMessage);
    }
    setSending(true);

    const assistantId = (Date.now() + 1).toString();
    const assistantMessage: Message = {
      id: assistantId,
      role: "assistant",
      content: "",
      isThinking: true,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      source: mode,
    };

    onSendMessage(assistantMessage);

    // threadId 於串流期間固定：新對話送出後 onDone 才會拿到新建的 thread_id，
    // 不應在同一次請求中途改變送出的 threadId。
    const threadIdAtSend = threadIdOverride !== undefined ? threadIdOverride : activeThreadId;
    // 累積目前訊息的出處，讓後續 onUpdate/onDone 的整包更新不會把已收到的出處蓋掉。
    let latestCitations: Message['citations'];
    // 自動網路搜尋開關：在送出當下（本次 sendMessage 呼叫）就地捕捉一份快照，
    // 而非在 onDone（可能於使用者切換開關後才觸發）當下才讀取 state ──
    // sendMessage 每次 render 都會重新建立，且是在事件當下同步呼叫，故此處讀到
    // 的即是「送出那一刻」的開關狀態，語意上等同於用 ref 讀取，但不需額外的 ref。
    const autoWebFallbackAtSend = autoWebFallback;
    // 保證同一個問題最多只自動觸發一次網路搜尋（防禦性：即使 onDone 意外多次觸發）。
    let autoWebFired = false;

    // 累積已收到的答案文字：onCitations（web 模式在文字之後才到）與 onDone 的整包更新
    // 都必須帶上它，否則會把畫面上已顯示的答案清成空白（handleUpdateMessage 是整物件取代）。
    let lastText = "";

    await streamChat(messageText, threadIdAtSend, {
      onCitations: (citations: ApiCitation[]) => {
        latestCitations = citations.map((c, i) => ({
          id: String(i),
          docName: c.doc_name,
          snippet: c.snippet,
          similarity: c.similarity,
          url: c.url,
        }));
        onUpdateMessage?.({ ...assistantMessage, content: lastText, citations: latestCitations, source: mode });
      },
      onUpdate: (fullText) => {
        lastText = fullText;
        onUpdateMessage?.({ ...assistantMessage, content: lastText, citations: latestCitations, source: mode });
      },
      onDone: ({ thread_id, source }) => {
        onUpdateMessage?.({ ...assistantMessage, content: lastText, isThinking: false, citations: latestCitations, source });
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

        // 查無資料時自動網路搜尋：僅 kb 模式評估，且每個問題最多觸發一次。
        // 判定「查無資料」＝完全沒有出處，或最高相似度低於 AUTO_WEB_THRESHOLD。
        if (mode === 'kb' && !autoWebFired) {
          const similarities = (latestCitations ?? []).map((c) => c.similarity);
          const maxSimilarity = similarities.length > 0 ? Math.max(...similarities) : -Infinity;
          const noResult = similarities.length === 0 || maxSimilarity < AUTO_WEB_THRESHOLD;

          if (autoWebFallbackAtSend && noResult) {
            autoWebFired = true;
            // 與手動「🌐 用網路搜尋補充」按鈕行為一致：不新增 user 氣泡（問題沒變），
            // 直接以 web 模式重送同一問題文字（來自本次送出的 closure，非索引查找）。
            // thread_id 一律採用 onDone 剛回傳的值──新對話時這是唯一可靠、非過期的
            // thread id（activeThreadId prop 此刻仍可能是 null）。
            void sendMessage(messageText, 'web', null, thread_id);
          }
        }
      },
      onError: () => {
        onUpdateMessage?.({
          ...assistantMessage,
          content: '⚠️ 系統暫時無法取得資料，請稍後再試',
          isThinking: false,
        });
        setSending(false);
      },
    }, mode);
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
    setInputText("");

    await sendMessage(messageText, 'kb', userMessage);
  };

  const toggleCitations = (key: string) => {
    setExpandedCitations((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  // 「用網路搜尋補充」：找出該 assistant 訊息前一則 user 訊息的內容，以 mode:'web' 重新送出，
  // 附加在同一對話尾端（不新增 user 氣泡，因為問題內容沒變）。
  const handleWebFallback = (assistantIndex: number) => {
    if (sending) return;
    for (let i = assistantIndex - 1; i >= 0; i--) {
      if (messages[i].role === 'user') {
        void sendMessage(messages[i].content, 'web', null);
        return;
      }
    }
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

        <div className="flex items-center space-x-3 relative">
          <div className="flex items-center gap-2">
            <span className="text-[12px] text-neutral-500 dark:text-neutral-400 select-none whitespace-nowrap">
              查無資料時自動網路搜尋
            </span>
            <button
              type="button"
              role="switch"
              aria-checked={autoWebFallback}
              aria-label="查無資料時自動網路搜尋"
              onClick={() => setAutoWebFallback((prev) => !prev)}
              className={`relative w-9 h-5 rounded-full shrink-0 transition-colors ${
                autoWebFallback ? "bg-sky-500" : "bg-slate-300 dark:bg-neutral-700"
              }`}
            >
              <motion.div
                className="absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow"
                animate={{ x: autoWebFallback ? 16 : 0 }}
                transition={{ type: "spring", stiffness: 500, damping: 30 }}
              />
            </button>
          </div>
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
                const isWebSource = isAssistant && message.source === 'web';
                const isErrorMessage = message.content.startsWith('⚠️ 系統暫時無法取得資料');
                // 顯示「用網路搜尋補充」按鈕的條件：assistant 訊息、非串流中（isThinking）、非錯誤文案。
                const showWebFallback = isAssistant && !message.isThinking && !isErrorMessage;
                const citationKey = message.id || String(index);
                const citationsExpanded = expandedCitations.has(citationKey);

                return (
                  <motion.div
                    key={message.id || index}
                    initial={{ opacity: 0, y: 10, scale: 0.98 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    className={`flex flex-col ${isAssistant ? "items-start" : "items-end"}`}
                  >
                    <div
                      className={`max-w-[85%] rounded-2xl px-4 py-3 shadow-sm border ${
                        isWebSource
                          ? "bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800/60 text-neutral-800 dark:text-neutral-200"
                          : isAssistant
                            ? "bg-white dark:bg-neutral-800 border-slate-200 dark:border-neutral-700 text-neutral-800 dark:text-neutral-200"
                            : "bg-sky-500 border-sky-400 text-white"
                      }`}
                    >
                      {isWebSource && (
                        <div className="mb-2 text-[10px] font-medium text-amber-700 dark:text-amber-400">
                          🌐 網路資訊，僅供參考
                        </div>
                      )}
                      <p className="text-sm leading-relaxed whitespace-pre-wrap">
                        {isAssistant && message.isThinking && !message.content ? (
                          <span className="flex items-center space-x-1">
                            <span className="w-1.5 h-1.5 bg-sky-500 rounded-full animate-bounce [animation-delay:-0.3s]" />
                            <span className="w-1.5 h-1.5 bg-sky-500 rounded-full animate-bounce [animation-delay:-0.15s]" />
                            <span className="w-1.5 h-1.5 bg-sky-500 rounded-full animate-bounce" />
                          </span>
                        ) : isAssistant ? (
                          <TypewriterText content={message.content} active={!!message.isThinking} />
                        ) : message.content}
                      </p>

                      {isAssistant && message.citations && message.citations.length > 0 && (
                        <div className="mt-4 pt-3 border-t border-slate-100 dark:border-neutral-700/50">
                          <button
                            type="button"
                            onClick={() => toggleCitations(citationKey)}
                            className="flex items-center gap-1 text-[10px] text-neutral-400 dark:text-neutral-500 hover:text-sky-500 transition-colors"
                          >
                            {citationsExpanded ? (
                              <ChevronDown className="w-3 h-3" />
                            ) : (
                              <ChevronRight className="w-3 h-3" />
                            )}
                            <span>參考來源 ({message.citations.length})</span>
                          </button>
                          {citationsExpanded && (
                            <div className="mt-2 space-y-2">
                              {message.citations.map((c) => (
                                <div key={c.id} className="text-[10px] text-neutral-400 dark:text-neutral-500 hover:text-sky-500 transition-colors cursor-help">
                                  {c.url ? (
                                    <>
                                      <a href={c.url} target="_blank" rel="noopener noreferrer" className="underline hover:text-sky-500">{c.docName}</a>
                                    </>
                                  ) : (
                                    <>{c.docName}</>
                                  )}
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                    {showWebFallback && (
                      <button
                        onClick={() => handleWebFallback(index)}
                        disabled={sending}
                        className="mt-1 px-2 py-0.5 text-[10px] text-neutral-400 dark:text-neutral-500 hover:text-sky-500 dark:hover:text-sky-400 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                      >
                        🌐 用網路搜尋補充
                      </button>
                    )}
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
