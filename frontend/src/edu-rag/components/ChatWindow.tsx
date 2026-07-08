import React, { useRef, useEffect, useState } from "react";
import {
  Send,
  Mic,
  RotateCcw,
  Settings,
  MessageSquare,
  Sparkles,
  Square
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import type { Message } from "../mockEduRag";
import MessageSkeleton from './MessageSkeleton';
import { streamChatCompletion } from '../services/openaiService';

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
  activeThreadTitle?: string;
  isLoading?: boolean;
}

const ChatWindow: React.FC<ChatWindowProps> = ({
  messages,
  inputText,
  setInputText,
  onSendMessage,
  onUpdateMessage,
  activeThreadTitle = "對話區",
  isLoading = false,
}) => {
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const recognitionRef = useRef<any>(null);
  const settingsRef = useRef<HTMLDivElement>(null);
  const inputTextRef = useRef(inputText);
  const listeningBaseTextRef = useRef("");
  const finalTranscriptRef = useRef("");

  const [isListening, setIsListening] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [sending, setSending] = useState(false);
  const [settings, setSettings] = useState({
    onlyFromDocs: true,
    showReasoning: false
  });

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (settingsRef.current && !settingsRef.current.contains(event.target as Node)) {
        setIsSettingsOpen(false);
      }
    };
    if (isSettingsOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isSettingsOpen]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, sending]);

  useEffect(() => {
    inputTextRef.current = inputText;
  }, [inputText]);

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

  const parseContent = (content: string) => {
    const thoughtMatch = content.match(/<thought>([\s\S]*?)<\/thought>/);
    const thought = thoughtMatch ? thoughtMatch[1].trim() : null;
    const answer = content.replace(/<thought>[\s\S]*?<\/thought>/, "").trim();
    return { thought, answer };
  };

  const handleSend = async () => {
    if (!inputText.trim() || sending) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      role: "user",
      content: inputText,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };

    onSendMessage(userMessage);
    setInputText("");
    setSending(true);

    const chatHistory = messages.map(m => ({
      role: m.role as 'user' | 'assistant',
      content: m.content
    }));
    chatHistory.push({ role: 'user', content: userMessage.content });

    const assistantId = (Date.now() + 1).toString();
    const assistantMessage: Message = {
      id: assistantId,
      role: "assistant",
      content: "",
      isThinking: true,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };

    onSendMessage(assistantMessage);

    let accumulatedText = "";

    await streamChatCompletion(chatHistory, {
      onlyFromDocs: settings.onlyFromDocs,
      showReasoning: settings.showReasoning,
      onUpdate: (fullText) => {
        accumulatedText = fullText;
        onUpdateMessage?.({ ...assistantMessage, content: fullText });
      },
      onError: (err) => {
        onUpdateMessage?.({ 
          ...assistantMessage, 
          content: accumulatedText + `\n\n⚠️ Error: ${err instanceof Error ? err.message : String(err)}`,
          isThinking: false 
        });
        setSending(false);
      },
      onComplete: () => {
        onUpdateMessage?.({ ...assistantMessage, content: accumulatedText, isThinking: false });
        setSending(false);
      }
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

        <div className="flex space-x-2 relative" ref={settingsRef}>
          <button className="p-2 rounded-xl bg-transparent hover:bg-slate-100 dark:hover:bg-neutral-800 text-neutral-500 transition-all">
            <RotateCcw className="w-5 h-5" />
          </button>
          <button 
            onClick={() => setIsSettingsOpen(!isSettingsOpen)}
            className={`p-2 rounded-xl transition-all ${isSettingsOpen ? 'bg-sky-500/10 text-sky-600' : 'bg-transparent hover:bg-slate-100 dark:hover:bg-neutral-800 text-neutral-500'}`}
          >
            <Settings className="w-5 h-5" />
          </button>

          <AnimatePresence>
            {isSettingsOpen && (
              <motion.div
                initial={{ opacity: 0, y: 10, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 10, scale: 0.95 }}
                className="absolute right-0 top-full mt-2 w-72 z-50 overflow-hidden"
              >
                <div className="card p-4 backdrop-blur-xl bg-white/90 dark:bg-neutral-900/90 border border-slate-200 dark:border-neutral-800 shadow-2xl space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold text-neutral-900 dark:text-white">對話設定</h3>
                    <div className="text-[10px] bg-sky-500/10 text-sky-600 px-1.5 py-0.5 rounded font-mono">Expert</div>
                  </div>
                  
                  <div className="flex items-center justify-between group">
                    <div className="flex flex-col">
                      <span className="text-xs font-medium text-neutral-700 dark:text-neutral-300">模型精確度調節</span>
                      <span className="text-[10px] text-neutral-500">僅從上傳的文件內容回覆</span>
                    </div>
                    <button 
                      onClick={() => setSettings(s => ({ ...s, onlyFromDocs: !s.onlyFromDocs }))}
                      className={`relative w-10 h-5 rounded-full transition-colors ${settings.onlyFromDocs ? 'bg-sky-500' : 'bg-slate-300 dark:bg-neutral-700'}`}
                    >
                      <motion.div 
                        animate={{ x: settings.onlyFromDocs ? 22 : 2 }}
                        className="absolute top-1 w-3 h-3 bg-white rounded-full shadow-sm"
                      />
                    </button>
                  </div>

                  <div className="flex items-center justify-between group">
                    <div className="flex flex-col">
                      <span className="text-xs font-medium text-neutral-700 dark:text-neutral-300">思維鏈</span>
                      <span className="text-[10px] text-neutral-500">顯示 AI 回覆的思考歷程</span>
                    </div>
                    <button 
                      onClick={() => setSettings(s => ({ ...s, showReasoning: !s.showReasoning }))}
                      className={`relative w-10 h-5 rounded-full transition-colors ${settings.showReasoning ? 'bg-sky-500' : 'bg-slate-300 dark:bg-neutral-700'}`}
                    >
                      <motion.div 
                        animate={{ x: settings.showReasoning ? 22 : 2 }}
                        className="absolute top-1 w-3 h-3 bg-white rounded-full shadow-sm"
                      />
                    </button>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
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
                const { thought, answer } = parseContent(message.content);

                return (
                  <motion.div
                    key={message.id || index}
                    initial={{ opacity: 0, y: 10, scale: 0.98 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    className={`flex flex-col ${isAssistant ? "items-start" : "items-end"}`}
                  >
                    <div className={`max-w-[85%] rounded-2xl px-4 py-3 shadow-sm border ${isAssistant ? "bg-white dark:bg-neutral-800 border-slate-200 dark:border-neutral-700 text-neutral-800 dark:text-neutral-200" : "bg-sky-500 border-sky-400 text-white"}`}>
                      {isAssistant && thought && (
                        <div className="mb-3 pb-3 border-b border-slate-100 dark:border-neutral-700/50">
                          <div className="flex items-center space-x-2 text-[10px] font-bold text-sky-500 mb-1 uppercase tracking-wider">
                            <Sparkles className="w-3 h-3" />
                            <span>Thinking Process</span>
                          </div>
                          <p className="text-xs text-neutral-500 dark:text-neutral-400 italic leading-relaxed">
                            {thought}
                          </p>
                        </div>
                      )}
                      
                      <p className="text-sm leading-relaxed whitespace-pre-wrap">
                        {isAssistant && message.isThinking && !answer ? (
                          <span className="flex items-center space-x-1">
                            <span className="w-1.5 h-1.5 bg-sky-500 rounded-full animate-bounce [animation-delay:-0.3s]" />
                            <span className="w-1.5 h-1.5 bg-sky-500 rounded-full animate-bounce [animation-delay:-0.15s]" />
                            <span className="w-1.5 h-1.5 bg-sky-500 rounded-full animate-bounce" />
                          </span>
                        ) : answer || message.content}
                      </p>

                      {isAssistant && message.citations && message.citations.length > 0 && !message.isThinking && (
                        <div className="mt-4 pt-3 border-t border-slate-100 dark:border-neutral-700/50 space-y-2">
                          {message.citations.map((c) => (
                            <div key={c.id} className="text-[10px] text-neutral-400 dark:text-neutral-500 hover:text-sky-500 transition-colors cursor-help">
                              📄 {c.docName} (p.{c.page})
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
