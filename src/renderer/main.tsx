import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.tsx'
import { AppErrorBoundary } from './AppErrorBoundary.tsx'
import './index.css'
import './axi-design.css'

// Startup timeline (src/main/bootTimeline.ts): this line runs once every
// module above has loaded.
window.electronAPI?.bootMark?.('modules loaded')

// Long tasks during the first minute — a frozen window after mount is a
// renderer stall that no mark brackets.
if (typeof PerformanceObserver !== 'undefined' && PerformanceObserver.supportedEntryTypes?.includes('longtask')) {
    const observer = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
            if (entry.duration < 300) continue
            window.electronAPI?.bootMark?.(`long task ${Math.round(entry.duration)}ms ending`)
        }
    })
    observer.observe({ entryTypes: ['longtask'] })
    setTimeout(() => observer.disconnect(), 60_000)
}

ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
        <AppErrorBoundary>
            <App />
        </AppErrorBoundary>
    </React.StrictMode>,
)
