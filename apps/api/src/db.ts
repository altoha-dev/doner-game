import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from './generated/prisma/client.js';

export function createDatabase(databaseUrl: string): PrismaClient {
  const adapter = new PrismaPg({
    connectionString: databaseUrl,
    connectionTimeoutMillis: 5000,
    idleTimeoutMillis: 10000,
    max: 10,
  });
  return new PrismaClient({ adapter });
}
