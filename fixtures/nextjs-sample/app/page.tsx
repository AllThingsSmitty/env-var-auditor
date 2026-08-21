'use client';

// This is a client component — env vars without NEXT_PUBLIC_ are exposed to
// the browser bundle, which is a security risk.

export default function HomePage() {
  // BAD: server-only secret accessed in client component
  const stripeKey = process.env.STRIPE_SECRET_KEY;

  // BAD: NEXT_PUBLIC_ prefix but matches sk_ secret pattern
  const pubKey = process.env.NEXT_PUBLIC_SK_LIVE_KEY;

  // OK in terms of prefix, but still bad — DATABASE_URL in browser
  const dbUrl = process.env.DATABASE_URL;

  return (
    <main>
      <h1>Welcome</h1>
      <p>App: {process.env.NEXT_PUBLIC_APP_URL}</p>
    </main>
  );
}
