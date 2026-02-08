import React, { useState } from 'react';
import { FileText, Sliders, ThumbsUp, ThumbsDown, Database, Zap } from 'lucide-react';
import type { Citation } from '../mockEduRag';

interface RightPanelTabsProps {
    citations: Citation[];
}

const RightPanelTabs: React.FC<RightPanelTabsProps> = ({ citations }) => {
    const [activeTab, setActiveTab] = useState<'citations' | 'settings' | 'feedback'>('citations');

    return (
        <div className="flex flex-col h-full bg-card-light dark:bg-card-dark border-l border-border-light dark:border-border-dark transition-colors">
            {/* Tabs Header */}
            <div className="flex border-b border-border-light dark:border-border-dark bg-card-light dark:bg-card-dark">
                {[
                    { id: 'citations', label: '引用來源', icon: FileText },
                    { id: 'settings', label: '設定', icon: Sliders },
                    { id: 'feedback', label: '回饋', icon: ThumbsUp },
                ].map((tab) => (
                    <button
                        key={tab.id}
                        onClick={() => setActiveTab(tab.id as any)}
                        className={`flex-1 py-3 text-sm font-medium flex items-center justify-center space-x-1 border-b-2 transition-colors ${activeTab === tab.id
                                ? 'border-primary dark:border-primary-dark text-primary dark:text-primary-dark bg-blue-50/50 dark:bg-blue-900/20'
                                : 'border-transparent text-text-muted-light dark:text-text-muted-dark hover:text-text-primary-light dark:hover:text-text-primary-dark hover:bg-gray-50 dark:hover:bg-slate-800'
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
                        <h3 className="text-xs font-semibold text-text-muted-light dark:text-text-muted-dark uppercase tracking-wider mb-2">
                            Reference Documents ({citations.length})
                        </h3>
                        {citations.length === 0 ? (
                            <div className="text-center py-8 text-text-muted-light dark:text-text-muted-dark text-sm">
                                <Database className="w-8 h-8 mx-auto mb-2 opacity-50" />
                                尚無引用資料
                            </div>
                        ) : (
                            citations.map(cit => (
                                <div key={cit.id} className="bg-white dark:bg-slate-900 border border-border-light dark:border-border-dark p-3 rounded-lg shadow-sm space-y-2 hover:border-primary dark:hover:border-primary-dark transition-colors group">
                                    <div className="flex items-start justify-between">
                                        <div className="flex items-center space-x-2 min-w-0">
                                            <FileText className="w-4 h-4 text-primary dark:text-primary-dark flex-shrink-0" />
                                            <span className="text-sm font-medium text-text-primary-light dark:text-text-primary-dark truncate" title={cit.docName}>{cit.docName}</span>
                                        </div>
                                        <span className="text-xs font-mono font-bold bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-400 px-1.5 py-0.5 rounded border border-green-200 dark:border-green-800">
                                            {(cit.similarity * 100).toFixed(0)}%
                                        </span>
                                    </div>
                                    <div className="text-xs text-text-secondary-light dark:text-text-secondary-dark bg-gray-50 dark:bg-slate-950 p-2 rounded leading-relaxed border border-gray-100 dark:border-slate-800">
                                        "{cit.snippet}"
                                    </div>
                                    <div className="flex justify-end">
                                        <span className="text-[10px] text-text-muted-light dark:text-text-muted-dark uppercase font-medium">Page {cit.page}</span>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                )}

                {activeTab === 'settings' && (
                    <div className="space-y-6">
                        <div className="space-y-3">
                            <label className="text-sm font-medium text-text-primary-light dark:text-text-primary-dark block">檢索數量 (Top K)</label>
                            <div className="flex items-center space-x-3">
                                <input type="range" min="1" max="10" defaultValue="3" className="flex-1 h-2 bg-gray-200 dark:bg-slate-700 rounded-lg appearance-none cursor-pointer" />
                                <span className="text-sm text-text-secondary-light dark:text-text-secondary-dark font-mono w-4">3</span>
                            </div>
                        </div>

                        <div className="space-y-3">
                            <label className="text-sm font-medium text-text-primary-light dark:text-text-primary-dark block">資料範圍</label>
                            <select className="w-full text-sm border-border-light dark:border-border-dark rounded-md shadow-sm focus:border-primary dark:focus:border-primary-dark focus:ring-primary dark:focus:ring-primary-dark p-2 border bg-white dark:bg-slate-900 text-text-primary-light dark:text-text-primary-dark">
                                <option>全部資料</option>
                                <option>近一年 (113年度)</option>
                                <option>僅法規與計畫</option>
                                <option>僅公文與函釋</option>
                            </select>
                        </div>

                        <div className="space-y-3">
                            <label className="text-sm font-medium text-text-primary-light dark:text-text-primary-dark block">回答風格</label>
                            <div className="grid grid-cols-2 gap-2">
                                <button className="px-3 py-2 text-xs font-medium bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800 rounded-md">精簡摘要</button>
                                <button className="px-3 py-2 text-xs font-medium bg-white dark:bg-slate-900 text-text-secondary-light dark:text-text-secondary-dark border border-border-light dark:border-border-dark rounded-md hover:bg-gray-50 dark:hover:bg-slate-800">詳細說明</button>
                            </div>
                        </div>

                        <div className="pt-4 border-t border-border-light dark:border-border-dark">
                            <div className="flex items-center space-x-2 text-xs text-text-muted-light dark:text-text-muted-dark">
                                <Zap className="w-3 h-3 text-amber-500" />
                                <span>Hybrid Search Enabled</span>
                            </div>
                        </div>
                    </div>
                )}

                {activeTab === 'feedback' && (
                    <div className="space-y-4">
                        <div className="text-center p-4">
                            <p className="text-sm text-text-primary-light dark:text-text-primary-dark mb-3">這則回答對您有幫助嗎？</p>
                            <div className="flex justify-center space-x-4">
                                <button className="p-3 rounded-full bg-white dark:bg-slate-900 border border-border-light dark:border-border-dark hover:border-green-500 dark:hover:border-green-500 hover:text-green-600 dark:hover:text-green-400 transition-all shadow-sm">
                                    <ThumbsUp className="w-6 h-6 text-text-secondary-light dark:text-text-secondary-dark" />
                                </button>
                                <button className="p-3 rounded-full bg-white dark:bg-slate-900 border border-border-light dark:border-border-dark hover:border-red-500 dark:hover:border-red-500 hover:text-red-600 dark:hover:text-red-400 transition-all shadow-sm">
                                    <ThumbsDown className="w-6 h-6 text-text-secondary-light dark:text-text-secondary-dark" />
                                </button>
                            </div>
                        </div>

                        <div className="space-y-2">
                            <label className="text-xs font-medium text-text-muted-light dark:text-text-muted-dark uppercase">詳細建議</label>
                            <textarea
                                className="w-full text-sm p-3 border border-border-light dark:border-border-dark rounded-md focus:ring-2 focus:ring-primary dark:focus:ring-primary-dark focus:border-transparent min-h-[120px] resize-none -mb-1 bg-white dark:bg-slate-900 text-text-primary-light dark:text-text-primary-dark"
                                placeholder="請告訴我們哪裡可以改進..."
                            ></textarea>
                            <button className="w-full py-2 bg-gray-900 dark:bg-slate-800 text-white text-sm rounded-md hover:bg-gray-800 dark:hover:bg-slate-700 transition-colors">
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
