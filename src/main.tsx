import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import {registerSW} from 'virtual:pwa-register';
import App from './App.tsx';
import Admin from './admin.tsx';
import './index.css';

registerSW({
  immediate: true,
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {window.location.pathname.startsWith('/admin') ? <Admin /> : <App />}
  </StrictMode>,
);
