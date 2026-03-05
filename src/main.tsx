import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import App from './App.tsx';
import Admin from './admin.tsx';
import Delivery from './delivery.tsx';
import LandingPage from './LandingPage.tsx';
import './index.css';

registerSW({
  immediate: true,
});

const currentPath = window.location.pathname;
const RootPage = currentPath.startsWith('/admin')
  ? Admin
  : currentPath.startsWith('/delivery')
  ? Delivery
  : currentPath.startsWith('/landing')
  ? LandingPage
  : App;

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <RootPage />
  </StrictMode>
);
