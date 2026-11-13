import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { App } from './App.js';
import { installSharedReset } from './lib/shared.js';
import './styles.css';

installSharedReset();

const root = document.getElementById('root');
if (!root) throw new Error('missing #root element');

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
