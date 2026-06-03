# Agendamento V1 — Decisões e plano

> Documento de alinhamento antes de codar. Última atualização: 21/05/2026.

## 1. Escopo

### Dentro do V1

- Cliente acessa `/agendar`, escolhe serviço → barbeiro → dia → horário, preenche nome + WhatsApp, confirma.
- Sistema gera link único de gerenciamento (token) e mostra na tela de confirmação.
- Cliente pode cancelar pelo link (sem login).
- Confirmação por WhatsApp via **wa.me click-to-chat** (botão pré-preenchido na tela final).
- Painel admin protegido por senha:
  - **Bayron Patrezio** vê todos os agendamentos, todos os barbeiros, gerencia serviços, durações, bloqueios, feriados, no-shows.
  - **Emanuel** e **Jackson** veem só os próprios agendamentos, conseguem cancelar e marcar no-show, conseguem bloquear o próprio tempo.
- Barbeiro gerencia o catálogo de serviços que ele oferece e a duração de cada um.
- Tela do dia: ao abrir o painel, mostra o dia de hoje com próximo cliente em destaque.
- Lançamento manual pelo barbeiro (walk-in ou cliente que ligou).
- Deploy no subdomínio `agendar.bayron.alexandrefdev.tech` via GitHub + EasyPanel.
- Backup diário automático do banco SQLite.

### Fora do V1 (V2+)

- Lembrete automático antes do horário (precisa Evolution API ou similar).
- Pagamento online / sinal.
- Histórico de cliente recorrente.
- Importação de dados do TopSalão.
- Controle de saldo de pacotes pré-pagos.
- App PWA / push notification nativo.

### Migração

- Cortar TopSalão de uma vez quando o V1 estiver em produção e testado.
- Sem importação de histórico.

## 2. Stack

| Camada | Escolha |
|---|---|
| Framework | Astro 5 (modo hybrid) com `@astrojs/node` adapter |
| Banco | SQLite via `better-sqlite3` |
| ORM | Drizzle ORM + drizzle-kit |
| Validação | Zod |
| Datas | date-fns + date-fns-tz (timezone `America/Fortaleza`, UTC-3) |
| Auth admin | iron-session (cookie HttpOnly assinado) |
| Logs | pino |
| UI interativa | Astro islands + TypeScript vanilla (sem React) |
| Estilo | Tailwind (já no projeto) |
| Deploy | Docker via EasyPanel (GitHub) |
| Backup | Script + cron diário copiando o `.db` |

## 3. Modelo de dados

### `barbers`

| coluna | tipo | obs |
|---|---|---|
| id | integer pk autoincrement | |
| name | text not null | "Bayron Patrezio", "Emanuel Brilhante", "Jackson Viana" |
| slug | text unique not null | "bayron", "emanuel", "jackson" |
| role | text not null | "admin" ou "barber" |
| password_hash | text not null | bcrypt; só Bayron começa com role=admin |
| active | boolean default true | |
| created_at | timestamp default now | |

Seed inicial: 3 linhas (Bayron como admin, os outros 2 como barber).

### `services` (catálogo global)

| coluna | tipo | obs |
|---|---|---|
| id | integer pk autoincrement | |
| name | text not null | ex: "Degradê" |
| slug | text unique not null | ex: "degrade" |
| price_cents | integer not null | preço em centavos |
| active | boolean default true | |
| created_at | timestamp default now | |

Seed inicial: 20 serviços (lista completa da Bayron, exceto os 3 pacotes `1º/2º/3º Combo`).

### `barber_services`

Quais serviços cada barbeiro oferece e em quanto tempo.

| coluna | tipo | obs |
|---|---|---|
| id | integer pk autoincrement | |
| barber_id | integer fk → barbers.id | |
| service_id | integer fk → services.id | |
| duration_minutes | integer not null | duração pra ESTE barbeiro neste serviço |
| active | boolean default true | desativa sem deletar |
| unique(barber_id, service_id) | | |

Seed inicial: todos os 3 barbeiros × 20 serviços com as durações padrão (ver tabela na seção 4).

### `working_hours`

Expediente semanal recorrente.


| coluna | tipo | obs |
|---|---|---|
| id | integer pk autoincrement | |
| barber_id | integer fk → barbers.id | |
| weekday | integer 0–6 | 0 = domingo, 1 = segunda... |
| start_time | text "HH:MM" | |
| end_time | text "HH:MM" | |

Seed inicial pros 3 barbeiros: seg–sex 09:00–20:00, sábado 09:00–18:00, sem linha pra domingo (=fechado).

### `time_off`

Bloqueios pontuais (folga, feriado, almoço, atestado, etc.).

| coluna | tipo | obs |
|---|---|---|
| id | integer pk autoincrement | |
| barber_id | integer fk → barbers.id (nullable) | nullable = vale pra todos (feriado) |
| starts_at | timestamp utc | |
| ends_at | timestamp utc | |
| reason | text nullable | "Feriado", "Folga", "Almoço" |
| created_by | integer fk → barbers.id | quem registrou |
| created_at | timestamp default now | |

### `appointments`

| coluna | tipo | obs |
|---|---|---|
| id | integer pk autoincrement | |
| barber_id | integer fk | |
| service_id | integer fk | |
| customer_name | text not null | |
| customer_phone | text not null | |
| starts_at | timestamp utc | |
| ends_at | timestamp utc | starts_at + duration no momento do booking |
| duration_minutes | integer | snapshot da duração no momento do booking |
| price_cents | integer | snapshot do preço no momento do booking |
| status | text | `confirmed` (default), `cancelled`, `completed`, `no_show` |
| manage_token | text unique | random urlsafe ~24 chars, usado em /a/{token} |
| cancelled_at | timestamp nullable | |
| cancelled_by | text nullable | `customer`, `barber`, `admin` |
| notes | text nullable | |
| created_at | timestamp default now | |
| created_by | text | `customer` (online) ou `barber` (lançamento manual) |

**Índices:**
- `(barber_id, starts_at)` pra consulta de slots
- `manage_token` único
- `customer_phone` pra futura busca

## 4. Durações iniciais (seed)

Os barbeiros podem ajustar depois no painel. Defaults:

| Serviço | Duração |
|---|---|
| Social, Degradê, Navalhado, Tesoura, 1º Baby | 40 min |
| Barba | 30 min |
| Barba + Pezinho | 30 min |
| Corte + Barba (qualquer combinação) | 60 min |
| Alisamento | 60 min |
| Corte + Alisamento | 90 min |
| Corte + Barba + Alisamento | 120 min |
| Corte + Barba + Hidratação | 75 min |
| Corte + Pigmentação OU Barba + Pigmentação | 45 min |
| Hidratação, Limpeza Caspa, Pigmentação (isoladas) | 20 min |
| Depilação Nasal, Sobrancelhas | 10 min |

## 5. Regras de agendamento

- **Antecedência mínima:** 0 (cliente marca qualquer horário disponível, inclusive logo a seguir).
- **Janela máxima:** 30 dias à frente.
- **Granularidade base:** 30 min (slots padrão: 09:00, 09:30, 10:00...).
- **Slots extras:** após cada agendamento existente, o **instante exato em que ele termina** vira um slot extra ofertado (se cabe o próximo serviço dentro do expediente sem conflitar).
- **Buffer entre clientes:** 0 min.
- **Cancelamento pelo cliente:** permitido a qualquer momento via link `/a/{token}` (sem login). Sem antecedência mínima no V1.
- **No-show:** o barbeiro marca o agendamento como `no_show` no painel. Não bloqueia o cliente automaticamente.

## 6. Lógica de geração de slots

```
function getAvailableSlots(barberId, serviceId, date):
  service     = barber_services where barber_id=B and service_id=S (active)
  if not service: return []
  duration    = service.duration_minutes

  hours       = working_hours where barber_id=B and weekday=weekday(date)
  if not hours: return []   // barbeiro não trabalha nesse dia

  open        = combine(date, hours.start_time)
  close       = combine(date, hours.end_time)

  appts       = appointments where barber_id=B
                 and date(starts_at) = date
                 and status in ('confirmed', 'completed')
                 order by starts_at

  timeoffs    = time_off where (barber_id=B or barber_id is null)
                 and overlaps (open, close)

  // 1) Slots padrão (grade 30 min)
  candidates  = []
  cursor      = open
  while cursor + duration <= close:
    candidates.push(cursor)
    cursor += 30 min

  // 2) Slots extras (end-time de cada agendamento)
  for appt in appts:
    if appt.ends_at + duration <= close:
      candidates.push(appt.ends_at)

  // 3) Filtra conflitos
  filtered = []
  for slot in candidates:
    slot_end = slot + duration
    has_conflict = false

    // Não pode estar no passado (se for hoje)
    if slot < now(): has_conflict = true

    // Conflito com agendamento existente
    for appt in appts:
      if slot < appt.ends_at and slot_end > appt.starts_at:
        has_conflict = true; break

    // Conflito com bloqueio (folga, feriado, almoço)
    for off in timeoffs:
      if slot < off.ends_at and slot_end > off.starts_at:
        has_conflict = true; break

    if not has_conflict: filtered.push(slot)

  // 4) Deduplica e ordena
  return unique(filtered, by=slot).sort()
```

**Atomicidade ao gravar (importante):** antes de inserir um agendamento, fazer dentro da mesma transação SQLite:
1. `SELECT ... FOR UPDATE` (equivalente: `BEGIN IMMEDIATE`)
2. Re-verifica que o slot ainda está livre
3. `INSERT INTO appointments`
4. `COMMIT`

Isso evita double-booking quando 2 pessoas clicam no mesmo slot ao mesmo tempo.

## 7. Endpoints (API routes do Astro)

Todos sob `/api/`. Validação com Zod. Resposta padrão JSON.

### Públicos (sem auth)

| Método | Rota | Função |
|---|---|---|
| GET | `/api/services` | Lista serviços ativos com seus barbeiros e durações |
| GET | `/api/barbers` | Lista barbeiros ativos |
| GET | `/api/slots?barberId=X&serviceId=Y&date=YYYY-MM-DD` | Slots disponíveis pra esse barbeiro/serviço/dia |
| POST | `/api/appointments` | Cria agendamento `{barberId, serviceId, customerName, customerPhone, startsAt}` → retorna `{id, manageToken, ...}` |
| GET | `/api/appointments/by-token/:token` | Detalhes pro cliente ver/cancelar |
| POST | `/api/appointments/by-token/:token/cancel` | Cliente cancela |

### Admin (auth via session cookie)

| Método | Rota | Quem | Função |
|---|---|---|---|
| POST | `/api/auth/login` | qualquer barbeiro | senha → cria sessão |
| POST | `/api/auth/logout` | qualquer | encerra sessão |
| GET | `/api/admin/appointments?date=...&barberId=...` | barbeiro vê só os seus, admin vê todos | listar agendamentos |
| POST | `/api/admin/appointments` | barbeiro/admin | criar agendamento manual (walk-in/telefone) |
| POST | `/api/admin/appointments/:id/cancel` | dono ou admin | cancelar |
| POST | `/api/admin/appointments/:id/no-show` | dono ou admin | marcar como não-apareceu |
| POST | `/api/admin/appointments/:id/complete` | dono ou admin | marcar como concluído |
| POST | `/api/admin/time-off` | barbeiro (próprio) ou admin (qualquer/feriado) | criar bloqueio |
| DELETE | `/api/admin/time-off/:id` | mesmo dono | remover bloqueio |
| GET | `/api/admin/services` | qualquer barbeiro autenticado | listar serviços do catálogo |
| PUT | `/api/admin/barber-services/:serviceId` | barbeiro próprio | ativar/desativar serviço e definir duração |
| POST | `/api/admin/services` | só admin | criar serviço novo no catálogo global |
| PUT | `/api/admin/services/:id` | só admin | editar nome/preço |
| DELETE | `/api/admin/services/:id` | só admin | desativar do catálogo |

## 8. UI / fluxos

### Lado cliente — `/agendar`

Fluxo em wizard de 4 etapas, todas na mesma página, com botão "voltar":

1. **Escolha o serviço** — grade visual dos serviços ativos
2. **Escolha o barbeiro** — cards dos barbeiros que fazem aquele serviço (mostra duração de cada)
3. **Escolha o dia e horário** — calendário simples dos próximos 30 dias + lista de slots do dia clicado
4. **Seus dados** — nome + WhatsApp + botão "Confirmar agendamento"

### Tela de confirmação — `/a/{token}`

- Detalhes do agendamento (serviço, barbeiro, dia, horário, preço)
- Botão "Avisar pelo WhatsApp" → `wa.me/55XXXXXXXXX?text=Olá, agendei...`
- Botão "Cancelar agendamento"
- Mensagem: "Salve este link pra acessar o agendamento depois"

### Lado admin — `/admin`

- `/admin/login` — formulário simples (slug do barbeiro + senha)
- `/admin` — redirect pra dia de hoje
- `/admin/dia/YYYY-MM-DD` — timeline do dia
  - Filtro por barbeiro (admin vê todos por padrão, barbeiro vê só os seus)
  - Próximo cliente em destaque no topo
  - Botões: marcar concluído, marcar no-show, cancelar
  - Botão "+ Agendamento manual"
  - Botão "Bloquear horário"
- `/admin/servicos` — meu catálogo (ativar/desativar serviço pra mim, ajustar duração)
- `/admin/catalogo` — só admin: gerenciar lista global de serviços
- `/admin/bloqueios` — folgas e feriados

## 9. Autenticação e autorização

- **iron-session** com cookie `__bayron_session` HttpOnly + Secure + SameSite=Lax
- Senhas com bcrypt (cost 12)
- Sessão guarda `{barberId, role}`
- Middleware checa role em cada rota /api/admin/*
- Login bloqueia após 5 tentativas erradas em 15 min (rate limit por IP/usuário)
- Sessão dura 30 dias; rolling refresh a cada acesso

## 10. Deploy

- **Repositório:** GitHub (continuação deste mesmo repo, na branch principal)
- **EasyPanel:** cria app Docker, aponta pra repo, build automático no push
- **Dockerfile:** multi-stage (build do Astro → imagem final Node alpine)
- **Volume persistente:** `/data` montado pra guardar o `appointments.db`
- **Variáveis de ambiente:**
  - `SESSION_SECRET` (gerar 32+ chars random)
  - `ADMIN_INITIAL_PASSWORD` (pra primeiro setup; depois trocar pelo painel)
  - `BARBER_INITIAL_PASSWORD` (mesma lógica)
  - `WHATSAPP_BARBEARIA` (número da barbearia, pra wa.me)
  - `DATABASE_PATH` (default `/data/appointments.db`)
  - `TZ=America/Fortaleza`
- **DNS:** apontar `agendar.bayron.alexandrefdev.tech` → IP da VPS Hostinger; EasyPanel cuida do SSL (Let's Encrypt)

## 11. Backup

- Script `scripts/backup.sh` que copia o `.db` pra `/data/backups/appointments-YYYY-MM-DD.db`
- Cron diário às 04:00 (madrugada, baixo tráfego)
- Mantém os últimos 30 dias, deleta mais antigos
- (Futuro) sync periódico pra storage externo (S3, Backblaze)

## 12. Cronograma estimado

Trabalhando em sessões focadas com a gente em par:

| Fase | Entrega | Estimativa |
|---|---|---|
| 1 | Setup do projeto: hybrid mode, adapter, Drizzle, schema, migrations, seed | 1 sessão |
| 2 | Lógica de slots + testes manuais | 1–2 sessões |
| 3 | API pública (services, barbers, slots, criar/cancelar agendamento) | 1–2 sessões |
| 4 | UI cliente (`/agendar` + `/a/{token}`) | 2–3 sessões |
| 5 | Auth admin + painel do dia + ações (cancelar, no-show, completar, manual) | 2 sessões |
| 6 | Painel: serviços e bloqueios | 1 sessão |
| 7 | Polish, mensagens de erro, validações, mobile | 1 sessão |
| 8 | Deploy na VPS + DNS + SSL + smoke tests | 1 sessão |

Total: ~10–13 sessões / 2–3 semanas.

## 13. Decisões em aberto pra registrar

- Política de cancelamento muito em cima da hora (cliente cancela 9:55 pra slot de 10:00)? V1 permite. Se virar problema, adicionamos regra depois.
- Telefone do cliente: validar formato? Por enquanto aceitar qualquer string que pareça WhatsApp BR (DDD + número, com ou sem 9). Não bloquear estrangeiros, mas avisar.
- Capacidade de cliente acessar histórico próprio? Não no V1 (cada agendamento tem token único, sem unificação por telefone).
