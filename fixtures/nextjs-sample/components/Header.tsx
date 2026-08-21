'use client';

// Another client component with destructuring pattern
const { NEXT_PUBLIC_APP_URL, NEXT_PUBLIC_POSTHOG_KEY } = process.env;

export function Header() {
  return (
    <header>
      <a href={NEXT_PUBLIC_APP_URL}>Home</a>
    </header>
  );
}
