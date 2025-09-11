import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import './index.css';
import CxChat from './pages/CxChat'; // ← nieuw

// ...
<Route
  path="/app"
  element={
    <Protected>
      <AppLayout />
    </Protected>
  }
>
  <Route index element={<CxChat />} />      {/* Chat als startpagina */}
  <Route path="chat" element={<CxChat />} />{/* expliciete /app/chat */}
  <Route path="news" element={<News />} />
  <Route path="settings" element={<Settings />} />
</Route>


ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
