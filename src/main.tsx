import { createRoot } from 'react-dom/client';
import { PublicSite } from './original/components/public/PublicSite';
import { MotionProvider } from './original/components/motion/MotionProvider';
import { portfolioData } from './data/portfolio';
import './styles/next-compiled.css';

const root = document.getElementById('root');
if (!root) throw new Error('Root element not found');

createRoot(root).render(
  <MotionProvider>
    <PublicSite data={portfolioData} />
  </MotionProvider>,
);
