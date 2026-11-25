# 여백 (Yeobaek)

미니멀·타이포그래피 중심의 Local-First 개인 생산성 앱입니다.  
메모, 할 일, 캘린더, 리마인더를 방해 요소 없는 차분한 글쓰기 경험 속에 통합합니다.

## 주요 기능

- **Story → Entry 계층 구조:** 상단 가로 탭(`일상`, `메모`, `할 일`, `아이디어` 등)과 여백 중심의 에디토리얼 글 목록
- **미니멀 Tiptap 에디터:** 선택 시에만 나타나는 플로팅 버블 메뉴, `- [ ] ` 인라인 체크리스트, `@오늘`/`@내일`/`@YYYY-MM-DD` 날짜 트리거 감지
- **통합 뷰 전환:** 이야기(Stories) · 캘린더(Calendar) · 할 일(To-do, 글 속 인라인 체크리스트 포함)
- **Local-First (Dexie.js / IndexedDB):** 즉각적인 로컬 저장, 오프라인 완전 동작, 로컬 JSON 백업 내보내기/가져오기
- **Google Drive API v3 동기화:** `appDataFolder` + `sync_index.json` 기반 변경분(Diff) 동기화, 수정 후 4초 자동 디바운스, 오프라인 동시 수정 시 `(충돌 사본)` 자동 보존
- **리마인더 · PWA · Windows 데스크탑 앱:** Web Notifications API + 앱 내 토스트 알림, 오프라인 캐시 Service Worker, Electron NSIS 설치 프로그램 및 `electron-updater` 자동 업데이트 지원

## 실행 방법

```bash
npm install
npm run dev
```

## Windows 설치 프로그램 빌드 & 자동 업데이트 릴리즈

### 로컬 빌드
```powershell
$env:CSC_IDENTITY_AUTO_DISCOVERY = "false"
npm run build:installer
```

### GitHub Actions 자동 릴리즈 (추천)
버전 태그(`v*`)를 푸시하면 `.github/workflows/release.yml`이 Windows 설치 파일(`Yeobaek-Setup-<version>.exe`)과 자동 업데이트 메타데이터(`latest.yml`, `.blockmap`)를 자동으로 빌드해 GitHub Releases에 업로드합니다.

```bash
npm version patch
git push origin main --follow-tags
```

> Public 레포지토리에서 `electron-updater`가 GitHub Releases의 최신 버전을 자동으로 감지·다운로드해 앱 재시작 시 적용합니다.

## Google Drive 동기화 설정 (선택)

1. Google Cloud Console에서 **Google Drive API**를 활성화하고 OAuth 2.0 웹 애플리케이션 클라이언트 ID를 발급받습니다.
2. 승인된 JavaScript 원본에 `http://localhost:3000`, `http://localhost:45821` (데스크탑 앱) 및 배포 도메인을 추가합니다.
3. `.env.local`에 `NEXT_PUBLIC_GOOGLE_CLIENT_ID=...`를 설정하거나, 앱 내 우측 상단 구름 아이콘(동기화 설정)에서 직접 입력해 연결합니다.
