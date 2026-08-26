import React from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { applyTheme, useThemeStore } from './stores/theme-store';
import './styles/global.css';
import './styles/ui.css';
import './styles/help.css';

applyTheme(useThemeStore.getState().mode);

const root = document.getElementById('root');
if (!root) {
  throw new Error('Root element not found');
}

createRoot(root).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
