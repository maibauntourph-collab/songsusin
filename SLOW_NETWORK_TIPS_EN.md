# 🐢 Troubleshooting Slow Internet & Wi-Fi

This guide offers solutions when audio lags, drops, or subtitles fail due to network issues.
Problems are divided into **① Local Wi-Fi Speed (LAN)** and **② Internet Speed (WAN)**.

---

## 1. Audio is Choppy (Wi-Fi Issue)
Audio broadcasting DOES NOT depend on internet speed, but on **Router Performance (Wi-Fi Bandwidth)**.

### 💡 Solutions

**1. Connect Server (Laptop) via "LAN Cable" (Most Important ⭐)**
*   **Why**: Wi-Fi bandwidth is limited. If the server connects via cable, it frees up airtime for tourists' phones.
*   **How**: Connect laptop to router with an **Ethernet Cable** and turn off laptop Wi-Fi.

**2. Use "5GHz" Wi-Fi instead of 2.4GHz**
*   **Why**: 2.4GHz is crowded and slow. With 60 users, it will likely crash.
*   **How**: Configure router to use 5GHz band (often named `_5G`) and instruct tourists to connect to it.

**3. Optimize Router Placement**
*   **How**: Do not hide the router in a bag. Place it **as high as possible** and in open sight. Human bodies block Wi-Fi signals.

**4. Use High-Performance Router**
*   **Recommendation**: Cheap travel routers struggle with >10 users. For 60 people, a **Wi-Fi 6 Router (AX3000 or higher)** is recommended.

---

## 2. No Subtitles/Translation (Internet Issue)
Speech-to-Text (STT) and Translation require **Internet access** to reach Google servers.

### 💡 Solutions

**1. Operations as "Audio-Only"**
*   If internet is too slow, subtitles may delay significantly or fail.
*   In this case, focus on the audio: **" can everyone hear me?"** and treat subtitles as an optional bonus.

**2. Use Mobile Data for Guide Phone**
*   Even if the server is on Wi-Fi, the **Guide's Phone** (microphone source) can use **LTE/5G Data** (Wi-Fi OFF) to send voice data faster to the cloud. (Only works if using ngrok).

---

## 🚦 Summary: Best Practice Setup
The ultimate setup for handling 60 people:

1.  **Router**: High-performance Wi-Fi 6 Router (Plugged into power).
2.  **Server (Laptop)**: Connected to router via **LAN Cable**.
3.  **Tourists**: Connected to **5GHz** Wi-Fi.
4.  **Position**: Router placed **high up** (shelf, pole, etc.).

With this setup, **Voice Broadcasting will work perfectly** even if the internet cable is unplugged.
