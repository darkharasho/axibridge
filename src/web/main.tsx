import React from 'react';
import ReactDOM from 'react-dom/client';
import '../renderer/index.css';
// The published report renders in whatever language the publisher's app was
// wearing; `reportApp` sets the body class from the report's own axiDesign
// flag, so these rules have to be in the bundle either way.
import '../renderer/axi-design.css';
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
