import "dotenv/config";
import prismaPkg from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const { PrismaClient } = prismaPkg;
const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

async function main() {
  await prisma.lckPlayer.deleteMany();

  await prisma.lckPlayer.createMany({
    data: [
      {
        name: "Faker",
        role: "mid",
        teamName: "T1",
      },
      {
        name: "Chovy",
        role: "mid",
        teamName: "Gen.G",
      },
    ],
  });

  console.log("Seeded players");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
