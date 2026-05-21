// @ts-check
import { defineConfig } from 'astro/config';
import node from '@astrojs/node';
import tailwindcss from '@tailwindcss/vite';

// https://astro.build/config
// output: "static" é o padrão no Astro 6 e já suporta rotas server-side
// com "export const prerender = false" — equivalente ao antigo "hybrid".
export default defineConfig({
  output: 'static',
  adapter: node({ mode: 'standalone' }),
  vite: {
    plugins: [tailwindcss()]
  }
});