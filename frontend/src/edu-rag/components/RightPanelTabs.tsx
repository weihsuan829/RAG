import React, { useState } from 'react';
import { FileText, Sliders, ThumbsUp, ThumbsDown, Database, Zap } from 'lucide-react';
import type { Citation } from '../mockEduRag';

// 右側面板可接收的資料：目前為引用來源清單。
interface RightPanelTabsProps {
    citations: Citation[];
}

// 右側多分頁面板：引用來源、檢索設定、回饋。
const RightPanelTabs: React.FC<RightPanelTabsProps> = ({ citations }) => {
    // 目前選中的分頁。
    const [activeTab, setActiveTab] = useState<'citations' | 'settings' | 'feedback'>('citations');

    return (
        <div className="flex flex-col h-full bg-white dark:bg-neutral-900 border-l border-slate-300 dark:border-neutral-700 transition-colors">
            {/* Tabs Header */}
            <div className="flex border-b border-slate-300 dark:border-neutral-700 bg-white dark:bg-neutral-900">
                {[
                    { id: 'citations', label: '引用來源', icon: FileText },
                    { id: 'settings', label: '設定', icon: Sliders },
                    { id: 'feedback', label: '回饋', icon: ThumbsUp },
                ].map((tab) => (
                    <button
                        key={tab.id}
                        onClick={() => setActiveTab(tab.id as any)}
                        className={`flex-1 py-3 text-sm font-medium flex items-center justify-center space-x-1 border-b-2 transition-colors ${activeTab === tab.id
                            ? 'border-sky-500 dark:border-sky-400 text-sky-600 dark:text-sky-300 bg-blue-50/50 dark:bg-blue-900/20'
                            : 'border-transparent text-slate-500 dark:text-neutral-400 hover:text-black dark:hover:text-white hover:bg-slate-50 dark:hover:bg-neutral-800'
                            }`}
                    >
                        <tab.icon className="w-4 h-4" />
                        <span>{tab.label}</span>
                    </button>
                ))}
            </div>

            {/* Tab Content */}
            <div className="flex-1 overflow-y-auto p-4">
                {activeTab === 'citations' && (
                    <div className="space-y-4">
                        <h3 className="text-xs font-semibold text-slate-500 dark:text-neutral-400 uppercase tracking-wider mb-2">
                            Reference Documents ({citations.length})
                        </h3>
                        {/* 無引用來源時顯示空狀態 */}
                        {citations.length === 0 ? (
                            <div className="text-center py-8 text-slate-500 dark:text-neutral-500 text-sm">
                                <Database className="w-8 h-8 mx-auto mb-2 opacity-50" />
                                尚無引用資料
                            </div>
                        ) : (
                            // 列出每個引用片段與相似度分數
                            citations.map(cit => (
                                <div key={cit.id} className="bg-slate-50 dark:bg-neutral-800/50 border border-slate-300 dark:border-neutral-700 p-3 rounded-lg shadow-sm space-y-2 hover:border-sky-500 dark:hover:border-sky-400 transition-colors group">
                                    <div className="flex items-start justify-between">
                                        <div className="flex items-center space-x-2 min-w-0">
                                            <FileText className="w-4 h-4 text-sky-600 dark:text-sky-400 flex-shrink-0" />
                                            <span className="text-sm font-medium text-black dark:text-white truncate" title={cit.docName}>{cit.docName}</span>
                                        </div>
                                        <span className="text-xs font-mono font-bold bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-400 px-1.5 py-0.5 rounded border border-green-200 dark:border-green-800">
                                            {(cit.similarity * 100).toFixed(0)}%
                                        </span>
                                    </div>
                                    <div className="text-xs text-slate-600 dark:text-neutral-400 bg-white dark:bg-neutral-900 p-2 rounded leading-relaxed border border-slate-200 dark:border-neutral-700">
                                        "{cit.snippet}"
                                    </div>
                                    <div className="flex justify-end">
                                        <span className="text-[10px] text-slate-500 dark:text-neutral-500 uppercase font-medium">Page {cit.page}</span>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                )}

                {activeTab === 'settings' && (
                    <div className="space-y-6">
                        <div className="space-y-3">
                            <label className="text-sm font-medium text-black dark:text-white block">檢索數量 (Top K)</label>
                            <div className="flex items-center space-x-3">
                                <input type="range" min="1" max="10" defaultValue="3" className="flex-1 h-2 bg-slate-200 dark:bg-neutral-700 rounded-lg appearance-none cursor-pointer" />
                                <span className="text-sm text-slate-600 dark:text-neutral-400 font-mono w-4">3</span>
                            </div>
                        </div>

                        <div className="space-y-3">
                            <label className="text-sm font-medium text-black dark:text-white block">資料範圍</label>
                            <select className="w-full text-sm border-slate-300 dark:border-neutral-700 rounded-md shadow-sm focus:border-sky-500 dark:focus:border-sky-400 focus:ring-sky-500 p-2 border bg-white dark:bg-neutral-900 text-black dark:text-white">
                                <option>全部資料</option>
                                <option>近一年 (113年度)</option>
                                <option>僅法規與計畫</option>
                                <option>僅公文與函釋</option>
                            </select>
                        </div>

                        <div className="space-y-3">
                            <label className="text-sm font-medium text-black dark:text-white block">回答風格</label>
                            <div className="grid grid-cols-2 gap-2">
                                <button className="px-3 py-2 text-xs font-medium bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800 rounded-md">精簡摘要</button>
                                <button className="px-3 py-2 text-xs font-medium bg-slate-50 dark:bg-neutral-800 text-slate-600 dark:text-neutral-400 border border-slate-300 dark:border-neutral-700 rounded-md hover:bg-white dark:hover:bg-neutral-700">詳細說明</button>
                            </div>
                        </div>

                        <div className="pt-4 border-t border-slate-300 dark:border-neutral-700">
                            <div className="flex items-center space-x-2 text-xs text-slate-500 dark:text-neutral-500">
                                <Zap className="w-3 h-3 text-amber-500" />
                                <span>Hybrid Search Enabled</span>
                            </div>
                        </div>
                    </div>
                )}

                {activeTab === 'feedback' && (
                    <div className="space-y-4">
                        <div className="text-center p-4">
                            <p className="text-sm text-black dark:text-white mb-3">這則回答對您有幫助嗎？</p>
                            <div className="flex justify-center space-x-4">
                                <button className="p-3 rounded-full bg-slate-50 dark:bg-neutral-800 border border-slate-300 dark:border-neutral-700 hover:border-green-500 hover:text-green-600 transition-all shadow-sm">
                                    <ThumbsUp className="w-6 h-6 text-slate-500 dark:text-neutral-400" />
                                </button>
                                <button className="p-3 rounded-full bg-slate-50 dark:bg-neutral-800 border border-slate-300 dark:border-neutral-700 hover:border-red-500 hover:text-red-600 transition-all shadow-sm">
                                    <ThumbsDown className="w-6 h-6 text-slate-500 dark:text-neutral-400" />
                                </button>
                            </div>
                        </div>

                        <div className="space-y-2">
                            <label className="text-xs font-medium text-slate-500 dark:text-neutral-400 uppercase">詳細建議</label>
                            <textarea
                                className="w-full text-sm p-3 border border-slate-300 dark:border-neutral-700 rounded-md focus:ring-2 focus:ring-sky-500 focus:border-transparent min-h-[120px] resize-none -mb-1 bg-white dark:bg-neutral-900 text-black dark:text-white"
                                placeholder="請告訴我們哪裡可以改進..."
                            ></textarea>
                            <button className="w-full py-2 bg-slate-900 dark:bg-slate-800 text-white text-sm rounded-md hover:bg-slate-800 dark:hover:bg-slate-700 transition-colors">
                                送出回饋
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default RightPanelTabs;
