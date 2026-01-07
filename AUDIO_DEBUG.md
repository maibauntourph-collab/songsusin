# Mobile Audio Guide System - Audio Issue Analysis

## Symptoms
- Text transcript works normally.
- Guide's audio is not heard by Tourists.

## Cause Analysis

### 1. WebRTC ICE Connection Failed (Major Cause)
In cloud environments (like Replit), the lack of a TURN server causes WebRTC P2P connection failures.

**Log Evidence:**
```
ICE connection state is failed
ICE connection state is closed
```
Direct connection is impossible because the server is on the cloud and the client is on a local network.

### 2. WebSocket Fallback Audio Error
When WebRTC fails, the system falls back to WebSocket audio transmission, but the previous code had incorrect audio format handling.

**Browser Error:**
```
NotSupportedError: Failed to load because no supported source was found
```

**Issue:**
- Attempted to play by simply combining WebM/Opus chunks created by MediaRecorder into a Blob.
- WebM containers require an initialization header, so chunks alone cannot be played.

### 3. Solution
Use MediaSource Extensions (MSE) API to play audio in a streaming manner:

```javascript
// Play real-time stream via MediaSource API
const mediaSource = new MediaSource();
audio.src = URL.createObjectURL(mediaSource);

mediaSource.addEventListener('sourceopen', () => {
    const sourceBuffer = mediaSource.addSourceBuffer('audio/webm; codecs=opus');
    // Append chunks sequentially
    sourceBuffer.appendBuffer(chunk);
});
```

## System Flow

```
[Guide Browser]
    │
    ├── MediaRecorder (audio/webm;codecs=opus)
    │       │
    │       └── socket.emit('binary_audio', chunk)
    │
    ▼
[Server (Replit/Local)]
    │
    ├── WebRTC Attempt → ICE Fail (No TURN)
    │
    └── WebSocket Fallback
            │
            └── socket.emit('audio_chunk', data)
    │
    ▼
[Tourist Browser]
    │
    ├── MediaSource API
    │       │
    │       └── SourceBuffer.appendBuffer(chunk)
    │
    └── Audio Playback
```

## Testing Method

### Guide Test
1. Access the website.
2. Select "I am Guide".
3. Click "Start Broadcast".
4. Allow Microphone permission.
5. Speak and check if text appears.

### Tourist Test
1. Access from another device/browser.
2. Select "I am Tourist".
3. Check if subtitles appear.
4. Check if audio controls appear.
5. Check if sound is audible.

## Browser Compatibility

| Browser | STT | Audio Playback | MediaSource |
|---------|-----|----------------|-------------|
| Chrome (PC) | O | O | O |
| Chrome (Android) | O | O | O |
| Safari (iPhone) | X | O | Limited |
| Firefox | X | O | O |

**Note:**
- Guide is recommended to use Chrome (for STT support).
- Tourists can receive audio on most modern browsers.

## Known Limitations

1. **TURN Server Required**: For stable WebRTC in production, a TURN server is needed.
2. **iOS Safari Limitations**: MediaSource API support is limited.
3. **Autoplay Policy**: Autoplay is blocked without user interaction (requires click/touch).

## Change Log

### 2026-01-06
- Added server-side audio initialization segment caching.
- Tourists joining late receive the init segment first.
- Added audio session reset when Guide starts broadcast.
- Implemented sequential playback using audio queue.
- Added user guidance message when autoplay is blocked.

## Audio Playback Code Explanation

Continuous streaming playback using MediaSource Extensions (MSE) API:

```javascript
// MediaSource Initialization
const mediaSource = new MediaSource();
audio.src = URL.createObjectURL(mediaSource);

mediaSource.addEventListener('sourceopen', () => {
    // Create SourceBuffer - Maintain single decoder
    sourceBuffer = mediaSource.addSourceBuffer('audio/webm; codecs=opus');
    sourceBuffer.mode = 'sequence'; // Sequence mode
    
    // Process next chunk when append is done
    sourceBuffer.addEventListener('updateend', flushPendingBuffers);
});

// Append chunks continuously to SourceBuffer
function appendToStream(data) {
    pendingBuffers.push(data);
    flushPendingBuffers();
}

// Clean up old data on buffer overflow
if (e.name === 'QuotaExceededError') {
    sourceBuffer.remove(start, end - 5); // Keep last 5 seconds
}
```

Advantages:
- Maintains a single decoder for seamless continuous playback.
- Real-time streaming by sequentially appending chunks.
- Prevents memory leaks through buffer management.
