# 📱 Using Tablet as Dedicated Server

Using a **Tablet (Galaxy Tab, Android Pad, etc.)** as the server provides a more stable operation environment than a smartphone.

## 1. Advantages of Tablet Server
1. **Large Battery**: Tablets have significantly larger batteries, making them ideal for running the server for long durations (entire tour).
2. **Decoupled Operation**: Keep the tablet in a bag (acting as Server + Hotspot), while the Guide uses a lightweight phone just for the microphone.
3. **Heat Dissipation**: The tablet handles the server load and network traffic, reducing heat and battery drain on the Guide's personal phone.

## 2. Architecture (Recommended Scenario)

*   **Tablet (Server + Router)**:
    *   **Role**: Enable Wi-Fi Hotspot, Run `server.py`.
    *   **Location**: Inside Guide's bag or a secure spot.
*   **Guide Phone (Input Device)**:
    *   **Role**: Connect to Tablet Wi-Fi -> Open Browser to Server IP -> Select **"I am Guide"**.
    *   **Benefit**: Keeps the phone light and cool.
*   **Tourist Phones (Receivers)**:
    *   **Role**: Connect to Tablet Wi-Fi -> Select **"I am Tourist"**.

## 3. Android Tablet Setup (Galaxy Tab, Lenovo Pad, etc.)

The setup process is **identical** to Android Smartphones. Refer to [MOBILE_GUIDE_EN.md](./MOBILE_GUIDE_EN.md).

### Summary:
1.  Install **Termux** app (Play Store or F-Droid).
2.  Download code via `git clone ...`.
3.  Run `./termux_install.sh`.
4.  Enable **Mobile Hotspot**.
5.  Run `python server.py`.
6.  Check Tablet's IP via `ifconfig` (e.g., `192.168.43.1`).

## 4. Note on iPad
*   **As Server**: iPad is **NOT recommended** as a main server due to iOS restrictions on background processes and port exposure.
*   **As Client**: iPad works perfectly as a **Guide Input Device** or **Tourist Receiver**.

## 5. Tips
*   When using a tablet as a server, increase the **Screen Timeout** or enable **"Acquire Wakelock"** in `Termux` notification settings to ensure the CPU keeps running even when the screen is off.
