# Wipe de appointments — procedimento

Script: `scripts/wipe-appointments.mjs`

## O que ele faz

1. Copia o `data/appointments.db` pra `data/backups/appointments-pre-wipe-<timestamp>.db`.
2. Mostra contagem atual e dá 5 segundos pra cancelar (Ctrl+C).
3. `DELETE FROM appointments` + reset do autoincrement + `VACUUM`.
4. Verifica e mostra contagem final.
5. **Preserva**: barbers, services, barber_services, working_hours, time_off.

## Rodar em produção (Hostinger / EasyPanel)

```bash
# 1) SSH no container ou usar o terminal do EasyPanel
# 2) Ir pra raiz do app (geralmente /app)
cd /app

# 3) Rodar o script
node scripts/wipe-appointments.mjs
```

Saída esperada:

```
[wipe] Backup criado: ./data/backups/appointments-pre-wipe-20260522-235959.db (65.0 KB)
[wipe] Antes: N appointments
[wipe] Por status: [...]
[wipe] Apagando TODOS os agendamentos em 5 segundos. Ctrl+C pra cancelar.
  5... 4... 3... 2... 1...
[wipe] Apagados: N appointments. Restantes: 0.
[wipe]   barbers: 3 linhas (preservada)
[wipe]   services: ... (preservada)
[wipe] OK. Pra restaurar: cp <backup-path> ./data/appointments.db
```

## Pra restaurar (se der ruim)

Pare o app primeiro, depois:

```bash
cp data/backups/appointments-pre-wipe-<timestamp>.db data/appointments.db
# Remova WAL/SHM órfãos pra forçar reconciliação limpa
rm -f data/appointments.db-wal data/appointments.db-shm
# Reinicie o app
```

## Avisos importantes

- **Agendamentos confirmados futuros somem.** Clientes que tinham horário marcado
  pra os próximos dias vão sumir da agenda do barbeiro. Eles podem aparecer
  no salão esperando ser atendidos.
- **Links `/a/{token}` ficam quebrados.** Quem tinha link salvo no WhatsApp ou
  no calendário vai receber 404.
- O backup fica no próprio container. Se o container for recriado sem
  volume persistente do `data/`, o backup vai junto. Pra segurança extra,
  baixe o backup pra fora do container:
  ```bash
  # Do seu computador local, com a chave SSH do container:
  scp user@host:/app/data/backups/appointments-pre-wipe-*.db ./backups-local/
  ```

## Histórico de execuções

| Data       | Ambiente        | Quantidade apagada | Backup                                          |
|------------|-----------------|---------------------|-------------------------------------------------|
| 2026-05-22 | local (dev)     | 7 (5 conf, 2 canc)  | `data/backups/appointments-pre-wipe-20260522-232920.db` |
| _aguardando_ | produção       | _aguardando_        | _aguardando_                                    |
