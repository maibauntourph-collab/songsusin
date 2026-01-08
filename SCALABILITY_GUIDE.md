# 🚀 Scalability Guide: Supporting 60 Users

Can this system support 60 simultaneous users?
**Yes, but you need the right hardware setup.**

A standard smartphone hotspot and processor cannot handle 60 concurrent connections alone.

## 1. Network Bottlenecks (Critical)

| Method | Max Users (Approx.) | Stability | Note |
|:---:|:---:|:---:|:---|
| **Phone Hotspot** | **8 ~ 10** | Low | Most Android phones limit hotspots to 10 connections. |
| **Tablet Hotspot** | **10 ~ 32** | Medium | High-end tablets may allow more, but still risky for 60. |
| **Dedicated Router** | **50 ~ 100+** | **High** | **Required for 60 users.** |

### ✅ Solution: Use a Wireless Router
To serve 60 tourists, you **must** use a portable Wi-Fi router (e.g., ipTIME, TP-Link, pocket router).
1.  **Connect Server (Tablet/Phone)** to the Router via Wi-Fi.
2.  **Connect Guide & Tourists** to the Router via Wi-Fi.
3.  Run the Server and check IP (e.g., `192.168.0.5`).
4.  Everyone connects to `http://192.168.0.5:5000`.

## 2. Server Performance (CPU/RAM)

The server software (Python `aiortc`) processes real-time audio encryption for every user.
*   **Smartphone (Termux)**: Can likely handle **10-15** WebRTC streams stable. 60 might cause audio stutter or overheating.
*   **WebSocket Fallback**: The system includes a "WebSocket Audio" mode which is lighter than WebRTC. If WebRTC fails, it switches to this.
*   **Recommendation**:
    *   If using a Phone/Tablet Server: **60 users is pushing the limit.**
    *   Test with 5-10 users first.
    *   For guaranteed stability with 60 users, use a **Laptop** as the server (connected to the Router).

## 3. Summary for 60 Users
1.  **Don't** rely on a phone's built-in Hotspot. **Bring a Router.**
2.  **Tablet Server** is better than Phone Server (Battery/Thermal), but a **Laptop** is best.
3.  **Battery**: Managing 60 network connections drains battery fast. Keep the server device plugged in.
