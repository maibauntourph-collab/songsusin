const socket = io();
let role = null;
let pc = null;
let localStream = null;
let audioCtx = null;
let isBroadcasting = false;
let animationId = null;
let recognition = null;

// Audio Visualizer Logic
function setupAudioAnalysis(stream, meterId) {
    try {
        if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        if (audioCtx.state === 'suspended') audioCtx.resume();

        const analyser = audioCtx.createAnalyser();
        analyser.fftSize = 256;
        const source = audioCtx.createMediaStreamSource(stream);
        source.connect(analyser);

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

// --- Audio Context Handling (Tourist) ---
function initAudioContext() {
    try {
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        audioCtx = new AudioContext();
        log("AudioContext State: " + audioCtx.state);
        updatePlayButton();

        audioCtx.onstatechange = () => {
            log("AudioContext State Change: " + audioCtx.state);
            updatePlayButton();
        };

    } catch (e) {
        log("Web Audio API not supported: " + e);
        els.touristStatus.textContent = "Error: Web Audio Not Supported";
    }
}

function updatePlayButton() {
    const btn = document.getElementById('play-btn');
    if (!audioCtx) return;

    if (audioCtx.state === 'running') {
        btn.textContent = "Audio Active (Tap to Test)";
        btn.style.background = "#6c757d"; // Grey out
        // Optional: Hide it, or keep it for manual resume if needed
        btn.style.display = 'none';
    } else {
        btn.style.display = 'block';
        btn.textContent = "Tap to Enable Audio";
        btn.style.background = "#28a745";
    }
}

function resumeAudioContext() {
    if (!audioCtx) { initAudioContext(); }

    if (audioCtx && audioCtx.state !== 'running') {
        audioCtx.resume().then(() => {
            log("AudioContext Resumed by User");
            updatePlayButton();
        }).catch(e => {
            log("Resume failed: " + e);
            document.getElementById('play-btn').textContent = "Retry Audio";
        });
    } else {
        log("AudioContext already running");
        updatePlayButton();
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
        };

        playBtn.addEventListener('click', handleInteraction);
        playBtn.addEventListener('touchstart', handleInteraction);
    }
});

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
window.startBroadcast = async function () {
    log("Start Broadcast clicked");
    try {
        if (isBroadcasting) return;
        isBroadcasting = true;

        // UI Updates
        els.guideStatus.textContent = "Initializing...";
        els.guideStatus.classList.remove('status-error');

        // Wake Lock (Keep screen on)
        try {
            if ('wakeLock' in navigator) {
                await navigator.wakeLock.request('screen');
                log("Screen Wake Lock active");
            }
        } catch (err) {
            log("Wake Lock error: " + err);
        }

        // Get User Media (Enhanced Audio with Safe Constraints)
        try {
            const audioConstraints = {
                echoCancellation: true,
                noiseSuppression: true,
                autoGainControl: true,
                // latency: 0.02, // TOO AGGRESSIVE for some Androids, causing silence
                // Chrome specific
                googEchoCancellation: true,
                googAutoGainControl: true,
                googNoiseSuppression: true,
                googHighpassFilter: true
            };

            localStream = await navigator.mediaDevices.getUserMedia({
                audio: audioConstraints,
                video: false
            });
            log("Microphone access granted");
        } catch (e) {
            log("Microphone access denied: " + e);
            els.guideStatus.textContent = "Error: Microphone Denied";
            els.guideStatus.classList.add('status-error');
            isBroadcasting = false;
            return;
        }

        // HTTPS Check for Mobile
        if (location.protocol !== 'https:' && location.hostname !== 'localhost' && location.hostname !== '127.0.0.1') {
            const msg = "⚠️ STT usually requires HTTPS on mobile. Text might not appear via HTTP IP.";
            log(msg);
            alert(msg);
        }

        // STT (Speech to Text) - Guide Side
        if (!('webkitSpeechRecognition' in window)) {
            alert("⚠️ Warning: This browser does not support AI Speech Recognition.\n\nGuide functionality requires Google Chrome (Android/PC).\niPhone (Safari) is NOT supported for STT.");
            log("STT Not Supported on this browser");
        } else {
            if (recognition) {
                // Prevent multiple instances
                try { recognition.stop(); } catch (e) { }
            }
            recognition = new webkitSpeechRecognition();
            recognition.continuous = true;
            recognition.interimResults = true;
            recognition.lang = 'ko-KR'; // Guide speaks Korean

            // Deep Debugging for STT
            recognition.onstart = () => {
                log("STT Engine: Started");
                updateGuideTranscriptUI("🎤 Listening...", false);
            };
            recognition.onaudiostart = () => log("STT Engine: Audio Detected");
            recognition.onspeechstart = () => log("STT Engine: Speech Detected");
            recognition.onnomatch = () => log("STT Engine: No Match");
            recognition.onerror = (e) => {
                log("STT Error: " + e.error);
                if (e.error === 'not-allowed') {
                    alert("STT Permission Denied. Check settings.");
                    els.guideStatus.textContent = "Error: STT Blocked";
                    els.guideStatus.classList.add('status-error');
                } else if (e.error === 'network') {
                    els.guideStatus.textContent = "Error: STT Network Issue";
                }
            };
            recognition.onend = () => {
                log("STT Engine: Ended (Will Auto-restart)");
                if (isBroadcasting) {
                    try { recognition.start(); } catch (e) { log("STT Restart Fail: " + e); }
                }
            };

            recognition.onresult = (event) => {
                let interim = '';
                let final = '';

                for (let i = event.resultIndex; i < event.results.length; ++i) {
                    if (event.results[i].isFinal) {
                        final += event.results[i][0].transcript;
                    } else {
                        interim += event.results[i][0].transcript;
                    }
                }

                // Handle Final Result (Translate & Save)
                if (final) {
                    socket.emit('transcript_msg', { text: final, source_lang: 'ko', isFinal: true });
                    log("STT Final: " + final);

                    // Local UI (Final)
                    updateGuideTranscriptUI(final, true);
                }

                // Handle Interim Result (Real-time feedback)
                if (interim) {
                    socket.emit('transcript_msg', { text: interim, source_lang: 'ko', isFinal: false });
                    // Local UI (Interim)
                    updateGuideTranscriptUI(interim, false);
                }
            };
            try {
                recognition.start();
                log("STT Init Command Sent");
            } catch (e) {
                log("STT Start Error: " + e);
            }
        }

        // Helper for Guide UI
        function updateGuideTranscriptUI(text, isFinal) {
            const guideBox = document.getElementById('guide-transcript-box');
            if (!guideBox) return;

            if (isFinal) {
                // Append final text
                // Create a new line or span? For simplicity, we just replace or append.
                // Re-using the box logic:
                guideBox.innerHTML = `<span style="color: #ccff00; text-shadow: 0 0 5px #ccff00;">${text}</span>`;
            } else {
                // Show interim text in different color (e.g. White or Orange)
                guideBox.innerHTML = `<span style="color: #fff;">${text}</span>`;
            }
        }
        // Initialize WebRTC
        els.guideStatus.textContent = "Broadcasting (WebRTC)...";
        document.querySelector('#guide-controls .btn-guide').classList.add('hidden');
        document.querySelector('#guide-controls .btn-stop').classList.remove('hidden');

        // Initialize WebRTC
        createPeerConnection();
        localStream.getTracks().forEach(track => pc.addTrack(track, localStream));

        // Setup Visualizer for Guide
        setupAudioAnalysis(localStream, 'guide-meter');

        // Create Offer
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);

        log("Gathering ICE candidates...");
        await waitForICEGathering(pc);
        log("ICE Gathering Complete");

        socket.emit('offer', { sdp: pc.localDescription.sdp, type: pc.localDescription.type, role: 'guide' });
        // Fallback: Recorder
        setupFallbackRecorder(localStream);

    } catch (err) {
        log("Error starting broadcast: " + err);
    }
}

window.stopBroadcast = function () {
    log("Stop Broadcast clicked");
    isBroadcasting = false;

    if (pc) pc.close();
    if (localStream) localStream.getTracks().forEach(track => track.stop());

    location.reload();
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

function getSupportedMimeType() {
    const types = [
        'audio/webm;codecs=opus',
        'audio/webm',
        'audio/ogg',
        'audio/mp4',
        'audio/aac'
    ];
    for (const type of types) {
        if (MediaRecorder.isTypeSupported(type)) {
            log("Selected MIME: " + type);
            return type;
        }
    }
    return null;
}

function setupFallbackRecorder(stream) {
    // Fallback: Send audio via WebSocket
    let options = {};
    const mimeType = getSupportedMimeType();

    if (mimeType) {
        options = { mimeType: mimeType };
    } else {
    }

    try {
        const recorder = new MediaRecorder(stream, options);

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
    log("Server acknowledged reconnect request. Restarting WebRTC...");
    // Force a role re-selection or re-init
    if (role === 'tourist') {
        startTouristReceiver(); // Try to get offer again
    }
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
            log("WebRTC Unstable (" + pc.iceConnectionState + "). Attempting Reconnect...");
            els.touristStatus.textContent = "Connection Lost. Reconnecting...";
            if (role === 'tourist') socket.emit('request_reconnect');
        } else if (pc.iceConnectionState === 'connected') {
            log("ICE Connected!");
            if (role === 'tourist' && els.touristStatus.textContent.includes("Waiting")) {
                els.touristStatus.textContent = "Connected. Waiting for audio...";
            }
        }
    };

    pc.ontrack = (event) => {
        log("Track received! ID: " + event.track.id + " Kind: " + event.track.kind);
        els.touristStatus.textContent = "Receiving Audio Stream...";
        const stream = event.streams[0];
        const audio = new Audio();
        audio.srcObject = stream;
        audio.autoplay = true;
        audio.playsInline = true;
        audio.controls = true; // Show controls to allow manual play if needed
        audio.style.marginTop = "20px";
        document.body.appendChild(audio);

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
    }
} // End createPeerConnection

// --- Signaling ---
socket.on('connect', () => {
    log("Socket.IO Connected");
    els.touristStatus.textContent = "Connected to Server";
    els.guideStatus.style.color = ""; // Reset color
    document.body.style.borderTop = "5px solid #28a745"; // Visual connection indicator
    if (role) {

        // Re-join if we were already there (Reconnect logic)
        socket.emit('join_room', { role: role });
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
    if (role === 'guide') {
        els.guideCtrl.classList.remove('hidden');
    } else {
        els.touristCtrl.classList.remove('hidden');
        initAudioContext();
        // Tourist immediate logic
        startTouristReceiver();
    }
    socket.emit('join_room', { role: role });
}

socket.on('answer', async (data) => {
    log("Received Answer");
    try {
        await pc.setRemoteDescription(new RTCSessionDescription(data));
    } catch (e) {
        log("Error setting remote desc: " + e);
    }
});

// Fallback Binary Audio from Server - Using Audio Buffering
let audioChunks = [];
let fallbackAudioElement = null;
let fallbackMediaSource = null;
let fallbackSourceBuffer = null;
let isFallbackActive = false;
let chunkBuffer = [];
let lastChunkTime = 0;

function initFallbackAudio() {
    if (fallbackAudioElement) return;
    
    fallbackAudioElement = document.createElement('audio');
    fallbackAudioElement.autoplay = true;
    fallbackAudioElement.controls = true;
    fallbackAudioElement.style.marginTop = '20px';
    fallbackAudioElement.style.width = '100%';
    document.getElementById('tourist-controls').appendChild(fallbackAudioElement);
    
    log("Fallback audio element created");
}

function playBufferedAudio() {
    if (chunkBuffer.length === 0) return;
    
    const combinedBlob = new Blob(chunkBuffer, { type: 'audio/webm;codecs=opus' });
    chunkBuffer = [];
    
    const url = URL.createObjectURL(combinedBlob);
    
    if (fallbackAudioElement) {
        URL.revokeObjectURL(fallbackAudioElement.src);
    }
    
    initFallbackAudio();
    fallbackAudioElement.src = url;
    fallbackAudioElement.play().then(() => {
        els.touristStatus.textContent = "Playing Audio (WebSocket)";
        log("Playing buffered audio");
    }).catch(e => {
        log("Fallback play error: " + e);
        els.touristStatus.textContent = "Tap to enable audio";
    });
}

socket.on('audio_chunk', (data) => {
    rxBytes += data.byteLength || data.size || 0;
    updateCounters();
    
    if (!isFallbackActive) {
        isFallbackActive = true;
        els.touristStatus.textContent = "Receiving audio (WebSocket)...";
        log("Fallback audio stream started");
    }
    
    chunkBuffer.push(data);
    
    const now = Date.now();
    if (now - lastChunkTime > 500 && chunkBuffer.length > 5) {
        lastChunkTime = now;
        playBufferedAudio();
    }
    
    if (chunkBuffer.length > 100) {
        log("Buffer overflow, playing...");
        playBufferedAudio();
    }
});


// --- Smart Signaling: Handle Late Join / Guide Restart ---
socket.on('guide_ready', () => {
    log("Guide is ready! Negotiating connection...");
    els.touristStatus.textContent = "Guide Online. Connecting...";
    if (role === 'tourist') {
        startTouristReceiver(); // Re-negotiate (or start fresh) to get the track
    }
});

socket.on('guide_status', (data) => {
    log("Guide Status Received: " + (data.online ? "Online" : "Offline"));
    if (!data.online) {
        els.touristStatus.textContent = "Waiting for Guide to start...";
    } else {
        els.touristStatus.textContent = "Guide Found! Connecting...";
    }
});
// Transcript Receiver - Works for both Guide and Tourist
socket.on('transcript', (data) => {
    const touristBox = document.getElementById('transcript-box');
    const guideBox = document.getElementById('guide-transcript-box');
    const langSelect = document.getElementById('lang-select');
    const langInfo = langSelect ? langSelect.value : 'original';
    const ttsBtn = document.getElementById('tts-btn');

    let displayText = data.original;

    if (data.isFinal && langInfo !== 'original' && data.translations && data.translations[langInfo]) {
        displayText = data.translations[langInfo];
    }

    if (role === 'tourist' && touristBox) {
        if (data.isFinal) {
            touristBox.innerHTML = `<div style="margin-bottom: 10px; color: #ccff00; text-shadow: 0 0 5px #ccff00; font-weight: bold;">${displayText}</div>`;
            
            if (ttsBtn && ttsBtn.textContent.includes("ON")) {
                const utterance = new SpeechSynthesisUtterance(displayText);
                if (langInfo === 'en') utterance.lang = 'en-US';
                else if (langInfo === 'ja') utterance.lang = 'ja-JP';
                else if (langInfo === 'zh-CN') utterance.lang = 'zh-CN';
                else utterance.lang = 'ko-KR';
                window.speechSynthesis.speak(utterance);
            }
        } else {
            touristBox.innerHTML = `<div style="color: #fff; font-style: italic;">${displayText}</div>`;
        }
        touristBox.scrollTop = touristBox.scrollHeight;
    }
    
    if (role === 'guide' && guideBox) {
        if (data.isFinal) {
            guideBox.innerHTML = `<div style="color: #ccff00; font-weight: bold;">${data.original}</div>`;
            if (data.translations && data.translations['en']) {
                guideBox.innerHTML += `<div style="color: #aaa; font-size: 0.9em; margin-top: 5px;">EN: ${data.translations['en']}</div>`;
            }
        } else {
            guideBox.innerHTML = `<div style="color: #fff; font-style: italic;">${data.original}</div>`;
        }
    }
});

// TTS Toggle
const ttsBtn = document.getElementById('tts-btn');
if (ttsBtn) {
    ttsBtn.onclick = () => {
        if (ttsBtn.textContent.includes("OFF")) {
            ttsBtn.textContent = "Sound: ON";
            ttsBtn.style.background = "#28a745";
        } else {
            ttsBtn.textContent = "Sound: OFF";
            ttsBtn.style.background = "#444";
            window.speechSynthesis.cancel();
        }
    };
}

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
                txt += `   (EN): ${item.translations.en}\n`;
                txt += `   (JP): ${item.translations.ja}\n`;
                txt += `   (CN): ${item.translations['zh-CN']}\n`;
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

