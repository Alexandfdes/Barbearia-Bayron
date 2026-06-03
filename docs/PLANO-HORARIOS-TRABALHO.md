# Plano — Tela de Horários de Trabalho (`working_hours`)

## Objetivo

Permitir editar, pela interface, os horários de trabalho de cada barbeiro (tabela `working_hours`) — hoje só populados pelo `seed.mjs`. Isso fecha dois problemas reais:

1. **Bug do domingo hardcoded.** Em `agendar.astro:209` o wizard faz `const closed = d.weekday === 0`, desabilitando domingo **sempre** e ignorando a tabela `working_hours`. Barbeiro que trabalha domingo (ou um domingo especial) não recebe agendamento.
2. **Barbeiro nasce preso ao padrão.** A tela de barbeiros já semeia `working_hours` padrão ao criar, mas não há como ajustar depois sem SQL. A escala fica refém de dev.

## Contexto do que já existe

- **Schema** (`working_hours`): `id`, `barberId`, `weekday` (0=domingo … 6=sábado), `startTime` (`"HH:MM"`), `endTime` (`"HH:MM"`). **Não há índice único** em `(barberId, weekday)` — o schema já permite mais de um registro por dia (vários turnos).
- **`slots.ts`** lê `working_hours` por `barberId + weekday` com `.all()` (array) — ou seja, já suporta múltiplos turnos e trata "sem registro" como dia fechado (0 slots).
- **`seed.mjs`** popula seg–sex 09:00–20:00 e sáb 09:00–18:00 (turno único, sem pausa de almoço).
- **Wizard** (`agendar.astro`): step 2 escolhe o barbeiro (`selBarber`), step 3 monta o calendário dos próximos dias e busca slots em `/api/slots`. O barbeiro já é conhecido quando o calendário é desenhado.

## Decisões de design (com trade-offs)

| # | Decisão | Por quê / trade-off |
|---|---------|---------------------|
| 1 | **Um turno por dia** no MVP (um par início–fim + "aberto/fechado") | Cobre o uso atual (o seed usa turno único). O schema e o `slots.ts` já suportam múltiplos turnos, então "fechar pro almoço" (2 turnos) fica como evolução sem migration. |
| 2 | **Dia fechado = sem registro** | É como o `slots.ts` já interpreta. Nada de flag "ativo" — ausência de linha = fechado. |
| 3 | **Salvar = substituir** (delete dos registros do barbeiro + insert dos dias abertos, em transação) | Mais simples e idempotente que diff. Risco de corrida com 2 edições simultâneas é desprezível no contexto. |
| 4 | **Permissões iguais à tela de Serviços** | Admin edita qualquer barbeiro (com seletor); barbeiro edita só os seus. Validado **no servidor**, não só na UI. |
| 5 | **Leitura pública dos horários** | O wizard é público (cliente não logado) e precisa saber os dias que o barbeiro trabalha. Horário de funcionamento não é dado sensível. |
| 6 | **Não unificar com o `Footer`/`BUSINESS_HOURS`** | O footer mostra o horário institucional da loja (config); `working_hours` é a escala por barbeiro. São conceitos diferentes e podem divergir de propósito. Unificar fica fora deste escopo. |

## API

| Método / rota | Acesso | Função |
|---|---|---|
| `GET /api/working-hours?barber=ID` | Público | Retorna `[{ weekday, startTime, endTime }]` do barbeiro. Usado pelo wizard (quais dias habilitar) e pela tela (leitura). |
| `PUT /api/admin/working-hours` | Admin (qualquer barbeiro) ou barbeiro (só o próprio) | Body: `{ barberId, days: [{ weekday, startTime, endTime }] }`. Valida e **substitui** os registros do barbeiro numa transação. |

**Validações (servidor):** `weekday` 0–6 sem repetição; `startTime`/`endTime` no formato `HH:MM`; `startTime < endTime`; barbeiro só grava o próprio `barberId` (admin grava qualquer um).

## Tela `/admin/horarios`

- Padrão visual e de permissão da tela de Serviços/Barbeiros (dark, `AdminLayout`, admin-only para o seletor de barbeiro).
- **Admin:** seletor de qual barbeiro editar (carrega os horários dele). **Barbeiro comum:** edita direto os seus, sem seletor.
- Lista os 7 dias (segunda→domingo). Cada dia: um **toggle aberto/fechado** + dois campos de horário (`início`/`fim`) habilitados só quando aberto.
- Botão **Salvar** → `PUT`. Feedback inline (✓/✕), igual às outras telas.
- Aviso quando o barbeiro fica **sem nenhum dia aberto** (= some do agendamento), para não fechar sem querer.
- Link **"Horários"** na nav do `AdminLayout` (visível a todos os papéis; barbeiro vê os próprios).

## Correção do bug do domingo (`agendar.astro`)

- Hoje: `const closed = d.weekday === 0;` (linha ~209).
- Depois: ao entrar no **step 3** (barbeiro já selecionado), buscar `GET /api/working-hours?barber=selBarber.id`, derivar o conjunto de `weekday`s que o barbeiro trabalha e usar `const closed = !diasDeTrabalho.has(d.weekday);`.
- Resultado: domingo abre se houver registro; qualquer dia sem registro fica desabilitado — coerente com o `slots.ts`. Sem fetch extra além de um, ao montar o calendário.

## Arquivos

| Ação | Arquivo |
|---|---|
| NOVO | `src/pages/api/working-hours/index.ts` (GET público) |
| NOVO | `src/pages/api/admin/working-hours/index.ts` (PUT protegido) |
| NOVO | `src/pages/admin/horarios.astro` (tela) |
| MODIFICAR | `src/layouts/AdminLayout.astro` (link "Horários") |
| MODIFICAR | `src/pages/agendar.astro` (corrigir o domingo) |

Sem migration — a tabela `working_hours` já existe.

## Riscos e validação

- **`agendar.astro` é o fluxo de conversão público** — a mudança é cirúrgica (só a regra do `closed` + um fetch), mas exige teste no navegador: dia de trabalho abre, dia fechado desabilita, domingo respeitando o cadastro.
- **Barbeiro sem horários** desaparece do agendamento — por isso o aviso na tela.
- **Fuso não afeta:** os horários são `HH:MM` locais; o `slots.ts` já cuida da conversão.
- **Validação que farei:** compilar as telas/endpoints no compilador Astro isolado, checar a sintaxe TS, e testar o SQL de leitura/escrita num SQLite real (como fiz na comanda). Runtime (navegador) fica com você, porque não consigo rodar o app daqui.

## Fora de escopo (de propósito)

- Múltiplos turnos por dia (pausa de almoço) — evolução; schema e `slots.ts` já suportam.
- Exceções pontuais (feriado, folga de um dia) — já existe `time_off`/Bloqueios pra isso.
- Unificar o horário do footer com `working_hours`.

## Ordem de implementação

1. API: `GET` público + `PUT` protegido (com teste de SQL).
2. Tela `/admin/horarios` + link na nav.
3. Correção do domingo no wizard.
4. Validação (compilação + sintaxe) e revisão.
