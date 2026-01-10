// WebRTC 오디오 스트리밍 개선 코드

class AudioBroadcaster {
    constructor() {
        this.mediaRecorder = null;
        this.audioContext = null;
        this.audioStream = null;
        this.chunks = [];
        this.isRecording = false;
        this.peers = new Map(); // WebRTC peer connections
    }

    // 오디오 스트림 초기화
    async initAudioStream() {
        try {
            // 더 나은 오디오 제약 조건 설정
            const constraints = {
                audio: {
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: true,
                    sampleRate: 48000,
                    channelCount: 1
                },
                video: false
            };

            this.audioStream = await navigator.mediaDevices.getUserMedia(constraints);
            console.log('Audio stream initialized successfully');
            return true;
        } catch (error) {
            console.error('Error initializing audio stream:', error);
            return false;
        }
    }

    // MediaRecorder 시작 (녹음용)
    startRecording() {
        if (!this.audioStream) {
            console.error('Audio stream not initialized');
            return false;
        }

        try {
            // Opus 코덱 우선 시도, 실패시 기본 코덱 사용
            const mimeTypes = [
                'audio/webm;codecs=opus',
                'audio/ogg;codecs=opus',
                'audio/webm',
                'audio/mp4'
            ];

            let selectedMimeType = '';
            for (const mimeType of mimeTypes) {
                if (MediaRecorder.isTypeSupported(mimeType)) {
                    selectedMimeType = mimeType;
                    console.log(`Selected MIME type: ${mimeType}`);
                    break;
                }
            }

            this.mediaRecorder = new MediaRecorder(this.audioStream, {
                mimeType: selectedMimeType,
                audioBitsPerSecond: 128000
            });

            this.chunks = [];

            this.mediaRecorder.ondataavailable = (event) => {
                if (event.data.size > 0) {
                    this.chunks.push(event.data);
                    console.log(`Chunk received: ${event.data.size} bytes`);

                    // 실시간으로 청크 전송 (WebSocket 등을 통해)
                    this.sendAudioChunk(event.data);
                }
            };

            this.mediaRecorder.onstart = () => {
                console.log('Recording started');
                this.isRecording = true;
            };

            this.mediaRecorder.onstop = () => {
                console.log('Recording stopped');
                this.isRecording = false;
                this.processRecording();
            };

            this.mediaRecorder.onerror = (error) => {
                console.error('MediaRecorder error:', error);
            };

            // 1초마다 데이터 청크 생성
            this.mediaRecorder.start(1000);
            return true;
        } catch (error) {
            console.error('Error starting recording:', error);
            return false;
        }
    }

    // 녹음 중지
    stopRecording() {
        if (this.mediaRecorder && this.isRecording) {
            this.mediaRecorder.stop();
        }
    }

    // 녹음 데이터 처리
    processRecording() {
        if (this.chunks.length === 0) {
            console.log('No audio data recorded');
            return;
        }

        const blob = new Blob(this.chunks, { type: this.mediaRecorder.mimeType });
        console.log(`Total recording size: ${blob.size} bytes`);

        // 필요시 서버로 전송
        this.uploadRecording(blob);
    }

    // WebRTC Peer Connection 생성 (양방향 통신용)
    createPeerConnection(peerId) {
        const configuration = {
            iceServers: [
                { urls: 'stun:stun.l.google.com:19302' },
                { urls: 'stun:stun1.l.google.com:19302' }
            ]
        };

        const pc = new RTCPeerConnection(configuration);

        // 로컬 오디오 스트림 추가
        if (this.audioStream) {
            this.audioStream.getTracks().forEach(track => {
                pc.addTrack(track, this.audioStream);
            });
        }

        // 원격 오디오 스트림 수신
        pc.ontrack = (event) => {
            console.log('Received remote track:', event.track.kind);
            this.playRemoteAudio(event.streams[0], peerId);
        };

        // ICE candidate 처리
        pc.onicecandidate = (event) => {
            if (event.candidate) {
                console.log('ICE candidate:', event.candidate);
                // ICE candidate를 시그널링 서버로 전송
                this.sendSignalingMessage(peerId, {
                    type: 'ice-candidate',
                    candidate: event.candidate
                });
            }
        };

        // 연결 상태 모니터링
        pc.onconnectionstatechange = () => {
            console.log(`Connection state: ${pc.connectionState}`);
        };

        this.peers.set(peerId, pc);
        return pc;
    }

    // Offer 생성 (발신자)
    async createOffer(peerId) {
        const pc = this.createPeerConnection(peerId);

        try {
            const offer = await pc.createOffer({
                offerToReceiveAudio: true
            });

            await pc.setLocalDescription(offer);
            console.log('Offer created:', offer);

            // Offer를 시그널링 서버로 전송
            this.sendSignalingMessage(peerId, {
                type: 'offer',
                sdp: offer.sdp
            });

            return offer;
        } catch (error) {
            console.error('Error creating offer:', error);
        }
    }

    // Answer 생성 (수신자)
    async createAnswer(peerId, offer) {
        const pc = this.createPeerConnection(peerId);

        try {
            await pc.setRemoteDescription(new RTCSessionDescription(offer));

            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);
            console.log('Answer created:', answer);

            // Answer를 시그널링 서버로 전송
            this.sendSignalingMessage(peerId, {
                type: 'answer',
                sdp: answer.sdp
            });

            return answer;
        } catch (error) {
            console.error('Error creating answer:', error);
        }
    }

    // 원격 오디오 재생
    playRemoteAudio(stream, peerId) {
        let audio = document.getElementById(`remote-audio-${peerId}`);

        if (!audio) {
            audio = document.createElement('audio');
            audio.id = `remote-audio-${peerId}`;
            audio.autoplay = true;
            audio.controls = false;
            document.body.appendChild(audio);
        }

        audio.srcObject = stream;
        console.log(`Playing remote audio for peer: ${peerId}`);
    }

    // 오디오 청크 전송 (WebSocket 또는 HTTP)
    sendAudioChunk(chunk) {
        // WebSocket 예제
        if (this.websocket && this.websocket.readyState === WebSocket.OPEN) {
            this.websocket.send(chunk);
        }
    }

    // 시그널링 메시지 전송
    sendSignalingMessage(peerId, message) {
        // WebSocket으로 시그널링 서버에 메시지 전송
        if (this.websocket && this.websocket.readyState === WebSocket.OPEN) {
            this.websocket.send(JSON.stringify({
                target: peerId,
                ...message
            }));
        }
    }

    // 녹음 파일 업로드
    async uploadRecording(blob) {
        const formData = new FormData();
        formData.append('audio', blob, 'recording.webm');

        try {
            const response = await fetch('/upload-audio', {
                method: 'POST',
                body: formData
            });

            if (response.ok) {
                console.log('Recording uploaded successfully');
            }
        } catch (error) {
            console.error('Error uploading recording:', error);
        }
    }

    // WebSocket 연결 (시그널링 및 데이터 전송)
    connectWebSocket(url) {
        this.websocket = new WebSocket(url);

        this.websocket.onopen = () => {
            console.log('WebSocket connected');
        };

        this.websocket.onmessage = (event) => {
            try {
                const message = JSON.parse(event.data);
                this.handleSignalingMessage(message);
            } catch (error) {
                // Binary data (audio chunk)
                console.log('Received audio chunk');
            }
        };

        this.websocket.onerror = (error) => {
            console.error('WebSocket error:', error);
        };

        this.websocket.onclose = () => {
            console.log('WebSocket disconnected');
        };
    }

    // 시그널링 메시지 처리
    async handleSignalingMessage(message) {
        const { type, peerId, sdp, candidate } = message;

        switch (type) {
            case 'offer':
                await this.createAnswer(peerId, { type, sdp });
                break;

            case 'answer':
                const pc = this.peers.get(peerId);
                if (pc) {
                    await pc.setRemoteDescription(new RTCSessionDescription({ type, sdp }));
                }
                break;

            case 'ice-candidate':
                const peerConnection = this.peers.get(peerId);
                if (peerConnection && candidate) {
                    await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
                }
                break;
        }
    }

    // 정리
    cleanup() {
        this.stopRecording();

        if (this.audioStream) {
            this.audioStream.getTracks().forEach(track => track.stop());
        }

        this.peers.forEach(pc => pc.close());
        this.peers.clear();

        if (this.websocket) {
            this.websocket.close();
        }

        console.log('Cleanup completed');
    }
}

// 사용 예제
const broadcaster = new AudioBroadcaster();

// 초기화 및 시작
async function startBroadcast() {
    const success = await broadcaster.initAudioStream();
    if (success) {
        broadcaster.startRecording();
        // WebSocket 연결 (실제 서버 주소로 변경)
        // broadcaster.connectWebSocket('ws://192.168.1.88:5000');
    }
}

// 중지
function stopBroadcast() {
    broadcaster.stopRecording();
}

// WebRTC 통화 시작 (양방향)
async function startCall(peerId) {
    await broadcaster.initAudioStream();
    // broadcaster.connectWebSocket('ws://your-signaling-server.com');
    await broadcaster.createOffer(peerId);
}

// Export
if (typeof module !== 'undefined' && module.exports) {
    module.exports = AudioBroadcaster;
}
