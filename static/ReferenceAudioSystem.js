// 현재 앱의 문제점 수정 코드

// ============================================
// 1. 송신측 (Guide/Sender) - Recorder Mode
// ============================================

class AudioSender {
    constructor() {
        this.mediaRecorder = null;
        this.audioStream = null;
        this.socket = null;
    }

    async init() {
        // 마이크 권한 요청
        try {
            this.audioStream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: true,
                    sampleRate: 48000
                }
            });
            console.log('✓ Microphone ready');
            return true;
        } catch (error) {
            console.error('✗ Microphone error:', error);
            alert('마이크 권한 필요');
            return false;
        }
    }

    startRecording(websocketUrl) {
        // WebSocket 연결
        this.socket = new WebSocket(websocketUrl);
        this.socket.binaryType = 'arraybuffer';

        this.socket.onopen = () => {
            console.log('✓ Connected to server');
            this.startMediaRecorder();
        };

        this.socket.onerror = (error) => {
            console.error('✗ WebSocket error:', error);
        };

        this.socket.onclose = () => {
            console.log('Disconnected');
        };
    }

    startMediaRecorder() {
        // MIME 타입 확인
        const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
            ? 'audio/webm;codecs=opus'
            : 'audio/webm';

        console.log('Using:', mimeType);

        this.mediaRecorder = new MediaRecorder(this.audioStream, {
            mimeType: mimeType,
            audioBitsPerSecond: 128000
        });

        // 데이터 전송
        this.mediaRecorder.ondataavailable = (event) => {
            if (event.data.size > 0 && this.socket.readyState === WebSocket.OPEN) {
                // Blob을 ArrayBuffer로 변환
                event.data.arrayBuffer().then(buffer => {
                    // 헤더 추가 (MIME 타입 정보)
                    const header = new TextEncoder().encode(mimeType + '\n');
                    const combined = new Uint8Array(header.length + buffer.byteLength);
                    combined.set(header, 0);
                    combined.set(new Uint8Array(buffer), header.length);

                    this.socket.send(combined.buffer);
                    console.log(`Sent: ${buffer.byteLength} bytes`);
                });
            }
        };

        this.mediaRecorder.onstart = () => {
            console.log('✓ Recording started');
        };

        this.mediaRecorder.onerror = (error) => {
            console.error('✗ MediaRecorder error:', error);
        };

        // 500ms마다 전송 (낮은 지연)
        this.mediaRecorder.start(500);
    }

    stop() {
        if (this.mediaRecorder) {
            this.mediaRecorder.stop();
        }
        if (this.audioStream) {
            this.audioStream.getTracks().forEach(track => track.stop());
        }
        if (this.socket) {
            this.socket.close();
        }
        console.log('Stopped');
    }
}

// ============================================
// 2. 수신측 (Tourist/Receiver)
// ============================================

class AudioReceiver {
    constructor() {
        this.audioContext = null;
        this.socket = null;
        this.audioElement = null;
        this.mediaSource = null;
        this.sourceBuffer = null;
        this.queue = [];
        this.isSourceOpen = false;
        this.mimeType = '';
    }

    init() {
        // AudioContext 생성
        this.audioContext = new (window.AudioContext || window.webkitAudioContext)();

        // iOS를 위한 unlock
        if (this.audioContext.state === 'suspended') {
            document.addEventListener('click', () => {
                this.audioContext.resume();
            }, { once: true });
        }

        console.log('✓ AudioContext ready');
    }

    connect(websocketUrl) {
        this.socket = new WebSocket(websocketUrl);
        this.socket.binaryType = 'arraybuffer';

        this.socket.onopen = () => {
            console.log('✓ Connected to server');
            document.getElementById('status').textContent = '연결됨 - 오디오 대기 중...';
        };

        this.socket.onmessage = (event) => {
            this.handleAudioData(event.data);
        };

        this.socket.onerror = (error) => {
            console.error('✗ Connection error:', error);
            document.getElementById('status').textContent = '연결 실패';
        };

        this.socket.onclose = () => {
            console.log('Disconnected');
            document.getElementById('status').textContent = '연결 끊김';
        };
    }

    async handleAudioData(arrayBuffer) {
        try {
            // 헤더에서 MIME 타입 추출
            const data = new Uint8Array(arrayBuffer);
            const headerEnd = data.indexOf(10); // '\n' 찾기

            if (headerEnd !== -1) {
                const headerBytes = data.slice(0, headerEnd);
                const mimeType = new TextDecoder().decode(headerBytes);
                const audioData = data.slice(headerEnd + 1);

                // 처음 받을 때만 MIME 타입 저장
                if (!this.mimeType) {
                    this.mimeType = mimeType;
                    console.log('MIME type:', mimeType);
                }

                // Web Audio API로 직접 재생
                await this.playWithWebAudio(audioData.buffer);
            }
        } catch (error) {
            console.error('✗ Error handling audio:', error);
        }
    }

    async playWithWebAudio(arrayBuffer) {
        try {
            // ArrayBuffer를 AudioBuffer로 디코딩
            const audioBuffer = await this.audioContext.decodeAudioData(arrayBuffer);

            // AudioBufferSourceNode 생성
            const source = this.audioContext.createBufferSource();
            source.buffer = audioBuffer;

            // 출력에 연결
            source.connect(this.audioContext.destination);

            // 재생
            source.start(0);

            console.log('✓ Playing audio chunk');
            document.getElementById('status').textContent = '재생 중 🔊';

            // 재생 완료 후 정리
            source.onended = () => {
                source.disconnect();
            };

        } catch (error) {
            console.error('✗ Playback error:', error);
            // 대안: HTML Audio Element 사용
            this.playWithAudioElement(arrayBuffer);
        }
    }

    playWithAudioElement(arrayBuffer) {
        // Blob 생성
        const blob = new Blob([arrayBuffer], { type: this.mimeType || 'audio/webm' });
        const url = URL.createObjectURL(blob);

        // Audio Element 생성 또는 재사용
        if (!this.audioElement) {
            this.audioElement = new Audio();
            this.audioElement.autoplay = true;
            this.audioElement.onplay = () => {
                console.log('✓ Audio element playing');
                document.getElementById('status').textContent = '재생 중 🔊';
            };
            this.audioElement.onerror = (error) => {
                console.error('✗ Audio element error:', error);
            };
        }

        // URL 설정 및 재생
        this.audioElement.src = url;

        // 재생 완료 후 URL 해제
        this.audioElement.onended = () => {
            URL.revokeObjectURL(url);
        };
    }

    stop() {
        if (this.socket) {
            this.socket.close();
        }
        if (this.audioContext) {
            this.audioContext.close();
        }
        if (this.audioElement) {
            this.audioElement.pause();
            this.audioElement.src = '';
        }
        console.log('Stopped');
    }
}
