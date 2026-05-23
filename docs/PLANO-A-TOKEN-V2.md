# Plano de mudanças — `/a/{token}` V2

> Documento de planejamento das alterações na tela pública onde o cliente vê e gerencia o agendamento (`src/pages/a/[token].astro`). Versão atual em produção: V1 (deploy inicial).

## Objetivo

Resolver duas frentes de uma vez:

1. **Bug**: o botão "Avisar pelo WhatsApp" não aparece em produção porque o código lê de uma env var (`WHATSAPP_BARBEARIA`) que nunca foi configurada no EasyPanel, ignorando o `src/config.ts` que o resto do site usa.
2. **Faltam funcionalidades óbvias** pra esse tipo de tela: o cliente abre o link no dia do agendamento e não consegue ver o endereço nem salvar no calendário.

## Escopo

### O que entra
- Refatoração da `/a/[token].astro` pra usar `src/config.ts` em vez de `process.env`.
- Novo bloco "Como chegar" com endereço + botão "Abrir no Google Maps".
- Novo botão "Adicionar ao calendário" gerando arquivo `.ics` universal.
- Diferenciação visual entre `no_show` e `completed` (hoje compartilham o mesmo "Volte sempre", o que é estranho pra quem deu bolo).
- Polimento da hierarquia visual do card de detalhes (data/hora ganham mais destaque, valor fica mais visível).
- Limpeza do cálculo do dia da semana (linha 45 hoje faz parse manual da string formatada — desnecessário).

### O que NÃO entra
- Trocar o número de teste do WhatsApp pelo número real do Bayron (`config.ts` ainda usa `15551547238`, comentado como "número de teste"). **Risco registrado**: a landing inteira pode estar mandando clientes pro número errado. Tratar separado.
- Botão "Reagendar" (cliente precisa cancelar e ir pro `/agendar` do zero). Fica pra V3.
- Mostrar data do cancelamento na tela quando `cancelled`. Pequeno, pode encaixar se sobrar tempo.
- Refatorar o fluxo de confirmação inline do cancelamento.

## Mudanças por arquivo

### 1. `src/pages/a/[token].astro` (refatorar)

**Imports**
- Remover dependência de `process.env.WHATSAPP_BARBEARIA`.
- Importar do `config.ts`: `WHATSAPP_NUMBER`, `getWhatsAppUrl`, `ADDRESS`, `GOOGLE_MAPS_URL`.

**Cálculo do dia da semana (linha 45)**
- Trocar o parse manual da string `dateLocal` por `formatInTimeZone(startsAt, TZ, 'EEEE', { locale: ptBR })`. Adicionar import do locale (`import { ptBR } from 'date-fns/locale'`).
- Se `date-fns/locale` não estiver disponível no projeto, manter a array `WEEKDAYS` mas alimentar por `formatInTimeZone(startsAt, TZ, 'i')` (ISO weekday 1-7) em vez de parsear `dateLocal`.

**Estados de status**
- `confirmed`: mantém check verde + "Agendamento confirmado".
- `cancelled`: mantém X vermelho. **Adicionar** data/hora do cancelamento abaixo do subtítulo, se `cancelledAt` existir.
- `completed`: ícone de check (não relógio) + "Atendimento concluído" + "Volte sempre!".
- `no_show`: **novo visual** — ícone de relógio com tom amarelo/âmbar (`amber-400`) + "Você não compareceu" + texto neutro sem "volte sempre".

**Card de detalhes — reorganização**
- Hoje: 4 linhas (Serviço | Barbeiro | Data+Hora grid 2-col | Valor).
- Proposta: agrupar Data/Hora em um bloco visual mais destacado (data + dia da semana à esquerda, horário grandão à direita, duração discreta embaixo). Serviço e Barbeiro continuam como hoje. Valor ganha mais peso (font maior + linha separadora antes).

**Novo bloco "Como chegar"** (abaixo do card de detalhes, antes do nome do cliente, em todos os estados)
- Ícone de pin (svg inline) + endereço completo (`ADDRESS.street` + `ADDRESS.city`).
- Botão fantasma "Abrir no Google Maps" — link externo (`target="_blank"`, `rel="noopener"`) usando `GOOGLE_MAPS_URL`.

**Botões de ação (só `confirmed`, em coluna):**
1. Primário verde: "Avisar pelo WhatsApp" — gerado via `getWhatsAppUrl(msg)` do config (não mais hardcoded).
2. Secundário: "Adicionar ao calendário" — link `<a href="/api/appointments/by-token/{token}/ics">` com `download` attribute. Ícone de calendário.
3. Terciário com borda fina: "Cancelar agendamento" — mantém comportamento atual (confirmação inline Sim/Não).

### 2. `src/pages/api/appointments/by-token/[token]/ics.ts` (novo)

**Endpoint público (sem auth).**

**Validações**
- 400 se `token` ausente.
- 404 se nenhum agendamento bate o token.
- 410 (Gone) se status ≠ `confirmed` — não faz sentido gerar `.ics` pra agendamento cancelado/concluído/no-show.

**Resposta**
- Headers:
  - `Content-Type: text/calendar; charset=utf-8`
  - `Content-Disposition: attachment; filename="bayron-YYYYMMDD-HHMM.ics"`
  - `Cache-Control: no-store`
- Corpo: VEVENT seguindo RFC 5545.

**Campos do VEVENT**
| Campo | Valor |
|---|---|
| UID | `appointment-{id}@bayron.alexandrefdev.tech` |
| DTSTAMP | timestamp atual em UTC (`YYYYMMDDTHHMMSSZ`) |
| DTSTART | `appointment.startsAt` em UTC |
| DTEND | `appointment.endsAt` em UTC |
| SUMMARY | `{serviceName} com {barberName} — Barbearia Bayron` |
| LOCATION | `{ADDRESS.street} — {ADDRESS.city}` |
| DESCRIPTION | `Cliente: {customerName}\nLink: https://bayron.alexandrefdev.tech/a/{token}` |
| URL | `https://bayron.alexandrefdev.tech/a/{token}` |
| STATUS | `CONFIRMED` |

**Detalhes técnicos**
- Linhas separadas por `\r\n` (não `\n`).
- Escapar `,`, `;`, `\` e `\n` em valores de texto conforme RFC 5545.
- Não preciso dobrar linhas em 75 chars pra esse caso (campos curtos), mas se algum nome de cliente for longo demais, posso adicionar.
- `PRODID` fixo: `-//Barbearia Bayron//Agendamento//PT-BR`.
- `VERSION:2.0`, `CALSCALE:GREGORIAN`, `METHOD:PUBLISH`.

## Riscos

- **Compatibilidade do `.ics`**: alguns clientes de calendário antigos rejeitam arquivos mal formatados. Mitigação: escapar texto direito, usar CRLF, testar localmente abrindo o arquivo no Google Calendar (drag-and-drop) e no app de Calendário do iOS via simulador ou celular real.
- **Layout em telas estreitas (≤360px)**: reorganização do card pode apertar a coluna de horário. Mitigação: manter `max-w-lg` e usar grid responsivo (`grid-cols-1 sm:grid-cols-2` no bloco data/hora se necessário).
- **Locale do date-fns**: se `date-fns/locale` não estiver instalado, plano B é manter a array `WEEKDAYS` manual mas indexar via `'i'` (ISO weekday) em vez do parse atual.
- **Número de WhatsApp errado em produção**: já registrado fora do escopo, mas vale repetir — refatorar a tela pra usar `getWhatsAppUrl()` **não corrige** o problema do número errado. Apenas alinha essa tela com o resto do site. O número continua sendo o de teste até alguém trocar o `config.ts`.

## Checklist de execução

1. [ ] Criar endpoint `src/pages/api/appointments/by-token/[token]/ics.ts` com geração de VEVENT.
2. [ ] Testar o endpoint local: baixar o `.ics`, abrir no Google Calendar e no app nativo do celular (se possível), confirmar que o evento aparece no horário certo (timezone `America/Fortaleza`).
3. [ ] Refatorar `src/pages/a/[token].astro`:
   - [ ] Trocar `process.env` por imports do `config.ts`.
   - [ ] Limpar cálculo do weekday.
   - [ ] Adicionar bloco "Como chegar".
   - [ ] Adicionar botão "Adicionar ao calendário".
   - [ ] Diferenciar visual de `no_show`.
   - [ ] Polir hierarquia do card de detalhes.
4. [ ] Validar visualmente em desktop e mobile (375px).
5. [ ] Atualizar `docs/CONTEXTO-AGENDAMENTO.md` removendo a pendência 4 ("botão Avisar pelo WhatsApp").
6. [ ] Commit + push pro `main` → EasyPanel rebuilda → testar em produção com um agendamento real.

## Notas

- Nenhuma mudança de schema do banco. Não precisa de migration.
- Nenhuma env var nova precisa ser adicionada ao EasyPanel.
- Mudança 100% no frontend + um endpoint público novo (sem auth, leitura simples).
