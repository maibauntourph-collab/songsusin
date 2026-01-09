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
let audioMode = 'stt'; // Default to STT mode

window.setAudioMode = function (mode) {
    audioMode = mode;
    log("[Audio Mode] Set to: " + mode);

    const sttStatus = document.getElementById('stt-status');
    if (mode === 'stt') {
        if (sttStatus) sttStatus.textContent = "🎤 STT Mode: Speech-to-text enabled";
    } else {
        if (sttStatus) sttStatus.textContent = "🔊 Recorder Mode: Audio streaming only (No STT)";
    }
}

function detectOfflineMode() {
    // Check if we're in an offline/local environment
    const isLocalIP = /^(192\.168\.|10\.|172\.(1[6-9]|2[0-9]|3[01])\.|localhost|127\.0\.0\.1)/.test(location.hostname);
    const isOffline = !navigator.onLine;

    if (isOffline || (isLocalIP && !navigator.onLine)) {
        offlineMode = true;
        log("[Offline Mode] Detected offline/local environment - STT disabled, audio-only mode");
        return true;
    }
    return false;
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


// Config
const rtcConfig = {
    iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
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
    els.debug.textContent += msg + '\n';
}

// Initial selectRole removed. Use the merged one below.

// --- Guide View Mode Logic ---
window.setGuideViewMode = function (mode) {
    const devSection = document.getElementById('guide-dev-section');
    const simplePlace = document.getElementById('simple-place-input');
    const btnSimple = document.getElementById('btn-mode-simple');
    const btnDev = document.getElementById('btn-mode-dev');

    if (mode === 'simple') {
        if (devSection) devSection.classList.add('hidden');
        if (simplePlace) simplePlace.classList.remove('hidden');

        // Button Styles
        if (btnSimple) btnSimple.style.background = "#007bff"; // Active Blue
        if (btnDev) btnDev.style.background = "#6c757d"; // Inactive Gray
    } else {
        if (devSection) devSection.classList.remove('hidden');
        // We keep simple-place-input visible or hide it? 
        // User said "all things" in dev mode. 
        // But dev mode includes everything in the dev-section.
        // Let's keep the simple-place-input visible in Simple, 
        // and in Dev mode, the Dev section HAS its own Manual Entry (extracted?), 
        // wait, I removed the Manual Entry from Dev section in HTML?
        // No, I kept it? Let's check HTML.
        // Actually I moved 'Manual Entry' to 'Simple Place Input'. 
        // So in Dev mode, we should STILL see 'Simple Place Input' because that's the only way to add places now.
        // So simplePlace stays visible in both.

        // Button Styles
        if (btnSimple) btnSimple.style.background = "#6c757d";
        if (btnDev) btnDev.style.background = "#007bff";
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
                        // Specific Google constraints can cause OverconstrainedError on some Androids
                        // googEchoCancellation: true, 
                        // googAutoGainControl: true,
                        // googNoiseSuppression: true,
                        // googHighpassFilter: true
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
            if (sttStatus) sttStatus.textContent = "🔊 Recorder Mode: Audio streaming (No STT)";
            updateGuideTranscriptUI("🔊 Recorder Mode - Audio streaming without transcription", false);
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
                log("STT Engine: Ended (Will Auto-restart)");
                if (isBroadcasting) {
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
        // - STT Mode: Try to use BOTH WebRTC + MediaRecorder (Hybrid) for robustness
        // - Recorder Mode: MediaRecorder only (No STT)
        // - Offline Mode: MediaRecorder only (No STT)

        const forceRecorder = audioMode === 'recorder' || offlineMode;

        // HYBRID MODE: Even in STT mode, we try to start MediaRecorder for WebSocket fallback
        // This fixes the "STT works but no sound" issue if WebRTC fails on LAN.
        // Android might block two mics, so we wrap in try-catch.
        const enableHybridAudio = true;

        if (useWebRTC) {
            els.guideStatus.textContent = "Broadcasting (WebRTC)...";
            createPeerConnection();
            localStream.getTracks().forEach(track => pc.addTrack(track, localStream));

            const offer = await pc.createOffer();
            await pc.setLocalDescription(offer);

            log("Gathering ICE candidates...");
            await waitForICEGathering(pc);
            socket.emit('offer', { sdp: pc.localDescription.sdp, type: pc.localDescription.type, role: 'guide' });

            // ALWAYS try to set up fallback recorder (Hybrid)
            try {
                if (forceRecorder || enableHybridAudio) {
                    setupFallbackRecorder(localStream);
                    if (audioMode === 'stt' && !offlineMode) {
                        els.guideStatus.textContent = "Broadcasting (Hybrid: WebRTC + STT + WS)";
                        log("[Hybrid] Attempting to run MediaRecorder alongside STT");
                    } else {
                        els.guideStatus.textContent = "Broadcasting (WebRTC + Recorder)";
                    }
                }
            } catch (e) {
                log("[Hybrid] MediaRecorder failed (likely Mic conflict with STT): " + e);
                // If hybrid failed, we rely on WebRTC only
                els.guideStatus.textContent = "Broadcasting (WebRTC + STT)";
            }

        } else {
            // WebSocket-only mode
            els.guideStatus.textContent = "Broadcasting (WebSocket)...";
            // Must use recorder here
            setupFallbackRecorder(localStream);

            if (audioMode === 'stt' && !offlineMode) {
                log("[STT Mode] WebSocket Only - Audio + STT");
                els.guideStatus.textContent = "Broadcasting (WebSocket + STT)";
            } else {
                els.guideStatus.textContent = "Broadcasting (Recorder Mode - Audio Only)";
                updateGuideTranscriptUI("🚫 STT Disabled (Recorder Mode)", true);
            }
        }
    } catch (err) {
        log("Error starting broadcast: " + err);
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
        'audio/webm;codecs=opus',
        'audio/webm',
        'audio/ogg;codecs=opus',
        'audio/mp4',
        'audio/aac'
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
        const recorder = new MediaRecorder(stream, options);
        log("MediaRecorder created successfully. Actual mimeType: " + recorder.mimeType);

        recorder.ondataavailable = e => {
            if (e.data.size > 0) {
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
                log("Recorder produced empty data (size=0)");
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

        // Try 50ms for ultra-low latency
        recorder.start(50);
        log("Fallback Audio (WebSocket) Setup OK");

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
    } else {
        els.touristCtrl.classList.remove('hidden');
        initAudioContext();
        touristAudioActive = true;
        els.touristStatus.textContent = "Waiting for Guide...";
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

        try {
            sourceBuffer = mediaSource.addSourceBuffer('audio/webm; codecs=opus');
            sourceBuffer.mode = 'sequence';
            sourceBufferReady = true;

            sourceBuffer.addEventListener('updateend', flushPendingBuffers);
            sourceBuffer.addEventListener('error', (e) => log("SourceBuffer error: " + e));

            flushPendingBuffers();
            log("SourceBuffer ready for audio/webm; codecs=opus");
        } catch (e) {
            log("SourceBuffer creation failed: " + e);
            sourceBufferReady = false;
        }
    });

    mediaSource.addEventListener('error', (e) => log("MediaSource error: " + e));

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
    if (!sourceBufferReady || !sourceBuffer || sourceBuffer.updating) return;
    if (!initReceived) {
        return;
    }
    if (pendingBuffers.length === 0) return;

    const buffer = pendingBuffers.shift();
    try {
        sourceBuffer.appendBuffer(buffer);
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
        } else {
            log("AppendBuffer error: " + e);
        }
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

        pendingBuffers.push(buffer);

        if (pendingBuffers.length > 50) {
            pendingBuffers = pendingBuffers.slice(-30);
            log("Buffer overflow, trimmed to 30");
        }

        flushPendingBuffers();
    });
}

socket.on('audio_init', (data) => {
    // Ignore audio if tourist has stopped listening
    if (!touristAudioActive) return;

    log("Received audio init segment from server");

    const toArrayBuffer = (input) => {
        if (input instanceof ArrayBuffer) return Promise.resolve(input);
        if (input instanceof Blob) return input.arrayBuffer();
        if (input.buffer instanceof ArrayBuffer) return Promise.resolve(input.buffer);
        return Promise.resolve(null);
    };

    toArrayBuffer(data).then(buffer => {
        if (!buffer) return;

        pendingBuffers.unshift(buffer);
        initReceived = true;
        log("Init segment prepended, " + pendingBuffers.length + " buffers queued");
        flushPendingBuffers();
    });
});

socket.on('audio_chunk', (data) => {
    // Ignore audio if tourist has stopped listening
    if (!touristAudioActive) return;

    rxBytes += data.byteLength || data.size || 0;
    updateCounters();

    if (!isFallbackActive) {
        isFallbackActive = true;
        els.touristStatus.textContent = "Buffering audio...";
        log("Starting MediaSource fallback stream");
        initMediaSourceFallback();
        socket.emit('request_audio_init');
    }

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
async function enableBackgroundMode() {
    try {
        if ('wakeLock' in navigator) {
            await navigator.wakeLock.request('screen');
            log("Tourist Screen Wake Lock active");
        }
    } catch (e) {
        log("WakeLock fail: " + e);
    }
}

// Hook WakeLock into Tourist Start
const origStart = window.startTouristReceiver; // Assuming it's reachable or we hook into selectRole
// Actually best to hook into initAudioContext or play button
const playBtn = document.getElementById('play-btn');
if (playBtn) {
    playBtn.addEventListener('click', () => {
        enableBackgroundMode();
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
const origSelectRole = window.selectRole;
window.selectRole = function (r) {
    origSelectRole(r);
    if (r === 'guide') {
        setTimeout(loadPlaces, 500); // Load after UI switches
    }
}

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

