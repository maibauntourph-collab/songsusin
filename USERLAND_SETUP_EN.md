# 🐧 UserLAnd (Ubuntu) Setup Guide

This guide explains how to run the server on Android using the **UserLAnd** app instead of Termux. UserLAnd runs a full Linux (Ubuntu) environment.

## 1. Install & Setup UserLAnd

1.  **Install App**: Download **UserLAnd** from Google Play Store.
2.  **Select Distribution**:
    *   Open app -> Select **Ubuntu**.
    *   Allow permissions if asked.
    *   Enter a **Username** (e.g., `user`) and **Password** (e.g., `123456`).
    *   Select **SSH** connection type.
3.  **Terminal Access**:
    *   Once connected, you will see a terminal screen ending with `user@localhost:~$`.

## 2. Download Code & Install

Run the following commands in the UserLAnd terminal:

```bash
# 1. Update & Install Git
sudo apt update
sudo apt install git -y

# 2. Clone Repository
git clone https://github.com/maibauntourph-collab/songsusin.git
cd songsusin

# 3. Run Install Script (UserLAnd version)
chmod +x userland_install.sh
./userland_install.sh
```
*Note: Depending on your phone's speed, this may take 5-10 minutes.*

## 3. Run Server

```bash
python3 server.py
```
*   The server will start at `http://0.0.0.0:5000`.

## 4. How to Connect

1.  **Find IP Address**:
    *   In UserLAnd, type `ip addr` or `ifconfig` (you might need `sudo apt install net-tools` first).
    *   Look for the IP address (e.g., `192.168.x.x`).
2.  **Access from Browser**:
    *   Open Chrome on Android.
    *   Enter `http://192.168.x.x:5000`.

## ⚠️ Important Differences from Termux
*   **Commands**: Use `python3` instead of `python`, and `pip3` instead of `pip`.
*   **Permissions**: Some commands require `sudo`.
*   **Background**: UserLAnd creates a background notification. It generally stays alive better than Termux without special tweaks.
