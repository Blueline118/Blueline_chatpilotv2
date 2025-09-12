import { createRoot } from 'react-dom/client';
import DevErrorBoundary from './components/DevErrorBoundary';
import './index.css';  // ⬅️ dit is nodig voor Tailwind


// ⬇️ use the path that exists in your repo:
import BluelineChatpilot from './components/BluelineChatpilot';

createRoot(document.getElementById('root')).render(
  <DevErrorBoundary>
    <BluelineChatpilot />
  </DevErrorBoundary>
);
