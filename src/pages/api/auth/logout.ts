export const prerender = false;

import type { APIRoute } from 'astro';
import { clearSessionCookie } from '../../../lib/session.js';

export const POST: APIRoute = () =>
  new Response(JSON.stringify({ ok: true }), {
    status:  200,
    headers: { 'Content-Type': 'application/json', 'Set-Cookie': clearSessionCookie() },
  });
