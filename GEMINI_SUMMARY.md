# Project Status Summary (Gemini Generated)

## 📌 Project: Mobile Audio Guide System

### 1. Overview (개요)
실시간 1:N (가이드 1명, 관광객 60명) 오디오 스트리밍 웹 애플리케이션입니다. Python(FastAPI) 백엔드와 WebRTC 기술을 활용하여 별도 앱 설치 없이 모바일 브라우저만으로 작동합니다.

### 2. Core Features (핵심 기능)
- **Real-time Audio**: 가이드의 음성을 2초 이내의 낮은 지연시간으로 다수에게 송출.
- **Speech-to-Text (STT)**: 가이드의 음성을 실시간으로 텍스트로 변환하여 화면에 표시.
- **Translation**: STT 텍스트를 다국어(영어, 일본어, 중국어)로 자동 번역.
- **Session History**: 모든 대화 내용을 데이터베이스에 저장하고 텍스트 파일로 다운로드 가능.
- **Server Recording**: 가이드의 음성을 서버에서 자동으로 녹음(.wav)하고 다운로드 제공.
- **Server Control**: 웹 UI 상단 툴바에서 리프레시, 방송 시작, 서버 원격 종료 가능.

### 3. Mobile Execution (모바일 구동)
- 안드로이드 **Termux** 환경을 지원하여, PC 없이 스마트폰 자체를 서버로 활용 가능.
- 핫스팟 환경에서 완전 무선 로컬 네트워크 가이드 시스템 구축 가능.

### 4. Tech Stack (기술 스택)
- **Backend**: Python FastAPI, Socket.IO, AIORTC (WebRTC)
- **Frontend**: HTML5, Vanilla JS, Web Audio API
- **Database**: SQLite (장소 정보 및 히스토리 저장)

### 5. Change Log (진행 이력)

#### 2026-01-06
- **Mobile Support**: 안드로이드(Termux) 설치 스크립트(`termux_install.sh`) 및 모바일 구동 가이드(`MOBILE_GUIDE.md`) 작성.
- **Server Control**: 웹 UI 상단에 제어 툴바(새로고침, 재실행, 방송시작, 서버종료) 추가.
- **Remote Shutdown/Restart**: `/shutdown` 및 `/restart` API 구현.
- **Recording**: 서버 측 오디오 스트림 자동 녹음(`wav`) 및 다운로드 기능 구현.
- **Session History**: STT 대화 내용 DB 저장 및 조회/다운로드 기능 구현.
- **Docs**: `user_guide.md` 최신화 (한글 매뉴얼 업데이트).

---
*Last Updated: 2026-01-06 (via Gemini)*
