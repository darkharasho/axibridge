# <img width="36" height="36" alt="ArcBridge logo" src="public/img/ArcBridge.png" /> ArcBridge

A premium, high-performance Electron application for Guild Wars 2 players to automatically upload arcdps combat logs, notify Discord, and view detailed WvW statistics in a stunning, modern interface.

## ✨ Features

- **🚀 Automated Monitoring**: Automatically detects, uploads, and processes new combat logs as they are created.
- **🎨 Premium UI**: A dark, glassmorphic interface built with React, Tailwind CSS, and Framer Motion for a smooth, high-end experience.
- **📊 Detailed WvW Statistics**: Expanded log cards providing deep insights:
    - **Squad Summary**: Damage, DPS, Downs, and Deaths for your squad.
    - **Enemy Summary**: Total damage taken and enemy player counts.
    - **Incoming Stats**: Track Misses, Blocks, CC (Interrupts), and Boon Strips.
    - **Top Rankings**: Ranked lists for Damage, Down Contribution, Healing, Barrier, Cleanses, Strips, CC, and Stability.
- **💬 Discord Integration**: Real-time notifications with detailed embed summaries, matching the aesthetics of the local UI.
- **🌐 Browser Fallback**: One-click to open full reports on `dps.report` in your default system browser.
- **📦 Drag & Drop Support**: Manually upload individual log files simply by dragging them into the app.

## 🖼️ Screenshots
<img width="1082" height="794" alt="image" src="https://github.com/user-attachments/assets/085c5938-23df-427a-be71-10707d6ee571" />

### Highly Configurable
<img width="1082" height="794" alt="image" src="https://github.com/user-attachments/assets/05b70735-5b95-4055-be14-9fe1a00acaaa" />

### Aggregated live stat dashboard
<img width="1082" height="794" alt="image" src="https://github.com/user-attachments/assets/bbd2fc5e-0dff-4a75-93d8-a88426cd5b1f" />

### Choose whether to post a native discord embed or a generated image
<img width="537" height="1259" alt="image" src="https://github.com/user-attachments/assets/4feba70b-1d05-4796-a452-a68aaa700c6b" /> <img width="1800" height="2444" alt="image" src="https://github.com/user-attachments/assets/ba52192d-8b9b-4473-bfb9-55de9a9e79be" />

### Persistent Stat Report via Github Pages
<img width="2034" height="1299" alt="image" src="https://github.com/user-attachments/assets/f700c0b9-26ec-4ac1-8ac1-f0c2d927fdc0" />




## 🛠️ Technology Stack

- **Framework**: Electron + React
- **Language**: TypeScript
- **Styling**: Tailwind CSS
- **Animations**: Framer Motion
- **Icons**: Lucide React
- **Backend API**: dps.report

## 🚀 Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) (v16+)
- [npm](https://www.npmjs.com/)

### Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/darkharasho/ArcBridge.git
   cd ArcBridge
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Start the application in development mode:
   ```bash
   npm run dev
   ```

4. Build the application for production:
   ```bash
   npm run build
   ```

## 📖 Usage

1. **Configure Log Directory**: Set your `arcdps.cbtlogs` folder in the Configuration panel.
2. **Discord Notification**: Paste your Discord Webhook URL to receive summaries in your channel.
3. **Automatic Uploads**: The app will watch the directory and process new logs automatically.
4. **View Details**: Click on any log card in the activity list to expand the detailed statistics view.

## 📄 License

This project is licensed under GPL-3.0-only—see the LICENSE file for details.
Copyright (C) 2026 harasho.

## 🙌 Attribution & Upstream Licenses

This project includes ideas and/or code adapted from:

- PlenBot Log Uploader by Plenyx (and contributors), with additional work by bear-on-the-job. (MIT)
  - https://github.com/Plenyx/PlenBotLogUploader
  - https://github.com/bear-on-the-job
- GW2 EI Log Combiner by Drevarr (and contributors). (GPL-3.0)
  - https://github.com/Drevarr/GW2_EI_log_combiner

See THIRD_PARTY_NOTICES.md for license text and additional details.
