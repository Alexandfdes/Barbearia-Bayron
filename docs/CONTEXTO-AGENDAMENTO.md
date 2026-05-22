# Contexto — Sistema de Agendamento Bayron

> Estado do projeto após o deploy V1. Use este documento como referência rápida pra qualquer pessoa (humana ou IA) que vá mexer no sistema.

## Resumo executivo

- Sistema de agendamento próprio criado pra substituir o TopSalão (R$40/mês economizados).
- Cliente da barbearia: Bayron Patrezio, Mossoró/RN. 3 barbeiros.
- **Em produção** em `https://bayron.alexandrefdev.tech`.
- Plano arquitetural completo está em `docs/AGENDAR-V1.md`. Este documento aqui é o "estado atual + pendências".

## Stack

- **Frontend + Backend**: Astro 6 (modo hybrid) com `@astrojs/node` adapter
- **Banco**: SQLite via `better-sqlite3` + Drizzle ORM
- **Auth**: iron-session (cookie HttpOnly assinado), bcrypt cost 12
- **Validação**: Zod
- **Datas**: date-fns + date-fns-tz (timezone `America/Fortaleza`)
- **UI**: Tailwind v4 + Astro islands com TS vanilla
- **Logs**: pino

## Infra em produção

- **Host**: VPS Hostinger gerenciada via EasyPanel
- **Projeto EasyPanel**: `barbearia` (mesmo onde rodam n8n, redis e postgres do n8n)
- **Serviço EasyPanel**: `site-bayron` (App, Dockerfile, GitHub deploy)
- **Repo**: `https://github.com/Alexandfdes/Barbearia-Bayron` (branch `main`)
- **Domínio**: `bayron.alexandrefdev.tech` (SSL Let's Encrypt automático)
- **Volume**: `bayron_data` montado em `/data` dentro do container
- **Banco em produção**: `/data/appointments.db`
- **Backup**: automático nativo do EasyPanel, diário às 2h, salvando em `/backups/bayron` (Local Disk)
- **Variáveis de ambiente em produção**:
  - `SESSION_SECRET` — secret de 32 bytes pra cookies de sessão
  - `DATABASE_PATH=/data/appointments.db`
  - `TZ=America/Fortaleza`
  - `ADMIN_INITIAL_PASSWORD` — só usado no primeiro seed; senhas já foram trocadas no painel
  - `BARBER_INITIAL_PASSWORD` — idem

## URLs em uso

| URL | Descrição |
|---|---|
| `/` | Landing page (Hero, Combo Boris, Serviços, Produtos, Galeria, Depoimentos, Localização, FAQ, Footer) |
| `/agendar` | Wizard de 4 passos: serviço → barbeiro → dia/horário → dados |
| `/a/{token}` | Cliente vê detalhes e cancela seu agendamento (sem login) |
| `/admin/login` | Login dos barbeiros |
| `/admin` | Redireciona pro dia de hoje |
| `/admin/dia/[YYYY-MM-DD]` | Timeline do dia com agendamentos |
| `/admin/servicos` | Catálogo de serviços do barbeiro logado (ativa/desativa e ajusta duração) |
| `/admin/catalogo` | Só admin: catálogo global de serviços |
| `/admin/bloqueios` | Folgas e feriados (`time_off`) |

## API endpoints

Públicos (sem auth):
- `GET /api/services` — lista serviços ativos
- `GET /api/barbers` — lista barbeiros ativos
- `GET /api/slots?barberId=X&serviceId=Y&date=YYYY-MM-DD` — slots disponíveis
- `POST /api/appointments` — cria agendamento
- `GET /api/appointments/by-token/:token` — detalhes pro cliente
- `POST /api/appointments/by-token/:token/cancel` — cliente cancela

Admin (auth via session cookie):
- `POST /api/auth/login` / `POST /api/auth/logout`
- `GET /api/admin/appointments?date=...&barberId=...`
- `POST /api/admin/appointments` — criar manual
- `POST /api/admin/appointments/:id/cancel|complete|no-show`
- `POST /api/admin/time-off` / `DELETE /api/admin/time-off/:id`
- `GET /api/admin/services`
- `PUT /api/admin/barber-services/:serviceId` — barbeiro ajusta o próprio catálogo
- `POST|PUT|DELETE /api/admin/services` — só admin (catálogo global)

## Schema do banco

Tabelas:
- `barbers` (id, name, slug, role, password_hash, active, created_at)
- `services` (id, name, slug, price_cents, active, created_at)
- `barber_services` (id, barber_id, service_id, duration_minutes, active) — UNIQUE(barber_id, service_id)
- `working_hours` (id, barber_id, weekday, start_time, end_time)
- `time_off` (id, barber_id nullable, starts_at, ends_at, reason, created_by, created_at)
- `appointments` (id, barber_id, service_id, customer_name, customer_phone, starts_at, ends_at, duration_minutes, price_cents, status, manage_token, cancelled_at, cancelled_by, notes, created_at, created_by)

Status do agendamento: `confirmed` | `cancelled` | `completed` | `no_show`

## Regras de negócio (V1)

- **Granularidade base**: 30 min (slots padrão 09:00, 09:30, 10:00...)
- **Slot extra**: após cada agendamento existente, o end-time exato vira slot ofertado (se cabe o próximo serviço dentro do expediente)
- **Antecedência mínima**: 0 (cliente pode marcar até em cima da hora)
- **Janela máxima**: 30 dias à frente
- **Buffer entre clientes**: 0
- **Cancelamento pelo cliente**: livre, qualquer hora, via `/a/{token}` sem login
- **No-show**: barbeiro marca pelo painel; não bloqueia cliente automaticamente
- **Expediente**: seg–sex 09:00–20:00, sáb 09:00–18:00, dom fechado (igual pros 3 barbeiros)
- **Atomicidade**: criação de agendamento usa transação SQLite com re-check de conflito antes do INSERT (evita double-booking)

## Estrutura de arquivos relevante

```
C:\DEV\barbearia\
├── astro.config.mjs          # output: static, adapter: node standalone
├── Dockerfile                # multi-stage build (node:22-alpine)
├── docker-compose.yml        # pra rodar local
├── drizzle.config.ts
├── drizzle/                  # migrations geradas pelo drizzle-kit
├── scripts/
│   ├── startup.mjs           # roda migrations no boot do container
│   ├── seed.mjs              # popula barbeiros + serviços + working_hours
│   └── backup.sh             # script de backup (não usado atualmente, EasyPanel cuida)
├── src/
│   ├── pages/
│   │   ├── index.astro                    # landing
│   │   ├── agendar.astro                  # wizard
│   │   ├── a/[token].astro                # cliente gerencia/cancela
│   │   ├── admin/
│   │   │   ├── login.astro
│   │   │   ├── index.astro
│   │   │   ├── dia/[date].astro
│   │   │   ├── servicos.astro
│   │   │   ├── catalogo.astro
│   │   │   └── bloqueios.astro
│   │   ├── api/                           # endpoints
│   │   └── produtos/[slug].astro
│   ├── components/                        # Astro components (Hero, Header, etc.)
│   ├── lib/                               # lógica de negócio (auth, slots, etc.)
│   ├── db/                                # schema Drizzle + conexão
│   └── data/                              # dados estáticos (depoimentos.json, faq.json, products.ts)
├── docs/
│   ├── AGENDAR-V1.md                      # plano arquitetural completo
│   └── CONTEXTO-AGENDAMENTO.md            # este documento
└── data/appointments.db                   # SQLite local (NÃO commitar)
```

## Estado dos dados (após seed)

- 3 barbeiros: `bayron` (admin), `emanuel`, `jackson`
- 20 serviços (lista completa em `scripts/seed.mjs`)
- 60 barber_services (todos × todos com durações default)
- 18 working_hours (3 barbeiros × 6 dias de expediente)

## Pendências conhecidas / débitos técnicos

1. **Login case-insensitive**: hoje `Bayron ≠ bayron`. Converter slug pra lowercase antes da comparação no login.
2. **Senhas no output do seed**: `seed.mjs` imprime as senhas iniciais no log (problema de segurança). Esconder ou só mostrar com flag explícita.
3. **Validação anti-placeholder no seed**: rejeitar senhas que tenham `<>` ou padrões parecidos (causou problema no deploy — usuário copiou os colchetes literais).
4. **Botão "Avisar pelo WhatsApp"** na tela `/a/{token}` — verificar se está presente; era previsto no V1.
5. **Rate limit por IP+usuário** em vez de só por IP — evitar bloquear outros usuários quando um erra muito.
6. **Documentação dos barbeiros**: criar guia rápido de como cada um usa o painel (talvez vídeo curto).

## Próximas funcionalidades planejadas (V1.1+)

- **Lembrete automático** 2h antes do agendamento (WhatsApp). Depende de Evolution API ou similar — n8n já está disponível no projeto `barbearia`.
- **Histórico de cliente recorrente** unificado por telefone (hoje cada agendamento é independente).
- **Importação de dados do TopSalão** (decisão atual: começar do zero).
- **Pagamento online / sinal** (fora do V1, pode entrar depois).
- **App PWA** com push notifications nativas.

## Deploy / dev workflow

**Local (dev):**
```bash
npm install
npm run dev    # http://localhost:4321
```

Banco local em `./data/appointments.db`. Pode rodar `node scripts/seed.mjs` pra popular (cuidado: o seed só roda se a tabela barbers estiver vazia).

**Deploy:**
```bash
git add -A
git commit -m "feat: ..."
git push origin main
```

EasyPanel detecta o push e rebuilda automaticamente (~3 min). Pra forçar deploy manual: clica em "Implantar" no painel.

**Acessar terminal do container em produção:**
EasyPanel → site-bayron → ícone de terminal (`>_`) → Bash ou Sh.

**Reset de senha em produção (emergência):**
No terminal do container:
```bash
node -e "const Database=require('better-sqlite3');const bcrypt=require('bcryptjs');const db=new Database('/data/appointments.db');db.prepare('UPDATE barbers SET password_hash=? WHERE slug=?').run(bcrypt.hashSync('nova-senha-aqui',12),'bayron');"
```

## Cuidados

- **Nunca rodar `node scripts/seed.mjs` em produção sem checar primeiro** — ele tem proteção idempotente (só roda se tabela barbers estiver vazia), mas vale conferir.
- **Mudanças de schema** precisam de migration nova (`npm run db:generate` localmente, commit, deploy — o `startup.mjs` aplica no boot do container).
- **Backup**: confirmar uma vez por semana que os backups estão sendo gerados (`/backups/bayron/` no host).
- **Cookies de sessão**: se `SESSION_SECRET` mudar, todas as sessões ativas são invalidadas (todo mundo precisa logar de novo).
