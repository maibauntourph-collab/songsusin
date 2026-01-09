# 🚀 Termux 자동 설치 가이드 (Android)

이 가이드는 안드로이드 폰에서 복잡한 명령어 없이 **한 번에** 모바일 가이드 시스템 서버를 구축하는 방법을 설명합니다.

## 1. Termux 앱 설치
플레이 스토어 버전은 업데이트가 중단되었습니다. 반드시 **F-Droid** 버전을 사용해야 합니다.

1.  핸드폰 브라우저에서 [F-Droid Termux 다운로드](https://f-droid.org/en/packages/com.termux/) 접속.
2.  `Download APK` 버튼을 눌러 설치합니다.
3.  앱을 실행합니다.

## 2. 한방 설치 명령어 (복사 & 붙여넣기)
아래 명령어를 **복사(Copy)** 해서 Termux 화면에 **붙여넣기(Paste)** 하고 엔터(Enter)를 누르세요.

```bash
pkg install -y git && ( [ -d "songsusin" ] || git clone https://github.com/maibauntourph-collab/songsusin.git ) && cd songsusin && git pull && bash setup_termux.sh
```

## 3. 설치 진행 과정
1.  **권한 요청**: 중간에 "Termux가 기기의 사진/미디어에 액세스하도록 허용하시겠습니까?" 팝업이 뜨면 **[허용]**을 누르세요.
2.  **자동 설치**: 약 5~10분 정도 소요됩니다. (화면이 꺼지지 않게 주의해주세요)
3.  **완료**: `✅ Installation Complete!` 메시지가 뜨면 성공입니다.

## 4. 서버 시작하기
설치가 끝난 후, 언제든지 서버를 켜려면 다음 명령어를 입력하세요:

```bash
cd songsusin && python server.py
```

## 5. 서버 종료하기
*   `Ctrl + C`를 누르면 서버가 꺼집니다.
