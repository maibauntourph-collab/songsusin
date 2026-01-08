# Project Status Summary

## 📌 Project: Mobile Audio Guide System

### 1. Overview
A real-time 1:N (1 Guide, 60 Tourists) audio streaming web application. Built using Python (FastAPI) backend and WebRTC technology, it works directly in mobile browsers without requiring app installation.

### 2. Core Features
- **Real-time Audio**: Low-latency audio streaming from Guide to multiple Users (within 2 seconds).
- **Speech-to-Text (STT)**: Real-time conversion of Guide's speech to text displayed on screen.
- **Translation**: Automatic translation of STT text into multiple languages (English, Japanese, Chinese).
- **Session History**: All conversations are stored in a database and can be downloaded as text files.
- **Server Recording**: Automatic server-side recording of Guide's voice (.wav) with download option.
- **Server Control**: Remote control via top toolbar (Refresh, Start Broadcast, Stop Server).

### 3. Mobile Execution
- Supports **Termux** environment on Android, allowing a smartphone to function as the server.
- Enables completely offline/local network guide system setup using a Hotspot.

### 4. Tech Stack
- **Backend**: Python FastAPI, Socket.IO, AIORTC (WebRTC)
- **Frontend**: HTML5, Vanilla JS, Web Audio API
- **Database**: SQLite (Store places and history)

### 5. Change Log

#### 2026-01-06
- **Mobile Support**: Created Android (Termux) install script (`termux_install.sh`) and mobile guide (`MOBILE_GUIDE.md`).
- **Server Control**: Added top control toolbar (Refresh, Restart, Start Broadcast, Shutdown).
- **Remote Shutdown/Restart**: Implemented `/shutdown` and `/restart` APIs.
- **Recording**: Implemented automatic server-side audio stream recording (`wav`) and download.
- **Session History**: Implemented STT conversation DB storage and view/download.
- **Docs**: Updated `user_guide.md` (Korean manual).
- **Code Sync**: Completed `git pull` from GitHub (Synced server logic and UI).
- **Karaoke View**: Implemented "Karaoke/Prompter" style UI highlighting the current sentence (`highlight-pen`) while keeping context.
- **Background Mode**: Applied `Silent Audio Loop` and `WakeLock` to prevent audio dropouts when screen is off/background.
- **Toggle Control**: Unified Start/Pause button and added control to top toolbar.

---
*Last Updated: 2026-01-06*
