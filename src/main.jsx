import { createRoot } from 'react-dom/client';

// Kies het juiste pad naar jouw component.
// Meest waarschijnlijke locatie:
import BluelineChatpilot from './components/BluelineChatpilot';
// Als dat niet bestaat, probeer één van deze en gebruik degene die *bestaat*:
// import BluelineChatpilot from './components/Chatpilot';
// import BluelineChatpilot from './pages/BluelineChatpilot';

createRoot(document.getElementById('root')).render(<BluelineChatpilot />);
