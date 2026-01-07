# ✈️ Offline Guide System Setup with Private Router

Guide for setting up the system overseas using a **Private Wireless Router (AP)** without internet access. This operates solely on a **Local Area Network (LAN)**.

## 1. Hardware Requirements

1.  **Wireless Router**
    *   **Web**: Stable power supply (Recommend models compatible with power banks).
    *   **Type**: Portable travel router (e.g., TP-Link, GL.iNet) or standard router + power bank.
    *   **Setup**: Power on ONLY. Do not connect WAN (Internet) cable.
2.  **Laptop (Server PC)**
    *   Computer to run the guide server (`server.py`).
    *   Connect to the router via Wi-Fi or LAN cable.
3.  **Smartphones (Guide & Tourists)**
    *   1 for Guide + N for Tourists.

## 2. Preparation (Before Leaving)

Since you cannot install packages without internet overseas, **complete setup before departure**.

1.  **Server Setup**:
    *   Run `pip install -r requirements.txt` and ensure everything is installed.
    *   Run the server at least once to verify functionality.
2.  **Router Wi-Fi Settings**:
    *   Set SSID (Wi-Fi Name) and Password in advance. (e.g., `Guide_Tour`, `12345678`)

## 3. On-Site Setup & Execution

### Step 1: Network Setup
1.  **Power on Router**: Do not connect internet cable. Just power on.
2.  **Connect Server PC**: Connect laptop to the router's Wi-Fi (or via LAN cable).
3.  **Check IP Address**:
    *   Open `cmd` on laptop -> type `ipconfig`.
    *   Note the **IPv4 Address** of the `Wireless LAN adapter` or `Ethernet adapter`. (e.g., `192.168.0.5`)

### Step 2: Run Server
1.  Open Terminal (CMD) on laptop and run server:
    ```bash
    python server.py
    ```
    *   *Note: Do not run ngrok as there is no internet.*

### Step 3: Connect
1.  **Connect Smartphones to Wi-Fi**:
    *   Connect Guide and all Tourist phones to the **Private Router's Wi-Fi**.
    *   *Note: Select "Keep Connection" if "No Internet" warning appears.*
2.  **Browser Access**:
    *   Enter the **Laptop's IP Address** and port in the phone's browser address bar.
    *   Example: `http://192.168.0.5:5000`
3.  **Select Role**:
    *   Select Guide/Tourist and start broadcast as usual.

## 4. Limitations (Important)

1.  **STT & Translation**:
    *   Google Speech-to-Text and Translation APIs **require internet**.
    *   In an **Offline Environment**, only **Audio Broadcasting** will work. Subtitles and translation will likely fail.
2.  **Microphone Permission**:
    *   Modern Android/iOS security policies may block microphone access on `http://` (insecure connections).
    *   **Solutions**:
        *   On Guide's phone (if Android), go to `chrome://flags`, find `Insecure origins treated as secure`, and add `http://192.168.x.x:5000`.
        *   Alternatively, use the **Laptop's Microphone** for the Guide to broadcast.

## Summary Checklist
- [ ] Router ready (Power supply checked)
- [ ] Server software installed & verified (Offline run check)
- [ ] Know how to check IP address
- [ ] Ready to instruct tourists: "Connect Wi-Fi -> Enter IP"
