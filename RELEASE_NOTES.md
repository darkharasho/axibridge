# Release Notes v1.4.1

## 🛠 Improvements & Fixes

### 🧊 What’s New Modal
- Fixed release notes missing in packaged builds by pulling from GitHub Releases

---

# Release Notes v1.4.0

## ✨ New Features

### 🧊 What’s New Modal
- New glassmorphic **What’s New** modal that appears knowing on first launch after an update
- Full markdown renderer with tables and working links
- Manual access via Settings → **What’s New**

### 🖼️ Discord Notifications: Tiled (Beta)
- New **Tiled** notification mode for Discord
- Each stat table renders as its own image tile, optimized for Discord previews
- Incoming stats grouped into a single post with a 2x2 grid
 - Optional class icons next to player names in image/tiled mode when class display is set to Emoji

### ⚙️ Top List Control
- Add a **Max rows per list** setting (1–10) for top lists
- Default-Disabled extra stats expanded (resurrects, distance to tag, kills, downs, breakbar damage, damage taken, deaths, dodges)
- New **Class display** option for top lists: Off, Short name, or Emoji

## 🛠 Improvements & Fixes

### 💬 Discord Embed Formatting
- Smarter embed splitting so a top 10 list never gets split across embeds
- Inline field padding to keep 2-column layout consistent
- Distance to tag now uses commander distance when available for accuracy
- Optional class abbreviations or emojis can be shown as the first column in top lists

### 📊 Stats Dashboard
- Class icons now appear next to player names in leader cards and the MVP header

---

# Release Notes v1.3.3

## ✨ New Features

### ⚙️ Settings Page
- **New dedicated settings page**: Access via the purple settings icon in the header
- **dps.report User Token**: Configure your dps.report token to associate uploads with your account
  - Automatically included in all upload requests
  - Enables upload history tracking on dps.report
- **Window Close Behavior**: Choose how the app behaves when you click the close button
  - **Minimize to Tray** (default): App stays running in the background
  - **Quit Application**: Fully closes the app including the system tray icon
- All settings persist across app restarts

## 🛠 Improvements & Fixes

### 💬 Discord Embed Formatting
- **Fixed text wrapping in Discord embeds**: Player names and stat values are now properly truncated to ensure all content fits on a single line
- **Dynamic character limits**: Name length automatically adjusts based on number width to maximize space usage
- Improved readability of Discord notifications with consistent, compact formatting

---

# Release Notes v1.3.2

## ✨ New Features

### 🖥️ In-App Terminal
- Added a new, slick slide-up **Terminal UI**!
- View application logs, upload progress, and errors directly within the app.
- Toggle it anytime by clicking the terminal icon in the header.

## 🛠 Improvements & Fixes

### 🚀 Upload Reliability v2
Further hardening of the upload process to combat 523/502 errors from dps.report:
- **Smarter Retries**: Now alternates between main and backup servers on *every* retry attempt.
- **Browser Mimicry**: Requests now look more like a standard browser to bypass aggressive Cloudflare filters.
- **Better Diagnostics**: The new terminal shows exact status codes and file sizes to help debug issues.
