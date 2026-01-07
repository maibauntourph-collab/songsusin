# 📖 Mobile Guide System User Manual

This document is a **setup and connection guide** to help Teachers (Guides) and Students (Tourists) use the system smoothly.

## 🖥️ 1. PC (Server/Guide) Preparation
The PC acts as the **Broadcast Station**. You need to install and run the program.

### A. Installation
1.  **Install Python**:
    - Download the latest version from [Python Official Website](https://www.python.org/downloads/).
    - ⚠️ **Check "Add Python to PATH"** during installation!
2.  **Download Code**:
    - Prepare the current folder (`mobile-guide-system`).
3.  **Install Libraries**:
    - Open `Command Prompt (cmd)` or `Terminal`, go to the project folder, and run:
    ```bash
    pip install -r requirements.txt
    ```

### B. Running & Connecting
1.  **Start Server**:
    ```bash
    python server.py
    ```
    - The broadcast station is now live on your computer (`http://0.0.0.0:5000`).
2.  **External Connection (ngrok) - Required!**:
    - Phones will NOT allow microphone access without **HTTPS (Secure Connection)**.
    - The easiest way is using a tool called **ngrok**.
    - [Download ngrok](https://ngrok.com/download), run it, and enter the following.
    - **Important**: If running for the first time, sign up on [ngrok site](https://dashboard.ngrok.com/get-started/your-authtoken) to get your Authtoken.
    ```bash
    # 1. Register Token (Once only)
    ngrok config add-authtoken <YOUR_TOKEN_HERE>
    
    # 2. Run
    ngrok http 5000
    ```
    - The URL next to `Forwarding` (e.g., `https://abcd-1234.ngrok-free.app`) is your **"Entry Ticket (URL)"**.

---

## 📱 2. Mobile (Guide & Tourist) Preparation
**No app installation required** on phones!

### A. Guide (Broadcaster)
1.  Open mobile browser (Chrome, Safari, etc.).
2.  Go to the **ngrok URL** created above (`https://...`).
3.  Click **"I am Guide"**.
4.  Click **[Allow]** when microphone permission is requested.
5.  Click **[Start Broadcast]** to begin.

### B. Tourist (Listener)
1.  Access the **ngrok URL** shared by the guide (via text, KakaoTalk, etc.).
2.  Click **"I am Tourist"**.
3.  Click the "**Tap to Enable Audio**" button once. (This prepares audio playback).
4.  You can now hear the guide's voice!

---

## ❓ FAQ
- **Q: I can't hear anything!**
    - A: If the "Tap to Enable Audio" button is still on the Tourist screen, please click it. For iPhone users, check if Silent Mode is off.
- **Q: Do I need ngrok even on the same Wi-Fi?**
    - A: Yes, mobile browsers often block mic/audio on non-`https` connections. Using ngrok preserves mental health during development.

---

## 🛠️ 3. Key Features Update

### A. Server Control Toolbar
New **control icons** fixed at the top of the screen:
- **🔄 (Refresh)**: Reloads the page.
- **▶️ (Run/Start)**: Starts Broadcast. (Same as "Start Broadcast" button).
- **🛑 (Stop Server)**: **Power off** the server program remotely. (Warning: Disconnects all users).

### B. Session History
- A **"Session History"** section is in the **Guide Admin Panel**.
- Everything the guide says is **automatically saved as text**, downloadable anytime.
- Click **"Refresh Text Log"** to see latest.

### C. Audio Recording
- Server **automatically starts recording** when broadcast begins.
- Click **"Refresh Audio"** after broadcast to see file list.
- Click **Download** to get the `.wav` file.
