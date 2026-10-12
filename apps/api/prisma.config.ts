import { defineConfig } from 'prisma/config';
import { loadApiEnvironment } from './src/config.ts';

loadApiEnvironment();

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: { path: 'prisma/migrations' },
  // Generation/build work without secrets; migration commands require DATABASE_URL.
  ...(process.env.DATABASE_URL ? { datasource: { url: process.env.DATABASE_URL } } : {}),
});
