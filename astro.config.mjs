// @ts-check
import { defineConfig } from 'astro/config';
import node from '@astrojs/node';
import tailwindcss from '@tailwindcss/vite';

// https://astro.build/config
// output: 'server' — renderização sob demanda (SSR) é o PADRÃO. As páginas
// estáticas optam explicitamente com "export const prerender = true" (landing,
// agendar, 404, produtos/[slug]). Assim, uma rota nova criada sem o opt-in
// nasce dinâmica (auth e dados frescos garantidos) em vez de virar estática
// silenciosamente — que era o risco do modo 'static'.
export default defineConfig({
  output: 'server',
  // Atrás do proxy do EasyPanel o Host chega diferente do Origin, e a proteção
  // CSRF nativa do Astro (checkOrigin) barra POST/PATCH/DELETE de formulário com
  // "Cross-site ... form submissions are forbidden". Desligamos aqui porque a
  // proteção CSRF já é garantida pelos cookies de sessão (HttpOnly + SameSite=Lax):
  // o navegador não envia o cookie em requisições de escrita cross-site.
  security: { checkOrigin: false },
  adapter: node({ mode: 'standalone' }),
  vite: {
    plugins: [tailwindcss()]
  }
});
