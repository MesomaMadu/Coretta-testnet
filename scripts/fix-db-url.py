from pathlib import Path

# Prisma resolves SQLite relative paths against the schema directory
# (packages/db/prisma), not process.cwd(). Always use file:./dev.db.
db_line = 'DATABASE_URL="file:./dev.db"'
for path in [
    Path("packages/db/.env"),
    Path("apps/api/.env"),
    Path(".env"),
]:
    if not path.exists():
        print("missing", path)
        continue
    lines = path.read_text(encoding="utf-8").splitlines()
    out = []
    found = False
    for line in lines:
        if line.startswith("DATABASE_URL="):
            out.append(db_line)
            found = True
        else:
            out.append(line)
    if not found:
        out.insert(0, db_line)
    path.write_text("\n".join(out) + "\n", encoding="utf-8")
    print("updated", path, "->", db_line)

db = Path("packages/db/prisma/dev.db")
print("db exists:", db.exists(), db.resolve())
