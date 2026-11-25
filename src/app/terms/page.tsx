import Link from 'next/link';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: '서비스 약관 / Terms of Service — 여백 (Yeobaek)',
  description: '여백(Yeobaek) 서비스 이용 약관 (Terms of Service)',
};

export default function TermsPage() {
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
        <h1 className="mt-4 font-serif text-2xl font-bold tracking-tight">서비스 약관</h1>
        <p className="mt-2 text-xs text-ink-muted">시행일: 2026년 11월 25일</p>
      </div>

      {/* Korean Version */}
      <article className="space-y-8 text-sm leading-relaxed text-ink-secondary">
        <section className="space-y-2">
          <h2 className="font-serif text-base font-bold text-ink">1. 서비스 개요</h2>
          <p>
            여백(Yeobaek)은 개인의 메모, 할 일, 일정, 리마인더를 로컬 우선 방식으로 기록·관리하고,
            사용자 선택에 따라 본인 소유의 Google Drive와 동기화할 수 있는 무료 생산성 소프트웨어입니다.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="font-serif text-base font-bold text-ink">2. 데이터 소유권 및 백업 책임</h2>
          <p>
            사용자가 작성한 모든 콘텐츠의 소유권은 전적으로 사용자에게 있습니다. 여백은 중앙 서버에
            데이터를 보관하지 않으므로, 중요한 기록은 Google Drive 동기화 또는 앱 내 JSON 백업 기능을
            통해 주기적으로 백업하는 것을 권장합니다.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="font-serif text-base font-bold text-ink">
            3. 서비스 변경·중단 및 면책 조항
          </h2>
          <p>
            개발자는 운영상·기술상 필요에 따라 사전 고지 없이 서비스의 일부 또는 전부를 변경하거나
            중단할 수 있습니다.
          </p>
          <p>
            본 소프트웨어는 &ldquo;있는 그대로(AS IS)&rdquo; 제공되며, 기기 오류, 브라우저 캐시 삭제,
            외부 API 정책 변경, 네트워크 장애 등 불가항력적 사유로 발생한 데이터 손실이나 서비스
            중단에 대해 법령이 허용하는 범위 내에서 책임을 지지 않습니다.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="font-serif text-base font-bold text-ink">4. 문의처</h2>
          <p>
            약관 및 서비스 이용 관련 문의는 <code>default_plus@naver.com</code>으로 연락해 주세요.
          </p>
        </section>
      </article>

      {/* English Version */}
      <hr className="my-14 border-hairline" />

      <section id="english" className="scroll-mt-10">
        <div className="mb-8">
          <h2 className="font-serif text-2xl font-bold tracking-tight text-ink">
            Terms of Service
          </h2>
          <p className="mt-2 text-xs text-ink-muted">Effective Date: November 25, 2026</p>
        </div>

        <article className="space-y-8 text-sm leading-relaxed text-ink-secondary">
          <section className="space-y-2">
            <h3 className="font-serif text-base font-bold text-ink">1. Service Overview</h3>
            <p>
              Yeobaek is a free, local-first personal productivity application for managing notes,
              tasks, calendar events, and reminders, with optional synchronization to your own
              Google Drive account.
            </p>
          </section>

          <section className="space-y-2">
            <h3 className="font-serif text-base font-bold text-ink">
              2. Data Ownership &amp; Backup Responsibility
            </h3>
            <p>
              You retain full ownership of all content you create in Yeobaek. Because Yeobaek does
              not store your data on any central server, you are encouraged to regularly back up
              important records using Google Drive sync or the built-in local JSON export feature.
            </p>
          </section>

          <section className="space-y-2">
            <h3 className="font-serif text-base font-bold text-ink">
              3. Service Changes, Discontinuation &amp; Disclaimer
            </h3>
            <p>
              The developer reserves the right to modify, suspend, or discontinue any part or all of
              the service at any time without prior notice for operational or technical reasons.
            </p>
            <p>
              This software is provided &ldquo;AS IS&rdquo; without warranties of any kind. To the
              maximum extent permitted by applicable law, the developer shall not be liable for any
              data loss or service interruption caused by device failure, browser cache clearing,
              third-party API changes, or network issues.
            </p>
          </section>

          <section className="space-y-2">
            <h3 className="font-serif text-base font-bold text-ink">4. Contact</h3>
            <p>
              For questions regarding these terms, please contact{' '}
              <code>default_plus@naver.com</code>.
            </p>
          </section>
        </article>
      </section>
    </main>
  );
}
