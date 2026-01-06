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
- **Guide Mode**: Broadcast audio with real-time speech recognition (Korean)
- **Tourist Mode**: Receive audio stream and translated subtitles (English, Korean, Japanese, Chinese)
- **Place Registration**: Add places manually or via Excel/CSV upload
- **Audio Recording**: Automatic server-side recording of guide sessions
- **Transcript History**: View and export past transcriptions

## API Endpoints
- `GET /` - Main application page
- `POST /add_place` - Add a new place
- `POST /upload_places` - Upload places from Excel/CSV
- `GET /places` - Get all registered places
- `GET /history` - Get transcript history
- `GET /export_places` - Export places to Excel
- `GET /api/recordings` - List audio recordings

## Socket.IO Events
- `join_room` - Join as guide or tourist
- `offer/answer` - WebRTC signaling
- `transcript_msg` - Speech-to-text messages
- `binary_audio` - Fallback audio streaming
