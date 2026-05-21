#!/bin/sh
# Backup diário do banco SQLite — copiar para /data/backups com timestamp
DB_PATH="${DATABASE_PATH:-/data/appointments.db}"
BACKUP_DIR="/data/backups"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)

mkdir -p "$BACKUP_DIR"

# Copia online-safe via SQLite backup API
sqlite3 "$DB_PATH" ".backup $BACKUP_DIR/appointments_$TIMESTAMP.db"

# Remove backups com mais de 30 dias
find "$BACKUP_DIR" -name "*.db" -mtime +30 -delete

echo "Backup concluído: appointments_$TIMESTAMP.db"
