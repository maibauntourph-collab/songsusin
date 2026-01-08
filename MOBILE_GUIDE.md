# 📱 모바일(안드로이드) 및 Replit 실행 가이드

## 0. Replit에서 바로 실행하기 (가장 쉬운 방법)

모바일에서 복잡한 설치 과정 없이 웹 브라우저만으로 서버를 실행하고 싶다면 **Replit**을 사용하는 것이 가장 좋습니다.

1.  **Replit 프로젝트 생성**:
    *   [Replit.com](https://replit.com)에 로그인.
    *   `+ Create Repl` -> **Import from GitHub** 선택.
    *   Git 주소 입력: `https://github.com/maibauntourph-collab/songsusin.git` (또는 본인 주소)
    *   언어는 **Python**이 자동으로 감지됩니다.

2.  **설정 및 실행**:
    *   오른쪽의 **Shell** 탭 클릭.
    *   필수 패키지 설치: `pip install -r requirements.txt`
    *   상단의 초록색 **Run** 버튼 클릭.

3.  **접속**:
    *   실행되면 오른쪽에 작은 브라우저 창(Webview)이 뜹니다.
    *   또는 브라우저 주소창에 다음 주소를 직접 입력해도 됩니다:
        👉 **https://songsusin.replit.app**
    *   해당 주소를 관광객들에게 공유하면, **같은 와이파이에 없어도** 전 세계 어디서든 접속 가능합니다.
    *   (주의: 무료 버전 Replit은 일정 시간 후 서버가 절전 모드로 들어갈 수 있습니다.)

---

## 1. 모바일(Termux)에서 직접 서버 실행하기 (이전 방식)


스마트폰을 **이동식 서버**로 사용할 수 있습니다. 이를 위해서는 안드로이드 전용 터미널 앱인 **Termux**가 필요합니다.

## 1. 앱 설치
구글 플레이 스토어 또는 F-Droid에서 **Termux** 앱을 다운로드하여 설치합니다.

## 2. 코드 다운로드
Termux 앱을 실행하고 아래 명령어를 입력하여 코드를 가져옵니다.
(깃허브 주소를 입력해야 합니다)

```bash
# Git 설치
pkg install git -y

# 코드 복제 (사용자 저장소 주소 사용)
git clone https://github.com/maibauntourph-collab/songsusin.git
cd songsusin
```

## 3. 설치 스크립트 실행
준비된 설치 스크립트를 실행하면 Python과 필요한 라이브러리가 자동으로 설치됩니다.

```bash
chmod +x termux_install.sh
./termux_install.sh
```

## 4. 서버 시작
설치가 완료되면 서버를 켭니다.

```bash
python server.py
```

> **참고**: `termux_install.sh` 스크립트가 업데이트되어 대부분의 에러(Rust, Pydantic 버전 문제 등)를 자동으로 처리합니다. 설치가 잘 진행되었다면 아래 내용은 건너뛰셔도 됩니다.

## 7. Termux 서버 설치 실패 시 수동 해결법

만약 `server.py` 실행 시 에러가 나거나 설치가 멈춘다면, 아래 명령어를 한 줄씩 차례대로 입력하여 수동으로 설치해주세요.

### 1단계: 필수 시스템 패키지 설치
```bash
pkg update -y && pkg upgrade -y
pkg install python rust clang make build-essential libffi openssl -y
```

### 2단계: Python 기본 도구 업데이트
```bash
pip install --upgrade pip setuptools wheel
```

### 3단계: 호환성 라이브러리 설치 (중요)
FastAPI와 최근 라이브러리 간의 충돌을 방지하기 위해 `pydantic` 구버전을 먼저 설치합니다.
```bash
pip install "pydantic<2"
```

### 4단계: 서버 핵심 라이브러리 설치
```bash
pip install fastapi uvicorn python-socketio aiortc deep-translator python-multipart
```

### 5단계: 판다스 (엑셀 기능) 설치 시도
(이 단계는 실패해도 서버는 켜집니다. 실패 시 엑셀 업로드 기능만 제한됩니다.)
```bash
pip install pandas openpyxl
```

설치가 다 되었다면 다시 `python server.py`를 실행해 보세요.

## 8. Termux 대안 (UserLAnd)

Termux 사용이 어렵거나 오류가 계속된다면, 리눅스(Ubuntu) 환경을 더 완벽하게 흉내 내는 **UserLAnd** 앱을 사용해 보세요.

- **장점**: Ubuntu 리눅스를 그대로 사용하므로 패키지 호환성이 좋음.
- **설치 방법**: 별도 가이드 문서인 `USERLAND_SETUP.md`를 참고하세요.
- **간단 요약**:
  1. 플레이 스토어에서 "UserLAnd" 설치
  2. "Ubuntu" 선택 후 SSH 연결
  3. `git clone` 및 `sudo apt install` 사용 가능





## 5. 접속 방법
- **본인 폰(서버)**: 브라우저에서 `http://localhost:5000` 접속
  - "I am Guide" 선택 -> 마이크 허용 -> Start Broadcast
- **손님 폰**:
  - 핫스팟에 연결된 상태에서.
  - 본인 폰(서버)의 IP 주소를 알아야 합니다 (Termux에서 `ifconfig` 입력).
  - 예: `192.168.43.1` (핫스팟 게이트웨이)
  - 손님들은 브라우저에 `http://192.168.43.1:5000`을 입력하여 접속합니다.
  - "I am Tourist" 선택 -> Tap to Enable Audio.

## 6. 안드로이드 오디오 송신 문제 해결 (Troubleshooting)

안드로이드(갤럭시 등)에서 "Start Broadcast"를 눌러도 마이크가 켜지지 않거나 소리가 안 들리는 경우, 아래 설정을 확인해주세요.

### 1) 크롬 브라우저 보안 설정 (필수)
안드로이드 10 이상에서는 `https`가 아닌 `http` (로컬 IP) 접속 시 마이크 권한을 차단합니다. 이를 강제로 허용해야 합니다.

1. 크롬(Chrome) 주소창에 `chrome://flags` 입력
2. 검색창에 `unsafely-treat-insecure-origin-as-secure` 또는 `insecure` 검색
3. **Insecure origins treated as secure** 항목을 `Enabled`로 변경
4. 나타나는 텍스트 박스에 `http://[내_IP]:5000` 입력 (예: `http://192.168.0.5:5000`)
5. 하단의 **Relaunch** 버튼을 눌러 브라우저 재시작

### 2) 전송 모드 변경 (Transmission Mode)
WebRTC 연결이 불안정하여 소리가 끊기거나 안 들리면, **Manual Mode**를 사용하세요.

1. 가이드 화면의 **Admin Panel** (아래쪽) 확인
2. **Transmission Mode** 스위치를 끕니다.
   - 📡 **Automatic** (기본): WebRTC 사용 (지연시간 짧음, 품질 좋음)
   - 📡 **Manual**: WebSocket 사용 (호환성 좋음, 약간의 지연 발생 가능)
3. 관광객 폰에서 새로고침 후 다시 연결합니다.

