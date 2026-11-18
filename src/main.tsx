import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';

document.documentElement.classList.remove('dark');
document.body.classList.remove('dark');
try {
  localStorage.removeItem('myvet_theme');
} catch {
  // ignore
}

createRoot(document.getElementById('root')!).render(<App />);

