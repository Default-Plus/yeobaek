# 여백 (Yeobaek)

미니멀·타이포그래피 중심의 Local-First 개인 생산성 앱입니다.  
메모, 할 일, 캘린더, 리마인더를 방해 요소 없는 차분한 글쓰기 경험 속에 통합합니다.

> **Yeobaek** is an open-source, local-first minimalist writing and personal productivity app (notes, tasks, calendar, and reminders) built with Next.js, Electron, and Capacitor, with optional client-side Google Drive (`appDataFolder`) synchronization.

## 주요 기능

- **Story → Entry 계층 구조:** 상단 가로 탭(`일상`, `메모`, `할 일`, `아이디어` 등)과 여백 중심의 에디토리얼 글 목록
- **미니멀 Tiptap 에디터:** 선택 시에만 나타나는 플로팅 버블 메뉴, `- [ ] ` 인라인 체크리스트, `@오늘`/`@내일`/`@YYYY-MM-DD` 날짜 트리거 감지
- **통합 뷰 전환:** 이야기(Stories) · 캘린더(Calendar) · 할 일(To-do, 글 속 인라인 체크리스트 포함)
- **Local-First (Dexie.js / IndexedDB):** 즉각적인 로컬 저장, 오프라인 완전 동작, 로컬 JSON 백업 내보내기/가져오기
- **Google Drive API v3 동기화:** 원클릭 Google 계정 로그인(웹/데스크탑 GIS + 모바일 시스템 브라우저 OAuth 2.0 PKCE), `appDataFolder` + `sync_index.json` 기반 변경분(Diff) 동기화, 수정 후 4초 자동 디바운스, 오프라인 동시 수정 시 `(충돌 사본)` 자동 보존
- **멀티 플랫폼 배포:** 웹/PWA · Windows 설치 프로그램(`.exe`, `electron-updater` 자동 업데이트) · Android(`.apk`, Capacitor) · iOS(`ios/` Xcode 프로젝트, 네이티브 예약 알림)

## 실행 방법

```bash
npm install
npm run dev
```

## 데스크탑 & 모바일 빌드 · 자동 릴리즈

### GitHub Actions 통합 자동 릴리즈 (Windows `.exe` + Android `.apk`)
버전 태그(`v*`)를 푸시하면 `.github/workflows/release.yml`이 **Windows 설치 파일(`Yeobaek-Setup-<version>.exe`)**과 **Android 설치 파일(`Yeobaek-v<version>-android.apk`)**을 자동으로 빌드해 GitHub Releases에 함께 업로드합니다.

```bash
npm version patch
git push origin main --follow-tags
```

### 모바일 로컬 동기화 (Capacitor)
```bash
npm run mobile:sync     # 정적 빌드(out/) 후 android/·ios/ 동기화
npx cap open android    # Android Studio 열기
npx cap open ios        # Xcode 열기 (macOS)
```

## Google 계정 로그인 & Drive 동기화 설정

1. [Google Cloud Console](https://console.cloud.google.com/)에서 **Google Drive API**를 활성화하고 OAuth 동의 화면(`.../auth/drive.appdata`)을 설정합니다.
2. OAuth 2.0 클라이언트 ID를 발급합니다:
   - **웹 / Windows `.exe`용 (웹 애플리케이션):** 승인된 JavaScript 원본에 `http://localhost:3000`, `http://localhost:45821`, 배포 도메인 추가
   - **Android / iOS용 (모바일 PKCE):** 리디렉션 URI 스킴 `app.defaultplus.yeobaek:/oauth2redirect` 사용
3. 로컬은 `.env.local`, 자동 릴리즈는 GitHub **Settings → Secrets → Actions**에 아래 값을 등록합니다:
   - `NEXT_PUBLIC_GOOGLE_CLIENT_ID`
   - `NEXT_PUBLIC_GOOGLE_ANDROID_CLIENT_ID` (선택)
   - `NEXT_PUBLIC_GOOGLE_IOS_CLIENT_ID` (선택)

## Code Signing & License

- **License:** [MIT License](./LICENSE)
- **Code Signing Policy:** See [CODE_SIGNING_POLICY.md](./CODE_SIGNING_POLICY.md). All official release builds are produced automatically from public source code via GitHub Actions.
