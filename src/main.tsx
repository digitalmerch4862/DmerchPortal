import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import {registerSW} from 'virtual:pwa-register';
import App from './App.tsx';
import Admin from './admin.tsx';
import Delivery from './delivery.tsx';
import './index.css';

registerSW({
  immediate: true,
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {window.location.pathname.startsWith('/admin') ? <Admin /> : window.location.pathname.startsWith('/delivery') ? <Delivery /> : <App />}
  </StrictMode>,
);
