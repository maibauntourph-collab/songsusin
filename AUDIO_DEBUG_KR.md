# 모바일 오디오 가이드 시스템 - 오디오 문제 분석

## 문제 현상
- 텍스트 자막은 정상적으로 전달됨
- 가이드의 음성이 관광객에게 들리지 않음

## 원인 분석

### 1. WebRTC ICE 연결 실패 (주요 원인)
클라우드 환경(Replit)에서는 TURN 서버가 없어 WebRTC P2P 연결이 실패합니다.

**로그 증거:**
```
ICE connection state is failed
ICE connection state is closed
```

서버가 클라우드에 있고 클라이언트가 로컬 네트워크(192.168.x.x)에 있어서 직접 연결이 불가능합니다.

### 2. WebSocket 폴백 오디오 재생 오류
WebRTC 실패 시 WebSocket으로 오디오를 전송하지만, 기존 코드에서 오디오 포맷 처리가 잘못되었습니다.

**브라우저 오류:**
```
NotSupportedError: Failed to load because no supported source was found
```

**문제점:** 
- MediaRecorder가 생성한 WebM/Opus 청크를 단순 Blob으로 합쳐서 재생 시도
- WebM 컨테이너는 초기화 헤더가 필요한데, 청크만으로는 재생 불가

### 3. 해결 방법
MediaSource Extensions (MSE) API를 사용하여 스트리밍 방식으로 오디오 재생:

```javascript
// MediaSource API로 실시간 스트리밍 재생
const mediaSource = new MediaSource();
audio.src = URL.createObjectURL(mediaSource);

mediaSource.addEventListener('sourceopen', () => {
    const sourceBuffer = mediaSource.addSourceBuffer('audio/webm; codecs=opus');
    // 청크를 순차적으로 추가
    sourceBuffer.appendBuffer(chunk);
});
```

## 시스템 동작 흐름

```
[가이드 브라우저]
    │
    ├── MediaRecorder (audio/webm;codecs=opus)
    │       │
    │       └── socket.emit('binary_audio', chunk)
    │
    ▼
[서버 (Replit)]
    │
    ├── WebRTC 시도 → ICE 실패 (TURN 없음)
    │
    └── WebSocket 폴백
            │
            └── socket.emit('audio_chunk', data)
    │
    ▼
[관광객 브라우저]
    │
    ├── MediaSource API
    │       │
    │       └── SourceBuffer.appendBuffer(chunk)
    │
    └── Audio 재생
```

## 테스트 방법

### 가이드 테스트
1. 웹사이트 접속
2. "I am Guide" 선택
3. "Start Broadcast" 클릭
4. 마이크 권한 허용
5. 말하면 텍스트가 표시되는지 확인

### 관광객 테스트
1. 다른 기기/브라우저로 접속
2. "I am Tourist" 선택
3. 자막이 표시되는지 확인
4. 오디오 컨트롤이 나타나는지 확인
5. 소리가 들리는지 확인

## 브라우저 호환성

| 브라우저 | 음성인식 (STT) | 오디오 재생 | MediaSource |
|---------|---------------|------------|-------------|
| Chrome (PC) | O | O | O |
| Chrome (Android) | O | O | O |
| Safari (iPhone) | X | O | 제한적 |
| Firefox | X | O | O |

**참고:** 
- 가이드는 Chrome 브라우저 사용 권장 (음성인식 지원)
- 관광객은 모든 최신 브라우저에서 오디오 수신 가능

## 알려진 제한사항

1. **TURN 서버 필요**: 프로덕션 환경에서 안정적인 WebRTC 연결을 위해 TURN 서버 구축 필요
2. **iOS Safari 제한**: MediaSource API 지원이 제한적
3. **자동재생 정책**: 사용자 상호작용 없이 자동 재생 불가 (터치/클릭 필요)

## 수정 내역

### 2026-01-06
- 서버에서 오디오 초기화 세그먼트 캐시 기능 추가
- 관광객이 중간 접속 시 초기화 세그먼트 먼저 수신
- 가이드 방송 시작 시 오디오 세션 리셋 기능 추가
- 오디오 큐 방식으로 순차 재생 구현
- 자동재생 차단 시 사용자 안내 메시지 추가

## 오디오 재생 코드 설명

MediaSource Extensions (MSE) API를 사용하여 연속 스트리밍 재생:

```javascript
// MediaSource 초기화
const mediaSource = new MediaSource();
audio.src = URL.createObjectURL(mediaSource);

mediaSource.addEventListener('sourceopen', () => {
    // SourceBuffer 생성 - 단일 디코더 유지
    sourceBuffer = mediaSource.addSourceBuffer('audio/webm; codecs=opus');
    sourceBuffer.mode = 'sequence'; // 순차 재생 모드
    
    // 청크 추가 완료 시 다음 청크 처리
    sourceBuffer.addEventListener('updateend', flushPendingBuffers);
});

// 청크를 SourceBuffer에 연속 추가
function appendToStream(data) {
    pendingBuffers.push(data);
    flushPendingBuffers();
}

// 버퍼 오버플로우 시 오래된 데이터 정리
if (e.name === 'QuotaExceededError') {
    sourceBuffer.remove(start, end - 5); // 최근 5초 유지
}
```

이 방식의 장점:
- 단일 디코더를 유지하여 끊김 없는 연속 재생
- 청크를 순차적으로 추가하여 실시간 스트리밍
- 버퍼 관리로 메모리 누수 방지
