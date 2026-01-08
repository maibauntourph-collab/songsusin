# Real-time Mobile Guide Audio System

Real-time audio broadcasting system for 1 Guide and 60 Tourists.
Implemented using Python FastAPI and WebRTC (aiortc).

## 1. Setup

**Requirements:**
- Python 3.9 or higher
- Supports Windows (Current), Mac, Linux

```bash
# Install dependencies
cd mobile-guide-system
pip install -r requirements.txt
```

## 2. Run Server

```bash
python server.py
```
The server starts at `http://0.0.0.0:5000`.

### 🌐 Live Demo
You can test the system immediately without installation here:
👉 **https://songsusin.replit.app**


## 3. Mobile Connection

WebRTC requires **HTTPS** or **Localhost** environment to allow microphone access.
To connect from a mobile device, you must expose the local server using **ngrok** etc.

### Using ngrok:
1. [Download ngrok](https://ngrok.com/download) and install.
2. Run command in terminal:
   ```bash
   ngrok http 5000
   ```
3. Open the generated `https://xxxx-xxxx.ngrok-free.app` URL in mobile browser (Chrome/Safari).

## 4. Usage

1. **Guide**:
   - Access URL on Smartphone A -> Select **"I am Guide"**.
   - Allow microphone.
   - Click **"Start Broadcast"**.
   - Check "Broadcasting..." status.

2. **Tourist**:
   - Access URL on Smartphone B, C... -> Select **"I am Tourist"**.
   - Click **"Tap to Enable Audio"** button to start listening (Browser autoplay policy).
   - Check if guide's voice is heard.

## 5. Troubleshooting

- **No Sound**:
  - Check volume.
  - Tourist MUST click "Tap to Enable Audio" (Enable AudioContext).
  - ngrok free version may have rate limits.
- **Connection Failed**:
  - Check if `server.py` is running.
  - If on same Wi-Fi, using PC's IP `https://192.168.x.x:5000` (requires SSL) or ngrok is recommended.

## 6. Features

### 📜 Session History (Analysis)
- All guide speech is automatically converted to **Text (STT)** and stored in DB.
- Multilingual translations are also stored.
- Can view and download log from **Guide Admin Panel** at the bottom.

### 🎙️ Audio Recording (Server)
- Server automatically **records audio stream** (`recordings/` folder) when broadcast starts.
- Download recordings from web UI after session.

### 🛑 Server Control
- **Top Toolbar**: Control server from top fixed toolbar.
    - **🔄 Refresh**: RELOAD page.
    - **🛑 Stop Server**: Safely **terminate** server process remotely.
