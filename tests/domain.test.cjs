'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const D = require('../assets/js/domain.js');
const today = '2026-10-05';
const now = '2026-10-05T08:00:00.000Z';
const draft = (extra = {}) => ({ type: 'lost', name: '蓝色水杯', category: 'bottle', place: '图书馆二楼', date: today, description: '白色杯盖', contactType: '微信', contactValue: 'demo_only', ...extra });
const item = (extra = {}) => D.createItem(draft(extra), 'owner-a', {today, now, id: extra.id || 'test-a'});

test('寻物和招领均可建立，首次状态为 active', () => {
  for (const type of ['lost', 'found']) {
    const value = item({type});
    assert.equal(value.type, type); assert.equal(value.status, 'active');
    assert.equal(value.ownerId, 'owner-a'); assert.equal(value.isDemo, false);
  }
});
test('必填字段的空白会被拦截，描述可空', () => {
  const result = D.validateDraft(draft({name:'  ',place:'\t',contactValue:'\n'}), today);
  assert.deepEqual(Object.keys(result.errors).sort(), ['contactValue','name','place']);
  assert.equal(D.validateDraft(draft({description:''}), today).ok, true);
});
test('空对象、非法类型、类别及联系方式类型被拦截', () => {
  assert.equal(D.validateDraft(null, today).ok, false);
  const result = D.validateDraft(draft({type:'chat',category:'__proto__',contactType:'站内聊天'}), today);
  assert.deepEqual(Object.keys(result.errors).sort(), ['category','contactType','type']);
});
test('闰年、无效日期、格式及年份边界', () => {
  for (const date of ['2024-02-29','2000-01-01','2100-12-31']) assert.equal(D.validDate(date), true);
  for (const date of ['2026-02-29','2026-04-31','2026-13-01','2026-1-01','1999-12-31','2101-01-01','']) assert.equal(D.validDate(date), false);
});
test('今天允许，明天拒绝', () => {
  assert.equal(D.validateDraft(draft(), today).ok, true);
  assert.match(D.validateDraft(draft({date:'2026-10-06'}), today).errors.date, /晚于今天/);
});
test('各文本字段恰好上限允许，上限加一拒绝', () => {
  for (const [key,max] of Object.entries(D.limits)) {
    assert.equal(D.validateDraft(draft({[key]:'字'.repeat(max)}), today).ok, true, key);
    assert.match(D.validateDraft(draft({[key]:'字'.repeat(max+1)}), today).errors[key], /字以内/);
  }
});
test('Unicode 码点计数，不把一个 emoji 当两个字', () => {
  assert.equal(D.validateDraft(draft({name:'😀'.repeat(40)}), today).ok, true);
  assert.equal(D.validateDraft(draft({name:'😀'.repeat(41)}), today).ok, false);
});
test('邮箱格式和多行联系方式校验', () => {
  assert.equal(D.validateDraft(draft({contactType:'邮箱',contactValue:'demo@example.com'}), today).ok, true);
  assert.equal(D.validateDraft(draft({contactType:'邮箱',contactValue:'demo@'}), today).ok, false);
  assert.equal(D.validateDraft(draft({contactValue:'a\nb'}), today).ok, false);
});
test('建立信息前去掉外围空格，校验失败不建立', () => {
  assert.equal(item({name:' 水杯 '}).name, '水杯');
  assert.throws(() => item({name:''}), /物品名称/);
  assert.throws(() => D.createItem(draft(), '', {today,now}), /发布者/);
});
test('关键词匹配名称、地点、描述，支持全角和大小写', () => {
  const entries = [item({name:'USB 耳机',description:'小熊挂件'})];
  for (const keyword of ['  ｕｓｂ  ','图书馆','小熊']) assert.equal(D.selectItems(entries,{keyword}).length, 1);
  assert.equal(D.selectItems(entries,{keyword:'不存在'}).length, 0);
});
test('组合筛选求交集，我的发布只显示本人的记录', () => {
  const a = item(); const b = {...item({id:'test-b',type:'found'}),ownerId:'owner-b'};
  assert.deepEqual(D.selectItems([a,b],{type:'lost',category:'bottle',place:'图书馆二楼',status:'active',ownerId:'owner-a'}),[a]);
  assert.equal(D.selectItems([a,b],{type:'found',ownerId:'owner-a'}).length,0);
});
test('按发布时间降序，不修改输入数组', () => {
  const a = item(); const b = {...item({id:'test-b'}),createdAt:'2026-10-04T08:00:00.000Z'};
  const entries = [b,a];
  assert.deepEqual(D.selectItems(entries).map(x=>x.id),['test-a','test-b']);
  assert.deepEqual(entries.map(x=>x.id),['test-b','test-a']);
});
test('本人完成记录：状态、时间及其他记录正确，原对象不变', () => {
  const a = item(); const b = item({id:'test-b'}); const next = D.finishItem([a,b],a.id,'owner-a','2026-10-05T09:00:00.000Z');
  assert.equal(next[0].status,'done'); assert.equal(next[0].updatedAt,'2026-10-05T09:00:00.000Z');
  assert.equal(a.status,'active'); assert.equal(next[1],b);
});
test('拒绝修改他人、示例及不存在的信息', () => {
  const a = item();
  assert.throws(()=>D.finishItem([a],a.id,'owner-b'),/自己/);
  assert.throws(()=>D.finishItem([{...a,isDemo:true}],a.id,'owner-a'),/自己/);
  assert.throws(()=>D.finishItem([a],'absent','owner-a'),/不存在/);
});
test('重复完成操作幂等，不覆盖完成时间', () => {
  const done = D.finishItem([item()],'test-a','owner-a',now);
  assert.equal(D.finishItem(done,'test-a','owner-a','2026-10-06T08:00:00.000Z'),done);
});
test('四种状态显示符合寻物、招领语义', () => {
  assert.equal(D.statusLabel({type:'lost',status:'active'}),'寻找中');
  assert.equal(D.statusLabel({type:'lost',status:'done'}),'已找到');
  assert.equal(D.statusLabel({type:'found',status:'active'}),'待认领');
  assert.equal(D.statusLabel({type:'found',status:'done'}),'已归还');
});
test('用户文本包含 HTML 时转义，空值安全', () => {
  assert.equal(D.escapeHTML(`<script a="x">&'</script>`),'&lt;script a=&quot;x&quot;&gt;&amp;&#39;&lt;/script&gt;');
  assert.equal(D.escapeHTML(null),'');
});
