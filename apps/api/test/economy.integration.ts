import assert from 'node:assert/strict';
import test from 'node:test';
import { randomUUID } from 'node:crypto';
import { io } from 'socket.io-client';
import type { Socket } from 'socket.io-client';
import type { ClientEvents, ServerEvents, OnlineRoom, RoomCommand } from '@doner-game/shared';
import { buildApp } from '../src/app.ts';
import { createDatabase } from '../src/db.ts';
import { createPlayerStore } from '../src/players.ts';
import { attachMultiplayer } from '../src/multiplayer/socket.ts';
import { roomStore } from '../src/multiplayer/store.ts';
import { config, signInitData } from './helpers.ts';
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
async function until(check: () => boolean | Promise<boolean>, ms = 8000) { const end=Date.now()+ms; while (!await check()) { assert.ok(Date.now()<end,'Timed out'); await sleep(25); } }
export function economyIntegration(url: string | undefined) {
  test('Stage6.3 economy: real purchases/rewards, ledger atomicity, duplicate/restart recovery', {skip:!url && 'Requires isolated TEST_DATABASE_URL',timeout:150000}, async t => {
    assert.ok(url); assert.match(new URL(url).pathname, /_test$/); assert.ok(['127.0.0.1','localhost'].includes(new URL(url).hostname));
    const db=createDatabase(url), players=createPlayerStore(db), store=roomStore(db), cfg={...config,databaseUrl:url};
    const ids:string[]=[], rooms:string[]=[], clients:Socket<ServerEvents,ClientEvents>[]=[];
    let app=await buildApp(cfg,players,false), transport=await attachMultiplayer(app,cfg,players,db,{buildMs:60000,raceMs:60000,reconnectGraceMs:30000,roomTtlMs:600000});
    await app.listen({host:'127.0.0.1',port:0});
    let address=`http://127.0.0.1:${(app.server.address() as {port:number}).port}`;
    let heartbeat:ReturnType<typeof setInterval>|undefined;
    t.after(async()=>{ clearInterval(heartbeat); clients.forEach(c=>c.disconnect()); await app.close(); await db.$executeRawUnsafe('DROP TRIGGER IF EXISTS stage63_fail_reward ON "DonerTransaction"'); await db.$executeRawUnsafe('DROP FUNCTION IF EXISTS stage63_fail_reward()'); await db.room.deleteMany({where:{id:{in:rooms}}});await db.user.deleteMany({where:{id:{in:ids}}});await db.$disconnect(); });
    const profiles=[];
    for(let i=0;i<4;i++){
      const auth=await app.inject({method:'POST',url:'/auth/telegram',payload:{initData:signInitData({user:JSON.stringify({id:5400000000000000+Date.now()+i,first_name:`Economy ${i}`})})}});assert.equal(auth.statusCode,200);
      const p=auth.json();profiles.push(p);ids.push(p.user.id);
      await db.playerProgress.update({where:{userId:p.user.id},data:{doners:[5,2,3,0][i]!,goldenDoners:7,campaignStage:4}});
    }
    const latest=new Map<string,OnlineRoom>();
    async function connect(i:number){const socket:Socket<ServerEvents,ClientEvents>=io(address,{auth:{token:profiles[i].accessToken},transports:['websocket'],forceNew:true,reconnection:false});clients.push(socket);socket.on('room:snapshot',r=>latest.set(ids[i]!,r));await new Promise<void>((resolve,reject)=>{socket.once('connect',resolve);socket.once('connect_error',reject);});return socket;}
    let sockets=await Promise.all([0,1,2,3].map(connect));
    const request=(i:number,c:RoomCommand)=>sockets[i]!.timeout(5000).emitWithAck('room:command',c);
    async function ok(i:number,c:RoomCommand){const reply=await request(i,c);assert.ok(reply.ok,JSON.stringify(reply));return reply.room!;}
    async function fail(i:number,c:RoomCommand,code:string){const r=await request(i,c);assert.equal(r.ok,false);if(!r.ok)assert.equal(r.code,code);}
    let room=await ok(0,{type:'CREATE',capacity:4});rooms.push(room.roomId);
    for(const i of [1,2,3])room=await ok(i,{type:'JOIN',code:room.code});
    for(const i of [0,1,2,3])await ok(i,{type:'READY',ready:true}); room=await ok(0,{type:'START'});
    function place(i:number,trapId:'basic-platform'|'fan'|'arcade-crossbow',x:number,y:number):RoomCommand {return {type:'PLACE',round:room.match.round,commandId:randomUUID(),expectedRevision:room.revision,trapId,orientation:trapId==='fan'?'up':trapId==='arcade-crossbow'?'left':'none',position:{x,y}};}
    await t.test('free block leaves exactly one extra slot; preview/cancel/invalid placement never debit',async()=>{
      room=await ok(0,place(0,'basic-platform',176,240)); assert.equal(room.balances?.[ids[0]!],5);assert.equal(room.players[0]!.buildDone,false);
      await fail(0,place(0,'basic-platform',176,240),'INVALID_PLACEMENT');
      sockets[1]!.emit('build:preview',{round:1,sequence:1,objectType:'fan',orientation:'up',position:{x:224,y:256}});await sleep(150);
      sockets[1]!.emit('build:preview',{round:1,sequence:2,objectType:'fan',orientation:'up',position:null});await sleep(100);
      assert.equal(await db.donerTransaction.count({where:{roomId:room.roomId}}),0);
      assert.equal((await db.playerProgress.findUniqueOrThrow({where:{userId:ids[1]!}})).doners,2);
    });
    await t.test('two concurrent extra requests: one placement/debit; lost/replayed ACK cannot repeat it',async()=>{
      const command=place(0,'basic-platform',208,224); const other={...command,commandId:randomUUID()} as RoomCommand;
      const result=await Promise.all([request(0,command),request(0,other)]); assert.equal(result.filter(r=>r.ok).length,1);
      const winner=result[0]!.ok?command:other;
      room=await ok(0,winner);assert.equal(room.balances?.[ids[0]!],4);assert.equal(room.match.placements.length,2);assert.equal(room.players[0]!.buildDone,true);
      assert.equal(await db.donerTransaction.count({where:{userId:ids[0]!,transactionType:'TRAP_PURCHASE'}}),1);
      await fail(0,place(0,'basic-platform',400,192),'ALREADY_BUILT');
    });
    await t.test('placement insert failure after debit rolls back wallet, ledger, room revision and slot',async()=>{
      const before=await db.playerProgress.findUniqueOrThrow({where:{userId:ids[1]!}});
      const revision=room.revision, count=await db.donerTransaction.count({where:{roomId:room.roomId}});
      await db.$executeRawUnsafe(`CREATE FUNCTION stage63_fail_placement() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'test-only placement failure'; END $$`);
      await db.$executeRawUnsafe('CREATE TRIGGER stage63_fail_placement BEFORE INSERT ON "TrapPlacement" FOR EACH ROW EXECUTE FUNCTION stage63_fail_placement()');
      try { await fail(1,place(1,'fan',224,256),'SERVER_ERROR'); }
      finally { await db.$executeRawUnsafe('DROP TRIGGER stage63_fail_placement ON "TrapPlacement"'); await db.$executeRawUnsafe('DROP FUNCTION stage63_fail_placement()'); }
      assert.deepEqual(await db.playerProgress.findUniqueOrThrow({where:{userId:ids[1]!}}),before);
      assert.equal(await db.donerTransaction.count({where:{roomId:room.roomId}}),count);
      assert.equal(await db.trapPlacement.count({where:{roomId:room.roomId,userId:ids[1]!}}),0);
      room=await ok(1,{type:'RESUME'}); assert.equal(room.revision,revision); assert.equal(room.players[1]!.buildDone,false);
    });
    await t.test('FAN2/CROSSBOW3 are atomic; poor player can still build free and explicitly end turn',async()=>{
      room=await ok(1,place(1,'fan',224,256));assert.equal(room.balances?.[ids[1]!],0);
      room=await ok(2,place(2,'arcade-crossbow',160,256));assert.equal(room.balances?.[ids[2]!],0);
      await fail(3,place(3,'fan',352,240),'INSUFFICIENT_DONER');assert.equal(await db.trapPlacement.count({where:{roomId:room.roomId,userId:ids[3]!}}),0);
      room=await ok(3,place(3,'basic-platform',352,240));assert.equal(room.match.phase,'BUILD');
      room=await ok(3,{type:'SKIP',round:1});assert.equal(room.match.phase,'RACE');
      assert.equal(await db.donerTransaction.count({where:{roomId:room.roomId,transactionType:'TRAP_PURCHASE'}}),3);
    });
    await t.test('four real input clients finish; exact rewards, identical results, score and one settlement',async()=>{
      const sequence=[0,0,0,0],jump=[0,0,0,0]; let lastJump=0;
      heartbeat=setInterval(()=>{const now=Date.now(),press=now-lastJump>400;if(press)lastJump=now;
        for(let i=0;i<4;i++){const own=transport.manager.movementSnapshot(ids[i]!)?.players.find(p=>p.playerId===ids[i]);if(!own||own.finished)continue;
          if(own.life && own.life.phase!=='ALIVE'){sequence[i]=own.sequence;jump[i]=own.jumpSerial;continue;}
          sequence[i]=Math.max(sequence[i]!,own.sequence);if(press)jump[i]++;
          sockets[i]!.emit('race:input',{round:1,frames:Array.from({length:3},()=>({sequence:++sequence[i]!,direction:1 as const,jump:jump[i]!}))});
        }
      },50);
      await until(()=>transport.manager.current(ids[0]!)?.rounds?.[0]?.status==='SETTLED',40000);clearInterval(heartbeat);
      room=await ok(0,{type:'RESUME'});assert.deepEqual(room.finishes.map(f=>f.position).sort(),[1,2,3,4]);
      for(const f of room.finishes){assert.equal(f.points,[3,2,1,0][f.position!-1]);assert.equal(f.doners,f.position!-1);}
      await until(()=>ids.every(id=>latest.get(id)?.revision===room.revision)); for(const id of ids)assert.deepEqual(latest.get(id)!.finishes,room.finishes);
      assert.equal(room.players.reduce((sum,p)=>sum+(p.score??0),0),6);
      const before=await db.playerProgress.findMany({where:{userId:{in:ids}},orderBy:{userId:'asc'}});
      await Promise.all([store.settle(room.roomId,1),store.settle(room.roomId,1)]);
      assert.deepEqual(await db.playerProgress.findMany({where:{userId:{in:ids}},orderBy:{userId:'asc'}}),before);
      assert.equal(await db.donerTransaction.count({where:{roomId:room.roomId,transactionType:'ROUND_REWARD'}}),4);
      for(const p of before){assert.equal(p.goldenDoners,7);assert.equal(p.campaignStage,4);}
    });
    await t.test('NEXT preserves traps; disconnect/restart after persisted purchase before observing ACK is idempotent',async()=>{
      room=await ok(0,{type:'NEXT'});assert.equal(room.match.placements.length,5);
      await db.playerProgress.update({where:{userId:ids[1]!},data:{doners:5}});room=await ok(1,{type:'RESUME'});
      const command=place(1,'fan',464,176);
      sockets[1]!.emit('room:command',command,()=>{}); // deliberately discard ACK
      await until(()=>db.trapPlacement.count({where:{placementId:(command as {commandId:string}).commandId}}).then(n=>n===1));
      sockets[1]!.disconnect(); await app.close();
      app=await buildApp(cfg,players,false);transport=await attachMultiplayer(app,cfg,players,db);await app.listen({host:'127.0.0.1',port:0});address=`http://127.0.0.1:${(app.server.address() as {port:number}).port}`;
      sockets[1]=await connect(1);room=await ok(1,command);assert.equal(room.balances?.[ids[1]!],3);assert.equal(room.match.placements.length,6);
      assert.equal(await db.donerTransaction.count({where:{placementId:(command as {commandId:string}).commandId}}),1);
    });
    await t.test('failed reward transaction rolls back completely; PENDING survives restart and retry settles once',async()=>{
      await app.close();room=(await store.load(room.roomId))[0]!;
      const summary=room.rounds!.find(r=>r.round===2)!;summary.status='PENDING';summary.participantIds=[...ids];summary.playedIds=[...ids];
      room.match={...room.match,phase:'RESULTS'};room.deadline=null;room.raceStartedAt=Date.now()-15000;room.revision++;room.match={...room.match,revision:room.revision};
      room.finishes.push(...ids.map((playerId,i)=>({playerId,round:2,status:i<2?'FINISHED' as const:'DNF' as const,position:i<2?i+1:null,durationMs:i<2?15000+i:null,finishedAt:i<2?Date.now():null})));
      await store.save(room);
      const before=await db.playerProgress.findMany({where:{userId:{in:ids}},orderBy:{userId:'asc'}});
      await db.$executeRawUnsafe(`CREATE FUNCTION stage63_fail_reward() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW."roundNumber" = 2 AND NEW."transactionType" = 'ROUND_REWARD' THEN RAISE EXCEPTION 'test-only reward failure'; END IF; RETURN NEW; END $$`);
      await db.$executeRawUnsafe('CREATE TRIGGER stage63_fail_reward BEFORE INSERT ON "DonerTransaction" FOR EACH ROW EXECUTE FUNCTION stage63_fail_reward()');
      await assert.rejects(store.settle(room.roomId,2));assert.deepEqual(await db.playerProgress.findMany({where:{userId:{in:ids}},orderBy:{userId:'asc'}}),before);
      assert.equal((await db.matchRound.findUniqueOrThrow({where:{roomId_roundNumber:{roomId:room.roomId,roundNumber:2}}})).settlement,'PENDING');
      await db.$executeRawUnsafe('DROP TRIGGER stage63_fail_reward ON "DonerTransaction"');await db.$executeRawUnsafe('DROP FUNCTION stage63_fail_reward()');
      app=await buildApp(cfg,players,false);transport=await attachMultiplayer(app,cfg,players,db);await app.listen({host:'127.0.0.1',port:0});
      await until(()=>transport.manager.current(ids[0]!)?.rounds?.find(r=>r.round===2)?.status==='SETTLED');
      assert.equal(await db.donerTransaction.count({where:{roomId:room.roomId,roundNumber:2,transactionType:'ROUND_REWARD'}}),2);
      const paid=await db.playerProgress.findMany({where:{userId:{in:ids}},orderBy:{userId:'asc'}});
      await app.close();app=await buildApp(cfg,players,false);transport=await attachMultiplayer(app,cfg,players,db);await app.listen({host:'127.0.0.1',port:0});await sleep(150);
      assert.deepEqual(await db.playerProgress.findMany({where:{userId:{in:ids}},orderBy:{userId:'asc'}}),paid);
      room=transport.manager.current(ids[0]!)!;assert.equal(room.players.reduce((sum,p)=>sum+(p.score??0),0),11);
    });
    await t.test('conditional balance debit cooperates with concurrent PlayerProgress writes; solo/idle never reward',async()=>{
      await app.close();room=(await store.load(room.roomId))[0]!;room.match={...room.match,phase:'MATCH_FINISHED'};room.revision++;await store.save(room);
      const id=randomUUID();rooms.push(id);const solo:OnlineRoom={...room,roomId:id,code:'ECONMY',revision:1,players:[{...room.players[3]!,connected:true,left:false,buildDone:false,score:0}],finishes:[],rounds:[{round:1,status:'NOT_STARTED',participantIds:[ids[3]!],playedIds:[ids[3]!],settledAt:null}],match:{...room.match,matchId:id,phase:'BUILD',round:1,revision:1,placements:[]}};
      await store.save(solo,true);await db.playerProgress.update({where:{userId:ids[3]!},data:{doners:2}});
      const next=structuredClone(solo);next.revision++;next.match={...next.match,placements:[{id:randomUUID(),catalogId:'fan',orientation:'up',slot:1,cost:2,ownerId:ids[3]!,round:1,x:224,y:256,width:32,height:16}]};
      const [buy,other]=await Promise.allSettled([store.save(next),db.playerProgress.updateMany({where:{userId:ids[3]!,doners:{gte:1}},data:{doners:{decrement:1}}})]);
      assert.equal(other.status,'fulfilled');const debit=other.status==='fulfilled'?other.value.count:0;
      const count=await db.trapPlacement.count({where:{roomId:id}});assert.equal(count,buy.status==='fulfilled'?1:0);
      assert.equal((await db.playerProgress.findUniqueOrThrow({where:{userId:ids[3]!}})).doners,2-count*2-debit);
      assert.equal(await db.donerTransaction.count({where:{roomId:id}}),count);
      const final=(await store.load(id))[0]!;final.revision++;final.match={...final.match,phase:'RESULTS'};final.rounds![0]!.status='PENDING';final.finishes=[{playerId:ids[3]!,round:1,status:'FINISHED',position:1,durationMs:10000,finishedAt:Date.now()}];await store.save(final);await store.settle(id,1);
      assert.equal(await db.donerTransaction.count({where:{roomId:id,transactionType:'ROUND_REWARD'}}),0);
      assert.equal((await store.load(id))[0]!.players[0]!.score,0);
    });
  });
}
