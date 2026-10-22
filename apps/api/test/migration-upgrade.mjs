// Dedicated empty *_upgrade_test DB only. Apply real old Prisma migrations, seed legacy data,
// then apply all pending migrations with the current config. Never resets or drops a database.
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, cp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import pg from 'pg';
const url = process.env.TEST_UPGRADE_DATABASE_URL;
assert.ok(url && new URL(url).pathname.endsWith('_upgrade_test') && ['127.0.0.1','localhost'].includes(new URL(url).hostname));
const db = new pg.Client({connectionString:url}); await db.connect();
try {
  const tables = await db.query("SELECT tablename FROM pg_tables WHERE schemaname='public'");assert.equal(tables.rowCount,0,'Use a new empty upgrade-test database; existing databases are never reset');
  const folder=await mkdtemp(`${tmpdir()}/doner-upgrade-`), migrations=`${folder}/migrations`;await mkdir(migrations);
  for (const name of ['migration_lock.toml','20261012000000_init','20261013000000_selected_character','20261020000000_party_rooms']) await cp(`prisma/migrations/${name}`,`${migrations}/${name}`,{recursive:true});
  const file=`${folder}/prisma.config.ts`;
  await writeFile(file,`import { defineConfig } from ${JSON.stringify(resolve('node_modules/prisma/config.js'))};\nexport default defineConfig({schema:${JSON.stringify(resolve('prisma/schema.prisma'))},migrations:{path:${JSON.stringify(migrations)}},datasource:{url:process.env.DATABASE_URL!}});\n`);
  const run=(config)=>execFileSync('pnpm',['exec','prisma','migrate','deploy','--config',config],{env:{...process.env,DATABASE_URL:url},stdio:'inherit'});
  run(file);
  const user='aa000000-0000-4000-8000-000000000001',room='aa000000-0000-4000-8000-000000000002';
  await db.query('INSERT INTO "User" (id,"telegramId","firstName","updatedAt") VALUES ($1,6000000000000001,\'Legacy user\',now())',[user]);
  await db.query('INSERT INTO "PlayerProgress" (id,"userId",doners,"goldenDoners","campaignStage","selectedCharacterId","updatedAt") VALUES ($1,$2,17,9,4,\'temik\',now())',['aa000000-0000-4000-8000-000000000003',user]);
  await db.query('INSERT INTO "Room" (id,code,"hostUserId",phase,"currentRound","updatedAt","expiresAt") VALUES ($1,\'LEGACY\',$2,\'RESULTS\',1,now(),now()+interval \'1 hour\')',[room,user]);
  await db.query('INSERT INTO "MatchRound" ("roomId","roundNumber",phase) VALUES ($1,1,\'RESULTS\')',[room]);
  await db.query('INSERT INTO "TrapPlacement" ("placementId","roomId","roundNumber","userId","objectType","gridX","gridY") VALUES (\'legacy-placement\',$1,1,$2,\'basic-platform\',176,240)',[room,user]);
  run(resolve('prisma.config.ts'));
  const progress=(await db.query('SELECT doners,"goldenDoners","campaignStage","selectedCharacterId" FROM "PlayerProgress" WHERE "userId"=$1',[user])).rows[0];
  assert.deepEqual(progress,{doners:17,goldenDoners:9,campaignStage:4,selectedCharacterId:'temik'});
  assert.deepEqual((await db.query('SELECT orientation,slot,cost FROM "TrapPlacement"')).rows,[{orientation:'none',slot:1,cost:0}]);
  assert.equal((await db.query('SELECT settlement FROM "MatchRound"')).rows[0].settlement,'LEGACY');
  assert.equal((await db.query('SELECT * FROM "DonerTransaction"')).rowCount,0);
  assert.equal((await db.query('SELECT * FROM "_prisma_migrations" WHERE finished_at IS NOT NULL')).rowCount,5);
  console.log('PASS legacy upgrade: three old migrations + populated user/progress/block -> pending orientation + economy, balances preserved, no retroactive rewards');
} finally { await db.end(); }
