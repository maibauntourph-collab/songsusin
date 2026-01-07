# 🐧 UserLAnd (우분투) 설치 및 실행 가이드

이 가이드는 Termux 대신 **UserLAnd** 앱을 사용하여 안드로이드 폰에서 리눅스(Ubuntu) 환경을 구축하고 서버를 실행하는 방법입니다.

## 1. UserLAnd 설치 및 접속

1.  **앱 설치**: 구글 플레이 스토어에서 **UserLAnd** 앱을 설치합니다.
2.  **리눅스 선택**:
    *   앱 실행 -> **Ubuntu** 선택.
    *   권한 허용.
    *   **사용자 이름(Username)** (예: `user`)과 **비밀번호(Password)** (예: `123456`) 설정.
    *   연결 방식은 **SSH** 선택.
3.  **터미널 접속**:
    *   설치가 끝나고 검은 화면(터미널)이 나오면 성공입니다. (`user@localhost:~$` 프롬프트 확인)

## 2. 코드 다운로드 및 설치

UserLAnd 터미널에 다음 명령어를 한 줄씩 입력하세요. (복사/붙여넣기 가능)

```bash
# 1. 업데이트 및 Git 설치
sudo apt update
sudo apt install git -y

# 2. 코드 가져오기
git clone https://github.com/maibauntourph-collab/songsusin.git
cd songsusin

# 3. 전용 설치 스크립트 실행
chmod +x userland_install.sh
./userland_install.sh
```
*참고: 폰 성능에 따라 설치에 5~10분이 걸릴 수 있습니다.*

## 3. 서버 실행

```bash
python3 server.py
```
*   서버가 `http://0.0.0.0:5000` 에서 시작됩니다.

## 4. 접속 방법

1.  **IP 주소 확인**:
    *   터미널에 `ip addr` 입력.
    *   `inet 192.168.x.x` 형식을 찾아서 메모합니다.
2.  **브라우저 접속**:
    *   크롬 브라우저를 켜고 주소창에 `http://192.168.x.x:5000` 입력.

## ⚠️ Termux와 다른 점
*   **명령어**: `python` 대신 **`python3`**, `pip` 대신 **`pip3`**를 주로 사용합니다.
*   **권한**: 시스템 명령어를 쓸 때 앞에 `sudo`를 붙여야 할 수 있습니다. (비밀번호 입력 필요)
*   **백그라운드**: UserLAnd는 상단바에 알림을 띄워 백그라운드에서도 비교적 잘 동작합니다.
