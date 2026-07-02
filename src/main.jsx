import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import ErrorBoundary from './components/error/ErrorBoundary';
import { ProfileProvider } from './contexts/ProfileContext';
import logger from './utils/logger';

// Catch errors that escape React entirely (event handlers, promises, etc.).
// The root ErrorBoundary handles render-time errors; these listeners cover the rest.
window.addEventListener('error', (e) => {
  logger.error('window', 'E002-UNCAUGHT', e.error || e.message, { filename: e.filename, lineno: e.lineno });
});
window.addEventListener('unhandledrejection', (e) => {
  logger.error('window', 'E003-UNHANDLED-REJECTION', e.reason);
});

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <ErrorBoundary boundary="root">
      {/* ProfileProvider sits ABOVE App (not inside its render) so App itself can
          call useProfile() for gamification session wiring (#134). It has no props
          and never depends on App state. */}
      <ProfileProvider>
        <App />
      </ProfileProvider>
    </ErrorBoundary>
  </React.StrictMode>
);
