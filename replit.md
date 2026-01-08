# Mobile Audio Guide System

## Overview
A real-time audio streaming application for tour guides and tourists. Guides can broadcast audio with live speech-to-text transcription and translation, while tourists receive the audio stream and translated subtitles.

## Tech Stack
- **Backend**: Python with FastAPI and Socket.IO
- **Frontend**: Vanilla JavaScript with Socket.IO client
- **Real-time**: WebRTC (aiortc) for audio streaming
- **Database**: SQLite (places.db) for storing places and transcripts
- **Translation**: deep-translator for multi-language support

## Project Structure
- `server.py` - Main FastAPI/Socket.IO server
- `static/index.html` - Frontend UI
- `static/app.js` - Frontend JavaScript logic
- `places.db` - SQLite database for places and transcripts
- `recordings/` - Directory for recorded audio files

## Running the Application
The server runs on port 5000:
```bash
python server.py
```

## Features
- **Guide Mode**: Broadcast audio with real-time speech recognition (Korean), see live transcript with English translation
- **Tourist Mode**: Receive audio stream and translated subtitles (English, Korean, Japanese, Chinese)
- **Place Registration**: Add places manually or via Excel/CSV upload
- **Audio Recording**: Automatic server-side recording of guide sessions
- **Transcript History**: View and export past transcriptions
- **AI Summarization**: Generate AI-powered summaries of tour sessions using OpenAI
- **Session Management**: Download transcript logs, clear session data

## API Endpoints
- `GET /` - Main application page
- `GET /monitor` - Real-time monitoring dashboard
- `GET /api/monitor` - Monitoring stats API (JSON)
- `POST /add_place` - Add a new place
- `POST /upload_places` - Upload places from Excel/CSV
- `GET /places` - Get all registered places
- `GET /history` - Get transcript history
- `GET /export_places` - Export places to Excel
- `GET /api/recordings` - List audio recordings
- `POST /summarize` - Generate AI summary of session transcripts
- `GET /download_transcript` - Download full transcript as text file
- `POST /clear_session` - Clear all session transcripts

## Socket.IO Events
- `join_room` - Join as guide, tourist, or monitor (includes language for tourists)
- `offer/answer` - WebRTC signaling
- `transcript_msg` - Speech-to-text messages
- `audio_chunk` - Binary audio streaming (WebM/Opus)
- `audio_init` - Audio initialization segment for late-joining tourists
- `request_audio_init` - Request cached init segment from server
- `reset_audio_session` - Reset audio state for new broadcast
- `start_broadcast` - Guide starts broadcasting
- `stop_broadcast` - Guide stops broadcasting
- `update_language` - Tourist changes language preference
- `monitor_update` - Server sends real-time stats to monitors

## Audio Streaming Architecture
The system uses MediaSource Extensions (MSE) API for continuous audio streaming:
- Server caches the first audio chunk (WebM init segment) for late-joining tourists
- SourceBuffer in 'sequence' mode ensures gap-free playback
- Init segment is prepended to buffer queue before any media chunks
- Automatic buffer cleanup on QuotaExceededError (keeps last 5 seconds)

## Recent Changes (Jan 2026)
- Fixed audio playback: Implemented MediaSource Extension streaming
- Added init segment caching and ordering for late-joining tourists
- Added Korean documentation (AUDIO_DEBUG_KR.md)
- Simplified tourist audio: Auto-receives when guide broadcasts (no manual controls)
- Added socket event guards to prevent stale data processing
- WebRTC fallback to WebSocket audio without retry loops
- **Monitoring Dashboard**: Real-time monitoring of guide and tourists at `/monitor`
  - Guide online/broadcasting status
  - Connected tourists count by language
  - Individual tourist session tracking

## Audio Control
- **Guide**: Has Start/Stop Broadcast buttons to control when audio is transmitted
- **Tourist**: Automatically receives audio when Guide broadcasts - no manual controls needed

State management:
- `touristAudioActive`: Set to true when tourist selects role, audio events are processed
- Socket guards on `audio_chunk` and `audio_init` prevent stale data processing
- WebRTC failure automatically falls back to WebSocket audio streaming
