# 📱 2 Phone Setup (Dedicated Server Phone + Guide Phone)

This setup uses an **extra phone (spare phone) purely as the Server**, while the **actual Guide Phone is used only for the microphone**. This reduces load on the main phone and improves stability.

---

## 1. Diagram

```
[ 1. Server Phone (Spare) ]  <--- (LAN Cable or 5G WiFi) --->  [ High-Performance Router (AP) ]
        |                                                             |
   (Running Server)                                             ((( Wi-Fi Signal )))
        |                                                             |
        +-------------------------------------------------------------+
                                      |
                +---------------------+---------------------+
                |                     |                     |
       [ 2. Guide Phone ]      [ Tourist Phone 1 ] ... [ Tourist Phone 60 ]
        (Mic Source)              (Listener)              (Listeners)
```

## 2. Advantages
1.  **Heat Dissipation**: Separates the heavy server processing from the daily use/mic phone.
2.  **Stability**: Even if the Guide receives a call or uses other apps, the Server (Spare Phone) stays alive.
3.  **Battery**: Reduces battery drain on the Guide's main phone.

---

## 3. Requirements
1.  **Server Phone (Spare Android)**
    *   Termux installed.
    *   Recommend keeping it plugged into power.
2.  **Guide Phone (Main Phone)**
    *   iPhone or Android (Doesn't matter).
    *   No app installation (Browser access).
3.  **High-Performance Router**
4.  **(Optional) USB-C Ethernet Adapter** (For Server Phone)

---

## 4. Setup Steps

### Step 1: Connect Hardware
1.  Power ON **Router**.
2.  **Server Phone (Spare)**:
    *   Connect to Router (Use Wired LAN or 5GHz Wi-Fi).
    *   Airplane Mode ON (Block calls).
3.  **Guide & Tourist Phones**:
    *   Connect all to Router Wi-Fi (`Guide_WiFi`).

### Step 2: Run Server (On Server Phone)
1.  Open Termux on **Server Phone**.
2.  Start Server:
    ```bash
    cd songsusin
    python server.py
    ```
3.  **Check IP**: Type `ifconfig` -> Note the IP (e.g., `192.168.0.100`).

### Step 3: Guide Connect (On Guide Phone)
1.  Open Browser on Guide Phone.
2.  Enter **Server Phone IP** (`http://192.168.0.100:5000`).
3.  Select **"I am Guide"** -> Allow Mic -> **"Start Broadcast"**.
    *   *Your main phone is now just acting as a microphone.*

### Step 4: Tourist Connect (On Tourist Phones)
1.  Open Browser on Tourist Phones.
2.  Enter **Server Phone IP** (`http://192.168.0.100:5000`).
    *   *Pro Tip: Make a QR Code for this URL.*
3.  Select **"I am Tourist"** -> **"Tap to Enable Audio"**.

---

## 💡 Operational Tips

1.  **Server Phone Placement**:
    *   Leave the Server Phone in a bag or next to the router. **Don't touch it.**
    *   Ensure "Wake Lock" is enabled or "Keep Screen On" is set so Termux doesn't sleep.
2.  **Guide Phone Freedom**:
    *   Since your phone isn't the server, you can turn off the screen briefly or check other apps (as long as the browser keeps mic access in background/PiP).
3.  **QR Code**:
    *   Generate a QR Code for the Server IP (`http://192.168.0.100:5000`) and print it out. Tourists can simply scan to join.
