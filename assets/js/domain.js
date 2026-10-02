/* 页面、存储和单元测试共用的业务规则。经典脚本兼容 file://。 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.CampusDomain = api;
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const categories = Object.freeze({ card: '校园卡 / 证件', keys: '钥匙', bottle: '水杯', umbrella: '雨伞', electronics: '电子物品', books: '书籍', clothing: '衣物', other: '其他' });
  const limits = Object.freeze({ name: 40, place: 60, description: 400, contactValue: 80 });
  const contactTypes = Object.freeze(['微信', 'QQ', '邮箱', '电话']);
  const text = value => typeof value === 'string' ? value.trim() : '';
  const normalize = value => text(value).normalize('NFKC').toLocaleLowerCase().replace(/\s+/g, ' ');
  function localDate(date = new Date()) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  }
  function validDate(value) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const [year, month, day] = value.split('-').map(Number);
    if (year < 2000 || year > 2100) return false;
    const date = new Date(Date.UTC(year, month - 1, day));
    return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
  }
  function validateDraft(input, today = localDate()) {
    input = input && typeof input === 'object' ? input : {};
    const value = Object.fromEntries(['type', 'name', 'category', 'place', 'date', 'description', 'contactType', 'contactValue'].map(key => [key, text(input[key])]));
    const errors = {};
    if (!['lost', 'found'].includes(value.type)) errors.type = '请选择寻物或招领';
    for (const [key, label] of [['name', '物品名称'], ['place', '地点'], ['contactValue', '联系方式']]) {
      if (!value[key]) errors[key] = `请填写${label}`;
    }
    for (const [key, max] of Object.entries(limits)) {
      if (Array.from(value[key]).length > max) errors[key] = `请控制在 ${max} 字以内`;
    }
    if (!Object.hasOwn(categories, value.category)) errors.category = '请选择物品类别';
    if (!validDate(value.date)) errors.date = '请选择有效日期';
    else if (value.date > today) errors.date = '日期不能晚于今天';
    if (!contactTypes.includes(value.contactType)) errors.contactType = '请选择联系方式类型';
    if (/[\r\n]/.test(value.contactValue)) errors.contactValue = '联系方式请写在一行内';
    if (value.contactType === '邮箱' && value.contactValue && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.contactValue)) errors.contactValue = '请填写完整邮箱地址';
    return { ok: Object.keys(errors).length === 0, errors, value };
  }
  function makeId() {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
    return `item-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  }
  function createItem(input, ownerId, options = {}) {
    const result = validateDraft(input, options.today || localDate());
    if (!result.ok) throw new Error(Object.values(result.errors)[0]);
    if (!text(ownerId)) throw new Error('缺少发布者标识');
    const now = options.now || new Date().toISOString();
    return { ...result.value, id: options.id || makeId(), ownerId, status: 'active', createdAt: now, updatedAt: now, isDemo: false };
  }
  function statusLabel(item) {
    return item.type === 'lost' ? (item.status === 'done' ? '已找到' : '寻找中') : (item.status === 'done' ? '已归还' : '待认领');
  }
  function finishItem(items, id, ownerId, now = new Date().toISOString()) {
    const item = items.find(entry => entry.id === id);
    if (!item) throw new Error('这条信息不存在');
    if (item.ownerId !== ownerId || item.isDemo) throw new Error('只能修改自己发布的信息');
    if (item.status === 'done') return items;
    return items.map(entry => entry.id === id ? { ...entry, status: 'done', updatedAt: now } : entry);
  }
  function selectItems(items, filters = {}) {
    const keyword = normalize(filters.keyword || '');
    return items.filter(item => {
      if (filters.ownerId && item.ownerId !== filters.ownerId) return false;
      if (filters.type && filters.type !== 'all' && item.type !== filters.type) return false;
      if (filters.category && filters.category !== 'all' && item.category !== filters.category) return false;
      if (filters.place && filters.place !== 'all' && item.place !== filters.place) return false;
      if (filters.status && filters.status !== 'all' && item.status !== filters.status) return false;
      return !keyword || normalize(`${item.name} ${item.place} ${item.description}`).includes(keyword);
    }).sort((a, b) => b.createdAt.localeCompare(a.createdAt) || a.id.localeCompare(b.id));
  }
  function escapeHTML(value) {
    return String(value ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
  }
  return { categories, limits, contactTypes, localDate, validDate, validateDraft, makeId, createItem, statusLabel, finishItem, selectItems, escapeHTML };
}));
