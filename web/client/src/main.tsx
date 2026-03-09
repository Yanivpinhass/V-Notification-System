import { createRoot } from 'react-dom/client'
import App from './App.tsx'
import './index.css'
import '@fontsource/noto-sans-hebrew/400.css'
import '@fontsource/noto-sans-hebrew/500.css'
import '@fontsource/noto-sans-hebrew/700.css'

createRoot(document.getElementById("root")!).render(<App />);
