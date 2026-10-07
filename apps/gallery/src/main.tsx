import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import './gallery.css';

// Load every library stylesheet from source (tokens and base first, then components).
import '../../../packages/react/src/styles/tokens.css';
import '../../../packages/react/src/styles/base.css';

import.meta.glob('../../../packages/react/src/**/*.css', { eager: true });

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
