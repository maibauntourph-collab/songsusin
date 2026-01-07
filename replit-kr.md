# 모바일 오디오 가이드 시스템 (Mobile Audio Guide System)

## 개요 (Overview)
투어 가이드와 관광객을 위한 실시간 오디오 스트리밍 애플리케이션입니다. 가이드는 실시간 STT(음성 텍스트 변환) 및 번역 기능과 함께 오디오를 방송할 수 있고, 관광객은 오디오 스트림과 번역된 자막을 수신합니다.

## 기술 스택 (Tech Stack)
- **백엔드 (Backend)**: Python (FastAPI, Socket.IO)
- **프론트엔드 (Frontend)**: Vanilla JavaScript (Socket.IO 클라이언트)
- **실시간 통신 (Real-time)**: WebRTC (aiortc) (오디오 스트리밍용)
- **데이터베이스 (Database)**: SQLite (places.db) - 장소 및 대화 내용 저장
- **번역 (Translation)**: deep-translator (다국어 지원)

## 프로젝트 구조 (Project Structure)
- `server.py` - 메인 FastAPI/Socket.IO 서버
- `static/index.html` - 프론트엔드 UI
- `static/app.js` - 프론트엔드 JavaScript 로직
- `places.db` - 장소 및 대화 기록 저장용 SQLite 데이터베이스
- `recordings/` - 녹음된 오디오 파일 저장 디렉토리

## 애플리케이션 실행 (Running the Application)
서버는 5000번 포트에서 실행됩니다:
```bash
python server.py
```

## 주요 기능 (Features)
- **가이드 모드 (Guide Mode)**: 실시간 음성 인식을 통한 오디오 방송, 영어 번역 자막 실시간 확인
- **관광객 모드 (Tourist Mode)**: 오디오 스트림 및 번역된 자막 수신 (영어, 한국어, 일본어, 중국어)
- **장소 등록 (Place Registration)**: 수동 입력 또는 Excel/CSV 업로드를 통한 장소 추가
- **오디오 녹음 (Audio Recording)**: 가이드 세션의 자동 서버 측 녹음
- **대화 기록 (Transcript History)**: 과거 대화 내용 조회 및 내보내기
- **AI 요약 (AI Summarization)**: OpenAI를 사용한 투어 세션 내용 AI 요약
- **세션 관리 (Session Management)**: 대화 로그 다운로드, 세션 데이터 초기화

## API 엔드포인트 (API Endpoints)
- `GET /` - 메인 애플리케이션 페이지
- `POST /add_place` - 새 장소 추가
- `POST /upload_places` - Excel/CSV에서 장소 업로드
- `GET /places` - 등록된 모든 장소 조회
- `GET /history` - 대화 기록 조회
- `GET /export_places` - 장소 목록 엑셀로 내보내기
- `GET /api/recordings` - 오디오 녹음 파일 목록 조회
- `POST /summarize` - 세션 대화 내용 AI 요약 생성
- `GET /download_transcript` - 전체 대화 내용 텍스트 파일 다운로드
- `POST /clear_session` - 모든 세션 대화 내용 삭제

## Socket.IO 이벤트 (Socket.IO Events)
- `join_room` - 가이드 또는 관광객으로 입장
- `offer/answer` - WebRTC 신호 교환 (Signaling)
- `transcript_msg` - STT(음성 텍스트 변환) 메시지
- `audio_chunk` - 바이너리 오디오 스트리밍 (WebM/Opus)
- `audio_init` - 늦게 입장한 관광객을 위한 오디오 초기화 세그먼트
- `request_audio_init` - 서버에 캐시된 초기화 세그먼트 요청
- `reset_audio_session` - 새 방송을 위한 오디오 상태 초기화

## 오디오 스트리밍 아키텍처 (Audio Streaming Architecture)
끊김 없는 오디오 스트리밍을 위해 MSE(MediaSource Extensions) API를 사용합니다:
- 서버는 첫 번째 오디오 청크(WebM 초기화 세그먼트)를 캐시하여 늦게 들어온 관광객에게 제공합니다.
- SourceBuffer를 'sequence' 모드로 설정하여 끊김 없는 재생을 보장합니다.
- 미디어 청크를 추가하기 전에 초기화 세그먼트를 버퍼 큐의 맨 앞에 추가합니다.
- QuotaExceededError 발생 시 자동으로 버퍼를 정리(마지막 5초 유지)합니다.

## 최근 변경 사항 (2026년 1월)
- 오디오 재생 수정: MediaSource Extension 스트리밍 구현
- 늦게 입장한 관광객을 위한 초기화 세그먼트 캐싱 및 정렬 기능 추가
- 한국어 문서 추가 (AUDIO_DEBUG_KR.md 및 replit-kr.md)
