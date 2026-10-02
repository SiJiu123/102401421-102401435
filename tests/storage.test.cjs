'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const D = require('../assets/js/domain.js');
const S = require('../assets/js/storage.js');
const now = new Date('2026-10-05T08:00:00.000Z');
function memoryStorage() {
  const entries = new Map();
  return {getItem:key=>entries.has(key)?entries.get(key):null,setItem:(key,value)=>entries.set(key,String(value)),removeItem:key=>entries.delete(key)};
}
function newItem(ownerId) { return D.createItem({type:'found',name:'测试钥匙',category:'keys',place:'教学楼',date:'2026-10-05',description:'',contactType:'微信',contactValue:'demo_only'},ownerId,{today:'2026-10-05',now:now.toISOString(),id:'own-test'}); }
test('首次读取生成六条示例并保存发布者标识', () => {
  const local = memoryStorage(); const result = S.createRepository(local).load(now);
  assert.equal(result.ok,true); assert.equal(result.state.items.length,6);
  assert.equal(result.state.items.every(x=>x.isDemo),true);
  assert.equal(S.validState(JSON.parse(local.getItem(S.KEY))),true);
});
test('重新建立仓储后，发布记录及本人标识仍保留', () => {
  const local = memoryStorage(); const repo = S.createRepository(local); const first = repo.load(now).state;
  const next = {...first,items:[newItem(first.ownerId),...first.items]};
  assert.equal(repo.save(next).ok,true);
  assert.deepEqual(S.createRepository(local).load(now).state,next);
});
test('完成状态刷新后保持，其他记录不变', () => {
  const local = memoryStorage(); const repo = S.createRepository(local); const first = repo.load(now).state;
  const next = {...first,items:D.finishItem([newItem(first.ownerId),...first.items],'own-test',first.ownerId,now.toISOString())};
  assert.equal(repo.save(next).ok,true);
  const after = repo.load(now).state;
  assert.equal(after.items[0].status,'done'); assert.deepEqual(after.items.slice(1),first.items);
});
test('损坏的 JSON 返回只读提示，不覆盖原始内容', () => {
  const local = memoryStorage(); local.setItem(S.KEY,'{broken');
  const result = S.createRepository(local).load(now);
  assert.equal(result.ok,false); assert.equal(result.state.ownerId,'preview-only');
  assert.equal(local.getItem(S.KEY),'{broken'); assert.match(result.error,/读取/);
});
test('非法字段、重复 ID、缺少发布者或非法时间被拒绝', () => {
  const valid = S.createRepository(memoryStorage()).load(now).state;
  for (const change of [{status:'unknown'},{date:'2026-02-30'},{ownerId:''},{createdAt:'bad'},{isDemo:'true'}]) {
    assert.equal(S.validState({...valid,items:[{...valid.items[0],...change}]}),false);
  }
  assert.equal(S.validState({...valid,items:[valid.items[0],valid.items[0]]}),false);
  assert.equal(S.validState({...valid,schema:2}),false);
});
test('读取存储被禁止时返回预览，不抛出未处理异常', () => {
  const repo = S.createRepository({getItem(){throw new Error('blocked');},setItem(){throw new Error('blocked');}});
  assert.equal(repo.load(now).ok,false);
});
test('初始化写入失败不会宣称保存成功', () => {
  const repo = S.createRepository({getItem(){return null;},setItem(){throw new Error('quota');}});
  const result = repo.load(now); assert.equal(result.ok,false); assert.match(result.error,/保存失败/);
});
test('更新写入失败保留原有已保存记录', () => {
  const local = memoryStorage(); const first = S.createRepository(local).load(now).state; const before = local.getItem(S.KEY);
  const broken = {getItem:local.getItem,setItem(){throw new Error('quota');}};
  const result = S.createRepository(broken).save({...first,items:[newItem(first.ownerId),...first.items]});
  assert.equal(result.ok,false); assert.equal(local.getItem(S.KEY),before);
});
test('保存非法数据时不覆盖原始记录', () => {
  const local = memoryStorage(); const repo = S.createRepository(local); repo.load(now); const before = local.getItem(S.KEY);
  assert.equal(repo.save({schema:1,ownerId:'a',items:[{}]}).ok,false);
  assert.equal(local.getItem(S.KEY),before);
});
test('草稿按发布者恢复，清除后不会再次恢复', () => {
  const repo = S.createRepository(memoryStorage());
  assert.equal(repo.saveDraft('a',{name:'测试草稿',type:'lost'}),true);
  assert.equal(repo.loadDraft('a').name,'测试草稿'); assert.deepEqual(repo.loadDraft('b'),{});
  assert.equal(repo.clearDraft(),true); assert.deepEqual(repo.loadDraft('a'),{});
});
test('损坏草稿不影响读取，写入删除失败有返回值', () => {
  const local = memoryStorage(); local.setItem(S.DRAFT_KEY,'{');
  assert.deepEqual(S.createRepository(local).loadDraft('a'),{});
  const repo = S.createRepository({setItem(){throw new Error();},removeItem(){throw new Error();}});
  assert.equal(repo.saveDraft('a',{}),false); assert.equal(repo.clearDraft(),false);
});
