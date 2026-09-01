// This file reads a var matching the custom secret pattern
// Should be flagged as client-exposed by the config-loaded custom pattern
'use client';

const apiKey = process.env.ACME_INTERNAL_API_KEY;
const dbUrl = process.env.DATABASE_URL;
