import React, { useEffect, useMemo, useState } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import Sidebar from './layouts/Sidebar';
import EduRagChatPage from './edu-rag/pages/EduRagChatPage';
import EduRagUploadPage from './edu-rag/pages/EduRagUploadPage';
import EduRagDocsPage from './edu-rag/pages/EduRagDocsPage';
import EduRagDocDetailPage from './edu-rag/pages/EduRagDocDetailPage';
import { Menu } from 'lucide-react';
import { ThemeProvider, useTheme } from './context/ThemeContext';
import { listUploads, type UploadRecord } from './edu-rag/utils/uploadStore';
import logoWhite from './assets/新北教育局-logo白.png';
import logoBlack from './assets/新北教育局-logo黑.png';

// 全站共用的版型殼：包含側邊欄、頂部工具列與內容區塊
const Layout = ({ children }: { children: React.ReactNode }) => {
  // 控制側邊欄展開/收合的狀態
  const [sidebarOpen, setSidebarOpen] = useState(true);
  // 取得目前主題，決定顯示哪個 logo
  const { theme } = useTheme();
  const logoSrc = theme === 'dark' ? logoWhite : logoBlack;

  return (
    <div className="flex h-screen overflow-hidden bg-[var(--bg-page)] text-[var(--text-primary)] transition-colors duration-300">
      {/* 可收合的側邊欄區塊 */}
      <div className={`flex-shrink-0 transition-all duration-300 p-4 ${sidebarOpen ? 'w-72' : 'w-0'}`}>
        <div className="h-full card overflow-hidden">
          <Sidebar />
        </div>
      </div>
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden p-4 pl-0">
        {/* 頂部工具列：顯示標題、切換側邊欄 */}
        <header className="h-16 flex items-center px-6 mb-4 card mx-4 mt-0 shrink-0">
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="p-2 -ml-2 rounded-xl hover:bg-neutral-800 text-neutral-400 hover:text-white transition-colors"
          >
            <Menu className="h-6 w-6" />
          </button>
          <img
            src={logoSrc}
            alt="新北市教育局"
            className="ml-4 h-10 w-auto object-contain"
          />
        </header>
        {/* 路由內容渲染區塊 */}
        <main className="flex-1 overflow-auto rounded-2xl mx-4 mb-0 relative">
          {children}
        </main>
      </div>
    </div>
  );
};

// 範例頁面：保留給既有系統或未完成的頁面
const Dashboard = () => {
  const [docs, setDocs] = useState<UploadRecord[]>([]);

  const refreshDocs = async () => {
    const items = await listUploads();
    setDocs(items);
  };

  useEffect(() => {
    refreshDocs();
    const onFocus = () => { void refreshDocs(); };
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, []);

  const counts = useMemo(() => {
    const totals = { pdf: 0, word: 0, excel: 0, other: 0 };
    docs.forEach((doc) => {
      const name = doc.name.toLowerCase();
      const type = doc.type;
      if (type === 'application/pdf' || name.endsWith('.pdf')) totals.pdf += 1;
      else if (type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' || name.endsWith('.docx')) totals.word += 1;
      else if (type === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' || type === 'application/vnd.ms-excel' || name.endsWith('.xlsx') || name.endsWith('.xls')) totals.excel += 1;
      else totals.other += 1;
    });
    return totals;
  }, [docs]);

  const total = docs.length;

  return (
    <div className="p-8 max-w-6xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-text-primary-light dark:text-text-primary-dark">
          檔案統計
        </h1>
        <div className="text-sm text-text-secondary-light dark:text-text-secondary-dark">
          總數：{total}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="card p-6">
          <div className="text-sm text-text-secondary-light dark:text-text-secondary-dark">PDF</div>
          <div className="mt-3 text-3xl font-semibold text-text-primary-light dark:text-text-primary-dark">{counts.pdf}</div>
        </div>
        <div className="card p-6">
          <div className="text-sm text-text-secondary-light dark:text-text-secondary-dark">Word</div>
          <div className="mt-3 text-3xl font-semibold text-text-primary-light dark:text-text-primary-dark">{counts.word}</div>
        </div>
        <div className="card p-6">
          <div className="text-sm text-text-secondary-light dark:text-text-secondary-dark">Excel</div>
          <div className="mt-3 text-3xl font-semibold text-text-primary-light dark:text-text-primary-dark">{counts.excel}</div>
        </div>
        <div className="card p-6">
          <div className="text-sm text-text-secondary-light dark:text-text-secondary-dark">其他</div>
          <div className="mt-3 text-3xl font-semibold text-text-primary-light dark:text-text-primary-dark">{counts.other}</div>
        </div>
      </div>
    </div>
  );
};

// App 為此專案的主要進入點：組合主題、路由與整體版型
const App = () => {
  return (
    // ThemeProvider 控制全站 light/dark 主題
    <ThemeProvider>
      {/* Router 負責前端路由切換 */}
      <Router>
        {/* Layout 是所有頁面共用的外框 */}
        <Layout>
          <Routes>
            {/* 入口路由：導向教育局 RAG 聊天首頁 */}
            <Route path="/" element={<Navigate to="/app/edu-rag/chat" replace />} />
            {/* 範例/既有頁面入口 */}
            <Route path="/app/dashboard" element={<Dashboard />} />

            {/* 教育局 RAG 功能路由 */}
            <Route path="/app/edu-rag/chat" element={<EduRagChatPage />} />
            {/* 後台：上傳資料 */}
            <Route path="/app/edu-rag/admin/upload" element={<EduRagUploadPage />} />
            {/* 後台：文件清單 */}
            <Route path="/app/edu-rag/admin/docs" element={<EduRagDocsPage />} />
            {/* 後台：單一文件詳情 */}
            <Route path="/app/edu-rag/admin/docs/:id" element={<EduRagDocDetailPage />} />
          </Routes>
        </Layout>
      </Router>
    </ThemeProvider>
  );
};

export default App;
