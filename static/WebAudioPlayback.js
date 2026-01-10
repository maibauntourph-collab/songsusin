
// New WebAudio API Playback Logic (Bypasses MSE)
async function playAudioChunk(arrayBuffer) {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === 'suspended') await audioCtx.resume();

    try {
        // Decode the Opus audio chunk asynchronously
        const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);

        // Create a buffer source node
        const source = audioContext.createBufferSource();
        source.buffer = audioBuffer;
        source.connect(audioContext.destination);
        source.start(0); // Play immediately

        // Update UI
        els.touristStatus.textContent = "Playing (WebAudio)";

    } catch (e) {
        console.error("Audio Decode Error:", e);
    }
}

// Override existing handlers to use playAudioChunk
function appendToStream(data) {
    const toArrayBuffer = (input) => {
        if (input instanceof ArrayBuffer) return Promise.resolve(input);
        if (input instanceof Blob) return input.arrayBuffer();
        if (input.buffer instanceof ArrayBuffer) return Promise.resolve(input.buffer);
        return Promise.resolve(null);
    };

    toArrayBuffer(data).then(buffer => {
        if (!buffer) return;
        // Direct Playback
        playAudioChunk(buffer);
    });
}
