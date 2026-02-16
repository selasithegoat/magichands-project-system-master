# ===== CONFIG =====
$DATE = Get-Date -Format "yyyyMMdd_HHmmss"
$BACKUP_ROOT = "C:\db-backups"
$DB_NAME = "magichands"
$TEMP_DUMP = "$BACKUP_ROOT\$DB_NAME`_$DATE"
$ARCHIVE = "$BACKUP_ROOT\$DB_NAME`_$DATE.archive"
$REMOTE = "gdrive_crypt:magichands"

# ===== DUMP DATABASE =====
mongodump --db $DB_NAME --archive=$ARCHIVE --gzip

# ===== UPLOAD TO GOOGLE DRIVE (ENCRYPTED) =====
rclone copy $ARCHIVE $REMOTE --progress

# ===== CLEAN LOCAL ARCHIVE AFTER UPLOAD =====
Remove-Item $ARCHIVE


# ===== ROTATION =====
$MAX_BACKUPS = 14

$FILES = rclone lsf $REMOTE --files-only | Sort-Object
$COUNT = $FILES.Count

if ($COUNT -gt $MAX_BACKUPS) {
    $DELETE = $FILES | Select-Object -First ($COUNT - $MAX_BACKUPS)
    foreach ($FILE in $DELETE) {
        rclone delete "$REMOTE/$FILE"
    }
}
