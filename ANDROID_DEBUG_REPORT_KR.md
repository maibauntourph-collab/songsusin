# 안드로이드 → 안드로이드 전송 문제 디버깅 리포트

## 작성일: 2026년 1월 8일

---

## 발견된 문제점

### 1. 가이드 상태 표시 오류
**증상**: 관광객이 텍스트(번역)를 수신하면서도 가이드 상태가 "Offline"으로 표시됨

**원인**: `guide_status` 이벤트가 `transcript` 이벤트보다 먼저 도착하지 않거나 누락됨

**해결책**: 
- `transcript` 수신 시 가이드 상태를 자동으로 "Broadcasting"으로 업데이트
- 텍스트가 오면 당연히 가이드가 방송 중인 것이므로 상태 동기화

### 2. 안드로이드 STT(음성인식) 미작동
**증상**: 
- iOS → Android: 정상 작동
- Android → Android: 텍스트 번역 안됨, 오디오만 전송됨

**원인**: 
- Android Chrome에서 MediaRecorder(오디오 녹음)와 SpeechRecognition(음성인식)이 마이크를 동시에 사용할 때 충돌 발생
- STT 시작 타이밍이 MediaRecorder와 겹쳐서 음성인식이 실패

**해결책**:
- 안드로이드에서 STT 시작을 1초 지연
- 첫 시도 실패 시 2초 후 자동 재시도
- STT 상태 표시 UI 추가로 작동 여부 확인 가능

### 3. 알림창(Alert) 과다
**증상**: 방송 시작할 때마다 시끄러운 알림창이 뜸

**원인**: HTTPS 경고, 브라우저 미지원 경고 등을 `alert()`로 표시

**해결책**:
- 알림창 제거
- 로그에만 기록하거나 UI에 조용히 표시

---

## 적용된 수정 사항

### 코드 변경 (app.js)

#### 1. 가이드 상태 자동 수정
```javascript
socket.on('transcript', (data) => {
    // 텍스트 수신 시 가이드 상태 자동 업데이트
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

#### 2. 안드로이드 STT 지연 시작
```javascript
// 안드로이드에서 마이크 충돌 방지를 위해 지연
const isAndroid = /Android/i.test(navigator.userAgent);
const sttStartDelay = isAndroid ? 1000 : 100;

setTimeout(() => {
    try {
        recognition.start();
    } catch (e) {
        // 안드로이드에서 재시도
        if (isAndroid) {
            setTimeout(() => {
                try { recognition.start(); } catch (e2) { }
            }, 2000);
        }
    }
}, sttStartDelay);
```

#### 3. STT 상태 표시 UI
```html
<div id="stt-status">🎤 STT: Waiting to start...</div>
```

#### 4. 알림창 제거
```javascript
// Before: alert(msg);
// After: 로그에만 기록, UI에 표시
log(msg);
const sttStatus = document.getElementById('stt-status');
if (sttStatus) sttStatus.textContent = "⚠️ STT: Not Supported";
```

---

## 디버깅 방법

### 안드로이드 가이드 폰 확인사항

1. **Chrome 콘솔 로그 확인**
   - `chrome://inspect`로 모바일 디버깅
   - `[Android Debug]` 로 시작하는 로그 확인

2. **필수 로그 메시지**
   ```
   [Android Debug] STT Audio Capture Started
   [Android Debug] Speech Detected!
   [Android Debug] STT onresult fired
   [Android Debug] transcript_msg emitted (final)
   ```

3. **STT 상태 확인**
   - UI에서 `🎤 STT: Active` 표시 확인
   - `🎤 Listening for speech...` 메시지 확인

### 서버 로그 확인

```
[TRANSCRIPT] RAW data received from xxx: {...}
[TRANSCRIPT] Processed: text='안녕하세요...'
[TRANSCRIPT] Emitting to tourists and guides
```

---

## 테스트 체크리스트

- [ ] 안드로이드 가이드에서 "Start Broadcast" 클릭
- [ ] STT 상태가 "Active"로 변경되는지 확인
- [ ] 말하면 검정색 박스에 텍스트가 나타나는지 확인
- [ ] 관광객 폰에서 번역된 텍스트가 나타나는지 확인
- [ ] 관광객 폰에서 가이드 상태가 "Broadcasting"으로 표시되는지 확인
- [ ] 알림창 없이 조용하게 시작되는지 확인

---

## 관련 파일

- `static/app.js` - 프론트엔드 로직
- `static/index.html` - UI 템플릿
- `server.py` - 백엔드 서버

## 참고

Chrome on Android 설정:
- 설정 > 사이트 설정 > 마이크 > 허용
- HTTPS 연결 권장 (HTTP에서는 STT 제한될 수 있음)
