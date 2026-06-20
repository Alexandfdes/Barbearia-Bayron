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
  adapter: node({ mode: 'standalone' }),
  vite: {
    plugins: [tailwindcss()]
  }
});
