# 📱 Running Server on Mobile (Android)

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
