import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import {registerSW} from 'virtual:pwa-register';
import App from './App.tsx';
import Admin from './admin.tsx';
import Delivery from './delivery.tsx';
import './index.css';

const SW_RELOAD_KEY = 'dmerch_sw_reload_once_v1';

const updateSW = registerSW({
  immediate: true,
  onNeedRefresh() {
    if (window.sessionStorage.getItem(SW_RELOAD_KEY) === '1') {
      return;
    }
    window.sessionStorage.setItem(SW_RELOAD_KEY, '1');
    void updateSW(true);
  },
  onOfflineReady() {
    window.sessionStorage.removeItem(SW_RELOAD_KEY);
  },
});

window.addEventListener('vite:preloadError', () => {
  window.location.reload();
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {window.location.pathname.startsWith('/admin') ? <Admin /> : window.location.pathname.startsWith('/delivery') ? <Delivery /> : <App />}
  </StrictMode>,
);
