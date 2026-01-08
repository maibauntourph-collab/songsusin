# 📱 Mobile (Android) & Replit Guide
  
## 0. Run on Replit (Simplest Method)

If you want to run the server without complex installations, use **Replit**.

1.  **Create Replit Project**:
    *   Login to [Replit.com](https://replit.com).
    *   Click `+ Create Repl` -> Select **Import from GitHub**.
    *   Enter Git URL: `https://github.com/maibauntourph-collab/songsusin.git` (or your repo).

2.  **Setup & Run**:
    *   Open the **Shell** tab on the right.
    *   Install dependencies: `pip install -r requirements.txt`
    *   Click the green **Run** button at the top.

3.  **Connect**:
    *   A small browser window (Webview) will appear on the right.
    *   Or you can directly visit: 👉 **https://songsusin.replit.app**
    *   Copy that URL and share it with tourists. They can connect from **anywhere**, even without the same Wi-Fi.
    *   (Note: Free Replit instances may sleep after inactivity.)

---

## 1. Run Local Server on Mobile (Termux)


You can use your smartphone as a **mobile server**. This requires **Termux**, a terminal emulator app for Android.

## 1. Install App
Download and install **Termux** from the Google Play Store or F-Droid.

## 2. Download Code
Open the Termux app and enter the following commands to fetch the code.
(You need to enter the GitHub repository address)

```bash
# Install Git
pkg install git -y

# Clone Code (Use your repository URL)
git clone https://github.com/maibauntourph-collab/songsusin.git
cd songsusin
```

## 3. Run Install Script
Run the prepared install script to automatically install Python and necessary libraries.

```bash
chmod +x termux_install.sh
./termux_install.sh
```

## 4. Start Server
Once installation is complete, start the server.

```bash
python server.py
```

## 5. How to Connect
- **Your Phone (Server)**: Open `http://localhost:5000` in browser.
  - Select "I am Guide" -> Allow Mic -> Start Broadcast
- **Guest Phone**:
  - Connect to your **Mobile Hotspot**.
  - Identify your phone's IP address (Type `ifconfig` in Termux).
  - Example: `192.168.43.1` (Hotspot gateway)
  - Guests enter `http://192.168.43.1:5000` in their browser.
  - Select "I am Tourist" -> Tap to Enable Audio.

## 6. Android Audio Troubleshooting

If the microphone does not turn on or sound is not heard when pressing "Start Broadcast" on Android (Galaxy, etc.), please check the settings below.

### 1) Chrome Browser Security Settings (Required)
Android 10+ blocks microphone access on `http` (local IP) connections unless they are secure `https`. You must force allow this.

1. Type `chrome://flags` in the Chrome address bar.
2. Search for `unsafely-treat-insecure-origin-as-secure` or `insecure`.
3. Change **Insecure origins treated as secure** to `Enabled`.
4. Enter your server URL `http://[YOUR_IP]:5000` in the text box (e.g., `http://192.168.0.5:5000`).
5. Click the **Relaunch** button at the bottom to restart the browser.

### 2) Change Transmission Mode
If WebRTC connection is unstable and audio cuts out or fails, use **Manual Mode**.

1. Check the **Admin Panel** at the bottom of the Guide screen.
2. Turn off the **Transmission Mode** switch.
   - 📡 **Automatic** (Default): Uses WebRTC (Low latency, High quality)
   - 📡 **Manual**: Uses WebSocket (High compatibility, slight delay)
3. Refresh the Tourist phone and reconnect.

## 7. Troubleshooting Check: Service Installation Failures

If `server.py` fails to run or the installation script gets stuck, please install the dependencies manually by running these commands line by line.

### Step 1: Install System Packages
```bash
pkg update -y && pkg upgrade -y
pkg install python rust clang make build-essential libffi openssl -y
```

### Step 2: Update Python Tools
```bash
pip install --upgrade pip setuptools wheel
```

### Step 3: Install Compatibility Libraries (Important)
Install the older version of `pydantic` first to avoid conflicts.
```bash
pip install "pydantic<2"
```

### Step 4: Install Core Server Libraries
```bash
pip install fastapi uvicorn python-socketio aiortc deep-translator python-multipart
```

### Step 5: Install Pandas (Optional)
(You can skip this if it fails. Only Excel features will be disabled.)
```bash
pip install pandas openpyxl
```

Try running `python server.py` again.

## 8. Alternative to Termux (UserLAnd)

If Termux is difficult to use or errors persist, try **UserLAnd**, which emulates a full Linux (Ubuntu) environment.

- **Pros**: Better package compatibility (runs actual Ubuntu).
- **How to Install**: Refer to the separate guide `USERLAND_SETUP.md` (or `USERLAND_SETUP_EN.md` if available).
- **Summary**:
  1. Install "UserLAnd" from Play Store.
  2. Select "Ubuntu" -> SSH Connection.
  3. Commands like `git clone` and `sudo apt install` work similarly.



