import React from 'react';
import ReactDOM from 'react-dom/client';
import '../renderer/index.css';
// The axi design language is unconditional now, so this is always loaded
// rather than switched on by a report-carried flag; `reportApp` applies the
// report's own accent and glass choice via `applyAxiTheme`.
import '../renderer/axi-design.css';
// The shell screens (error boundary here, plus loading/tombstone in the share
// viewer) draw through the app's variables, so they follow the report's own
// design language instead of hardcoding one.
import './reportShell.css';
import { ReportApp } from './reportApp';
import { ReportErrorBoundary } from './ReportErrorBoundary';

document.documentElement.classList.add('web-report');
document.body.classList.add('web-report');

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ReportErrorBoundary>
      <ReportApp />
    </ReportErrorBoundary>
  </React.StrictMode>
);
