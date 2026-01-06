# Audio Capture Loop Fix / 오디오 캡처 루프 수정

## Problem / 문제

### English
The application was experiencing an infinite reconnection loop with repeated "audio capture" and ICE connection failures. This caused:
- Continuous WebRTC connection attempts that always failed
- Server logs flooded with "ICE failed" and "requested reconnect" messages
- High CPU usage and resource waste
- Poor user experience with constant reconnection attempts

### 한국어
애플리케이션에서 무한 재연결 루프가 발생하여 "audio capture" 및 ICE 연결 실패가 반복되었습니다. 이로 인해:
- 항상 실패하는 WebRTC 연결 시도가 계속됨
- 서버 로그에 "ICE failed" 및 "requested reconnect" 메시지가 넘침
- 높은 CPU 사용량 및 리소스 낭비
- 지속적인 재연결 시도로 인한 사용자 경험 저하

---

## Root Cause / 근본 원인

### English
1. **Automatic WebRTC Start**: When a tourist selected their role, WebRTC connection was automatically initiated
2. **NAT/Firewall Issues**: WebRTC ICE connections fail in cloud environments (Replit) due to NAT traversal limitations
3. **Auto-Reconnect Loop**: When ICE connection failed, the code automatically requested reconnection
4. **No Manual Control**: Users had no way to stop the reconnection loop

### 한국어
1. **자동 WebRTC 시작**: 관광객이 역할을 선택하면 WebRTC 연결이 자동으로 시작됨
2. **NAT/방화벽 문제**: 클라우드 환경(Replit)에서 NAT 통과 제한으로 인해 WebRTC ICE 연결이 실패함
3. **자동 재연결 루프**: ICE 연결이 실패하면 코드가 자동으로 재연결을 요청함
4. **수동 제어 없음**: 사용자가 재연결 루프를 중지할 방법이 없었음

---

## Solution / 해결책

### English
1. **Manual Start/Stop Buttons**: Added "Start Audio" and "Stop Audio" buttons for tourist control
2. **Auto-Detect Toggle**: Added an option checkbox to enable/disable automatic reconnection
3. **Default Off**: Auto-detect is OFF by default - no automatic reconnection loops
4. **WebSocket Fallback**: When WebRTC fails, the system uses WebSocket audio streaming instead

### 한국어
1. **수동 시작/중지 버튼**: 관광객 제어를 위한 "Start Audio" 및 "Stop Audio" 버튼 추가
2. **자동 감지 토글**: 자동 재연결을 활성화/비활성화하는 옵션 체크박스 추가
3. **기본값 OFF**: 자동 감지가 기본적으로 OFF - 자동 재연결 루프 없음
4. **WebSocket 폴백**: WebRTC가 실패하면 시스템이 WebSocket 오디오 스트리밍을 대신 사용

---

## How to Use / 사용 방법

### English
1. Select "Tourist Mode"
2. Press **"Start Audio"** button to begin listening
3. Press **"Stop Audio"** button to stop
4. (Optional) Enable **"Auto-detect"** checkbox if you want automatic reconnection when connection is lost

### 한국어
1. "Tourist Mode" 선택
2. **"Start Audio"** 버튼을 눌러 청취 시작
3. **"Stop Audio"** 버튼을 눌러 중지
4. (선택사항) 연결이 끊어졌을 때 자동 재연결을 원하면 **"Auto-detect"** 체크박스 활성화

---

## Technical Details / 기술적 세부사항

### English
- WebRTC is attempted first for lowest latency
- If WebRTC ICE connection fails (common in cloud environments), WebSocket fallback is used
- WebSocket streaming uses MediaSource Extensions (MSE) API for continuous playback
- Audio is transmitted as WebM/Opus chunks every 50ms
- Init segment is cached on server for late-joining tourists

### 한국어
- 최저 지연을 위해 WebRTC를 먼저 시도
- WebRTC ICE 연결이 실패하면 (클라우드 환경에서 일반적), WebSocket 폴백 사용
- WebSocket 스트리밍은 연속 재생을 위해 MediaSource Extensions (MSE) API 사용
- 오디오는 50ms마다 WebM/Opus 청크로 전송됨
- 늦게 참여하는 관광객을 위해 Init 세그먼트가 서버에 캐시됨

---

## Files Changed / 변경된 파일

| File | Changes |
|------|---------|
| `static/index.html` | Added Start/Stop buttons and Auto-detect toggle |
| `static/app.js` | Removed auto-start, added manual control functions, conditional reconnect logic |

---

## Date / 날짜
January 2026

