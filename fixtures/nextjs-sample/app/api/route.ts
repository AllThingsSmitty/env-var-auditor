// Server-side API route — process.env usage is safe here

export async function GET() {
  const dbUrl = process.env.DATABASE_URL;
  const secret = process.env.JWT_SECRET;

  // Bracket access — same as member access but different syntax
  const webhookSecret = process.env['STRIPE_WEBHOOK_SECRET'];

  // Dynamic access — cannot be audited statically
  const key = 'STRIPE_SECRET_KEY';
  const dynamic = process.env[key as string];

  // Read but never declared in .env.example (bucket 2)
  const redisUrl = process.env.REDIS_URL;

  return new Response(JSON.stringify({ ok: true }));
}
