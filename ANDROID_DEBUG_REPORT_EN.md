# Android → Android Transmission Debugging Report

## Date: January 8, 2026

---

## Issues Identified

### 1. Guide Status Display Error
**Symptom**: Tourist receives translated text but guide status shows "Offline"

**Cause**: `guide_status` event not arriving or missing before `transcript` event

**Solution**: 
- Automatically update guide status to "Broadcasting" when transcript is received
- Since receiving text means guide is definitely broadcasting, sync the status

### 2. Android STT (Speech Recognition) Not Working
**Symptom**: 
- iOS → Android: Works correctly
- Android → Android: Text translation fails, only audio transmits

**Cause**: 
- On Android Chrome, MediaRecorder (audio recording) and SpeechRecognition (STT) conflict when using microphone simultaneously
- STT start timing overlaps with MediaRecorder causing recognition failure

**Solution**:
- Delay STT start by 1 second on Android
- Auto-retry after 2 seconds if first attempt fails
- Add STT status indicator UI to confirm operation

### 3. Excessive Alert Dialogs
**Symptom**: Noisy alert dialogs appear every time broadcast starts

**Cause**: HTTPS warnings, browser compatibility warnings displayed via `alert()`

**Solution**:
- Remove alert dialogs
- Log messages only or display quietly in UI

---

## Applied Fixes

### Code Changes (app.js)

#### 1. Auto-Correct Guide Status
```javascript
socket.on('transcript', (data) => {
    // Auto-update guide status when transcript received
    if (role === 'tourist') {
        const statusEl = document.getElementById('tourist-status');
        if (statusEl && !statusEl.textContent.includes("Broadcasting")) {
            statusEl.textContent = "Guide Broadcasting...";
            statusEl.style.color = "#28a745";
        }
    }
    // ...
});
```

#### 2. Android STT Delayed Start
```javascript
// Delay STT start on Android to prevent microphone conflict
const isAndroid = /Android/i.test(navigator.userAgent);
const sttStartDelay = isAndroid ? 1000 : 100;

setTimeout(() => {
    try {
        recognition.start();
    } catch (e) {
        // Retry on Android
        if (isAndroid) {
            setTimeout(() => {
                try { recognition.start(); } catch (e2) { }
            }, 2000);
        }
    }
}, sttStartDelay);
```

#### 3. STT Status Indicator UI
```html
<div id="stt-status">🎤 STT: Waiting to start...</div>
```

#### 4. Remove Alert Dialogs
```javascript
// Before: alert(msg);
// After: Log only, display in UI
log(msg);
const sttStatus = document.getElementById('stt-status');
if (sttStatus) sttStatus.textContent = "⚠️ STT: Not Supported";
```

---

## Debugging Guide

### Android Guide Phone Checklist

1. **Check Chrome Console Logs**
   - Use `chrome://inspect` for mobile debugging
   - Look for logs starting with `[Android Debug]`

2. **Required Log Messages**
   ```
   [Android Debug] STT Audio Capture Started
   [Android Debug] Speech Detected!
   [Android Debug] STT onresult fired
   [Android Debug] transcript_msg emitted (final)
   ```

3. **Check STT Status**
   - Verify `🎤 STT: Active` appears in UI
   - Verify `🎤 Listening for speech...` message appears

### Server Log Verification

```
[TRANSCRIPT] RAW data received from xxx: {...}
[TRANSCRIPT] Processed: text='Hello...'
[TRANSCRIPT] Emitting to tourists and guides
```

---

## Test Checklist

- [ ] Click "Start Broadcast" on Android guide
- [ ] Verify STT status changes to "Active"
- [ ] Speak and verify text appears in black box
- [ ] Verify translated text appears on tourist phone
- [ ] Verify guide status shows "Broadcasting" on tourist phone
- [ ] Verify no alert dialogs appear during startup

---

## Related Files

- `static/app.js` - Frontend logic
- `static/index.html` - UI template
- `server.py` - Backend server

## Notes

Chrome on Android settings:
- Settings > Site Settings > Microphone > Allow
- HTTPS connection recommended (STT may be restricted on HTTP)
