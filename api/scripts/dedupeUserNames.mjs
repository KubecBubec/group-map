/**
 * Pred prisma db push: ak existujú duplicitné mená, premenuje ich (User 2, User 3, …).
 * Spúšťa sa pri štarte API kontajnera.
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const users = await prisma.user.findMany({
    select: { id: true, name: true },
    orderBy: { createdAt: "asc" },
  });

  const counts = new Map();
  let renamed = 0;

  for (const user of users) {
    const key = user.name.trim().toLowerCase();
    const next = (counts.get(key) ?? 0) + 1;
    counts.set(key, next);
    if (next === 1) continue;

    const suffix = ` ${next}`;
    const base = user.name.trim().slice(0, Math.max(1, 40 - suffix.length));
    const newName = `${base}${suffix}`;
    await prisma.user.update({ where: { id: user.id }, data: { name: newName } });
    renamed += 1;
    console.log(`[dedupe] ${user.name} → ${newName}`);
  }

  if (renamed === 0) console.log("[dedupe] Žiadne duplicitné mená.");
  else console.log(`[dedupe] Premenovaných: ${renamed}`);
}

main()
  .catch((err) => {
    console.error("[dedupe] failed:", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
