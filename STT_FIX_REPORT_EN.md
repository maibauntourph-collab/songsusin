# Android STT Persistence Bug Fix Report

## Problem
Even when the user selected **[🔊 Recorder Mode]** (Audio Only), the STT (Speech-to-Text) engine kept restarting in the background, causing repetitive "beep" sounds.

## Root Cause Analysis
The `recognition.onend` handler (responsible for auto-restarting STT) in `static/app.js` lacked a check for the current `audioMode`. It was restarting STT solely based on `isBroadcasting == true`, regardless of whether STT was actually enabled.

## Solution
1.  **Stricter Restart Condition:** Updated the `recognition.onend` logic to check `if (isBroadcasting && audioMode === 'stt')`. STT now only restarts if the user is explicitly in STT mode.
2.  **Force Stop on Mode Switch:** Updated `setAudioMode` to immediately call `recognition.stop()` if the user switches to 'recorder' mode.

## Result
- Selecting **Recorder Mode** now fully terminates the STT engine, eliminating the "beep" sounds.
- Pushed the fixed code to GitHub.
