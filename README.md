# <img width="36" height="36" alt="logo" src="https://github.com/user-attachments/assets/25424e86-4a8e-4d99-bd4a-abe9867ed99f" /> GW2 Arc Log Uploader

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
<img width="1043" height="786" alt="image" src="https://github.com/user-attachments/assets/dc09d52a-e90e-4c07-8489-59235e7ba275" />

### Configurable stat reporting
<img width="1043" height="786" alt="image" src="https://github.com/user-attachments/assets/c4529ea9-8ccf-4157-9ca6-02909087bee7" />

### Aggregated live stat dashboard
<img width="1035" height="1315" alt="image" src="https://github.com/user-attachments/assets/8bc490df-7a4e-49b0-812d-7e0d9f73c270" />

### Choose whether to post a native discord embed or a generated image
<img width="537" height="1259" alt="image" src="https://github.com/user-attachments/assets/4feba70b-1d05-4796-a452-a68aaa700c6b" /> <img width="1800" height="2444" alt="image" src="https://github.com/user-attachments/assets/ba52192d-8b9b-4473-bfb9-55de9a9e79be" />

### Higscores calculated on the fly and postable automatically to discord
<img width="537" height="1259" alt="image" src="https://github.com/user-attachments/assets/cd72e824-e987-4a79-962c-b1d73118c84d" />




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
   git clone https://github.com/darkharasho/gw2_arc_log_uploader.git
   cd gw2_arc_log_uploader
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

This project is licensed under the MIT License—see the LICENSE file for details.

## Attribution

This project includes ideas and/or code adapted from:

- PlenBot Log Uploader by Plenyx (and contributors), with additional work by bear-on-the-job.
  - https://github.com/Plenyx/PlenBotLogUploader
  - https://github.com/bear-on-the-job
- GW2 EI Log Combiner by Drevarr (and contributors).
  - https://github.com/Drevarr/GW2_EI_log_combiner
