# Real-time Mobile Guide Audio System

1 Guide (가이드) - 60 Tourists (관광객) 실시간 오디오 중계 시스템입니다.
Python FastAPI 및 WebRTC (aiortc)를 사용하여 구현되었습니다.

## 1. 설치 (Setup)

**필수 요구사항:**
- Python 3.9 이상
- Windows (현재 환경), Mac, Linux 모두 지원

```bash
# 의존성 설치
cd mobile-guide-system
pip install -r requirements.txt
```

## 2. 서버 실행 (Run Server)

```bash
python server.py
```
서버가 `http://0.0.0.0:5000` 에서 시작됩니다.

### 🌐 온라인 데모 (Live Demo)
별도 설치 없이 아래 링크에서 바로 테스트할 수 있습니다:
👉 **https://songsusin.replit.app**


## 3. 모바일 접속 방법 (Mobile Connection)

WebRTC는 **HTTPS** 또는 **Localhost** 환경에서만 마이크 권한을 허용합니다.
모바일 기기에서 접속하려면 **ngrok** 등을 사용하여 로컬 서버를 외부로 노출해야 합니다.

### ngrok 사용법:
1. [ngrok 다운로드](https://ngrok.com/download) 및 설치.
2. 터미널에서 다음 명령어 실행:
   ```bash
   ngrok http 5000
   ```
3. 생성된 `https://xxxx-xxxx.ngrok-free.app` 주소를 모바일 브라우저(Chrome/Safari)에서 엽니다.

## 4. 사용 방법 (Usage)

1. **가이드 (Guide)**:
   - 스마트폰 A에서 URL 접속 -> **"I am Guide"** 선택.
   - 마이크 권한 허용.
   - **"Start Broadcast"** 버튼 클릭.
   - "Broadcasting..." 상태 확인.

2. **관광객 (Tourist)**:
   - 스마트폰 B, C... 에서 URL 접속 -> **"I am Tourist"** 선택.
   - **"Tap to Enable Audio"** 버튼을 눌러 청취 시작 (브라우저 자동재생 정책).
   - 가이드의 목소리가 들리는지 확인.

## 5. 문제 해결 (Troubleshooting)

- **소리가 안 들릴 때**:
  - 볼륨을 확인하세요.
  - Tourist 화면에서 "Tap to Enable Audio"를 꼭 눌러야 합니다 (AudioContext 활성화).
  - ngrok 무료 버전은 속도 제한이 있을 수 있습니다.
- **연결 실패**:
  - `server.py`가 실행 중인지 확인하세요.
  - 같은 와이파이 내라면 PC의 IP 주소 `https://192.168.x.x:5000` (SSL 인증서 필요) 또는 ngrok을 권장합니다.

## 6. 주요 기능 (Features)

### 📜 Session History (세션 히스토리 분석)
- 가이드가 말하는 모든 내용은 **텍스트(STT)**로 자동 변환되어 데이터베이스에 저장됩니다.
- 다국어 번역 결과도 함께 저장됩니다.
- **Guide Admin Panel** 하단에서 언제든지 로그를 조회하고 텍스트 파일로 다운로드할 수 있습니다.

### 🎙️ Audio Recording (서버 녹음)
- 가이드가 방송을 시작하면 서버에서 자동으로 **오디오 스트림을 녹음**(`recordings/` 폴더)합니다.
- 방송 종료 후 웹 화면에서 바로 녹음 파일을 다운로드할 수 있습니다.

### 🛑 Server Control (서버 제어)
- **상단 툴바**: 화면 최상단에 고정된 툴바를 통해 서버를 제어할 수 있습니다.
    - **🔄 Refresh**: 화면을 새로고침하여 최신 상태를 불러옵니다.
    - **🛑 Stop Server**: 서버 프로세스를 원격으로 **안전하게 종료**합니다. (모든 연결이 끊어집니다)

