import { useEffect, useState } from 'react';
import { Moon, Sun } from 'lucide-react';
import { useTheme } from '../../context/ThemeContext';

const EduRagHeader = () => {
  const { theme, toggleTheme } = useTheme();
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
    <div className="flex items-center justify-between mb-8 py-2">
      <div className="flex items-center space-x-3">
        {/* Logo Placeholder */}
        <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center text-white font-bold shadow-lg shadow-blue-500/30">
          AI
        </div>
        <div>
          <h1 className="text-lg font-bold text-text-primary-light dark:text-gray-100 tracking-wide">
            RAG系統
          </h1>
        </div>
      </div>

      <div className="flex items-center space-x-4">
        <div className="flex items-center space-x-2 text-sm text-text-secondary-light dark:text-gray-400 mr-4">
          <span>字體大小</span>
          <button
            onClick={increaseFontSize}
            className="w-8 h-8 rounded border border-border-light dark:border-gray-700 flex items-center justify-center hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
            aria-label="字體放大"
          >
            A+
          </button>
          <button
            onClick={decreaseFontSize}
            className="w-8 h-8 rounded border border-border-light dark:border-gray-700 flex items-center justify-center hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
            aria-label="字體縮小"
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
    </div>
  );
};

export default EduRagHeader;
