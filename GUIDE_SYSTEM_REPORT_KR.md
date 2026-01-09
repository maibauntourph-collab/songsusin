# 모바일 오디오 가이드 시스템 - 테스트 리포트

## 개요
투어 가이드와 관광객 간의 실시간 오디오 스트리밍 및 다국어 번역 시스템입니다.

## 시스템 아키텍처

```
┌─────────────────┐      WebSocket/WebRTC      ┌─────────────────┐
│   가이드 앱     │ ◄──────────────────────────► │     서버        │
│  (Chrome/안드로이드) │                           │  (Python/FastAPI) │
└─────────────────┘                             └────────┬────────┘
                                                         │
                                                         │ Socket.IO
                                                         │ (실시간 이벤트)
                                                         ▼
                                               ┌─────────────────┐
                                               │   관광객 앱     │
                                               │ (iOS/안드로이드/웹) │
                                               └─────────────────┘
```

## 테스트 결과 요약

### 1. 연결 테스트
| 테스트 항목 | 결과 | 비고 |
|------------|------|------|
| Socket.IO 연결 | ✅ 성공 | 자동 재연결 지원 |
| 가이드 역할 선택 | ✅ 성공 | 즉시 방 입장 |
| 관광객 역할 선택 | ✅ 성공 | 가이드 상태 자동 수신 |
| 모니터 대시보드 | ✅ 성공 | 실시간 통계 업데이트 |

### 2. 오디오 스트리밍 테스트
| 테스트 항목 | 결과 | 비고 |
|------------|------|------|
| 마이크 권한 획득 | ✅ 성공 | HTTPS 필수 (모바일) |
| WebSocket 오디오 전송 | ✅ 성공 | 128kbps 비트레이트 |
| MediaSource API 재생 | ✅ 성공 | WebM/Opus 코덱 |
| 늦게 참여한 관광객 동기화 | ✅ 성공 | Init 세그먼트 캐싱 |

### 3. 음성 인식 (STT) 테스트
| 테스트 항목 | 결과 | 비고 |
|------------|------|------|
| 한국어 음성 인식 | ✅ 성공 | Chrome 전용 |
| 중간 결과 표시 | ✅ 성공 | 실시간 텍스트 업데이트 |
| 최종 결과 전송 | ✅ 성공 | 서버로 즉시 전송 |
| STT 자동 재시작 | ✅ 성공 | 1초 딜레이 후 재시작 |

### 4. 번역 테스트
| 테스트 항목 | 결과 | 비고 |
|------------|------|------|
| 100+ 언어 동시 번역 | ✅ 성공 | Google Translate API |
| 번역 지연 시간 | ⚠️ 주의 | 약 2-5초 (언어 수에 따라) |
| 관광객 화면 표시 | ✅ 성공 | 형광펜 스타일 적용 |

### 5. 플랫폼별 호환성
| 플랫폼 | 가이드 모드 | 관광객 모드 | 비고 |
|--------|------------|------------|------|
| Android Chrome | ✅ 지원 | ✅ 지원 | 권장 브라우저 |
| iOS Safari | ❌ 미지원 (STT) | ✅ 지원 | Safari는 Web Speech API 미지원 |
| Desktop Chrome | ✅ 지원 | ✅ 지원 | 개발/테스트용 |
| Desktop Firefox | ⚠️ 부분 | ✅ 지원 | STT 제한적 |

## 주요 기능

### 가이드 기능
- **방송 시작/중지**: 원터치 버튼으로 방송 제어
- **실시간 음성 인식**: 한국어 음성을 텍스트로 자동 변환
- **전송 상태 표시**: TX 카운터로 데이터 전송량 확인
- **장소 등록**: 수동 입력 또는 Excel 업로드
- **세션 관리**: 로그 다운로드, AI 요약, 세션 초기화

### 관광객 기능
- **자동 오디오 수신**: 가이드 방송 시 자동으로 오디오 수신
- **다국어 번역**: 100개 이상 언어로 실시간 자막 표시
- **TTS 음성 안내**: 번역된 텍스트를 음성으로 듣기
- **형광펜 하이라이트**: 현재 번역 중인 텍스트 강조 표시

### 모니터링 기능
- **실시간 대시보드**: `/monitor` 경로에서 접근
- **가이드 상태 표시**: 온라인/방송 중 상태
- **관광객 통계**: 언어별 접속자 수
- **세션 추적**: 개별 관광객 연결 시간

## 알려진 이슈 및 해결 방법

### 이슈 1: "Waiting for Guide" 지속 표시
**원인**: 관광객이 가이드보다 먼저 접속한 경우
**해결**: 
- 가이드 상태 변경 시 모든 관광객에게 자동 알림
- `request_guide_status` 이벤트로 수동 상태 요청

### 이슈 2: 안드로이드에서 형광색 미표시
**원인**: CSS 클래스 누락
**해결**: `highlight-pen` 클래스 명시적 추가

### 이슈 3: STT 중단 현상
**원인**: Chrome의 STT 엔진 타임아웃
**해결**: `onend` 이벤트에서 1초 후 자동 재시작

## 시뮬레이션 실행 방법

1. 서버 시작 확인
```bash
python server.py
```

2. 시뮬레이션 페이지 접속
```
http://localhost:5000/static/simulation.html
```

3. 가이드 프레임에서 "Start Broadcast" 클릭

4. 60명의 가상 관광객이 자동으로 연결됨

## API 엔드포인트

| 엔드포인트 | 메서드 | 설명 |
|-----------|--------|------|
| `/` | GET | 메인 앱 페이지 |
| `/monitor` | GET | 모니터링 대시보드 |
| `/api/monitor` | GET | 연결 통계 JSON |
| `/add_place` | POST | 장소 등록 |
| `/upload_places` | POST | Excel 업로드 |
| `/places` | GET | 장소 목록 |
| `/history` | GET | 자막 이력 |
| `/summarize` | POST | AI 요약 생성 |
| `/download_transcript` | GET | 전체 로그 다운로드 |
| `/clear_session` | POST | 세션 초기화 |

## Socket.IO 이벤트

### 클라이언트 → 서버
| 이벤트 | 데이터 | 설명 |
|--------|--------|------|
| `join_room` | `{role, language}` | 역할 선택 및 방 입장 |
| `start_broadcast` | - | 방송 시작 |
| `stop_broadcast` | - | 방송 중지 |
| `transcript_msg` | `{text, isFinal}` | 음성 인식 결과 |
| `binary_audio` | Binary | 오디오 청크 |
| `update_language` | `{language}` | 언어 변경 |
| `request_guide_status` | - | 가이드 상태 요청 |

### 서버 → 클라이언트
| 이벤트 | 데이터 | 설명 |
|--------|--------|------|
| `guide_status` | `{online, broadcasting}` | 가이드 상태 알림 |
| `transcript` | `{original, translations, isFinal}` | 번역된 자막 |
| `audio_chunk` | Binary | 오디오 데이터 |
| `audio_init` | Binary | 초기화 세그먼트 |
| `monitor_update` | Stats Object | 모니터 통계 |

## 안드로이드 디버깅 가이드

### 안드로이드 → 안드로이드 전송 문제 해결

안드로이드 Chrome에서 가이드 역할 시 다음 사항을 확인하세요:

1. **브라우저 콘솔 로그 확인**
   - `chrome://inspect`로 모바일 디버깅
   - `[Android Debug]` 로 시작하는 로그 확인

2. **필수 확인 로그**
   ```
   [Android Debug] STT Audio Capture Started
   [Android Debug] Speech Detected!
   [Android Debug] STT onresult fired
   [Android Debug] transcript_msg emitted (final)
   ```

3. **문제 발생 시**
   - `STT Error: not-allowed` → 마이크 권한 허용 필요
   - `STT Error: network` → 인터넷 연결 확인
   - `Socket not connected` → 페이지 새로고침

4. **안드로이드 Chrome 설정**
   - 설정 > 사이트 설정 > 마이크 > 허용
   - HTTPS 연결 권장 (HTTP에서는 STT 제한)

### 서버 로그 확인

서버에서 `[TRANSCRIPT]` 로그가 나타나야 합니다:
```
[TRANSCRIPT] Received from xxx: text='안녕하세요...', isFinal=True
[TRANSCRIPT] Emitting to tourists and guides: original='안녕하세요...'
[TRANSCRIPT] Emit complete
```

## 테스트 환경

- **서버**: Python 3.11, FastAPI, Socket.IO
- **데이터베이스**: SQLite
- **번역**: Google Translate (deep-translator)
- **AI 요약**: OpenAI GPT-4o-mini
- **테스트 일시**: 2026년 1월 8일

## 결론

모바일 오디오 가이드 시스템은 다음 조건에서 정상 작동합니다:
1. **가이드**: Android Chrome 권장 (HTTPS 환경)
2. **관광객**: 모든 최신 브라우저 지원
3. **네트워크**: 안정적인 인터넷 연결 필요

시스템은 60명 이상의 동시 접속자를 처리할 수 있으며, 100개 이상의 언어로 실시간 번역을 제공합니다.
