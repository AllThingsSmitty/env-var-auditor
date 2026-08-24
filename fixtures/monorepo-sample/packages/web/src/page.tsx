'use client';

// CLIENT-EXPOSED finding: DATABASE_URL has no NEXT_PUBLIC_ prefix
// CLIENT-EXPOSED finding: DATABASE_URL matches secret-adjacent pattern
const dbUrl = process.env.DATABASE_URL;

export default function Page() {
  return <div>{dbUrl}</div>;
}
