// Uses root-level vars (DATABASE_URL, REDIS_URL) and a package-level var (API_SECRET)
// MISSING_API_VAR is accessed but declared nowhere — should appear as readButUndeclared
const db = process.env.DATABASE_URL;
const cache = process.env.REDIS_URL;
const secret = process.env.API_SECRET;
const missing = process.env.MISSING_API_VAR;

export { db, cache, secret, missing };
