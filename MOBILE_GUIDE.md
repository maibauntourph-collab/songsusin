# 📱 모바일(안드로이드)에서 서버 실행하기

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
-에러시
--FastAPI 버전 고정 + Rust 설치
처음 
  pkg update && pkg upgrade
  pkg install python rust clang make
  pip install --upgrade pip setuptools wheel
두번째
  pip install "pydantic<2"
  pip install fastapi uvicorn 



## 5. 접속 방법
- **본인 폰(서버)**: 브라우저에서 `http://localhost:5000` 접속
  - "I am Guide" 선택 -> 마이크 허용 -> Start Broadcast
- **손님 폰**:
  - 핫스팟에 연결된 상태에서.
  - 본인 폰(서버)의 IP 주소를 알아야 합니다 (Termux에서 `ifconfig` 입력).
  - 예: `192.168.43.1` (핫스팟 게이트웨이)
  - 손님들은 브라우저에 `http://192.168.43.1:5000`을 입력하여 접속합니다.
  - "I am Tourist" 선택 -> Tap to Enable Audio.
