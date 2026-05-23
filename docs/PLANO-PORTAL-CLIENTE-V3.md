# Plano — Portal do cliente V3: telefone + data de nascimento

Data: 2026-05-22
Status: implementado, aguardando deploy

## Contexto

Na V2 do portal do cliente (`/cliente/entrar` + `/cliente`), o login era feito
apenas com o telefone. Qualquer pessoa que soubesse o telefone alheio podia:

1. Ver os agendamentos do outro cliente (vazamento de leitura).
2. Pegar os `manage_token` listados na tela e usar `/a/{token}` pra **cancelar
   ou reagendar** os agendamentos alheios (vazamento de escrita).

Decisão: adicionar **data de nascimento** como segundo fator no login do
portal — mantém a UX simples (não precisa de OTP, e-mail ou senha) mas exige
um dado que um atacante casual não tem.

## O que mudou

### Banco / schema

- Migration `drizzle/0001_add_customer_birthdate.sql`: adiciona coluna
  `customer_birthdate text NULL` em `appointments`.
- `src/db/schema.ts`: nova coluna `customerBirthdate` (nullable).
- `drizzle/meta/0001_snapshot.json` e `_journal.json` atualizados.
- **Importante**: rodar `npm run db:migrate` em produção depois do deploy.

### Camada de aplicação

- `src/lib/bookAppointment.ts`: `BookParams` agora exige
  `customerBirthdate: string | null`. O INSERT salva a coluna nova.
- `src/lib/customerSession.ts`: `CustomerSessionData` agora tem
  `phone` E `birthdate`. A validação no `getCustomerSession` rejeita sessões
  sem birthdate (sessões antigas, em iron-session, ficam inválidas — cliente
  precisa logar de novo).

### Endpoints

- `POST /api/appointments` (criação pelo cliente): exige `customerBirthdate`
  no formato `YYYY-MM-DD`. Valida plausibilidade (idade entre 5 e 100 anos).
- `POST /api/admin/appointments` (criação pelo barbeiro): aceita
  `customerBirthdate` como **opcional/null**. Barbeiro pode criar agendamento
  pelo balcão sem pedir essa info — mas nesse caso o cliente não vai conseguir
  acessar o portal até o registro receber birthdate.
- `POST /api/customer/login`: aceita `{ phone, birthdate }`. Conta apenas
  registros que casem **telefone E birthdate**. Resposta genérica quando não
  bate (404, "Telefone ou data de nascimento não conferem").
  - Caso especial: se o telefone existe mas **nenhum** registro tem
    birthdate cadastrada, devolve 403 com `code: 'legacy_no_birthdate'` e
    mensagem específica orientando o cliente a refazer agendamento. Isso
    vaza a existência do telefone — trade-off por UX, aceitável.

### Frontends

- `src/pages/agendar.astro`: novo campo `<input type="date">` no Step 4
  (dados pessoais), com `min` e `max` calculados em JS (5 a 100 anos atrás).
  Enviado como `customerBirthdate` no POST.
- `src/pages/cliente/entrar.astro`: novo campo de data abaixo do telefone.
  Submissão envia `{ phone, birthdate }`.
- `src/pages/cliente/index.astro`: a query SQL agora filtra por
  `customer_phone (últimos 11 dígitos) = ? AND customer_birthdate = ?`.
  Cliente vê só agendamentos onde o par bate — resolve colisão de telefone
  (família compartilhando linha), porque cada pessoa tem birthdate própria.

## Comportamento por caso

| Situação                                                  | Resultado                                                |
|-----------------------------------------------------------|----------------------------------------------------------|
| Cliente novo agenda em `/agendar`                         | Vai informar birthdate. Tudo certo.                      |
| Cliente novo tenta logar em `/cliente/entrar`             | Informa telefone + birthdate. Login OK.                  |
| Cliente antigo (pré-V3) tenta logar                       | 403 com mensagem específica orientando refazer agendamento. |
| Cliente antigo tenta logar com birthdate inventada        | 403 com a mesma mensagem (porque a checagem `match.c === 0` cai na branch legacy se o telefone não tem birthdate em lugar nenhum). |
| Família com telefone compartilhado: A loga com sua data   | A vê só os agendamentos dele. B continua oculto.          |
| Barbeiro cria agendamento no admin sem birthdate          | Salvo com `null`. Cliente não consegue logar nesse registro até o admin atualizar. |
| Atacante tenta brute force de telefone + data             | Rate limit por IP, 429.                                  |

## Riscos conhecidos e aceitos

### O endpoint de login vaza "telefone está cadastrado mas sem birthdate"
A branch `legacy_no_birthdate` confirma a existência do telefone. Um atacante
pode enumerar quais telefones têm cadastro antigo. Trade-off pela UX
(cliente antigo precisa de explicação). Se virar problema:

- Trocar a resposta pela mesma mensagem genérica do 404.
- Marcar visualmente esse caso só quando o cliente clicar em "Não consigo
  entrar" (link separado), em vez de no submit normal.

### Cliente perde acesso se errou a data ao agendar
Se o cliente digitou data de nascimento errada no `/agendar`, ele não
consegue logar com a data correta depois. Solução manual: barbeiro corrige
o registro via SQL ou via tela admin (ainda não existe — vide pendências).

### Sessões antigas (V2) viram inválidas no deploy
Quem estiver logado com cookie da V2 (só phone) vai ser deslogado, porque
o `getCustomerSession` agora exige birthdate na payload. Cliente precisa
logar de novo. Impacto pequeno (TTL do cookie da V2 já vinha truncando, e a
base ativa é pequena).

### Atacante com telefone E data de nascimento ainda entra
Data de nascimento não é segredo profundo — está em redes sociais, em
documentos vazados. Esse 2FA dobra o esforço de um atacante casual mas
não para um atacante motivado. Pra defesa real seria preciso OTP via
WhatsApp/SMS — fica pra V4 quando a Evolution API estiver decidida.

## Pendências relacionadas

- Adicionar tela/campo no `/admin/buscar` ou `/admin/dia` pra o barbeiro
  cadastrar/editar a birthdate de um cliente já existente (resolve o caso
  do legado e do erro de digitação no agendamento).
- Considerar adicionar índice em `(customer_phone, customer_birthdate)` se
  o `/cliente` ficar lento.
- O search admin (`/admin/appointments/search`) NÃO foi alterado — barbeiro
  continua vendo o `manage_token` direto. Aceito porque equipe é de 3.

## Deploy

1. `git add -A && git commit -m "feat: portal do cliente exige telefone + data de nascimento"`
2. `git push origin main`
3. EasyPanel rebuilda (~3min)
4. **Após o deploy**, rodar a migration no container:
   `npm run db:migrate` (ou aplicar o SQL direto via sqlite cli, se for o caso)
5. Testar: agendar pelo `/agendar` (deve exigir data), depois logar em
   `/cliente/entrar` com telefone + data.

## Verificação

- `npx tsc --noEmit` local: confirmar que passa antes do commit (o sandbox
  desta sessão estava com o mount dessincronizado, então a verificação
  oficial é local).
- Smoke test manual: novo agendamento + login no portal + ver lista.
- Edge case: tentar logar com cliente antigo, confirmar mensagem
  `legacy_no_birthdate`.
