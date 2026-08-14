import { prisma } from "../packages/db/dist/index.js";

const n = await prisma.identity.count();
console.log("identity count:", n);
console.log("DATABASE_URL:", process.env.DATABASE_URL);
await prisma.$disconnect();
