# Android Guide Compatibility & Deployment Report

## 1. Fixed Errors & Improvements

### Android Guide Compatibility (STT & Audio)
- **STT (Speech Recognition)**: Modified to support standard `SpeechRecognition` alongside `webkitSpeechRecognition`, ensuring compatibility with Android Chrome.
- **Audio Encoding**: Improved logic to sequentially check various MIME types (`3gpp`, `aac`, `mpeg`, etc.) and select the best format for each Android device.
- **Bitrate Optimization**: Fixed audio bitrate at 128kbps for stable transmission on mobile networks.

### Deployment Fixes
- **Configuration Optimization**: Updated the `[deployment]` section required for Cloud Run / Replit Autoscale.
- **Port Binding**: Ensured the server binds to `0.0.0.0:5000` for external accessibility.

### Real-time Monitoring
- Built a dashboard at `/monitor` to track 1 guide and 100+ tourists in real-time.
- Shows language distribution, broadcast status (LIVE/Idle), and session details.

## 2. Recommendations
- **Chrome Required**: Android guides must use Google Chrome.
- **HTTPS Mandatory**: STT and Microphone access require a secure connection.
