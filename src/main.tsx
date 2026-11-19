import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';

const rootEl = document.getElementById('root');

if (rootEl) {
  try {
    createRoot(rootEl).render(<App />);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    rootEl.innerHTML = `
      <div style="min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px;background:#09090b;color:#f4f4f5;font-family:system-ui,sans-serif;">
        <div style="max-width:480px;width:100%;background:#131317;border:1px solid #7f1d1d;border-radius:16px;padding:24px;">
          <h1 style="margin:0 0 8px;font-size:18px;color:#f87171;">Scratchpad Startup Error</h1>
          <p style="margin:0;font-size:14px;color:#d4d4d8;word-break:break-word;">${message.replace(/[<>&"]/g, '')}</p>
        </div>
      </div>
    `;
  }
}
