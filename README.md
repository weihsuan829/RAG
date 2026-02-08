# React + TypeScript + Vite

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Babel](https://babeljs.io/) (or [oxc](https://oxc.rs) when used in [rolldown-vite](https://vite.dev/guide/rolldown)) for Fast Refresh
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/) for Fast Refresh

## ThemeContext 流程圖式註解（更細）

以下流程描述 `RAG/src/context/ThemeContext.tsx` 的主題初始化、同步與切換邏輯。

```mermaid
flowchart TD
  A[ThemeProvider 初始化] --> B{localStorage 有 theme 嗎?}
  B -->|有| C[使用 savedTheme]
  B -->|沒有| D{系統偏好是深色?}
  D -->|是| E[初始 theme = dark]
  D -->|否| F[初始 theme = light]
  C --> G[useEffect 監聽 theme 變化]
  E --> G
  F --> G
  G --> H[移除 <html> 上的 light/dark class]
  H --> I[加入目前 theme 的 class]
  I --> J[寫入 localStorage: theme]
  J --> K[子元件透過 useTheme 讀取 theme]
  K --> L[呼叫 toggleTheme 切換]
  L --> M[setTheme: light ↔ dark]
  M --> G
```

### 步驟補充說明

- ThemeProvider 掛載時，先從 localStorage 讀取 `theme`，沒有才看系統偏好。
- 初始主題確定後，`useEffect` 會同步 `<html>` 的 class（`light`/`dark`）並寫回 localStorage。
- 子元件透過 `useTheme` 取得 `theme` 與 `toggleTheme`。
- 使用者切換主題時，`toggleTheme` 會更新 state，進而觸發 `useEffect` 重新同步 DOM 與儲存。

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the ESLint configuration

If you are developing a production application, we recommend updating the configuration to enable type-aware lint rules:

```js
export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      // Other configs...

      // Remove tseslint.configs.recommended and replace with this
      tseslint.configs.recommendedTypeChecked,
      // Alternatively, use this for stricter rules
      tseslint.configs.strictTypeChecked,
      // Optionally, add this for stylistic rules
      tseslint.configs.stylisticTypeChecked,

      // Other configs...
    ],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.node.json', './tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
])
```

You can also install [eslint-plugin-react-x](https://github.com/Rel1cx/eslint-react/tree/main/packages/plugins/eslint-plugin-react-x) and [eslint-plugin-react-dom](https://github.com/Rel1cx/eslint-react/tree/main/packages/plugins/eslint-plugin-react-dom) for React-specific lint rules:

```js
// eslint.config.js
import reactX from 'eslint-plugin-react-x'
import reactDom from 'eslint-plugin-react-dom'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      // Other configs...
      // Enable lint rules for React
      reactX.configs['recommended-typescript'],
      // Enable lint rules for React DOM
      reactDom.configs.recommended,
    ],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.node.json', './tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
])
```
