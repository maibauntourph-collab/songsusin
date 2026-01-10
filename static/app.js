const socket = io();
let role = null;
let pc = null;
let localStream = null;
let audioCtx = null;
let isBroadcasting = false;
let animationId = null;
let recognition = null;

// Manual audio control state (prevent auto-reconnect loops)
// Tourist audio is always active once role is selected
let touristAudioActive = false;

// Offline Mode: For local/intranet environments without internet
// In offline mode, STT/translation is disabled, only audio streaming works
let offlineMode = false;

// Audio Mode: 'stt' for speech-to-text, 'recorder' for MediaRecorder audio streaming
// On Android, these conflict - user must choose one
let audioMode = 'recorder'; // Default to Recorder Mode (Audio Only)

// DOM Elements (Global Access) - Removed duplicate declaration here.
// See robust definition below (~line 141)


window.setAudioMode = function (mode) {
    audioMode = mode;
    window.audioMode = mode; // Force global property sync
    log("[Audio Mode] Set to: " + mode);

    // UI Update
    if (mode === 'stt') {
        if (sttStatus) sttStatus.textContent = "🎤 STT Mode (Auto)";
    } else {
        if (sttStatus) sttStatus.textContent = "🔊 Recorder Mode (Audio Only)";
    }

    // Dynamic Mode Switching Logic
    if (isBroadcasting) {
        log("[Audio Mode] Switching mode while broadcasting...");

        if (mode === 'recorder') {
            // Stop STT
            if (recognition) {
                try { recognition.stop(); } catch (e) { }
            }
            // Start Recorder if not running
            if (localStream) {
                setupFallbackRecorder(localStream);
            } else {
                log("[Audio Mode] Error: No local stream available for recorder");
            }
        } else if (mode === 'stt') {
            // Stop Recorder (if we had a handle, but currently setupFallbackRecorder doesn't return one globally... wait, we need to fix that)
            // Actually app.js doesn't store the MediaRecorder instance globally cleanly. 
            // We should just ensure STT starts. 

        } else if (mode === 'stt') {
            // Stop Recorder if running
            if (window.mediaRecorder && window.mediaRecorder.state !== 'inactive') {
                try { window.mediaRecorder.stop(); } catch (e) { }
            }

            // Start STT
            if (recognition) {
                try { recognition.start(); } catch (e) { log("STT Start Error: " + e); }
            }
        }
    }
}

function detectOfflineMode() {
    // Check if we're in an offline/local environment
    const isLocalIP = /^(192\.168\.|10\.|172\.(1[6-9]|2[0-9]|3[01])\.|localhost|127\.0\.0\.1)/.test(location.hostname);
    const isOffline = !navigator.onLine;

    // 로컬 IP에서는 navigator.onLine을 신뢰하지 않음 (안드로이드 버그)
    if (isLocalIP) {
        log("[Network] Local IP detected - assuming online, STT enabled");
        offlineMode = false;  // 로컬 네트워크에서는 온라인으로 간주
        return false;
    }

    if (isOffline) {
        offlineMode = true;
        log("[Offline Mode] Detected offline environment - STT disabled, audio-only mode");
        return true;
    }

    offlineMode = false;
    return false;
}

window.toggleOfflineMode = function (checkbox) {
    offlineMode = checkbox.checked;
    log("[Offline Mode] User toggled: " + offlineMode);

    const label = document.getElementById('offline-mode-label');
    const panel = document.getElementById('offline-mode-panel');

    if (offlineMode) {
        if (label) label.textContent = "Offline Mode ENABLED (Audio Only)";
        if (panel) panel.style.border = "2px solid #ff4444";

        // Force Recorder Mode
        document.getElementById('audio-mode-recorder').checked = true;
        setAudioMode('recorder');

        // Explicitly kill STT
        if (recognition) try { recognition.stop(); } catch (e) { }
    } else {
        if (label) label.textContent = "Enable Offline Mode";
        if (panel) panel.style.border = "2px solid #28a745";
    }
}

// Listen for online/offline changes
window.addEventListener('online', () => {
    log("[Network] Back online");
    offlineMode = false;
    updateOfflineModeUI();
});

window.addEventListener('offline', () => {
    log("[Network] Gone offline");
    offlineMode = true;
    updateOfflineModeUI();
});

function updateOfflineModeUI() {
    const sttStatus = document.getElementById('stt-status');
    const offlineIndicator = document.getElementById('offline-indicator');

    if (offlineMode) {
        if (sttStatus) sttStatus.textContent = "⚠️ Offline Mode (Audio Only)";
        if (offlineIndicator) offlineIndicator.classList.remove('hidden');
    } else {
        if (sttStatus) sttStatus.textContent = "";
        if (offlineIndicator) offlineIndicator.classList.add('hidden');
    }
}

// Audio Visualizer Logic
function setupAudioAnalysis(stream, meterId) {
    try {
        log("[Visualizer] Setting up for meter: " + meterId);
        if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        if (audioCtx.state === 'suspended') {
            log("[Visualizer] AudioContext was suspended, resuming...");
            audioCtx.resume();
        }
        log("[Visualizer] AudioContext state: " + audioCtx.state);

        const analyser = audioCtx.createAnalyser();
        analyser.fftSize = 256;
        const source = audioCtx.createMediaStreamSource(stream);
        source.connect(analyser);
        log("[Visualizer] Analyser connected to stream");

        // If it's a remote stream (Tourist), we also need to connect to destination to hear it!
        // But 'audio' element in createPeerConnection handles playback. 
        // Connecting source->destination here would cause echo or double audio if <audio> element is also playing.
        // For visualizer only, we don't connect to destination.
        // However, we must ensure the 'source' doesn't detach the stream from the <audio> element.
        // Cloning the stream or using the existing audio element source is safer.

        const dataArray = new Uint8Array(analyser.frequencyBinCount);
        const meterFill = document.getElementById(meterId);

        function draw() {
            animationId = requestAnimationFrame(draw);
            analyser.getByteFrequencyData(dataArray);

            // Calculate average volume
            let sum = 0;
            for (let i = 0; i < dataArray.length; i++) {
                sum += dataArray[i];
            }
            const average = sum / dataArray.length;

            // Map 0-255 to 0-100%
            // Boost sensitivity a bit (x1.5)
            const level = Math.min(100, (average * 2));

            if (meterFill) meterFill.style.width = level + "%";
        }
        draw();
    } catch (e) {
        log("Visualizer Error: " + e);
    }
}

// Timeslice UI Helper
window.updateTimesliceDisplay = function (val) {
    const display = document.getElementById('timeslice-display');
    if (display) display.textContent = val;
}


// Config
const rtcConfig = {
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' }
    ]
};

// UI Elements
const els = {
    roleSel: document.getElementById('role-selection'),
    guideCtrl: document.getElementById('guide-controls'),
    touristCtrl: document.getElementById('tourist-controls'),
    guideStatus: document.getElementById('guide-status'),
    touristStatus: document.getElementById('tourist-status'),
    debug: document.getElementById('debug')
};

function log(msg) {
    console.log(msg);
    // Reverse order: Newest at top
    if (els.debug) {
        els.debug.innerText = msg + '\n' + els.debug.innerText.substring(0, 5000); // Limit size
    }
}

// Initial selectRole removed. Use the merged one below.

//    // Guide View Mode Toggle
window.setGuideViewMode = function (mode) {
    const simpleBtn = document.getElementById('btn-mode-simple');
    const devBtn = document.getElementById('btn-mode-dev');
    const qrBtn = document.getElementById('btn-mode-qr');

    const simpleSection = document.getElementById('simple-place-input');
    const devSection = document.getElementById('guide-dev-section');
    const qrSection = document.getElementById('guide-qr-section');
    const debugSection = document.getElementById('debug');

    // Reset Buttons
    if (simpleBtn) simpleBtn.style.background = "#6c757d";
    if (devBtn) devBtn.style.background = "#6c757d";
    if (qrBtn) qrBtn.style.background = "#6c757d";

    // Hide All Sections first
    if (simpleSection) simpleSection.classList.add('hidden');
    if (devSection) devSection.classList.add('hidden');
    if (qrSection) qrSection.classList.add('hidden');
    if (debugSection) debugSection.classList.add('hidden'); // Hide debug by default

    // Activate specific sections based on mode
    if (mode === 'simple') {
        if (simpleBtn) simpleBtn.style.background = "#007bff";
        if (simpleSection) simpleSection.classList.remove('hidden');
    } else if (mode === 'qr') {
        if (qrBtn) qrBtn.style.background = "#17a2b8";
        if (qrSection) qrSection.classList.remove('hidden');
    } else if (mode === 'dev') {
        if (devBtn) devBtn.style.background = "#007bff";
        if (devSection) devSection.classList.remove('hidden');
        if (debugSection) debugSection.classList.remove('hidden'); // Show debug only in dev
        // Dev mode also shows simple input for convenience
        if (simpleSection) simpleSection.classList.remove('hidden');
    }
}



// --- Audio Context Handling (Tourist) ---
let dummyAudio = null;

function updatePlayButton() {
    const playBtn = document.getElementById('play-btn');
    if (!playBtn) return;

    if (audioCtx && audioCtx.state === 'running') {
        playBtn.textContent = "Audio Ready";
        playBtn.style.background = "#28a745";
    } else if (audioCtx && audioCtx.state === 'suspended') {
        playBtn.textContent = "Tap to Enable Audio";
        playBtn.style.background = "#007bff";
    } else {
        playBtn.textContent = "Enable Audio";
        playBtn.style.background = "#6c757d";
    }
}

function initAudioContext() {
    try {
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        audioCtx = new AudioContext();
        log("AudioContext State: " + audioCtx.state);
        updatePlayButton();

        // Background Audio Hack (Silent Loop)
        // This keeps the AudioContext active even when screen is locked/backgrounded on iOS/Android
        if (!dummyAudio) {
            dummyAudio = document.createElement('audio');
            // Tiny silent mp3 base64
            dummyAudio.src = 'data:audio/mp3;base64,SUQzBAAAAAAAI1RTU0UAAAAPAAADTGF2ZjU4LjIwLjEwMAAAAAAAAAAAAAAA//OEAAAAAAAAAAAAAAAAAAAAAAAASW5mbwAAAA8AAAAEAAABIADAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMD//////////////////////////////////////////////////////////////////wAAAP//OEAAAAAAAAAAAAAAAAAAAAAATEFNRTMuMTAwVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVV//OEAAAAAAAAAAAAAAAAAAAAAA//OEAAAAAAAAAAAAAAAAAAAAAA==';
            dummyAudio.loop = true;
            dummyAudio.volume = 0.01; // Not perfectly 0 to avoid being "optimized out" by some OS
            document.body.appendChild(dummyAudio);
        }

        audioCtx.onstatechange = () => {
            log("AudioContext State Change: " + audioCtx.state);
            updatePlayButton();
        };

    } catch (e) {
        log("Web Audio API not supported: " + e);
        els.touristStatus.textContent = "Error: Web Audio Not Supported";
    }
}

function resumeAudioContext() {
    if (!audioCtx) { initAudioContext(); }

    if (audioCtx && audioCtx.state !== 'running') {
        audioCtx.resume().then(() => {
            log("AudioContext Resumed by User");
            updatePlayButton();

            // Start silent loop
            if (dummyAudio) {
                dummyAudio.play().then(() => log("Background Keep-alive Audio Started")).catch(e => log("Keep-alive fail: " + e));
            }

            // Also acquire Wake Lock if possible
            enableBackgroundMode();

        }).catch(e => {
            log("Resume failed: " + e);
            document.getElementById('play-btn').textContent = "Retry Audio";
        });
    } else {
        log("AudioContext already running");
        updatePlayButton();
        // Start silent loop just in case
        if (dummyAudio && dummyAudio.paused) {
            dummyAudio.play().then(() => log("Background Keep-alive Audio Started")).catch(e => log("Keep-alive fail: " + e));
        }
    }
}


// Bind events safely after DOM load
document.addEventListener('DOMContentLoaded', () => {
    const playBtn = document.getElementById('play-btn');
    if (playBtn) {
        // Handle both click and touchstart for better mobile response
        const handleInteraction = (e) => {
            e.preventDefault(); // Prevent double-firing on some devices
            log("Button Interact: " + e.type);
            playBtn.textContent = "Processing...";
            playBtn.style.background = "#ffc107"; // Yellow indicating working
            resumeAudioContext();

            // Retry connection if tourist and no active connection
            if (role === 'tourist' && touristAudioActive) {
                if (!pc || pc.connectionState === 'failed' || pc.connectionState === 'disconnected' || pc.connectionState === 'closed') {
                    log("Retrying tourist connection...");
                    teardownTouristAudio();
                    startTouristReceiver();
                }
            }
        };

        playBtn.addEventListener('click', handleInteraction);
        playBtn.addEventListener('touchstart', handleInteraction);
    }
});

function enableBackgroundMode() {
    // 1. Wake Lock (Screen)
    if ('wakeLock' in navigator) {
        navigator.wakeLock.request('screen')
            .then(wl => {
                wakeLock = wl;
                log("Screen WakeLock Acquired (Background Mode)");
            })
            .catch(err => log("WakeLock Fail: " + err));
    }

    // 2. Media Session API (Lock Screen Controls)
    if ('mediaSession' in navigator) {
        navigator.mediaSession.metadata = new MediaMetadata({
            title: 'Mobile Audio Guide',
            artist: 'Live Stream',
            album: 'Tour System',
            artwork: [
                { src: 'https://via.placeholder.com/96', sizes: '96x96', type: 'image/png' },
                { src: 'https://via.placeholder.com/128', sizes: '128x128', type: 'image/png' },
            ]
        });

        navigator.mediaSession.setActionHandler('play', () => {
            if (dummyAudio) dummyAudio.play();
            if (audioCtx) audioCtx.resume();
        });
        navigator.mediaSession.setActionHandler('pause', () => {
            // Do nothing to prevent stopping
            log("Pause pressed on lock screen - Ignoring to keep stream alive");
        });
    }
}

// Helper to wait for ICE gathering to complete
function waitForICEGathering(pc) {
    return new Promise((resolve) => {
        if (pc.iceGatheringState === 'complete') {
            resolve();
        } else {
            function checkState() {
                if (pc.iceGatheringState === 'complete') {
                    pc.removeEventListener('icegatheringstatechange', checkState);
                    resolve();
                }
            }
            pc.addEventListener('icegatheringstatechange', checkState);
            // Safety timeout in case it hangs
            setTimeout(() => { resolve(); }, 2000);
        }
    });
}

// --- Guide Logic ---
// --- Guide Logic ---
let wakeLock = null;

window.toggleBroadcast = function () {
    if (isBroadcasting) {
        stopBroadcast();
    } else {
        startBroadcast();
    }
}

// Transmission Mode State
let useWebRTC = true;

window.toggleTransmissionMode = function (cb) {
    useWebRTC = cb.checked;
    const label = document.getElementById('mode-label');
    if (label) label.textContent = useWebRTC ? "Automatic (WebRTC + Fallback)" : "Manual (WebSocket Only)";
    log("Transmission Mode changed to: " + (useWebRTC ? "Auto" : "Manual"));
}

window.toggleOfflineMode = function (cb) {
    offlineMode = cb.checked;
    const label = document.getElementById('offline-mode-label');
    const panel = document.getElementById('offline-mode-panel');
    const sttStatus = document.getElementById('stt-status');

    if (offlineMode) {
        if (label) label.textContent = "Offline Mode ENABLED (Audio Only)";
        if (panel) panel.style.background = "#2a1a1a";
        if (panel) panel.style.borderColor = "#dc3545";
        if (sttStatus) sttStatus.textContent = "📡 Offline Mode: Audio streaming only (No STT/Translation)";
        log("[Offline Mode] ENABLED - STT and translation disabled");
    } else {
        if (label) label.textContent = "Enable Offline Mode (Audio Only, No STT)";
        if (panel) panel.style.background = "#1a3a1a";
        if (panel) panel.style.borderColor = "#28a745";
        if (sttStatus) sttStatus.textContent = "🎤 STT: Waiting to start...";
        log("[Offline Mode] DISABLED - STT and translation enabled");
    }
}

window.checkNetworkMode = function () {
    const el = document.getElementById('network-mode');
    if (!el) return;

    if (location.hostname === 'localhost' || location.hostname.startsWith('192.168.') || location.hostname.startsWith('10.')) {
        el.innerHTML = "📶 Local Network";
        el.style.background = "rgba(255, 193, 7, 0.2)"; // Yellow tint
        el.style.color = "#ffc107";
        el.style.border = "1px solid #ffc107";
    } else {
        el.innerHTML = "🌐 Online Mode (Cloud)";
        el.style.background = "rgba(40, 167, 69, 0.2)"; // Green tint
        el.style.color = "#28a745";
        el.style.border = "1px solid #28a745";
    }
}

// Init check
document.addEventListener('DOMContentLoaded', () => {
    checkNetworkMode();

    // Auto-role selection for testing/simulation
    const urlParams = new URLSearchParams(window.location.search);
    const autoRole = urlParams.get('auto_role');
    if (autoRole) {
        log("Auto-selecting role: " + autoRole);
        selectRole(autoRole);
    }

    // Auto-language selection
    const autoLang = urlParams.get('lang');
    if (autoLang) {
        const langSel = document.getElementById('lang-select');
        if (langSel) {
            langSel.value = autoLang;
            log("Auto-selected Language: " + autoLang);
        }
    }

    // Auto-sound (TTS) enable
    const autoSound = urlParams.get('sound');
    if (autoSound === 'on') {
        const tBtn = document.getElementById('tts-btn');
        // Check if exists and is currently OFF
        if (tBtn && tBtn.textContent.includes("OFF")) {
            log("Auto-enabling TTS Sound");
            tBtn.click(); // Trigger toggle logic
        }
    }
});

window.startBroadcast = async function () {
    // Detect platform for debugging
    const ua = navigator.userAgent;
    const isAndroid = /Android/i.test(ua);
    const isIOS = /iPhone|iPad|iPod/i.test(ua);
    const isMobile = isAndroid || isIOS;
    log("[Platform] UA=" + ua.substring(0, 50) + "...");
    log("[Platform] isAndroid=" + isAndroid + ", isIOS=" + isIOS + ", isMobile=" + isMobile);

    log("Start Broadcast clicked");
    try {
        if (isBroadcasting) return;

        // Update Buttons
        const toggleBtn = document.getElementById('broadcast-toggle-btn');
        const toolbarBtn = document.getElementById('toolbar-run-btn');

        if (toggleBtn) {
            toggleBtn.innerHTML = "⏸️ Pause Broadcast";
            toggleBtn.classList.remove('btn-guide');
            toggleBtn.classList.add('btn-stop'); // Make it red/warning style
            toggleBtn.style.background = "#dc3545";
        }
        if (toolbarBtn) toolbarBtn.innerHTML = "<span style='font-size: 1.5rem;'>⏸️</span>";

        isBroadcasting = true;

        socket.emit('reset_audio_session');
        socket.emit('start_broadcast');

        // UI Updates
        els.guideStatus.textContent = "Initializing...";
        els.guideStatus.classList.remove('status-error');

        // Wake Lock (Keep screen on)
        try {
            if ('wakeLock' in navigator) {
                wakeLock = await navigator.wakeLock.request('screen');
                log("Screen Wake Lock active");
            }
        } catch (err) {
            log("Wake Lock error: " + err);
        }

        // Get User Media (Retry Strategy for Android Compatibility)
        try {
            // Level 1: Standard High Quality
            let stream = null;

            // SECURITY CHECK: Android Chrome requires HTTPS or special Flag
            if (!navigator.mediaDevices) {
                const msg = "⛔ 마이크 권한 오류 (Security Error)\n\n" +
                    "chrome://flags 설정이 잘못되었습니다.\n" +
                    "현재 주소가 설정에 정확히 입력되었는지 확인해주세요.\n\n" +
                    "현재 주소: " + window.location.origin;
                alert(msg);
                log("CRITICAL: navigator.mediaDevices is undefined. Insecure origin?");
                els.guideStatus.textContent = "Error: Insecure Origin (Check Flags)";
                els.guideStatus.classList.add('status-error');
                stopBroadcast();
                return;
            }

            try {
                localStream = await navigator.mediaDevices.getUserMedia({
                    audio: {
                        echoCancellation: true,
                        noiseSuppression: true,
                        autoGainControl: true,
                        sampleRate: 48000, // High quality sample rate
                        channelCount: 1    // Mono is sufficient and stable
                    },
                    video: false
                });
                log("Microphone access granted (Standard)");
            } catch (e1) {
                log("Standard Audio Constraints failed: " + e1);
                // Level 2: Basic (Fallback)
                log("Retrying with basic constraints...");
                localStream = await navigator.mediaDevices.getUserMedia({
                    audio: true, // Just give me mic
                    video: false
                });
                log("Microphone access granted (Basic)");
            }
            log("Microphone access granted");

            // Debug: Check stream status
            if (localStream) {
                const tracks = localStream.getAudioTracks();
                log("[Mic Debug] Audio tracks count: " + tracks.length);
                if (tracks.length > 0) {
                    const track = tracks[0];
                    log("[Mic Debug] Track enabled: " + track.enabled + ", muted: " + track.muted + ", readyState: " + track.readyState);
                    log("[Mic Debug] Track settings: " + JSON.stringify(track.getSettings()));
                }
            }
        } catch (e) {
            log("Microphone access denied: " + e);
            els.guideStatus.textContent = "Error: Microphone Denied";
            els.guideStatus.classList.add('status-error');
            stopBroadcast(); // Reset UI
            return;
        }

        // HTTPS Check for Mobile (Log only, no alert)
        if (location.protocol !== 'https:' && location.hostname !== 'localhost' && location.hostname !== '127.0.0.1') {
            const msg = "⚠️ STT usually requires HTTPS on mobile. Text might not appear via HTTP IP.";
            log(msg);
            // alert(msg); // Removed - too noisy
        }

        // Check offline mode before STT
        detectOfflineMode();

        // STT (Speech to Text) - Guide Side
        // Skip STT in offline mode, or if audioMode is 'recorder'
        const SpeechRecognitionAPI = window.SpeechRecognition || window.webkitSpeechRecognition;
        const useSTT = audioMode === 'stt' && !offlineMode;

        log("[Audio Mode] Current mode: " + audioMode + ", useSTT=" + useSTT);

        if (audioMode === 'recorder') {
            log("[Recorder Mode] STT disabled - using MediaRecorder for audio");
            const sttStatus = document.getElementById('stt-status');
            if (sttStatus) sttStatus.textContent = "🔊 레코더 모드: 오디오 스트리밍 (STT 미지원)";
            updateGuideTranscriptUI("🔊 레코더 모드 - 오디오 스트리밍 중 (자막 지원 안됨)", false);

            // ✅ 추가: Recorder 시작!
            setupFallbackRecorder(localStream);
            els.guideStatus.textContent = "방송 중 (레코더 모드)...";
            return;  // STT/WebRTC 설정 스킵
        } else if (offlineMode) {
            log("[Offline Mode] STT disabled - audio only streaming");
            const sttStatus = document.getElementById('stt-status');
            if (sttStatus) sttStatus.textContent = "📡 Offline Mode: Audio Only (No STT)";
            updateGuideTranscriptUI("📡 Offline Mode - Audio streaming without transcription", false);
        } else if (!SpeechRecognitionAPI) {
            log("STT Not Supported on this browser");
            // Show in UI instead of alert
            const sttStatus = document.getElementById('stt-status');
            if (sttStatus) sttStatus.textContent = "⚠️ STT: Not Supported (Use Chrome)";
        } else {
            if (recognition) {
                // Prevent multiple instances
                try { recognition.stop(); } catch (e) { }
            }
            log("Creating SpeechRecognition instance...");
            recognition = new SpeechRecognitionAPI();
            recognition.continuous = true;
            recognition.interimResults = true;
            recognition.lang = 'ko-KR'; // Guide speaks Korean

            // STT Engine Setup
            recognition.onstart = () => {
                log("STT Engine: Started");
                // Show STT status on UI
                const sttStatus = document.getElementById('stt-status');
                if (sttStatus) sttStatus.textContent = "🎤 STT: Active";
                updateGuideTranscriptUI("🎤 Listening for speech...", false);
            };
            // recognition.onaudiostart = () => log("STT Engine: Audio Detected");
            // recognition.onspeechstart = () => log("STT Engine: Speech Detected");
            recognition.onnomatch = () => log("STT Engine: No Match");
            recognition.onerror = (e) => {
                log("STT Error: " + e.error + " (message: " + (e.message || 'none') + ")");
                if (e.error === 'not-allowed') {
                    els.guideStatus.textContent = "Error: STT Blocked";
                    els.guideStatus.classList.add('status-error');
                } else if (e.error === 'network') {
                    els.guideStatus.textContent = "Error: STT Network Issue";
                } else if (e.error === 'aborted') {
                    // Android often aborts STT - auto-restart
                    log("[Android Debug] STT aborted - will auto-restart");
                } else if (e.error === 'no-speech') {
                    // No speech detected - this is normal, just restart
                    log("[Android Debug] No speech detected - will auto-restart");
                }
            };

            // Android-specific: Add audio events for debugging
            recognition.onaudiostart = () => log("[Android Debug] STT Audio Capture Started");
            recognition.onspeechstart = () => log("[Android Debug] Speech Detected!");
            recognition.onspeechend = () => log("[Android Debug] Speech Ended");
            recognition.onend = () => {
                log("STT Engine: Ended (Will Auto-restart). Current audioMode=" + audioMode + ", isBroadcasting=" + isBroadcasting);
                // CRITICAL: Ensure we rely on window.audioMode if for some reason local var is stale (though it shouldn't be)
                const currentMode = window.audioMode || audioMode;
                log("Deep Debug: window.audioMode=" + window.audioMode + ", local var=" + audioMode);

                if (offlineMode) {
                    log("STT Engine: Blocked restart due to Offline Mode");
                    return;
                }

                if (isBroadcasting && currentMode === 'stt') {
                    // Android Chrome needs longer delay for STT restart
                    const isAndroid = /Android/i.test(navigator.userAgent);
                    const restartDelay = isAndroid ? 500 : 1000;
                    log("[Android Debug] STT restart in " + restartDelay + "ms, isAndroid=" + isAndroid);
                    setTimeout(() => {
                        try {
                            recognition.start();
                            log("[Android Debug] STT restarted successfully");
                        } catch (e) {
                            log("STT Restart Fail: " + e);
                            // On Android, try again after another delay if first restart fails
                            if (isAndroid && isBroadcasting) {
                                setTimeout(() => {
                                    try { recognition.start(); } catch (e2) { log("STT Retry Fail: " + e2); }
                                }, 1000);
                            }
                        }
                    }, restartDelay);
                }
            };

            recognition.onresult = (event) => {
                log("[Android Debug] STT onresult fired, resultIndex=" + event.resultIndex + ", results.length=" + event.results.length);

                let interim = '';
                let final = '';

                for (let i = event.resultIndex; i < event.results.length; ++i) {
                    if (event.results[i].isFinal) {
                        final += event.results[i][0].transcript;
                    } else {
                        interim += event.results[i][0].transcript;
                    }
                }

                if (final) {
                    log("STT Final: " + final);
                    // Check socket connection before emitting
                    if (socket && socket.connected) {
                        socket.emit('transcript_msg', { text: final, source_lang: 'ko', isFinal: true });
                        log("[Android Debug] transcript_msg emitted (final)");
                    } else {
                        log("[Android Debug] ERROR: Socket not connected! Cannot emit transcript_msg");
                    }
                    updateGuideTranscriptUI(final, true);
                }

                if (interim) {
                    // Check socket connection before emitting
                    if (socket && socket.connected) {
                        socket.emit('transcript_msg', { text: interim, source_lang: 'ko', isFinal: false });
                    }
                    updateGuideTranscriptUI(interim, false);
                }
            };
            // On Android, add delay before starting STT to avoid microphone conflict
            const isAndroid = /Android/i.test(navigator.userAgent);
            const sttStartDelay = isAndroid ? 1000 : 100;
            log("[Android Debug] Will start STT in " + sttStartDelay + "ms, isAndroid=" + isAndroid);

            setTimeout(() => {
                try {
                    recognition.start();
                    log("STT Init Command Sent");
                } catch (e) {
                    log("STT Start Error: " + e);
                    // On Android, retry with longer delay
                    if (isAndroid) {
                        setTimeout(() => {
                            try { recognition.start(); log("STT Retry Success"); }
                            catch (e2) { log("STT Retry Fail: " + e2); }
                        }, 2000);
                    }
                }
            }, sttStartDelay);
        }

        // --- Audio Transmission ---
        // Resume AudioContext explicitly (required on mobile after user gesture)
        if (audioCtx && audioCtx.state === 'suspended') {
            log("[Mobile Fix] Resuming suspended AudioContext");
            await audioCtx.resume();
            log("[Mobile Fix] AudioContext state after resume: " + audioCtx.state);
        }

        // Setup Visualizer for Guide
        setupAudioAnalysis(localStream, 'guide-meter');

        // Audio Mode Logic:
        // - STT Mode: WebRTC Only (Cleanest for Android)
        // - Recorder Mode: MediaRecorder Only (Audio Only, No STT)
        // NO Hybrid Mode (avoids mic conflicts)

        // Audio Mode Logic:
        // - STT Mode: WebRTC Only
        // - Recorder Mode: MediaRecorder Only

        try {
            if (useWebRTC) {
                els.guideStatus.textContent = "Broadcasting (STT Mode)...";
                createPeerConnection();
                localStream.getTracks().forEach(track => pc.addTrack(track, localStream));

                const offer = await pc.createOffer();
                await pc.setLocalDescription(offer);

                log("Gathering ICE candidates...");
                await waitForICEGathering(pc);
                socket.emit('offer', { sdp: pc.localDescription.sdp, type: pc.localDescription.type, role: 'guide' });

                log("[STT Mode] WebRTC active.");
            } else {
                // WebSocket-only mode (Recorder Mode)
                els.guideStatus.textContent = "Broadcasting (Audio Only)...";
                setupFallbackRecorder(localStream);
                updateGuideTranscriptUI("🚫 STT Disabled (Recorder Mode)", true);
            }
        } catch (err) {
            log("Error starting broadcast: " + err);
            stopBroadcast();
        }
    } catch (e) {
        log("Unhandled Broadcast Error: " + e);
        stopBroadcast();
    }
}

window.stopBroadcast = function () {
    log("Stop Broadcast clicked");
    isBroadcasting = false;

    // Notify server that broadcast stopped
    socket.emit('stop_broadcast');

    // Update Buttons
    const toggleBtn = document.getElementById('broadcast-toggle-btn');
    const toolbarBtn = document.getElementById('toolbar-run-btn');

    if (toggleBtn) {
        toggleBtn.innerHTML = "▶️ Start Broadcast";
        toggleBtn.classList.add('btn-guide');
        toggleBtn.classList.remove('btn-stop');
        toggleBtn.style.background = ""; // Reset
    }
    if (toolbarBtn) toolbarBtn.innerHTML = "<span style='font-size: 1.5rem;'>▶️</span>";


    if (pc) pc.close();
    if (localStream) localStream.getTracks().forEach(track => track.stop());
    if (wakeLock) {
        wakeLock.release().then(() => wakeLock = null);
    }

    // Ideally we shouldn't reload to keep state, just reset
    // location.reload(); 
    // Manual reset:
    els.guideStatus.textContent = "Ready (Paused)";

    // Ensure we stay on Guide Page
    els.roleSel.classList.add('hidden');
    els.guideCtrl.classList.remove('hidden');
}

// Data Counters
let txBytes = 0;
let rxBytes = 0;

function updateCounters() {
    if (role === 'guide') {
        const el = document.getElementById('guide-counter');
        if (el) el.textContent = `TX: ${(txBytes / 1024).toFixed(1)} KB`;
    } else if (role === 'tourist') {
        const el = document.getElementById('tourist-counter');
        if (el) el.textContent = `RX: ${(rxBytes / 1024).toFixed(1)} KB`;
    }
}

function updateGuideTranscriptUI(text, isFinal) {
    const guideBox = document.getElementById('guide-transcript-box');
    if (!guideBox) return;

    if (isFinal) {
        guideBox.innerHTML = `<span style="color: #ccff00; text-shadow: 0 0 5px #ccff00;">${text}</span>`;
    } else {
        guideBox.innerHTML = `<span style="color: #fff;">${text}</span>`;
    }
}

function getSupportedMimeType() {
    const types = [
        'audio/webm; codecs=opus',
        'audio/ogg; codecs=opus',  // Reference class addition
        'audio/webm',
        'audio/mp4; codecs=opus',
        'audio/mp4'
    ];
    for (const type of types) {
        if (MediaRecorder.isTypeSupported(type)) {
            log("Selected MediaRecorder MIME: " + type);
            return type;
        }
    }
    return '';
}

function setupFallbackRecorder(stream) {
    // Fallback: Send audio via WebSocket
    let options = {};
    const mimeType = getSupportedMimeType();

    if (mimeType) {
        options = { mimeType: mimeType };
    } else {
        log("No MIME specified, using browser default");
    }

    // Add audioBitsPerSecond for better Android compatibility
    options.audioBitsPerSecond = 128000;

    try {
        log("Creating MediaRecorder with options: " + JSON.stringify(options));
        // Assign to global window.mediaRecorder for control
        window.mediaRecorder = new MediaRecorder(stream, options);
        const recorder = window.mediaRecorder;

        log("MediaRecorder created successfully. Actual mimeType: " + recorder.mimeType);

        let chunkCount = 0;
        recorder.ondataavailable = e => {
            chunkCount++;
            // Log every 10th chunk or if size is small/suspicious
            if (chunkCount % 20 === 0 || e.data.size < 100) {
                log(`[Recorder Debug] Chunk #${chunkCount}: Size=${e.data.size}, State=${recorder.state}, Mime=${recorder.mimeType}`);
            }

            if (e.data.size > 10) { // Filter out empty/tiny headers (~1 byte artifacts)
                // Log only occasionally to avoid spam, but log first few
                if (txBytes === 0) log("Recorder produced first data: " + e.data.size + " bytes");

                if (socket.connected) {
                    socket.emit('binary_audio', e.data);
                    txBytes += e.data.size;
                    updateCounters();
                } else {
                    log("Socket disconnected, dropping audio chunk");
                    els.guideStatus.textContent = "Connection Lost! Reconnecting...";
                    els.guideStatus.style.color = "red";
                }
            } else {
                log("[Recorder Debug] Ignored tiny chunk: " + e.data.size + " bytes");
            }
        };

        recorder.onstart = () => {
            log("Recorder Started. Mime: " + recorder.mimeType + " State: " + recorder.state);
            els.guideStatus.textContent = "Broadcasting (Dual Mode)";
        };

        recorder.onerror = (e) => {
            log("Recorder Error: " + e.error);
            els.guideStatus.textContent = "Recorder Error: " + e.error;
        };

        // Dynamic Timeslice from UI
        let timeslice = 1000;
        const tsInput = document.getElementById('timeslice-control');
        if (tsInput) {
            timeslice = parseInt(tsInput.value, 10);
            log("Using configured timeslice: " + timeslice + "ms");
        }

        recorder.start(timeslice);
        log("Fallback Audio (WebSocket) Setup OK (timeslice=" + timeslice + "ms)");

    } catch (e) {
        log("Fallback Setup Failed: " + e);
        els.guideStatus.textContent = "Error: Recorder Init Failed (" + e + ")";
    }
}

socket.on('reconnect_ack', () => {
    log("Server acknowledged reconnect request.");
    // Tourist relies on WebSocket fallback - no WebRTC retry needed
});

// --- Tourist Logic ---
function createPeerConnection() {
    if (pc) pc.close();
    pc = new RTCPeerConnection(rtcConfig);

    pc.onicecandidate = (event) => {
        // We usually don't need to send candidates with aiortc if we use a single offer/answer with all candidates gathered
        // But for completeness:
        // if (event.candidate) socket.emit('candidate', event.candidate);
    };

    pc.oniceconnectionstatechange = () => {
        log(`ICE State: ${pc.iceConnectionState}`);
        if (role === 'tourist') {
            els.touristStatus.textContent = `Status: ${pc.iceConnectionState}`;
        }
        if (pc.iceConnectionState === 'failed' || pc.iceConnectionState === 'disconnected') {
            log("WebRTC Unstable (" + pc.iceConnectionState + ")");
            // Tourist uses WebSocket fallback - no retry loop needed
            els.touristStatus.textContent = "Using WebSocket audio...";
            log("WebRTC failed - relying on WebSocket fallback");
        } else if (pc.iceConnectionState === 'connected') {
            log("ICE Connected!");
            if (role === 'tourist' && els.touristStatus.textContent.includes("Waiting")) {
                els.touristStatus.textContent = "Connected. Waiting for audio...";
            }
        }
    };

    pc.ontrack = (event) => {
        log("Track received! ID: " + event.track.id + " Kind: " + event.track.kind);

        // CRITICAL FIX: Only Tourists should play the audio stream to prevent howling/feedback
        if (role === 'tourist') {
            els.touristStatus.textContent = "Receiving Audio Stream...";
            const stream = event.streams[0];
            webrtcAudioElement = new Audio(); // Assign to global
            webrtcAudioElement.srcObject = stream;
            webrtcAudioElement.autoplay = true;
            webrtcAudioElement.playsInline = true;
            webrtcAudioElement.controls = true; // Show controls to allow manual play if needed
            webrtcAudioElement.style.marginTop = "20px";

            // Respect current mode
            if (ttsEnabled) webrtcAudioElement.muted = true;

            document.body.appendChild(webrtcAudioElement);

            // Setup Visualizer for Tourist
            setupAudioAnalysis(stream, 'tourist-meter');

            // Ensure playback
            const playPromise = audio.play();
            if (playPromise !== undefined) {
                playPromise.then(_ => {
                    log("Audio playing");
                    els.touristStatus.textContent = "Audio Playing!";
                }).catch(error => {
                    log("Auto-play blocked: " + error);
                    els.touristStatus.textContent = "Click 'Tap to Enable Audio' again";
                    document.getElementById('play-btn').style.display = 'block';
                    // Re-bind click to play this specific audio
                    document.getElementById('play-btn').onclick = () => {
                        audio.play();
                        document.getElementById('play-btn').style.display = 'none';
                    };
                });
            }
        } else {
            log("Ignoring incoming track (Guide Mode) to prevent echo.");
        }
    }
} // End createPeerConnection

// --- Signaling ---
// NOTE: Transcript handler moved to unified handler below (line ~1134)

let ttsEnabled = false; // Now represents "AI Voice Mode"
let webrtcAudioElement = null; // Global reference for muting

function speakText(text, lang) {
    if (!('speechSynthesis' in window) || !ttsEnabled) return; // Only speak if enabled

    // Stop any current speech (debounced?)
    window.speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = lang === 'original' ? 'ko-KR' : lang;

    // Adjust language code for Google TTS
    if (utterance.lang === 'en') utterance.lang = 'en-US';
    if (utterance.lang === 'ja') utterance.lang = 'ja-JP';
    if (utterance.lang === 'zh-CN') utterance.lang = 'zh-CN';

    window.speechSynthesis.speak(utterance);
}

document.addEventListener('DOMContentLoaded', () => {
    const ttsBtn = document.getElementById('tts-btn');
    if (ttsBtn) {
        // Set initial state UI
        ttsBtn.textContent = "🎧 Live Voice";
        ttsBtn.style.background = "#007bff"; // Blue for Live

        ttsBtn.onclick = () => {
            ttsEnabled = !ttsEnabled;

            if (ttsEnabled) {
                // Switch to AI Mode
                ttsBtn.textContent = "🤖 AI Voice";
                ttsBtn.style.background = "#e83e8c"; // Pink/Purple for AI

                // Mute Live Audio
                if (webrtcAudioElement) webrtcAudioElement.muted = true;
                if (fallbackAudioElement) fallbackAudioElement.muted = true;

                // Test speech
                speakText("AI Voice Enabled", "en");
                log("[Audio] Switched to AI Voice (Live Muted)");
            } else {
                // Switch to Live Mode
                ttsBtn.textContent = "🎧 Live Voice";
                ttsBtn.style.background = "#007bff";

                // Unmute Live Audio
                if (webrtcAudioElement) webrtcAudioElement.muted = false;
                if (fallbackAudioElement) fallbackAudioElement.muted = false;

                window.speechSynthesis.cancel();
                log("[Audio] Switched to Live Voice (TTS Off)");
            }
        };
    }
});
// Guide status handler - unified handler at line ~1065
socket.on('guide_status', (data) => {
    log("Guide Status Update: " + JSON.stringify(data));
    const statusEl = document.getElementById('tourist-status');
    if (!statusEl) return;

    if (data.broadcasting) {
        statusEl.textContent = "🎙️ Guide is Live (Broadcasting)";
        statusEl.style.color = "#28a745";
        statusEl.style.fontWeight = "bold";

        if (role === 'tourist' && touristAudioActive) {
            log("Guide is broadcasting, requesting audio init and starting receiver...");
            socket.emit('request_audio_init');
            if (!pc || pc.connectionState === 'closed' || pc.connectionState === 'failed') {
                startTouristReceiver();
            }
        }
    } else if (data.online) {
        statusEl.textContent = "✅ Guide Online (Waiting to Start)";
        statusEl.style.color = "#007bff";
        statusEl.style.fontWeight = "normal";
    } else {
        statusEl.textContent = "❌ Guide Offline";
        statusEl.style.color = "#dc3545";
        statusEl.style.fontWeight = "normal";
    }
});

socket.on('guide_ready', () => {
    log("Guide Ready (WebRTC Track Active)");
    const statusEl = document.getElementById('tourist-status');
    if (statusEl) {
        statusEl.textContent = "🎙️ Audio Receiving...";
        statusEl.style.color = "#28a745";
    }
    if (role === 'tourist' && touristAudioActive) {
        // startTouristReceiver(); // Handled by play button or auto-retry
    }
});

socket.on('connect', () => {
    log("Socket.IO Connected");
    els.touristStatus.textContent = "Connected to Server";
    els.guideStatus.style.color = ""; // Reset color
    document.body.style.borderTop = "5px solid #28a745"; // Visual connection indicator
    if (role) {
        // Re-join if we were already there (Reconnect logic)
        const langSel = document.getElementById('lang-select');
        const lang = langSel ? langSel.value : 'en';
        socket.emit('join_room', { role: role, language: lang });
    }
});

socket.on('disconnect', () => {
    log("Socket Disconnected! Auto-rejoining...");
});

// Tourist receives an offer (or answer, usually SFU logic flows differently).
// In our server.py, the server waits for an Offer from the client? 
// Wait, `server.py` logic:
// Guide sends Offer. Server answers.
// Tourist sends Offer? 
// Let's check `server.py`:
// `if role == 'tourist': ... await pc.setRemoteDescription... await pc.createAnswer()`
// So Tourist MUST send Offer first to receive the track.

// Correction for Tourist Logic:
async function startTouristReceiver() {
    createPeerConnection();
    // Add Transceiver to receive Audio only
    pc.addTransceiver('audio', { direction: 'recvonly' });

    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);

    log("Gathering ICE candidates...");
    await waitForICEGathering(pc);
    log("ICE Gathering Complete");

    socket.emit('offer', { sdp: pc.localDescription.sdp, type: pc.localDescription.type, role: 'tourist' });
}

socket.on('connection_success', (data) => {
    // If I am a tourist, I should start the negotiation immediately to get the stream?
    // Or wait for the guide? Use the `join_room` to trigger?
    // Let's trigger manual 'Start' for tourist is safer for "Tap to Play"
});

// Merged selectRole logic
window.selectRole = function (r) {
    log("Role selected: " + r);
    role = r;
    els.roleSel.classList.add('hidden');

    // Get selected language for tourists
    const langSel = document.getElementById('lang-select');
    const lang = langSel ? langSel.value : 'en';

    if (role === 'guide') {
        els.guideCtrl.classList.remove('hidden');
        // Auto-load places for Guide
        setTimeout(loadPlaces, 500);
    } else {
        els.touristCtrl.classList.remove('hidden');

        // DIRECT LISTEN: Use this click as the gesture to unlock AudioContext
        initAudioContext();
        touristAudioActive = true;

        // Immediate feedback "Connected" instead of "Waiting..."
        els.touristStatus.textContent = "Connected. Listening...";
        els.touristStatus.style.color = "#28a745";

        // Ensure we try to connect if guide is already live
        socket.emit('request_guide_status');
    }
    socket.emit('join_room', { role: role, language: lang });
}

// Handle language change for tourists
window.onLanguageChange = function (selectEl) {
    const lang = selectEl.value;
    log("Language changed to: " + lang);
    socket.emit('update_language', { language: lang });
}

// Full teardown of all tourist audio resources
function teardownTouristAudio() {
    log("Tearing down tourist audio...");

    // Close WebRTC
    if (pc) {
        pc.close();
        pc = null;
    }

    // Close fallback audio
    if (fallbackAudioElement) {
        fallbackAudioElement.pause();
        fallbackAudioElement.remove();
        fallbackAudioElement = null;
    }
    if (mediaSource && mediaSource.readyState === 'open') {
        try { mediaSource.endOfStream(); } catch (e) { }
    }
    mediaSource = null;
    sourceBuffer = null;
    isFallbackActive = false;
    pendingBuffers = [];
    sourceBufferReady = false;
    initReceived = false;
}

// Reset fallback state only (keeps WebRTC intact)
function resetFallbackState() {
    if (fallbackAudioElement) {
        fallbackAudioElement.pause();
        fallbackAudioElement.remove();
        fallbackAudioElement = null;
    }
    if (mediaSource && mediaSource.readyState === 'open') {
        try { mediaSource.endOfStream(); } catch (e) { }
    }
    mediaSource = null;
    sourceBuffer = null;
    isFallbackActive = false;
    pendingBuffers = [];
    sourceBufferReady = false;
    initReceived = false;
}


socket.on('answer', async (data) => {
    log("Received Answer");
    try {
        await pc.setRemoteDescription(new RTCSessionDescription(data));
    } catch (e) {
        log("Error setting remote desc: " + e);
    }
});

// Fallback Binary Audio - MediaSource Extension streaming
let fallbackAudioElement = null;
let mediaSource = null;
let sourceBuffer = null;
let isFallbackActive = false;
let pendingBuffers = [];
let sourceBufferReady = false;
let initReceived = false;

function initMediaSourceFallback() {
    if (mediaSource) return;

    fallbackAudioElement = document.createElement('audio');
    fallbackAudioElement.autoplay = true;
    fallbackAudioElement.controls = true;
    fallbackAudioElement.style.marginTop = '20px';
    fallbackAudioElement.style.width = '100%';

    // Respect current mode
    if (ttsEnabled) fallbackAudioElement.muted = true;

    const container = document.getElementById('tourist-controls');
    if (container) container.appendChild(fallbackAudioElement);

    mediaSource = new MediaSource();
    fallbackAudioElement.src = URL.createObjectURL(mediaSource);

    mediaSource.addEventListener('sourceopen', () => {
        log("MediaSource opened for streaming");

        // Detect supported MIME type - MUST Match Sender Priorities
        const mimeTypes = [
            'audio/webm; codecs=opus',
            'audio/ogg; codecs=opus',
            'audio/webm',
            'audio/mp4; codecs=opus',
            'audio/mp4'
        ];
        let selectedMime = '';

        for (const type of mimeTypes) {
            if (MediaSource.isTypeSupported(type)) {
                selectedMime = type;
                log("[Tourist] Selected MediaSource MIME: " + selectedMime);
                break;
            }
        }

        if (!selectedMime) {
            log("[Error] No supported MediaSource MIME type found!");
            return;
        }

        try {
            sourceBuffer = mediaSource.addSourceBuffer(selectedMime);
            sourceBuffer.mode = 'sequence';
            sourceBufferReady = true;

            sourceBuffer.addEventListener('updateend', flushPendingBuffers);
            sourceBuffer.addEventListener('error', (e) => log("SourceBuffer error: " + e));

            flushPendingBuffers();
            log("SourceBuffer ready for " + selectedMime);
        } catch (e) {
            log("SourceBuffer creation failed: " + e);
            sourceBufferReady = false;
        }
    });

    mediaSource.addEventListener('error', (e) => log("MediaSource error: " + e));
    mediaSource.addEventListener('sourceclose', () => {
        log("MediaSource closed!");
        sourceBufferReady = false;
    });

    fallbackAudioElement.play().catch(e => {
        log("Autoplay blocked: " + e);
        els.touristStatus.textContent = "Tap to enable audio playback";
    });

    document.body.addEventListener('click', () => {
        if (fallbackAudioElement && fallbackAudioElement.paused) {
            fallbackAudioElement.play().catch(() => { });
        }
    }, { once: true });
}

function flushPendingBuffers() {
    if (sourceBuffer) console.log('sourceBuffer.updating:', sourceBuffer.updating);
    if (mediaSource) console.log('mediaSource.readyState:', mediaSource.readyState);
    console.log('sourceBufferReady:', sourceBufferReady);

    if (!sourceBufferReady || !sourceBuffer || sourceBuffer.updating) return;

    // Safety Check: MediaSource must be open
    if (!mediaSource || mediaSource.readyState !== 'open') {
        // log("MediaSource not open (" + (mediaSource ? mediaSource.readyState : 'null') + "), buffering...");
        return;
    }

    if (pendingBuffers.length === 0) return;

    const buffer = pendingBuffers.shift();
    try {
        sourceBuffer.appendBuffer(buffer);
        // Throttle logs for playback to avoid UI freeze
        if (Math.random() < 0.05) log("[Tourist Info] Appending audio buffer (" + buffer.byteLength + " bytes)");
        els.touristStatus.textContent = "Playing Audio (Stream)";
    } catch (e) {
        if (e.name === 'QuotaExceededError') {
            try {
                const buffered = sourceBuffer.buffered;
                if (buffered.length > 0 && buffered.start(0) < buffered.end(0) - 10) {
                    sourceBuffer.remove(buffered.start(0), buffered.end(0) - 5);
                }
            } catch (removeErr) {
                log("Buffer cleanup failed: " + removeErr);
            }
        } else if (e.name === 'InvalidStateError') {
            log("Critical: SourceBuffer invalid state. Resetting fallback...");
            resetFallbackState();
        } else {
            log("AppendBuffer error: " + e);
        }
    }
}

// --- Web Audio API Playback (Low Latency Fallback) ---
async function playAudioChunk(arrayBuffer) {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === 'suspended') {
        try {
            await audioCtx.resume();
        } catch (e) { }
    }

    try {
        const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer.slice(0));
        const source = audioCtx.createBufferSource();
        source.buffer = audioBuffer;
        source.connect(audioCtx.destination);
        source.start(0);
        els.touristStatus.textContent = "재생 중 🔊";
    } catch (e) {
        // console.error(e);
    }
}

function appendToStream(data) {
    const toArrayBuffer = (input) => {
        if (input instanceof ArrayBuffer) return Promise.resolve(input);
        if (input instanceof Blob) return input.arrayBuffer();
        if (input.buffer instanceof ArrayBuffer) return Promise.resolve(input.buffer);
        return Promise.resolve(null);
    };

    toArrayBuffer(data).then(buffer => {
        if (!buffer) return;
        playAudioChunk(buffer);
    });
}

function flushPendingBuffers() { } // Disabled

socket.on('audio_init', (data) => {
    log("Audio Init received (Web Audio Mode - Ignored)");
});

socket.on('audio_chunk', (data) => {
    if (!touristAudioActive) return;
    rxBytes += data.byteLength || data.size || 0;
    updateCounters();

    // Direct feed
    appendToStream(data);
});


// --- Smart Signaling: Handle Late Join / Guide Restart ---
socket.on('guide_ready', () => {
    log("Guide is ready!");
    if (role === 'tourist' && touristAudioActive) {
        els.touristStatus.textContent = "Guide Online. Connecting...";
        // Only start if we don't have an active connection
        if (!pc || pc.connectionState === 'closed' || pc.connectionState === 'failed') {
            log("Starting tourist connection on guide_ready");
            teardownTouristAudio();
            startTouristReceiver();
        }
    }
});

// NOTE: guide_status handler already defined above, this block removed to prevent duplicate
// Transcript Receiver - Works for both Guide and Tourist
// --- Client-Side Translation Logic ---
async function translateClientSide(text, targetLang) {
    if (!text || targetLang === 'original') return text;

    try {
        // Use Google Translate 'gtx' endpoint
        const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${targetLang}&dt=t&q=${encodeURIComponent(text)}`;
        const response = await fetch(url);
        const json = await response.json();

        if (json && json[0]) {
            return json[0].map(item => item[0]).join('');
        }
        return text;
    } catch (e) {
        log("[Translation] Error: " + e);
        return text;
    }
}

// Transcript Receiver - Works for both Guide and Tourist
socket.on('transcript', async (data) => {
    // log("[Android Debug] Transcript received: " + JSON.stringify(data).substring(0, 200));

    // IMPORTANT: If we receive transcript, guide MUST be online and broadcasting
    if (role === 'tourist') {
        const statusEl = document.getElementById('tourist-status');
        if (statusEl && !statusEl.textContent.includes("Broadcasting")) {
            statusEl.textContent = "Guide Broadcasting...";
            statusEl.style.color = "#28a745";
        }
    }

    const touristBox = document.getElementById('transcript-box');
    const guideBox = document.getElementById('guide-transcript-box');
    const langSelect = document.getElementById('lang-select');
    const langInfo = langSelect ? langSelect.value : 'original';
    const ttsBtn = document.getElementById('tts-btn');

    let displayText = data.original;

    // CLIENT-SIDE TRANSLATION LOGIC
    if (role === 'tourist' && langInfo !== 'original' && langInfo !== 'ko') {
        // If server sent translation (cached?), use it. Otherwise fetch.
        if (data.translations && data.translations[langInfo]) {
            displayText = data.translations[langInfo];
        } else {
            // Only translate FINAL results to save API calls and reduce flickering
            if (data.isFinal) {
                displayText = await translateClientSide(data.original, langInfo);
            } else {
                // For interim, show original + indicator? Or just show original.
                // Showing original feels faster.
                displayText = data.original;
            }
        }
    }

    // Function to update a box with "Message Bubble" logic
    const updateBox = (box, text, isFinal) => {
        // Remove old temp segment if exists
        const oldTemp = box.querySelector('#temp-seg');
        if (oldTemp) oldTemp.remove();

        const bubble = document.createElement('div');
        bubble.className = isFinal ? 'message-bubble final' : 'message-bubble interim';
        if (!isFinal) bubble.id = 'temp-seg';

        const timestamp = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });

        bubble.innerHTML = `
            <span class="message-timestamp">${timestamp}</span>
            <div class="message-content highlight-pen">${text}</div>
        `;

        box.appendChild(bubble);
        box.scrollTop = box.scrollHeight;
    };

    if (role === 'tourist' && touristBox) {
        updateBox(touristBox, displayText, data.isFinal);

        if (data.isFinal && ttsEnabled) {
            const utterance = new SpeechSynthesisUtterance(displayText);
            // ... (language logic)
            if (langInfo === 'en') utterance.lang = 'en-US';
            else if (langInfo === 'ja') utterance.lang = 'ja-JP';
            else if (langInfo === 'zh-CN') utterance.lang = 'zh-CN';
            else utterance.lang = 'ko-KR';
            window.speechSynthesis.speak(utterance);
        }
    }

    if (role === 'guide' && guideBox) {
        updateBox(guideBox, data.original, data.isFinal);
    }
});

// TTS Toggle (Moved to DOMContentLoaded above)
// const ttsBtn = document.getElementById('tts-btn'); ... REMOVED

// Background Audio Fix (Wake Lock for Tourist)
// Background Audio Fix (Wake Lock + NoSleep Video for iOS/Android)
async function enableBackgroundMode() {
    // 1. Try Screen Wake Lock (Android/PC)
    try {
        if ('wakeLock' in navigator) {
            await navigator.wakeLock.request('screen');
            log("Screen Wake Lock active (Android/Desktop)");
        }
    } catch (e) {
        log("WakeLock fail: " + e);
    }

    // 2. Play Silent Video (iOS/Safari Hack) - "NoSleep.js" Strategy
    // iOS pauses JS timers when screen locks unless an A/V element is active.
    if (!window.noSleepVideo) {
        const video = document.createElement('video');
        video.setAttribute('playsinline', '');
        video.setAttribute('no-audio', '');
        video.style.display = 'none';

        // Tiny 1s silent WebM or MP4 loop
        video.src = 'data:video/mp4;base64,AAAAIGZ0eXGlc29tAAAAAGlzb21pc28yYXZjMW1wNDEAAAAIZnJlZQAAAs1tZGF0AAACrgYF//+//7fcP8AAAAPbW9vdgAAACxtdmhkAAAAABGjU4ARo1OAAAAAAAAAAQAAAAAAAAAAAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAASdHJhawAAAFx0a2hkAAAAABGjU4ARo1OAAAAAAAAAAQAAAAAAAAAAAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAABAAAAAABIAAAASAAAAAAAACBlZHRzAAAAHGVsc3QAAAAAAAAAAQAAABAAAAAAAAEAAAAAAG1tZGlhAAAAIG1kaGQAAAAAEaNTgBGjU4AAAAAAAAABAAAAAAAAAAAAAVhoZGxyAAAAAAAAAAB2aWRlAAAAAAAAAAAAAAAAVmlkZW9IYW5kbGVyAAAAATNtaW5mAAAAFHZtaGQBMQAAAAEAAAAAAAAAAAAAACRkaW5mAAAAHGRyZWYAAAAAAAAAAQAAAAx1cmwgAAAAAQAAALZzdGJsAAAAenN0c2QAAAAAAAAAAQAAAGhhdmMxAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAAAAEgASAAAAAEABAAAAABqYXZjQwFYgAAb//8AAgAEAOABOAAZ/95/D4gAAAAAHhBFgAAK/8AAAAAY///+AAAMAgAAAB1zdHRzAAAAAAAAAAEAAAAEAAAAAQAAABxzdHNjAAAAAAAAAAEAAAABAAAABAAAAAEAAAAwc3RzegAAAAAAAAAEAAAAQAAAAAQAAABAAAAABAAAAEAAAAAcY29MNAAAAAQAAAAAAAAbdHJha3M=';

        video.loop = true;
        document.body.appendChild(video);

        try {
            await video.play();
            window.noSleepVideo = video;
            log("Background Video Loop Started (iOS Fix)");
        } catch (e) {
            log("Background Video Start Failed (User Interaction needed): " + e);
        }
    }
}

// Hook WakeLock into User Interactions
const playBtn = document.getElementById('play-btn');
if (playBtn) {
    playBtn.addEventListener('click', () => {
        enableBackgroundMode();
    });
}
// Also hook into Guide Broadcast Start
const broadcastBtn = document.getElementById('broadcast-toggle-btn');
if (broadcastBtn) {
    broadcastBtn.addEventListener('click', () => {
        if (!isBroadcasting) enableBackgroundMode(); // Only if starting
    });
}

// --- Guide Admin Functions ---
window.addPlace = async function () {
    const name = document.getElementById('place-name').value;
    const desc = document.getElementById('place-desc').value;
    const status = document.getElementById('admin-status');

    if (!name) {
        status.textContent = "Error: Name is required.";
        status.style.color = "red";
        return;
    }

    status.textContent = "Adding...";
    status.style.color = "yellow";

    try {
        const res = await fetch('/add_place', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: name, description: desc })
        });

        let data;
        try {
            data = await res.json();
        } catch (jsonError) {
            throw new Error(`Server returned non-JSON response: ${res.status}`);
        }

        if (res.ok && data.status === 'success') {
            status.textContent = data.message || "Place added successfully.";
            status.style.color = "#ccff00";
            // Clear inputs
            document.getElementById('place-name').value = "";
            document.getElementById('place-desc').value = "";
            loadPlaces(); // Refresh list
        } else {
            // Handle cases where message might be undefined
            let msg = data.message || data.detail || "Unknown Server Error";
            if (typeof msg === 'object') {
                msg = JSON.stringify(msg);
            }
            status.textContent = "Error: " + msg;
            status.style.color = "red";
        }
    } catch (e) {
        console.error("AddPlace Error:", e);
        status.textContent = "Network/Client Error: " + e.message;
        status.style.color = "red";
    }
};

window.uploadExcel = async function () {
    const fileInput = document.getElementById('excel-file');
    const status = document.getElementById('admin-status');

    if (fileInput.files.length === 0) {
        status.textContent = "Error: Please select a file.";
        status.style.color = "red";
        return;
    }

    const formData = new FormData();
    formData.append('file', fileInput.files[0]);

    status.textContent = "Uploading...";
    status.style.color = "yellow";

    try {
        const res = await fetch('/upload_places', {
            method: 'POST',
            body: formData
        });

        const contentType = res.headers.get("content-type");
        let data;
        if (contentType && contentType.indexOf("application/json") !== -1) {
            data = await res.json();
        } else {
            const text = await res.text();
            throw new Error(`Server Error (${res.status}): ${text.substring(0, 100)}...`);
        }

        if (data.status === 'success') {
            status.textContent = data.message;
            status.style.color = "#ccff00";
            fileInput.value = ""; // Clear file
            loadPlaces(); // Refresh list
        } else {
            let msg = data.message || data.detail || "Unknown Upload Error";
            if (typeof msg === 'object') {
                msg = JSON.stringify(msg);
            }
            status.textContent = "Error: " + msg;
            status.style.color = "red";
        }
    } catch (e) {
        status.textContent = "Upload Failed: " + e.message;
        status.style.color = "red";
    }
};

window.loadPlaces = async function () {
    try {
        const res = await fetch('/places');
        const data = await res.json();
        const container = document.getElementById('places-list');
        if (!container) return;

        container.innerHTML = ""; // Clear

        if (data.places && data.places.length > 0) {
            data.places.forEach(place => {
                const div = document.createElement('div');
                div.className = 'place-item';
                div.style.cssText = "background: #333; padding: 10px; margin-bottom: 8px; border-radius: 5px; cursor: pointer; border: 1px solid #555; display: flex; justify-content: space-between; align-items: center;";

                // Add click event to broadcast
                // Prevent quick double clicks? 
                div.onclick = () => broadcastPlaceInfo(place);

                const info = document.createElement('div');
                info.innerHTML = `<strong style='color: #fff;'>${place.name}</strong><br><span style='color: #aaa; font-size: 0.8rem;'>${place.description ? place.description.substring(0, 30) + '...' : 'No desc'}</span>`;

                const btn = document.createElement('button');
                btn.textContent = "📢 Send";
                btn.style.cssText = "background: #17a2b8; border: none; color: white; padding: 5px 10px; border-radius: 4px; font-size: 0.8rem;";

                div.appendChild(info);
                div.appendChild(btn);
                container.appendChild(div);
            });
        } else {
            container.innerHTML = "<div style='color: #888; font-style: italic;'>No places registered yet.</div>";
        }
    } catch (e) {
        log("Error loading places: " + e);
    }
}

window.broadcastPlaceInfo = function (place) {
    if (!place.description) {
        alert("This place has no description to broadcast.");
        return;
    }

    // Broadcast as functionality (Guide -> Server -> Tourist)
    // Re-use transcript_msg but maybe with a flag or just plain text
    // The server will translate it and send it back as 'final'
    socket.emit('transcript_msg', { text: place.description, source_lang: 'ko', isFinal: true });
    log("Broadcasting info for: " + place.name);

    // Also show locally in Guide's transcript box
    const guideBox = document.getElementById('guide-transcript-box');
    if (guideBox) {
        guideBox.innerHTML = `<span style="color: #17a2b8;">[Info] ${place.name}: ${place.description}</span>`;
    }
}

// Auto-load on start if Guide
// Hook into SelectRole or just expose it
// Better: When opening the Admin Panel or just initially.
// Let's call it when role is selected as guide.
// Auto-load on start if Guide
// (Moved logic into main selectRole function)

// History Functions
window.loadHistory = async function () {
    try {
        const res = await fetch('/history');
        const data = await res.json();
        const container = document.getElementById('history-list');
        if (!container) return;

        container.innerHTML = "";

        if (data.history && data.history.length > 0) {
            data.history.forEach(item => {
                const div = document.createElement('div');
                div.style.cssText = "border-bottom: 1px solid #444; padding: 5px; margin-bottom: 5px;";

                const time = new Date(item.created_at).toLocaleTimeString();
                div.innerHTML = `
                    <div style="color: #888; font-size: 0.7rem;">${time}</div>
                    <div style="color: #fff; margin-top: 2px;">${item.text}</div>
                    <div style="color: #aaa; font-size: 0.8rem; margin-top: 2px;">
                        EN: ${item.translations?.en || '-'}
                    </div>
                `;
                container.appendChild(div);
            });
        } else {
            container.innerHTML = "<div style='color: #888; font-style: italic;'>No history found.</div>";
        }
    } catch (e) {
        log("History Error: " + e);
    }
}

window.downloadHistory = async function () {
    try {
        const res = await fetch('/history');
        const data = await res.json();

        if (!data.history || data.history.length === 0) {
            alert("No history to download.");
            return;
        }

        let txt = "== Mobile Guide Session Log ==\n\n";
        data.history.forEach(item => {
            txt += `[${item.created_at}] ${item.text}\n`;
            if (item.translations) {
                txt += `   (EN): ${item.translations.en || '-'}\n`;
                txt += `   (JP): ${item.translations.ja || '-'}\n`;
                txt += `   (CN): ${item.translations['zh-CN'] || '-'}\n`;
            }
            txt += "----------------------------\n";
        });

        const blob = new Blob([txt], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = "session_history.txt";
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    } catch (e) {
        alert("Download failed: " + e);
    }
}

window.loadRecordings = async function () {
    try {
        const res = await fetch('/api/recordings');
        const data = await res.json();
        const container = document.getElementById('recording-list');
        if (!container) return;

        container.innerHTML = "";

        if (data.files && data.files.length > 0) {
            data.files.forEach(file => {
                const div = document.createElement('div');
                div.style.cssText = "border-bottom: 1px solid #444; padding: 5px; margin-bottom: 5px; display: flex; justify-content: space-between; align-items: center;";

                div.innerHTML = `
                    <span style="color: #ddd; font-size: 0.8rem;">${file}</span>
                    <a href="/recordings/${file}" download style="background: #28a745; color: white; text-decoration: none; padding: 2px 8px; border-radius: 4px; font-size: 0.8rem;">Download</a>
                `;
                container.appendChild(div);
            });
        } else {
            container.innerHTML = "<div style='color: #888; font-style: italic;'>No recordings found.</div>";
        }
    } catch (e) {
        log("Rec Error: " + e);
    }
}


window.summarizeSession = async function () {
    const status = document.getElementById('admin-status') || els.touristStatus;
    if (status) status.textContent = "Generating AI summary...";

    try {
        const res = await fetch('/summarize', { method: 'POST' });
        const data = await res.json();

        if (data.status === 'success') {
            const summaryText = data.summary;
            alert("Session Summary:\n\n" + summaryText);
            if (status) status.textContent = "Summary generated!";
        } else {
            alert("Error: " + (data.message || "Failed to generate summary"));
            if (status) status.textContent = "Summary failed";
        }
    } catch (e) {
        alert("Summary error: " + e);
        if (status) status.textContent = "Error";
    }
}

window.downloadTranscript = async function () {
    try {
        window.location.href = '/download_transcript';
    } catch (e) {
        alert("Download error: " + e);
    }
}

window.clearSession = async function () {
    if (!confirm("Are you sure you want to clear all session transcripts? This cannot be undone.")) {
        return;
    }

    const status = document.getElementById('admin-status');
    if (status) status.textContent = "Clearing session...";

    try {
        const res = await fetch('/clear_session', { method: 'POST' });
        const data = await res.json();

        if (data.status === 'success') {
            alert("Session cleared successfully!");
            if (status) status.textContent = "Session cleared";
            loadHistory();
        } else {
            alert("Error: " + (data.message || "Failed to clear session"));
            if (status) status.textContent = "Clear failed";
        }
    } catch (e) {
        alert("Clear error: " + e);
        if (status) status.textContent = "Error";
    }
}

window.confirmShutdown = async function () {
    if (confirm("Are you sure you want to STOP the server?")) {
        try {
            await fetch('/shutdown', { method: 'POST' });
            alert("Server is shutting down...");
            document.body.innerHTML = "<h1 style='color:white; text-align:center; margin-top:50px;'>Server Stopped</h1>";
        } catch (e) {
            alert("Error stopping: " + e);
        }
    }
}

window.confirmRestart = async function () {
    if (confirm("⚠️ SYSTEM RESTART ⚠️\n\nAre you sure you want to RESTART the server?\nAll current connections will be reset.")) {
        try {
            await fetch('/restart', { method: 'POST' });
            alert("Server is restarting... Please wait 5 seconds and refresh.");
            setTimeout(() => { location.reload(); }, 5000);
        } catch (e) {
            alert("Error restarting: " + e);
        }
    }
}

