import { PrismaClient } from "@prisma/client";
import { PrismaLibSql } from "@prisma/adapter-libsql";

const url = process.env.DATABASE_URL ?? "file:./dev.db";
const adapter = new PrismaLibSql({ url });
const prisma = new PrismaClient({ adapter });

async function setupFTS() {
  await prisma.$executeRawUnsafe(`
    CREATE VIRTUAL TABLE IF NOT EXISTS notes_fts USING fts5(
      id UNINDEXED,
      title,
      content,
      tags,
      content='Note',
      content_rowid='rowid'
    );
  `);

  await prisma.$executeRawUnsafe(`
    CREATE TRIGGER IF NOT EXISTS notes_fts_insert AFTER INSERT ON Note BEGIN
      INSERT INTO notes_fts(id, title, content, tags)
      VALUES (new.id, new.title, new.content, new.tags);
    END;
  `);

  await prisma.$executeRawUnsafe(`
    CREATE TRIGGER IF NOT EXISTS notes_fts_update AFTER UPDATE ON Note BEGIN
      DELETE FROM notes_fts WHERE id = old.id;
      INSERT INTO notes_fts(id, title, content, tags)
      VALUES (new.id, new.title, new.content, new.tags);
    END;
  `);

  await prisma.$executeRawUnsafe(`
    CREATE TRIGGER IF NOT EXISTS notes_fts_delete AFTER DELETE ON Note BEGIN
      DELETE FROM notes_fts WHERE id = old.id;
    END;
  `);

  console.log("FTS5 setup complete");
}

setupFTS()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
