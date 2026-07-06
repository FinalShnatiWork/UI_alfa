import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import './styles/main.css';

// Restore theme before first paint to avoid flicker.
const savedTheme = localStorage.getItem('theme');
if (savedTheme) {
  document.documentElement.setAttribute('data-theme', savedTheme);
}

/**
 * Initial bootstrapper file for the React client application.
 * Restores the persisted styling theme from localStorage before render,
 * verifies DOM root container presence, and mounts the React application under StrictMode.
 */
const rootEl = document.getElementById('root');
if (!rootEl) throw new Error('Root element #root not found');

createRoot(rootEl).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
