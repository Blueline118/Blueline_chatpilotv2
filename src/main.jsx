import { createRoot } from 'react-dom/client';
import AppHome from './pages/AppHome';

function Safe() {
  try {
    return <AppHome />;
  } catch (e) {
    return <pre style={{whiteSpace:'pre-wrap',padding:16}}>App error: {String(e)}</pre>;
  }
}

createRoot(document.getElementById('root')).render(<Safe />);
