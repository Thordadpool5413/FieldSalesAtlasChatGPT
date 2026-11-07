import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './index.css';
// This is the sole final appearance layer, after all feature/component CSS imports.
import './AtlasAtelier.css';
import './WorkspaceExperience.css';
import './styles/miami-vice-system.css';
import './styles/map-priority.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);

// PwaCompanion owns registration and prompts before activating updates.
// It never forces a reload while a trainer is completing a form.
