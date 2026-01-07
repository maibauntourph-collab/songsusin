# 📱 Running Server on Phone with External Router

How to use **your own smartphone as the Server**, replacing a heavy laptop, while using a **High-Performance Router** to stably handle 60 connections.

---

## 1. Hardware Diagram

```
[Guide Phone (Server + Mic)] 
       │ 
       │ (USB C-to-Ethernet Adapter + LAN Cable) OR (5GHz Wi-Fi)
       ▼
[High-Performance Router (AP)]
       │
       │ ((( Wi-Fi Signal )))
       │
       ▼
[Tourist Phones 1...60]
```

## 2. Requirements

1.  **Android Phone** (For Guide)
    *   **Termux** app required. (iPhone cannot run the server)
    *   **Power bank** connection is essential due to high battery drain.
2.  **High-Performance Router (Wi-Fi 6 Recommended)**
    *   No internet connection (WAN) needed. Just power on.
3.  **(Optional, Highly Recommended) USB-C Ethernet Adapter + LAN Cable**
    *   Connecting phone and router via **Cable** significantly improves stability.

---

## 3. Setup Steps

### Step 1: Install Server on Phone
1.  **Install Termux**: From Play Store.
2.  **Run Install Script (Once)**:
    (Do this where internet is available)
    ```bash
    pkg install git -y
    git clone https://github.com/maibauntourph-collab/songsusin.git
    cd songsusin
    chmod +x termux_install.sh
    ./termux_install.sh
    ```

### Step 2: Connect to Router (On-Site)
1.  **Power On Router**.
2.  **Connection Method (Choose one)**:
    *   **Method A (Best Performance ⭐)**: Connect USB-C Ethernet Adapter to phone and plug LAN cable to router. (Turn off Wi-Fi on phone)
    *   **Method B (Easy)**: Turn on phone Wi-Fi and connect to router. (Must use **5GHz** band)

### Step 3: Run Server on Phone
1.  Open Termux.
2.  Go to folder and run:
    ```bash
    cd songsusin
    python server.py
    ```
3.  **Check My IP**:
    *   Type `ifconfig` in Termux.
    *   Note the IP address starting with `192.168.x.x`. (e.g., `192.168.0.15`)

### Step 4: Start Broadcast
1.  Open **Chrome Browser**.
2.  Enter `http://localhost:5000`.
3.  "I am Guide" -> "Start Broadcast".

### Step 5: Tourists Connect
1.  Instruct tourists to connect to the Router Wi-Fi (`Guide_WiFi`).
2.  Have them enter the Guide Phone's IP address (`http://192.168.0.15:5000`) in their browser.
3.  "I am Tourist" -> "Tap to Enable Audio".

---

## 💡 Optimization Tips

1.  **Airplane Mode Recommended**:
    *   Calls or texts can interrupt the broadcast. Turn on Airplane mode and enable only Wi-Fi (or use Ethernet).
2.  **Simultaneous Charging**:
    *   Broadcasting + Server + Wi-Fi eats battery. Use a **USB hub with PD Charging + Ethernet** to charge and connect LAN simultaneously.
3.  **Keep Screen On**:
    *   Some phones kill apps when screen goes dark. Set **"Keep Screen On"** in settings.

## ⚠️ Limitations
*   **No Translation (STT)**: Without internet on the router, **only voice audio** functions. (No subtitles)
*   **Heat**: Phone may get hot. Remove the case.
