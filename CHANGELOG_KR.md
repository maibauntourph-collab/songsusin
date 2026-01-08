# 모바일 오디오 가이드 시스템 - 진행사항

## 2026년 1월 8일 업데이트

---

### 1. Android STT 문제 해결

#### 문제
- Android Chrome에서 STT가 "Listening for speech..."에서 멈춤
- `onresult` 이벤트가 호출되지 않음
- 음성이 감지되지 않음

#### 원인 분석
- **MediaRecorder가 마이크 독점**: Android Chrome에서 MediaRecorder가 먼저 시작되면 마이크를 독점하여 STT가 오디오를 받지 못함
- 두 API(MediaRecorder + SpeechRecognition)가 동시에 마이크 사용 불가

#### 해결책
```javascript
// Android에서 STT 사용 시 MediaRecorder 건너뛰기
const isAndroidDevice = /Android/i.test(navigator.userAgent);
const sttEnabled = !!SpeechRecognitionAPI && !offlineMode;
const skipRecorderForSTT = isAndroidDevice && sttEnabled;

if (skipRecorderForSTT) {
    log("[Android STT Fix] Skipping MediaRecorder to allow STT to work");
    // WebRTC만 사용하여 오디오 전송
}
```

#### 결과
- Android에서 STT가 정상 작동
- WebRTC로 오디오 전송 유지
- 콘솔에서 `[Android Debug] Speech Detected!` 확인 가능

---

### 2. 오프라인 모드 추가

#### 필요성
- 인터넷 없는 로컬 환경에서 사용 요청
- Web Speech API는 Google 서버 필요 (오프라인 불가)
- 로컬 네트워크에서 오디오만 전송 필요

#### 구현 내용

**자동 감지**
```javascript
function detectOfflineMode() {
    const isLocalIP = /^(192\.168\.|10\.|172\.)/.test(location.hostname);
    const isOffline = !navigator.onLine;
    
    if (isOffline || (isLocalIP && !navigator.onLine)) {
        offlineMode = true;
        return true;
    }
    return false;
}
```

**수동 토글**
- 가이드 Admin 패널에 "Offline/Local Mode" 체크박스 추가
- 체크 시: STT/번역 비활성화, 오디오만 스트리밍
- 해제 시: 정상 모드 (STT + 번역)

**UI 표시**
- STT 상태: "📡 Offline Mode: Audio Only (No STT)"
- 패널 색상 변경으로 모드 구분

#### 동작 방식
| 모드 | STT | 번역 | 오디오 스트리밍 | MediaRecorder |
|------|-----|------|----------------|---------------|
| 온라인 (PC) | O | O | O | O |
| 온라인 (Android) | O | O | O (WebRTC만) | X |
| 오프라인 | X | X | O | O |

---

### 3. 기존 수정 사항 유지

#### 가이드 상태 자동 동기화
- Tourist가 transcript 수신 시 자동으로 "Broadcasting" 표시
- `request_guide_status` 이벤트로 수동 동기화 가능

#### STT 알림 개선
- `alert()` 제거 → 콘솔 로그 + UI 표시로 대체
- 시끄러운 알림 없이 조용한 디버깅

#### Android 디버깅 로그
- `[Android Debug]` 접두어로 디버그 로그 구분
- STT 상태 추적: Audio Start → Speech Detected → onresult

---

### 4. 파일 변경 목록

| 파일 | 변경 내용 |
|------|----------|
| `static/app.js` | Android STT 수정, 오프라인 모드 추가 |
| `static/index.html` | 오프라인 모드 토글 UI 추가 |
| `ANDROID_DEBUG_REPORT_KR.md` | Android 디버깅 리포트 |
| `ANDROID_DEBUG_REPORT_EN.md` | Android 디버깅 리포트 (영문) |
| `BUSINESS_MODEL_KR.md` | 비즈니스 모델 요약 (특허용) |
| `BUSINESS_MODEL_EN.md` | 비즈니스 모델 요약 (영문) |

---

### 5. 테스트 체크리스트

#### Android STT 테스트
- [ ] 가이드 모드 선택
- [ ] 방송 시작 버튼 클릭
- [ ] 콘솔에서 `[Android STT Fix] Skipping MediaRecorder` 확인
- [ ] 말하기 → `[Android Debug] Speech Detected!` 확인
- [ ] 자막이 표시되는지 확인

#### 오프라인 모드 테스트
- [ ] 가이드 Admin에서 "Offline/Local Mode" 체크
- [ ] STT 상태가 "Offline Mode: Audio Only" 표시
- [ ] 방송 시작 → 오디오 스트리밍 확인
- [ ] Tourist에서 오디오 수신 확인

---

### 6. 알려진 제한사항

1. **Android + 오프라인**: 
   - 오프라인 모드에서는 MediaRecorder 사용 (마이크 충돌 없음)
   - STT 불가능하므로 자막 없음

2. **Safari/iOS**: 
   - Web Speech API 미지원
   - 오프라인 모드로만 사용 권장

3. **WebRTC 실패 시**:
   - Android 온라인: STT만 작동, 오디오 스트리밍 불가
   - 해결책: 오프라인 모드 활성화하여 MediaRecorder 사용

---

*마지막 업데이트: 2026년 1월 8일*
