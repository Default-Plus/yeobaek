import Link from 'next/link';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: '서비스 약관 — 여백 (Yeobaek)',
  description: '여백(Yeobaek) 서비스 이용 약관',
};

export default function TermsPage() {
  return (
    <main className="mx-auto max-w-2xl px-6 py-16 text-ink">
      <div className="mb-10 border-b border-hairline pb-6">
        <Link
          href="/"
          className="text-xs text-ink-muted transition-colors hover:text-ink"
        >
          ← 여백으로 돌아가기
        </Link>
        <h1 className="mt-4 font-serif text-2xl font-bold tracking-tight">서비스 약관</h1>
        <p className="mt-2 text-xs text-ink-muted">시행일: 2026년 11월 25일</p>
      </div>

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
          <h2 className="font-serif text-base font-bold text-ink">3. 면책 조항</h2>
          <p>
            본 소프트웨어는 &ldquo;있는 그대로(AS IS)&rdquo; 제공되며, 기기 오류, 브라우저 캐시 삭제,
            네트워크 장애 등 불가항력적 사유로 발생한 데이터 손실이나 서비스 중단에 대해 법령이 허용하는
            범위 내에서 책임을 지지 않습니다.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="font-serif text-base font-bold text-ink">4. 문의처</h2>
          <p>
            약관 및 서비스 이용 관련 문의는 <code>namgite0310@gmail.com</code>으로 연락해 주세요.
          </p>
        </section>
      </article>
    </main>
  );
}
