import Link from 'next/link';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: '개인정보처리방침 / Privacy Policy — 여백 (Yeobaek)',
  description: '여백(Yeobaek) 서비스의 개인정보처리방침 (Privacy Policy)',
};

export default function PrivacyPage() {
  return (
    <main className="mx-auto max-w-2xl px-6 py-16 text-ink">
      <div className="mb-10 border-b border-hairline pb-6">
        <div className="flex items-center justify-between gap-4">
          <Link
            href="/"
            className="text-xs text-ink-muted transition-colors hover:text-ink"
          >
            ← 여백으로 돌아가기
          </Link>
          <a
            href="#english"
            className="rounded-full border border-hairline px-3 py-1 text-[11px] text-ink-secondary transition-colors hover:border-ink-secondary hover:text-ink"
          >
            English ↓
          </a>
        </div>
        <h1 className="mt-4 font-serif text-2xl font-bold tracking-tight">
          개인정보처리방침
        </h1>
        <p className="mt-2 text-xs text-ink-muted">시행일: 2026년 11월 25일</p>
      </div>

      {/* Korean Version */}
      <article className="space-y-8 text-sm leading-relaxed text-ink-secondary">
        <section className="space-y-2">
          <h2 className="font-serif text-base font-bold text-ink">1. 기본 원칙 (Local-First)</h2>
          <p>
            여백(Yeobaek)은 별도의 개발자 중앙 서버를 운영하지 않는 Local-First 개인 생산성 앱입니다.
            사용자가 작성한 모든 이야기, 메모, 할 일, 일정 데이터는 사용자의 기기 로컬 저장소(IndexedDB)에
            직접 저장되며, 개발자나 제3자 서버로 전송·수집되지 않습니다.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="font-serif text-base font-bold text-ink">
            2. Google 계정 로그인 및 Google Drive API 사용 범위
          </h2>
          <p>
            사용자가 선택적으로 Google Drive 동기화를 연결하는 경우, 앱은 Google OAuth 2.0을 통해 아래의
            최소 권한만 요청합니다.
          </p>
          <ul className="list-disc space-y-1 pl-5">
            <li>
              <code>https://www.googleapis.com/auth/drive.appdata</code>: 사용자 Google Drive 내 앱 전용
              숨김 폴더(<code>appDataFolder</code>)에만 동기화 JSON 파일을 읽고 씁니다. 사용자의 일반
              Google Drive 파일에는 접근하지 않습니다.
            </li>
            <li>
              <code>userinfo.email</code>, <code>userinfo.profile</code>: 앱 설정 화면에 현재 연결된
              계정 이름과 이메일을 표시하기 위해서만 사용합니다.
            </li>
          </ul>
          <p>
            Google API를 통해 접근한 정보는 사용자 본인의 기기 간 데이터 동기화 목적 외에 어떤 용도로도
            사용·공유·판매되지 않으며, Google API Services User Data Policy(Limited Use 요구사항 포함)를
            준수합니다.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="font-serif text-base font-bold text-ink">3. 데이터 보관 및 삭제</h2>
          <p>
            사용자는 언제든지 앱 내에서 로그아웃하여 동기화 연결을 해제할 수 있으며, 기기 로컬 데이터 삭제
            또는 Google 계정 보안 설정에서 여백 앱의 액세스 권한을 철회할 수 있습니다.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="font-serif text-base font-bold text-ink">4. 문의처</h2>
          <p>
            개인정보 처리와 관련한 문의는 개발자 이메일(<code>default_plus@naver.com</code>)로 연락해
            주세요.
          </p>
        </section>
      </article>

      {/* English Version (for Google OAuth Verification & International Users) */}
      <hr className="my-14 border-hairline" />

      <section id="english" className="scroll-mt-10">
        <div className="mb-8">
          <h2 className="font-serif text-2xl font-bold tracking-tight text-ink">
            Privacy Policy
          </h2>
          <p className="mt-2 text-xs text-ink-muted">Effective Date: November 25, 2026</p>
        </div>

        <article className="space-y-8 text-sm leading-relaxed text-ink-secondary">
          <section className="space-y-2">
            <h3 className="font-serif text-base font-bold text-ink">
              1. Local-First Principle &amp; Zero Developer Collection
            </h3>
            <p>
              Yeobaek is a local-first personal productivity application that operates without a
              central developer backend server. All stories, notes, tasks, schedules, and reminders
              you create are stored directly in your device&apos;s local storage (IndexedDB). We do
              not collect, store, track, or sell your personal data on any developer-owned servers.
            </p>
          </section>

          <section className="space-y-2">
            <h3 className="font-serif text-base font-bold text-ink">
              2. Google Sign-In &amp; Google Drive API Usage
            </h3>
            <p>
              If you optionally connect your Google account for cross-device synchronization,
              Yeobaek requests only the minimum required OAuth 2.0 scopes:
            </p>
            <ul className="list-disc space-y-1 pl-5">
              <li>
                <code>https://www.googleapis.com/auth/drive.appdata</code>: Used solely to read and
                write Yeobaek&apos;s own sync JSON files inside your private hidden Google Drive{' '}
                <code>appDataFolder</code>. Yeobaek never accesses, reads, or modifies any other
                files in your Google Drive.
              </li>
              <li>
                <code>userinfo.email</code> and <code>userinfo.profile</code>: Used solely to
                display your signed-in account name and email inside the app&apos;s sync settings.
              </li>
            </ul>
            <p>
              Yeobaek&apos;s use and transfer to any other app of information received from Google
              APIs will adhere to the{' '}
              <a
                href="https://developers.google.com/terms/api-services-user-data-policy"
                target="_blank"
                rel="noopener noreferrer"
                className="underline underline-offset-2 hover:text-ink"
              >
                Google API Services User Data Policy
              </a>
              , including the Limited Use requirements.
            </p>
          </section>

          <section className="space-y-2">
            <h3 className="font-serif text-base font-bold text-ink">
              3. Data Retention &amp; Revocation
            </h3>
            <p>
              You retain full ownership and control of your data. You may sign out of Google Drive
              sync at any time inside Yeobaek, clear local browser/app data on your device, or
              revoke Yeobaek&apos;s access directly from your Google Account security settings.
            </p>
          </section>

          <section className="space-y-2">
            <h3 className="font-serif text-base font-bold text-ink">4. Contact</h3>
            <p>
              For privacy-related questions or requests, please contact{' '}
              <code>default_plus@naver.com</code>.
            </p>
          </section>
        </article>
      </section>
    </main>
  );
}
