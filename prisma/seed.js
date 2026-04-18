import "dotenv/config";
import prismaPkg from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const { PrismaClient } = prismaPkg;
const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

async function main() {
  await prisma.lckPlayer.deleteMany();
  await prisma.lckOrganization.deleteMany();

  await prisma.lckOrganization.createMany({
    data: [
      {
        name: "T1",
      },
      {
        name: "Gen.G",
      },
    ],
  });

  const organizations = await prisma.lckOrganization.findMany({
    select: {
      id: true,
      name: true,
    },
  });

  const organizationIds = Object.fromEntries(
    organizations.map((organization) => [organization.name, organization.id]),
  );

  await prisma.lckPlayer.createMany({
    data: [
      {
        name: "Doran",
        role: "top",
        organizationId: organizationIds["T1"],
      },
      {
        name: "Oner",
        role: "jungle",
        organizationId: organizationIds["T1"],
      },
      {
        name: "Faker",
        role: "mid",
        organizationId: organizationIds["T1"],
      },
      {
        name: "Gumayusi",
        role: "bot",
        organizationId: organizationIds["T1"],
      },
      {
        name: "Keria",
        role: "support",
        organizationId: organizationIds["T1"],
      },
      {
        name: "Kiin",
        role: "top",
        organizationId: organizationIds["Gen.G"],
      },
      {
        name: "Canyon",
        role: "jungle",
        organizationId: organizationIds["Gen.G"],
      },
      {
        name: "Chovy",
        role: "mid",
        organizationId: organizationIds["Gen.G"],
      },
      {
        name: "Ruler",
        role: "bot",
        organizationId: organizationIds["Gen.G"],
      },
      {
        name: "Duro",
        role: "support",
        organizationId: organizationIds["Gen.G"],
      },
    ],
  });

  console.log("Seeded organizations and players");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
