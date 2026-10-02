(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./domain.js'));
  else root.CampusStorage = factory(root.CampusDomain);
}(typeof globalThis !== 'undefined' ? globalThis : this, function (D) {
  'use strict';
  const KEY = 'campus-lost-found-v1';
  const DRAFT_KEY = `${KEY}-draft`;
  function seedItems(now = new Date()) {
    const date = offset => { const day = new Date(now); day.setDate(day.getDate() - offset); return D.localDate(day); };
    const seed = [
      ['demo-cup', 'found', '蓝色保温水杯', 'bottle', '图书馆二楼', 1, '杯盖有一处白色划痕，请联系时说明其他特征。', 'demo_cup'],
      ['demo-umbrella', 'lost', '黑色折叠雨伞', 'umbrella', '南区食堂', 1, '伞柄挂着灰色绳结，午饭后发现遗失。', 'demo_umbrella'],
      ['demo-card', 'found', '校园卡', 'card', '教学楼 A 区一层', 2, '卡面个人信息已遮挡，请认领时说明姓名与其他特征。', 'demo_card'],
      ['demo-keys', 'found', '挂着小熊的钥匙串', 'keys', '运动场看台', 2, '钥匙串有小熊挂件。请说明钥匙数量和挂件颜色。', 'demo_keys'],
      ['demo-book', 'lost', '软件工程教材', 'books', '图书馆二楼', 3, '书里夹着手写书签，封面贴有透明保护膜。', 'demo_book'],
      ['demo-earbuds', 'found', '白色无线耳机', 'electronics', '南区食堂', 4, '耳机和充电盒一起捡到，请说明品牌和外壳特征。', 'demo_earbuds']
    ];
    return seed.map(([id, type, name, category, place, offset, description, contactValue]) => ({ id, type, name, category, place, date: date(offset), description, contactType: '微信', contactValue, ownerId: 'demo-owner', status: id === 'demo-earbuds' ? 'done' : 'active', createdAt: `${date(offset)}T08:00:00.000Z`, updatedAt: `${date(offset)}T08:00:00.000Z`, isDemo: true }));
  }
  function validState(state) {
    if (!state || state.schema !== 1 || typeof state.ownerId !== 'string' || !state.ownerId.trim() || !Array.isArray(state.items)) return false;
    const seen = new Set();
    return state.items.every(item => {
      if (!item || typeof item.id !== 'string' || !item.id || seen.has(item.id)) return false;
      seen.add(item.id);
      if (typeof item.ownerId !== 'string' || !item.ownerId.trim() || !['active', 'done'].includes(item.status) || typeof item.isDemo !== 'boolean') return false;
      if (typeof item.createdAt !== 'string' || typeof item.updatedAt !== 'string' || !Number.isFinite(Date.parse(item.createdAt)) || !Number.isFinite(Date.parse(item.updatedAt))) return false;
      // 已保存的合法日期不受当前系统时钟回拨影响。
      return D.validateDraft(item, '2100-12-31').ok;
    });
  }
  function createRepository(storage) {
    function save(state) {
      if (!validState(state)) return { ok: false, error: '信息格式异常，尚未保存。请保留当前内容并重试。' };
      try { storage.setItem(KEY, JSON.stringify(state)); return { ok: true }; }
      catch { return { ok: false, error: '本机保存失败，信息尚未发布或更新。请检查浏览器存储空间后重试。' }; }
    }
    function load(now = new Date()) {
      try {
        const raw = storage.getItem(KEY);
        if (raw !== null) {
          const state = JSON.parse(raw);
          if (!validState(state)) throw new Error('invalid schema');
          return { ok: true, state };
        }
        const state = { schema: 1, ownerId: D.makeId(), items: seedItems(now) };
        const result = save(state);
        return result.ok ? { ok: true, state } : { ok: false, state, error: result.error };
      } catch {
        return { ok: false, state: { schema: 1, ownerId: 'preview-only', items: seedItems(now) }, error: '无法读取本机保存的信息，暂时展示示例。发布与状态更新不可用，请保留原数据并联系开发者。' };
      }
    }
    function loadDraft(ownerId) {
      try {
        const saved = JSON.parse(storage.getItem(DRAFT_KEY) || 'null');
        if (!saved || saved.ownerId !== ownerId || !saved.value || typeof saved.value !== 'object') return {};
        return Object.fromEntries(['type', 'name', 'category', 'place', 'date', 'description', 'contactType', 'contactValue'].map(key => [key, typeof saved.value[key] === 'string' ? saved.value[key] : '']));
      } catch { return {}; }
    }
    function saveDraft(ownerId, value) {
      try { storage.setItem(DRAFT_KEY, JSON.stringify({ ownerId, value })); return true; }
      catch { return false; }
    }
    function clearDraft() {
      try { storage.removeItem(DRAFT_KEY); return true; }
      catch { return false; }
    }
    return { load, save, loadDraft, saveDraft, clearDraft };
  }
  return { KEY, DRAFT_KEY, seedItems, validState, createRepository };
}));
