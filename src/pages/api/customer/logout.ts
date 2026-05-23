export const prerender = false;

import type { APIRoute } from 'astro';
import { clearCustomerSessionCookie } from '../../../lib/customerSession.js';

export const POST: APIRoute = () => {
  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Set-Cookie':   clearCustomerSessionCookie(),
    },
  });
};
