/**
 * Creates a staff account (operations, dispatcher, depot agent, accountant,
 * support, admin or super admin) with a hashed password.
 *
 * The API deliberately exposes no public user-creation endpoint: a courier can
 * only be created through `POST /api/v1/couriers`, and every other role has to
 * be provisioned from the server side. This script is that provisioning path.
 *
 * Usage:
 *   DATABASE_URL=postgresql://… npx tsx scripts/create-staff-user.ts \
 *     --email accountant@exoexpress.ma \
 *     --password "S3cret!" \
 *     --name "Nom Complet" \
 *     --role ACCOUNTANT
 *
 * The password is never stored in clear text: it is hashed with the same
 * scrypt implementation the API uses (`src/lib/password.ts`).
 */
import { PrismaClient } from "@prisma/client";
import { hashPassword } from "../src/lib/password.js";

const STAFF_ROLES = [
  "SUPER_ADMIN",
  "ADMIN",
  "OPERATIONS",
  "DISPATCHER",
  "DEPOT_AGENT",
  "ACCOUNTANT",
  "SUPPORT"
] as const;

type StaffRole = (typeof STAFF_ROLES)[number];

const prisma = new PrismaClient();

function readArgument(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  if (index === -1) return undefined;
  const value = process.argv[index + 1];
  return value && !value.startsWith("--") ? value : undefined;
}

async function main() {
  const email = readArgument("email")?.trim().toLowerCase();
  const password = readArgument("password");
  const fullName = readArgument("name")?.trim();
  const phone = readArgument("phone")?.trim();
  const role = (readArgument("role") ?? "OPERATIONS") as StaffRole;

  if (!email || !password || !fullName) {
    console.error("Missing arguments: --email, --password and --name are required.");
    console.error(`Available roles: ${STAFF_ROLES.join(", ")}`);
    process.exitCode = 1;
    return;
  }

  if (!STAFF_ROLES.includes(role)) {
    console.error(`Unknown role "${role}". Available roles: ${STAFF_ROLES.join(", ")}`);
    process.exitCode = 1;
    return;
  }

  if (password.length < 10) {
    console.error("The password must be at least 10 characters long.");
    process.exitCode = 1;
    return;
  }

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    console.error(`A user already exists for ${email}. Nothing was changed.`);
    process.exitCode = 1;
    return;
  }

  const user = await prisma.user.create({
    data: {
      email,
      fullName,
      phone: phone ?? null,
      role,
      passwordHash: await hashPassword(password)
    },
    select: { id: true, email: true, fullName: true, role: true, isActive: true }
  });

  console.log(`Created ${user.role} account ${user.email} (${user.id}).`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
