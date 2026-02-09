import React, { useEffect, useMemo, useState } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import Sidebar from './layouts/Sidebar';
import EduRagChatPage from './edu-rag/pages/EduRagChatPage';
import EduRagUploadPage from './edu-rag/pages/EduRagUploadPage';
import EduRagDocsPage from './edu-rag/pages/EduRagDocsPage';
import EduRagDocDetailPage from './edu-rag/pages/EduRagDocDetailPage';
import { Menu, Moon, Sun } from 'lucide-react';
import { ThemeProvider, useTheme } from './context/ThemeContext';
import { listUploads, type UploadRecord } from './edu-rag/utils/uploadStore';
import logoWhite from './assets/新北教育局-logo白.png';
import logoBlack from './assets/新北教育局-logo黑.png';

const Layout = ({ children }: { children: React.ReactNode }) => {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const { theme, toggleTheme } = useTheme();
  const logoSrc = theme === 'dark' ? logoWhite : logoBlack;
  const [fontSize, setFontSize] = useState(16);
  const minFontSize = 12;
  const maxFontSize = 22;
  const step = 2;

  useEffect(() => {
    const saved = window.localStorage.getItem('font-size-base');
    const parsed = saved ? Number(saved) : NaN;
    const initial = Number.isFinite(parsed) ? parsed : 16;
    setFontSize(initial);
    document.documentElement.style.setProperty('--font-size-base', `${initial}px`);
  }, []);

  const applyFontSize = (nextSize: number) => {
    const clamped = Math.min(maxFontSize, Math.max(minFontSize, nextSize));
    setFontSize(clamped);
    document.documentElement.style.setProperty('--font-size-base', `${clamped}px`);
    window.localStorage.setItem('font-size-base', String(clamped));
  };

  const increaseFontSize = () => {
    applyFontSize(fontSize + step);
  };

  const decreaseFontSize = () => {
    applyFontSize(fontSize - step);
  };

  return (
    <div className="flex h-screen overflow-hidden bg-[var(--bg-page)] text-[var(--text-primary)] transition-colors duration-300">
      <div className={`flex-shrink-0 transition-all duration-300 p-4 ${sidebarOpen ? 'w-72' : 'w-0'}`}>
        <div className="h-full card overflow-hidden">
          <Sidebar />
        </div>
      </div>
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden p-4 pl-0">
        <header className="h-16 flex items-center justify-between px-6 mb-4 card mx-4 mt-0 shrink-0">
          <div className="flex items-center">
            <button
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
            <div className="flex items-center space-x-2 text-sm text-text-secondary-light dark:text-gray-400">
              <span>字體大小</span>
              <button
                onClick={increaseFontSize}
                className="w-8 h-8 rounded border border-border-light dark:border-gray-700 flex items-center justify-center hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                aria-label="放大字體"
              >
                A+
              </button>
              <button
                onClick={decreaseFontSize}
                className="w-8 h-8 rounded border border-border-light dark:border-gray-700 flex items-center justify-center hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                aria-label="縮小字體"
              >
                A-
              </button>
            </div>
            <button
              onClick={toggleTheme}
              className="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 text-text-secondary-light dark:text-gray-400 transition-colors"
            >
              {theme === 'light' ? <Moon className="w-5 h-5" /> : <Sun className="w-5 h-5" />}
            </button>
          </div>
        </header>
        <main className="flex-1 overflow-auto rounded-2xl mx-4 mb-0 relative">
          {children}
        </main>
      </div>
    </div>
  );
};

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

const App = () => {
  return (
    <ThemeProvider>
      <Router>
        <Layout>
          <Routes>
            <Route path="/" element={<Navigate to="/app/edu-rag/chat" replace />} />
            <Route path="/app/dashboard" element={<Dashboard />} />
            <Route path="/app/edu-rag/chat" element={<EduRagChatPage />} />
            <Route path="/app/edu-rag/admin/upload" element={<EduRagUploadPage />} />
            <Route path="/app/edu-rag/admin/docs" element={<EduRagDocsPage />} />
            <Route path="/app/edu-rag/admin/docs/:id" element={<EduRagDocDetailPage />} />
          </Routes>
        </Layout>
      </Router>
    </ThemeProvider>
  );
};

export default App;
