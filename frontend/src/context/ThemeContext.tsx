import React, { createContext, useContext, useEffect, useState } from 'react';

// 定義可用的主題型別，只允許 'light' 或 'dark'
type Theme = 'light' | 'dark';

// Context 對外提供的資料與方法型別
interface ThemeContextType {
    // 目前主題狀態
    theme: Theme;
    // 切換主題的方法
    toggleTheme: () => void;
}

// 建立 Context，預設值為 undefined，確保未包 Provider 時能拋出錯誤提醒
const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

// Provider 組件：負責初始化主題、同步到 DOM、並提供切換方法
export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    // 初始化主題狀態：優先讀取 localStorage，否則依系統偏好設定
    const [theme, setTheme] = useState<Theme>(() => {
        // 先檢查 localStorage 是否有保存的主題
        const savedTheme = localStorage.getItem('theme') as Theme;
        if (savedTheme) return savedTheme;

        // 若無保存，則依據系統深色模式偏好決定初始主題
        if (window.matchMedia('(prefers-color-scheme: dark)').matches) {
            return 'dark';
        }
        // 預設回到 light
        return 'light';
    });

    useEffect(() => {
        // 主題變更時：同步到 <html> 的 class，並持久化到 localStorage
        const root = window.document.documentElement;
        root.classList.remove('light', 'dark');
        root.classList.add(theme);
        localStorage.setItem('theme', theme);
    }, [theme]);

    // 切換主題：在 light 與 dark 之間互換
    const toggleTheme = () => {
        setTheme((prev) => (prev === 'light' ? 'dark' : 'light'));
    };

    // 將主題狀態與切換方法透過 Context 提供給子元件
    return (
        <ThemeContext.Provider value={{ theme, toggleTheme }}>
            {children}
        </ThemeContext.Provider>
    );
};

// 自訂 Hook：方便子元件讀取主題與切換方法
export const useTheme = () => {
    // 從 Context 取出資料
    const context = useContext(ThemeContext);
    // 若未被 ThemeProvider 包住，直接拋錯提醒
    if (context === undefined) {
        throw new Error('useTheme must be used within a ThemeProvider');
    }
    // 回傳主題資料與切換方法
    return context;
};
