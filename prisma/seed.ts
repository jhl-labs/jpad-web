import { PrismaClient } from "@prisma/client";
import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { hashSync } from "bcryptjs";
import { v4 as uuidv4 } from "uuid";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL environment variable is required");
}

const pool = new Pool({ connectionString });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log("Seeding database...");

  // PLATFORM_ADMIN_EMAILS에서 첫 번째 이메일 추출
  const adminEmails = process.env.PLATFORM_ADMIN_EMAILS ?? "admin@example.com";
  const adminEmail = adminEmails.split(",")[0].trim();
  const adminPassword = process.env.SEED_ADMIN_PASSWORD ?? "admin123!";

  // 관리자 계정 upsert
  const admin = await prisma.user.upsert({
    where: { email: adminEmail },
    update: {},
    create: {
      id: uuidv4(),
      email: adminEmail,
      name: "Admin",
      hashedPassword: hashSync(adminPassword, 10),
    },
  });
  console.log(`Admin user: ${admin.email} (id: ${admin.id})`);

  // 샘플 워크스페이스 생성
  const workspaceSlug = "getting-started";
  const existing = await prisma.workspace.findUnique({
    where: { slug: workspaceSlug },
  });

  if (!existing) {
    const workspace = await prisma.workspace.create({
      data: {
        id: uuidv4(),
        name: "Getting Started",
        slug: workspaceSlug,
        description: "jpad 시작하기 — 샘플 워크스페이스",
        members: {
          create: {
            id: uuidv4(),
            userId: admin.id,
            role: "owner",
          },
        },
      },
    });
    console.log(`Sample workspace: ${workspace.name} (slug: ${workspace.slug})`);
  } else {
    console.log(`Workspace "${workspaceSlug}" already exists, skipping.`);
  }

  console.log("Seeding complete.");
}

main()
  .catch((e) => {
    console.error("Seed failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });
