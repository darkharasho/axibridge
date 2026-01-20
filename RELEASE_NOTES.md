# Release Notes v1.3.1

## 🛠 Improvements & Fixes

### 🚀 Upload Reliability
Major improvements to the stability and success rate of log uploads to dps.report:
- **Backup API Support**: The uploader now automatically tries a backup API URL if the primary one fails.
- **Enhanced Connection Handling**: Implemented a persistent HTTPS keep-alive agent to reduce connection drops.
- **Extended Timeouts**: Increased the default timeout limit to handle larger files and slower network conditions, resolving the "120000ms exceeded" errors.

### 🐛 Internal Fixes
- **Codebase Stability**: Resolved TypeScript errors in chart components for smoother development builds.
