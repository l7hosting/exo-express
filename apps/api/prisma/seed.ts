import { PrismaClient } from "@prisma/client";
import { randomBytes, scrypt as scryptCb } from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(scryptCb) as (p: string, s: Buffer, l: number) => Promise<Buffer>;

const prisma = new PrismaClient();

/** Initial reference pricing. Values are configuration, not hardcoded business logic. */
const INITIAL_ZONES = [
  { name: "Casablanca", city: "Casablanca", deliveryFee: 17, returnFee: 5 },
  { name: "Maarif", city: "Casablanca", deliveryFee: 20, returnFee: 5 },
  { name: "Sidi Maârouf", city: "Casablanca", deliveryFee: 20, returnFee: 5 },
  { name: "Bouskoura", city: "Casablanca", deliveryFee: 30, returnFee: 5 },
  { name: "Errahma", city: "Casablanca", deliveryFee: 30, returnFee: 5 },
  { name: "Gauthier", city: "Casablanca", deliveryFee: 30, returnFee: 5 },
  { name: "Dar Bouazza", city: "Casablanca", deliveryFee: 35, returnFee: 5 },
  { name: "Ain Diab", city: "Casablanca", deliveryFee: 35, returnFee: 5 }
];

async function hashPassword(password: string) {
  const salt = randomBytes(16);
  const derived = await scrypt(password, salt, 64);
  return `scrypt$${salt.toString("hex")}$${derived.toString("hex")}`;
}

async function main() {
  for (const zone of INITIAL_ZONES) {
    const existing = await prisma.zone.findFirst({
      where: { name: zone.name, city: zone.city }
    });
    if (existing) continue; // never overwrite existing business data
    await prisma.zone.create({
      data: {
        name: zone.name,
        city: zone.city,
        deliveryFee: zone.deliveryFee,
        returnFee: zone.returnFee,
        tariffs: {
          create: {
            label: zone.name,
            price: zone.deliveryFee,
            returnFee: zone.returnFee,
            isDefault: true
          }
        }
      }
    });
    console.log(`seeded zone ${zone.name} (${zone.deliveryFee} DH)`);
  }

  const adminEmail = process.env.SEED_ADMIN_EMAIL ?? "admin@exoexpress.ma";
  const adminPassword = process.env.SEED_ADMIN_PASSWORD;
  if (adminPassword) {
    const existing = await prisma.user.findUnique({ where: { email: adminEmail } });
    if (!existing) {
      await prisma.user.create({
        data: {
          email: adminEmail,
          fullName: "Administrateur EXO",
          role: "SUPER_ADMIN",
          passwordHash: await hashPassword(adminPassword)
        }
      });
      console.log(`seeded super admin ${adminEmail}`);
    }
  } else {
    console.log("SEED_ADMIN_PASSWORD not set, skipping admin creation");
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
