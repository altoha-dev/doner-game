import assert from 'node:assert/strict';
import test from 'node:test';
import { DONER_RULES, roundReward, placementOffer, matchLeaders } from '@doner-game/shared';
import { parseCommand } from '../src/multiplayer/validation.ts';
test('confirmed competitive rewards: exact table, DNF/ABORTED/ineligible/invalid positions yield zero', () => {
  assert.deepEqual([1,2,3,4,5].map(p => roundReward(p,true,'FINISHED')), [{points:3,doners:0},{points:2,doners:1},{points:1,doners:2},{points:0,doners:3},{points:0,doners:3}]);
  for (const p of [null,0,-1,1.2,Infinity]) assert.deepEqual(roundReward(p,true,'FINISHED'), {points:0,doners:0});
  for (const status of ['DNF','ABORTED']) assert.deepEqual(roundReward(2,true,status), {points:0,doners:0});
  assert.deepEqual(roundReward(2,false,'FINISHED'), {points:0,doners:0});
});
test('two explicit build slots; extra costs one and is only offered after the free block', () => {
  assert.deepEqual(placementOffer([], 'basic-platform'), {slot:1,cost:0,endsTurn:false});
  assert.deepEqual(placementOffer([], 'fan'), {slot:1,cost:2,endsTurn:true});
  assert.deepEqual(placementOffer([], 'arcade-crossbow'), {slot:1,cost:3,endsTurn:true});
  assert.deepEqual(placementOffer([{catalogId:'basic-platform'}], 'basic-platform'), {slot:2,cost:1,endsTurn:true});
  assert.equal(placementOffer([{catalogId:'basic-platform'}], 'fan'), null);
  assert.equal(placementOffer([{catalogId:'fan'}], 'basic-platform'), null);
  assert.equal(placementOffer([{catalogId:'basic-platform'},{catalogId:'basic-platform'}], 'basic-platform'), null);
  assert.equal(DONER_RULES.minPlayers,2);
});
test('ties share the lead; clients cannot submit rewards, score, balance or purchase price', () => {
  assert.deepEqual(matchLeaders({players:[{playerId:'a',score:5},{playerId:'b',score:5},{playerId:'c',score:4}]} as never), ['a','b']);
  assert.deepEqual(matchLeaders({players:[{playerId:'a',score:0}]} as never), []);
  for (const type of ['RESULTS','REWARD','SET_BALANCE','giveDoners']) assert.equal(parseCommand({type,amount:999,position:1}),null);
  const command={type:'PLACE',round:1,commandId:'placement-test-1234',expectedRevision:1,position:{x:176,y:240},trapId:'fan'};
  for (const key of ['cost','doners','points','slot','balance']) assert.equal(parseCommand({...command,[key]:0}),null);
});
