import React, { useEffect, useMemo, useState } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import Sidebar from './layouts/Sidebar';
import EduRagChatPage from './edu-rag/pages/EduRagChatPage';
import EduRagUploadPage from './edu-rag/pages/EduRagUploadPage';
import EduRagDocsPage from './edu-rag/pages/EduRagDocsPage';
import EduRagDocDetailPage from './edu-rag/pages/EduRagDocDetailPage';
import LandingPage from './pages/LandingPage';
import LoginPage from './pages/LoginPage';
import { Menu, Moon, Sun } from 'lucide-react';
import { ThemeProvider, useTheme } from './context/ThemeContext';
import { listUploads } from './edu-rag/utils/uploadStore';
import { SYSTEM_DOCS } from './edu-rag/mockEduRag';
import logoWhite from './assets/新北教育局-logo白.png';
import logoBlack from './assets/新北教育局-logo黑.png';

// 全域版面配置元件：
// 負責側邊欄、頂部工具列、主內容容器，以及字體大小/主題切換等跨頁 UI。
const Layout = ({ children }: { children: React.ReactNode }) => {
  // 控制側邊欄展開/收合狀態。
  const [sidebarOpen, setSidebarOpen] = useState(true);
  // 從主題 Context 讀取目前主題，並取得切換主題方法。
  const { theme, toggleTheme } = useTheme();
  // 根據深淺主題切換對應的 Logo 圖檔。
  const logoSrc = theme === 'dark' ? logoWhite : logoBlack;

  // 字體大小設定（px），預設 16。
  const [fontSize, setFontSize] = useState(16);
  // 字體大小上下限與每次調整步進值。
  const minFontSize = 12;
  const maxFontSize = 22;
  const step = 2;

  // 初始化字體大小：
  // 1) 讀取 localStorage 的使用者偏好
  // 2) 套用到 state 與 CSS 變數 --font-size-base
  useEffect(() => {
    const saved = window.localStorage.getItem('font-size-base');
    const parsed = saved ? Number(saved) : NaN;
    const initial = Number.isFinite(parsed) ? parsed : 16;
    setFontSize(initial);
    document.documentElement.style.setProperty('--font-size-base', `${initial}px`);
  }, []);

  // 套用字體大小的共用方法：
  // - 先做夾擠（clamp）避免超出上下限
  // - 同步更新 React state、CSS 變數與 localStorage
  const applyFontSize = (nextSize: number) => {
    const clamped = Math.min(maxFontSize, Math.max(minFontSize, nextSize));
    setFontSize(clamped);
    document.documentElement.style.setProperty('--font-size-base', `${clamped}px`);
    window.localStorage.setItem('font-size-base', String(clamped));
  };

  // 放大字體。
  const increaseFontSize = () => {
    applyFontSize(fontSize + step);
  };

  // 縮小字體。
  const decreaseFontSize = () => {
    applyFontSize(fontSize - step);
  };

  return (
    // 最外層容器：固定全高，並使用主題色彩變數。
    <div className="flex h-screen overflow-hidden bg-[var(--bg-page)] text-[var(--text-primary)] transition-colors duration-300">
      {/* 側邊欄區塊：透過寬度動畫切換顯示/隱藏 */}
      <div className={`flex-shrink-0 transition-all duration-300 p-4 ${sidebarOpen ? 'w-72' : 'w-0'}`}>
        <div className="h-full card overflow-hidden">
          <Sidebar />
        </div>
      </div>

      {/* 右側主區域：上方 Header + 下方內容區 */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden p-4 pl-0">
        {/* Header：側邊欄按鈕、Logo、字體大小與主題切換 */}
        <header className="h-16 flex items-center justify-between px-6 mb-4 card mx-4 mt-0 shrink-0">
          <div className="flex items-center">
            <button
              // 切換側邊欄開關
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="p-2 -ml-2 rounded-xl hover:bg-neutral-800 text-neutral-400 hover:text-white transition-colors"
            >
              <Menu className="h-6 w-6" />
            </button>
            <img
              src={logoSrc}
              alt="Logo"
              className="ml-4 h-10 w-auto object-contain"
            />
          </div>
          <div className="flex items-center space-x-4">
            <div className="flex items-center space-x-2 text-sm text-slate-500 dark:text-neutral-400">
              <span className="font-medium mr-1">字體大小</span>
              <button
                onClick={increaseFontSize}
                className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-slate-200 dark:hover:bg-neutral-800 transition-colors font-mono"
                aria-label="放大字體"
              >
                A+
              </button>
              <button
                onClick={decreaseFontSize}
                className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-slate-200 dark:hover:bg-neutral-800 transition-colors font-mono"
                aria-label="縮小字體"
              >
                A-
              </button>
            </div>
            <button
              onClick={toggleTheme}
              className="p-2 rounded-full hover:bg-slate-200 dark:hover:bg-neutral-800 text-slate-500 dark:text-neutral-400 transition-colors"
            >
              {/* 目前為淺色顯示月亮圖示；深色顯示太陽圖示 */}
              {theme === 'light' ? <Moon className="w-5 h-5" /> : <Sun className="w-5 h-5" />}
            </button>
          </div>
        </header>

        {/* 主內容區：由 Router 的子路由頁面內容注入 */}
        <main className="flex-1 overflow-auto rounded-2xl mx-4 mb-0 relative">
          {children}
        </main>
      </div>
    </div>
  );
};

// Dashboard 頁面：
// 從本地上傳紀錄取得文件列表，並依類型統計數量。
const Dashboard = () => {
  // 文件清單狀態，型別來自 uploadStore 的 UploadRecord。 (及系統預設文件)
  const [docs, setDocs] = useState<any[]>([]);

  // 重新載入文件資料。
  const refreshDocs = async () => {
    const items = await listUploads();
    // 合併系統預設文件
    const combined = [...items, ...SYSTEM_DOCS];
    setDocs(combined);
  };

  // 初始化與視窗重新聚焦時刷新資料，確保跨頁操作後數據仍同步。
  useEffect(() => {
    refreshDocs();
    const onFocus = () => { void refreshDocs(); };
    window.addEventListener('focus', onFocus);
    // 元件卸載時移除事件監聽，避免記憶體洩漏。
    return () => window.removeEventListener('focus', onFocus);
  }, []);

  // 文件類型統計（memo 化）：
  // 只有 docs 變動時才重新計算，避免不必要運算。
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

  // 文件總數。
  const total = docs.length;

  return (
    // 儀表板排版：標題 + 四個統計卡片（PDF/Word/Excel/其他）。
    <div className="p-8 max-w-7xl mx-auto space-y-8 animate-fadeIn">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-semibold tracking-tight text-black dark:text-white">
          檔案統計
        </h1>
        <div className="chip">
          <span className="text-slate-600 dark:text-neutral-300">總數</span>
          <span className="font-mono font-semibold text-blue-600 dark:text-blue-400">{total}</span>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 auto-rows-fr">
        <div className="card p-6 flex flex-col justify-between group cursor-pointer hover:-translate-y-1">
          <div className="text-sm font-medium text-black dark:text-neutral-300 uppercase tracking-wider">PDF</div>
          <div className="mt-4 text-4xl font-mono font-bold text-black dark:text-white transition-colors">{counts.pdf}</div>
        </div>
        <div className="card p-6 flex flex-col justify-between group cursor-pointer hover:-translate-y-1">
          <div className="text-sm font-medium text-black dark:text-neutral-300 uppercase tracking-wider">Word</div>
          <div className="mt-4 text-4xl font-mono font-bold text-black dark:text-white transition-colors">{counts.word}</div>
        </div>
        <div className="card p-6 flex flex-col justify-between group cursor-pointer hover:-translate-y-1">
          <div className="text-sm font-medium text-black dark:text-neutral-300 uppercase tracking-wider">Excel</div>
          <div className="mt-4 text-4xl font-mono font-bold text-black dark:text-white transition-colors">{counts.excel}</div>
        </div>
        <div className="card p-6 flex flex-col justify-between group cursor-pointer hover:-translate-y-1">
          <div className="text-sm font-medium text-black dark:text-neutral-300 uppercase tracking-wider">其他</div>
          <div className="mt-4 text-4xl font-mono font-bold text-black dark:text-white transition-colors">{counts.other}</div>
        </div>
      </div>
    </div>
  );
};

// App 根元件：
// 包住 ThemeProvider 與 Router，定義全站路由。
const App = () => {
  return (
    // 讓整個應用都能讀取/切換主題。
    <ThemeProvider>
      {/* BrowserRouter 負責前端路由管理 */}
      <Router>
        <Routes>
          {/* Public Routes: Landing and Login without sidebar Layout */}
          <Route path="/" element={<LandingPage />} />
          <Route path="/login" element={<LoginPage />} />

          {/* Protected Routes nested under /app with Sidebar Layout */}
          <Route path="/app/*" element={
            <Layout>
              <Routes>
                {/* 進入根路徑時導向預設聊天頁 */}
                <Route path="/" element={<Navigate to="/app/edu-rag/chat" replace />} />
                {/* 儀表板頁 */}
                <Route path="dashboard" element={<Dashboard />} />
                {/* EDU-RAG 聊天頁 */}
                <Route path="edu-rag/chat" element={<EduRagChatPage />} />
                {/* EDU-RAG 管理：上傳頁 */}
                <Route path="edu-rag/admin/upload" element={<EduRagUploadPage />} />
                {/* EDU-RAG 管理：文件列表頁 */}
                <Route path="edu-rag/admin/docs" element={<EduRagDocsPage />} />
                {/* EDU-RAG 管理：文件詳細頁（動態 id） */}
                <Route path="edu-rag/admin/docs/:id" element={<EduRagDocDetailPage />} />
              </Routes>
            </Layout>
          } />
        </Routes>
      </Router>
    </ThemeProvider>
  );
};

export default App;
