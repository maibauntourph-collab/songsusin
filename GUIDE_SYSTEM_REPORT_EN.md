# Mobile Audio Guide System - Test Report

## Overview
A real-time audio streaming and multilingual translation system for tour guides and tourists.

## System Architecture

```
┌─────────────────┐      WebSocket/WebRTC      ┌─────────────────┐
│   Guide App     │ ◄──────────────────────────► │     Server      │
│ (Chrome/Android)│                             │ (Python/FastAPI) │
└─────────────────┘                             └────────┬────────┘
                                                         │
                                                         │ Socket.IO
                                                         │ (Real-time Events)
                                                         ▼
                                               ┌─────────────────┐
                                               │   Tourist App   │
                                               │ (iOS/Android/Web)│
                                               └─────────────────┘
```

## Test Results Summary

### 1. Connection Tests
| Test Item | Result | Notes |
|-----------|--------|-------|
| Socket.IO Connection | ✅ Pass | Auto-reconnect supported |
| Guide Role Selection | ✅ Pass | Immediate room join |
| Tourist Role Selection | ✅ Pass | Auto-receive guide status |
| Monitor Dashboard | ✅ Pass | Real-time stats update |

### 2. Audio Streaming Tests
| Test Item | Result | Notes |
|-----------|--------|-------|
| Microphone Permission | ✅ Pass | HTTPS required (mobile) |
| WebSocket Audio Transmission | ✅ Pass | 128kbps bitrate |
| MediaSource API Playback | ✅ Pass | WebM/Opus codec |
| Late-join Tourist Sync | ✅ Pass | Init segment caching |

### 3. Speech Recognition (STT) Tests
| Test Item | Result | Notes |
|-----------|--------|-------|
| Korean Speech Recognition | ✅ Pass | Chrome only |
| Interim Results Display | ✅ Pass | Real-time text update |
| Final Result Transmission | ✅ Pass | Immediate server send |
| STT Auto-restart | ✅ Pass | 1 second delay restart |

### 4. Translation Tests
| Test Item | Result | Notes |
|-----------|--------|-------|
| 100+ Language Simultaneous Translation | ✅ Pass | Google Translate API |
| Translation Latency | ⚠️ Note | ~2-5 seconds (varies by language count) |
| Tourist Display | ✅ Pass | Highlighter style applied |

### 5. Platform Compatibility
| Platform | Guide Mode | Tourist Mode | Notes |
|----------|------------|--------------|-------|
| Android Chrome | ✅ Supported | ✅ Supported | Recommended browser |
| iOS Safari | ❌ Not Supported (STT) | ✅ Supported | Safari lacks Web Speech API |
| Desktop Chrome | ✅ Supported | ✅ Supported | Development/Testing |
| Desktop Firefox | ⚠️ Partial | ✅ Supported | Limited STT |

## Key Features

### Guide Features
- **Start/Stop Broadcast**: One-touch button control
- **Real-time Speech Recognition**: Auto-convert Korean speech to text
- **Transmission Status**: TX counter shows data sent
- **Place Registration**: Manual input or Excel upload
- **Session Management**: Download logs, AI summary, clear session

### Tourist Features
- **Automatic Audio Reception**: Auto-receive when guide broadcasts
- **Multilingual Translation**: Real-time subtitles in 100+ languages
- **TTS Voice Guide**: Listen to translated text as speech
- **Highlighter Effect**: Emphasize currently translated text

### Monitoring Features
- **Real-time Dashboard**: Access via `/monitor` path
- **Guide Status Display**: Online/Broadcasting status
- **Tourist Statistics**: Connection count by language
- **Session Tracking**: Individual tourist connection times

## Known Issues and Solutions

### Issue 1: "Waiting for Guide" Persists
**Cause**: Tourist connects before guide
**Solution**: 
- Auto-notify all tourists on guide status change
- `request_guide_status` event for manual status request

### Issue 2: Highlight Color Not Showing on Android
**Cause**: Missing CSS class
**Solution**: Explicitly add `highlight-pen` class

### Issue 3: STT Interruption
**Cause**: Chrome STT engine timeout
**Solution**: Auto-restart after 1 second in `onend` event

## Running Simulation

1. Verify server is running
```bash
python server.py
```

2. Access simulation page
```
http://localhost:5000/static/simulation.html
```

3. Click "Start Broadcast" in the guide frame

4. 60 virtual tourists will automatically connect

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/` | GET | Main app page |
| `/monitor` | GET | Monitoring dashboard |
| `/api/monitor` | GET | Connection stats JSON |
| `/add_place` | POST | Register place |
| `/upload_places` | POST | Excel upload |
| `/places` | GET | Place list |
| `/history` | GET | Transcript history |
| `/summarize` | POST | Generate AI summary |
| `/download_transcript` | GET | Download full log |
| `/clear_session` | POST | Clear session |

## Socket.IO Events

### Client → Server
| Event | Data | Description |
|-------|------|-------------|
| `join_room` | `{role, language}` | Role selection and room join |
| `start_broadcast` | - | Start broadcast |
| `stop_broadcast` | - | Stop broadcast |
| `transcript_msg` | `{text, isFinal}` | Speech recognition result |
| `binary_audio` | Binary | Audio chunk |
| `update_language` | `{language}` | Language change |
| `request_guide_status` | - | Request guide status |

### Server → Client
| Event | Data | Description |
|-------|------|-------------|
| `guide_status` | `{online, broadcasting}` | Guide status notification |
| `transcript` | `{original, translations, isFinal}` | Translated subtitles |
| `audio_chunk` | Binary | Audio data |
| `audio_init` | Binary | Init segment |
| `monitor_update` | Stats Object | Monitor statistics |

## Android Debugging Guide

### Troubleshooting Android → Android Transmission Issues

When using Guide mode on Android Chrome, check the following:

1. **Check Browser Console Logs**
   - Use `chrome://inspect` for mobile debugging
   - Look for logs starting with `[Android Debug]`

2. **Required Log Messages**
   ```
   [Android Debug] STT Audio Capture Started
   [Android Debug] Speech Detected!
   [Android Debug] STT onresult fired
   [Android Debug] transcript_msg emitted (final)
   ```

3. **Common Issues**
   - `STT Error: not-allowed` → Allow microphone permission
   - `STT Error: network` → Check internet connection
   - `Socket not connected` → Refresh the page

4. **Android Chrome Settings**
   - Settings > Site Settings > Microphone > Allow
   - HTTPS connection recommended (STT limited on HTTP)

### Server Log Verification

Server should show `[TRANSCRIPT]` logs:
```
[TRANSCRIPT] Received from xxx: text='Hello...', isFinal=True
[TRANSCRIPT] Emitting to tourists and guides: original='Hello...'
[TRANSCRIPT] Emit complete
```

## Test Environment

- **Server**: Python 3.11, FastAPI, Socket.IO
- **Database**: SQLite
- **Translation**: Google Translate (deep-translator)
- **AI Summary**: OpenAI GPT-4o-mini
- **Test Date**: January 8, 2026

## Conclusion

The Mobile Audio Guide System works correctly under the following conditions:
1. **Guide**: Android Chrome recommended (HTTPS environment)
2. **Tourist**: All modern browsers supported
3. **Network**: Stable internet connection required

The system can handle 60+ concurrent users and provides real-time translation in 100+ languages.
