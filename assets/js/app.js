(function () {
  'use strict';
  const D = window.CampusDomain;
  const S = window.CampusStorage;
  const e = D.escapeHTML;
  let local;
  try { local = window.localStorage; } catch { local = { getItem() { throw new Error(); }, setItem() { throw new Error(); } }; }
  const repo = S.createRepository(local);
  const loaded = repo.load();
  let state = loaded.state;
  let readOnly = !loaded.ok;
  let draft = repo.loadDraft(state.ownerId);
  let errors = {};
  let pendingId = null;
  let draftTimer;
  let toastTimer;
  let backURL = '#/home';
  const filters = {
    home: { type: 'all', category: 'all', place: 'all', status: 'active' },
    search: { type: 'all', category: 'all', place: 'all', status: 'all' },
    mine: { type: 'all', category: 'all', place: 'all', status: 'all' }
  };
  const content = document.getElementById('content');
  const dialog = document.getElementById('finish-dialog');
  const drawings = {
    bottle: '<path d="M36 21h24v9H36z" fill="#e5bf67"/><path d="M34 31h28v43a5 5 0 0 1-5 5H39a5 5 0 0 1-5-5z" fill="#3e9386"/><path d="M35 45h26v20H35z" fill="#d9eee8"/><path d="M57 38v9" stroke="white" stroke-width="3" stroke-linecap="round"/>',
    keys: '<circle cx="35" cy="39" r="14" fill="#e5bf67"/><circle cx="35" cy="39" r="6" fill="#f1f8f4"/><path d="m45 49 23 23m-8-8 5-5m-1 9 5-5" stroke="#ca9c40" stroke-width="8" stroke-linejoin="round"/><path d="M25 29c-2-13 9-19 18-13" fill="none" stroke="#116c60" stroke-width="3"/>',
    umbrella: '<path d="M18 47a30 30 0 0 1 60 0Q68 39 58 47Q48 39 38 47Q28 39 18 47" fill="#3e9386"/><path d="M48 19v49q0 13-11 10" fill="none" stroke="#116c60" stroke-width="4" stroke-linecap="round"/><path d="M48 21q-14 12-10 25m10-25q14 12 10 25" fill="none" stroke="#c9e5dd" stroke-width="2"/>',
    card: '<rect x="18" y="28" width="60" height="41" rx="6" fill="#3e9386"/><rect x="18" y="28" width="60" height="10" rx="4" fill="#116c60"/><circle cx="34" cy="48" r="5" fill="#e5bf67"/><path d="M27 61q7-13 14 0" fill="#e5bf67"/><path d="M49 48h19m-19 8h14" stroke="white" stroke-width="3" stroke-linecap="round"/>',
    books: '<path d="m23 28 25 5 25-5v45l-25 5-25-5z" fill="#3e9386"/><path d="m48 33 21-4v37l-21 4-21-4V29z" fill="#f7faf6"/><path d="M48 34v39m5-31 12-2m-12 12 12-2m-34-8 11 2" stroke="#9abbb0" stroke-width="2"/><path d="M56 29v22l5-4 5 2V28" fill="#e5bf67"/>',
    electronics: '<rect x="26" y="21" width="44" height="59" rx="12" fill="#3e9386"/><rect x="31" y="27" width="34" height="37" rx="5" fill="#d9eee8"/><circle cx="48" cy="73" r="4" fill="#e5bf67"/><path d="m40 47 5 5 12-15" fill="none" stroke="#3e9386" stroke-width="3"/>',
    clothing: '<path d="m34 23-16 14 11 12 6-6v35h26V43l6 6 11-12-16-14q-14 11-28 0" fill="#3e9386"/><path d="M35 23q13 14 26 0" fill="none" stroke="#e5bf67" stroke-width="4"/>',
    other: '<path d="m23 34 25-12 25 12v33L48 80 23 67z" fill="#3e9386"/><path d="m23 34 25 12 25-12M48 46v34" fill="none" stroke="#d9eee8" stroke-width="3"/><path d="m36 28 25 13v12" fill="none" stroke="#e5bf67" stroke-width="7"/>'
  };
  function picture(category, large = false) {
    return `<svg class="item-art${large ? ' large-art' : ''}" viewBox="0 0 96 96" aria-hidden="true"><ellipse cx="48" cy="82" rx="29" ry="5" fill="#d6e8df"/>${drawings[category] || drawings.other}</svg>`;
  }
  function route() {
    const [path, search = ''] = (location.hash || '#/home').slice(1).split('?');
    const parts = path.split('/').filter(Boolean);
    return { page: parts[0] || 'home', id: parts[1] || '', keyword: new URLSearchParams(search).get('keyword') || '' };
  }
  function go(url) {
    if (location.hash === url) render(true);
    else location.hash = url;
  }
  function toast(message) {
    const node = document.getElementById('toast');
    clearTimeout(toastTimer);
    node.textContent = message; node.hidden = false;
    toastTimer = setTimeout(() => { node.hidden = true; }, 3800);
  }
  function storageNotice(message) {
    const node = document.getElementById('storage-notice');
    node.textContent = message || ''; node.hidden = !message;
  }
  function badge(item) {
    return `<span class="badge ${item.status === 'done' ? 'done' : item.type}">${D.statusLabel(item)}</span>`;
  }
  function card(item) {
    return `<article class="item-card"><a href="#/item/${e(item.id)}" data-action="detail" aria-label="查看${e(item.name)}详情"><div class="card-art">${picture(item.category)}<span class="kind">${item.type === 'lost' ? '寻物' : '招领'}</span></div><div class="card-content"><div class="card-heading"><h2>${e(item.name)}</h2>${badge(item)}</div><p class="place">${e(item.place)}</p><p class="card-meta"><span>${e(item.date)}</span><span>${e(D.categories[item.category])}</span></p></div></a></article>`;
  }
  function option(value, label, current) { return `<option value="${e(value)}"${value === current ? ' selected' : ''}>${e(label)}</option>`; }
  function filterBar(page, source) {
    const f = filters[page];
    const places = [...new Set(source.map(item => item.place))].sort((a, b) => a.localeCompare(b, 'zh-CN'));
    return `<div class="filter-bar"><label>物品类别<select id="filter-category" data-filter="category">${option('all', '全部类别', f.category)}${Object.entries(D.categories).map(([key, label]) => option(key, label, f.category)).join('')}</select></label><label>地点<select id="filter-place" data-filter="place">${option('all', '全部地点', f.place)}${places.map(place => option(place, place, f.place)).join('')}</select></label><label>信息状态<select id="filter-status" data-filter="status">${option('active', '未完成', f.status)}${option('all', '全部状态', f.status)}${option('done', '已完成', f.status)}</select></label><button class="text-button" type="button" data-action="reset-filters">重置筛选</button></div>`;
  }
  function empty(title, message, action = '<a class="button primary" href="#/publish">发布信息</a>') {
    return `<section class="empty-state">${picture('other')}<h2>${title}</h2><p>${message}</p>${action}</section>`;
  }
  function renderList(r) {
    const page = ['home', 'search', 'mine'].includes(r.page) ? r.page : 'home';
    const mine = page === 'mine';
    const source = mine ? state.items.filter(item => item.ownerId === state.ownerId) : state.items;
    const f = filters[page];
    if (f.place !== 'all' && !source.some(item => item.place === f.place)) f.place = 'all';
    const list = D.selectItems(source, { ...f, keyword: page === 'search' ? r.keyword : '' });
    const title = mine ? '我的发布' : page === 'search' ? '搜索物品' : '校园里丢的东西，在这里找。';
    const intro = mine ? '物品找回或交还后，记得在详情里更新状态。' : '集中浏览寻物与招领，看看有没有你正在找的物品。';
    const search = `<form id="search-form" class="search-form"><label class="sr-only" for="keyword">搜索物品名称、地点或特征</label><span class="search-icon" aria-hidden="true">⌕</span><input id="keyword" name="keyword" maxlength="100" placeholder="搜物品名称、地点或特征" value="${e(page === 'search' ? r.keyword : '')}"><button class="button primary" type="submit">搜索</button></form>`;
    let body;
    if (page === 'search' && !r.keyword.trim()) body = empty('输入关键词，找找看', '可以试试“水杯”或“图书馆”。', '');
    else if (mine && !source.length) body = empty('你还没有发布信息', '丢失或捡到物品后，从“发布信息”开始。');
    else if (!list.length) body = empty('没有找到相关信息', '试试更短的关键词，或清除筛选条件。', '<div class="actions"><button class="button secondary" data-action="reset-filters" type="button">清除筛选</button><a class="button primary" href="#/publish">去发布</a></div>');
    else body = `<div class="item-grid">${list.map(card).join('')}</div>`;
    const count = page === 'search' && r.keyword.trim() ? `“${e(r.keyword)}” · ${list.length} 条结果` : `${list.length} 条信息`;
    content.innerHTML = `<section class="board-intro"><div><h1 tabindex="-1">${title}</h1></div>${mine ? '<a class="button primary" href="#/publish">＋ 发布新信息</a>' : search}</section><section class="board"><div class="board-top"><div class="type-tabs" role="group" aria-label="信息类型">${[['all', '全部信息'], ['found', '招领'], ['lost', '寻物']].map(([key, label]) => `<button type="button" class="type-tab${f.type === key ? ' selected' : ''}" data-type="${key}" aria-pressed="${f.type === key}">${label}</button>`).join('')}</div><p class="result-count" role="status">${count}</p></div>${filterBar(page, source)}${body}</section>`;
  }
  function renderDetail(r) {
    const item = state.items.find(entry => entry.id === r.id);
    if (!item) { content.innerHTML = `<h1 class="sr-only" tabindex="-1">信息未找到</h1>${empty('这条信息不存在', '可以返回首页查看其他物品。', '<a class="button primary" href="#/home">返回首页</a>')}`; return; }
    const owned = item.ownerId === state.ownerId && !item.isDemo;
    content.innerHTML = `<a class="back-link" href="${e(backURL)}">‹ 返回列表</a><section class="detail-layout"><div class="detail-art">${picture(item.category, true)}<span>${e(D.categories[item.category])}</span></div><div class="detail-body"><div class="detail-heading"><div><p class="detail-kind">${item.type === 'lost' ? '寻物信息' : '招领信息'}</p><h1 tabindex="-1">${e(item.name)}</h1></div>${badge(item)}</div><dl class="item-facts"><div><dt>${item.type === 'lost' ? '遗失地点' : '拾取地点'}</dt><dd>${e(item.place)}</dd></div><div><dt>日期</dt><dd>${e(item.date)}</dd></div><div><dt>物品特征</dt><dd class="description">${e(item.description || '暂无补充描述')}</dd></div></dl><section class="contact-panel"><h2>联系发布者</h2><p class="contact-value" id="contact-value">${e(item.contactType)}：${e(item.contactValue)}</p><button class="button secondary" type="button" data-action="copy" data-id="${e(item.id)}">复制联系方式</button></section>${owned && item.status === 'active' ? `<section class="owner-panel"><h2>管理这条信息</h2>${item.status === 'active' ? `<button class="button primary" type="button" data-action="finish" data-id="${e(item.id)}"${readOnly ? ' disabled' : ''}>标记${item.type === 'lost' ? '已找到' : '已归还'}</button>` : `<p>已标记“${D.statusLabel(item)}”</p>`}</section>` : ''}</div></section>`;
  }
  function field(key, label, body, help = '') {
    return `<div class="field${errors[key] ? ' invalid' : ''}"><label for="${key}">${label}${key !== 'description' ? '<span class="required"> *</span>' : ''}</label>${body}<p class="field-error" id="error-${key}">${e(errors[key] || '')}</p></div>`;
  }
  function input(key, placeholder, type = 'text') {
    return `<input id="${key}" name="${key}" type="${type}" value="${e(draft[key] || '')}"${D.limits[key] ? ` maxlength="${D.limits[key]}"` : ''}${type === 'date' ? ` min="2000-01-01" max="${D.localDate()}"` : ''} placeholder="${placeholder}" aria-describedby="error-${key}" aria-invalid="${Boolean(errors[key])}">`;
  }
  function renderPublish() {
    draft = { type: 'lost', category: 'other', date: D.localDate(), contactType: '微信', ...draft };
    if (!['lost', 'found'].includes(draft.type)) draft.type = 'lost';
    if (!Object.hasOwn(D.categories, draft.category)) draft.category = 'other';
    if (!D.contactTypes.includes(draft.contactType)) draft.contactType = '微信';
    content.innerHTML = `<section class="page-heading"><h1 tabindex="-1">发布信息</h1></section><div class="publish-layout"><form id="publish-form" class="publish-form" novalidate><fieldset class="type-choice"><legend>信息类型</legend>${[['lost', '我丢了东西', '发布寻物'], ['found', '我捡到东西', '发布招领']].map(([value, label, hint]) => `<label><input type="radio" name="type" value="${value}"${draft.type === value ? ' checked' : ''}><span><strong>${label}</strong></span></label>`).join('')}</fieldset><div class="form-grid">${field('name', '物品名称', input('name', '例如：蓝色保温水杯'))}${field('category', '物品类别', `<select id="category" name="category" aria-describedby="error-category" aria-invalid="${Boolean(errors.category)}">${Object.entries(D.categories).map(([key, label]) => option(key, label, draft.category)).join('')}</select>`)}${field('place', draft.type === 'lost' ? '遗失地点' : '拾取地点', input('place', '例如：图书馆二楼'))}${field('date', draft.type === 'lost' ? '遗失日期' : '拾取日期', input('date', '', 'date'))}</div>${field('description', '物品描述（选填）', `<textarea id="description" name="description" maxlength="400" rows="4" placeholder="颜色、外形和其他便于辨认的特征" aria-describedby="error-description">${e(draft.description || '')}</textarea>`, '招领信息可以保留一项特征，联系时再核对。')}<div class="form-grid contact-grid">${field('contactType', '联系类型', `<select id="contactType" name="contactType">${D.contactTypes.map(value => option(value, value, draft.contactType)).join('')}</select>`)}${field('contactValue', '联系方式', input('contactValue', '填写愿意公开的联系账号'), '将在详情页公开展示，请确认后填写。')}</div><p id="form-error" class="form-error" role="alert">${e(errors.global || '')}</p><div class="form-bottom"><button type="submit" class="button primary"${readOnly ? ' disabled' : ''}>发布${draft.type === 'lost' ? '寻物' : '招领'}信息</button></div></form></div>`;
  }
  function renderSuccess(r) {
    const item = state.items.find(entry => entry.id === r.id && entry.ownerId === state.ownerId);
    if (!item) { renderDetail(r); return; }
    content.innerHTML = `<section class="success-panel"><div class="success-mark" aria-hidden="true">✓</div><h1 tabindex="-1">发布成功</h1><p>“${e(item.name)}”已保存并加入${item.type === 'lost' ? '寻物' : '招领'}列表。</p><div class="actions"><a class="button primary" href="#/item/${e(item.id)}">查看这条信息</a><a class="button secondary" href="#/home">返回首页</a></div><a class="text-button" href="#/mine">前往我的发布</a></section>`;
  }
  function render(focus = false) {
    const r = route();
    document.querySelectorAll('[data-nav]').forEach(node => {
      const current = r.page === 'mine' ? 'mine' : ['publish', 'success'].includes(r.page) ? 'publish' : 'home';
      if (node.dataset.nav === current) node.setAttribute('aria-current', 'page'); else node.removeAttribute('aria-current');
    });
    if (r.page === 'publish') renderPublish();
    else if (r.page === 'item') renderDetail(r);
    else if (r.page === 'success') renderSuccess(r);
    else renderList(r);
    document.title = `${content.querySelector('h1')?.textContent || '校园寻物站'} · 校园寻物站`;
    if (focus) { window.scrollTo(0, 0); content.querySelector('h1')?.focus({ preventScroll: true }); }
  }
  function readForm() {
    const form = document.getElementById('publish-form');
    return form ? Object.fromEntries(new FormData(form).entries()) : draft;
  }
  function saveDraftSoon() {
    draft = readForm();
    clearTimeout(draftTimer);
    draftTimer = setTimeout(() => {
      const ok = repo.saveDraft(state.ownerId, draft);
      const node = document.getElementById('draft-feedback');
      if (node) node.textContent = ok ? '草稿已保存' : '草稿未保存，请保持页面打开';
    }, 250);
  }
  function commit(transform) {
    if (readOnly) throw new Error('本机数据暂不可保存，请查看页面顶部提示。');
    const fresh = repo.load();
    if (!fresh.ok) throw new Error(fresh.error);
    if (fresh.state.ownerId !== state.ownerId) throw new Error('本机发布者标识已变化，请刷新页面后重试。');
    const next = { ...fresh.state, items: transform(fresh.state.items) };
    const result = repo.save(next);
    if (!result.ok) throw new Error(result.error);
    state = next;
  }
  content.addEventListener('submit', event => {
    event.preventDefault();
    if (event.target.id === 'search-form') {
      const keyword = document.getElementById('keyword').value.trim();
      filters.search = { type: 'all', category: 'all', place: 'all', status: 'all' };
      go(`#/search?keyword=${encodeURIComponent(keyword)}`); return;
    }
    if (event.target.id !== 'publish-form') return;
    draft = readForm();
    const result = D.validateDraft(draft);
    if (!result.ok) { errors = result.errors; renderPublish(); document.getElementById(Object.keys(errors)[0])?.focus(); return; }
    try {
      const item = D.createItem(result.value, state.ownerId);
      commit(items => [item, ...items]);
      clearTimeout(draftTimer); repo.clearDraft(); draft = {}; errors = {};
      backURL = '#/mine'; go(`#/success/${item.id}`);
    } catch (error) { errors = { global: error.message }; renderPublish(); document.getElementById('form-error').scrollIntoView({ block: 'center' }); }
  });
  content.addEventListener('input', event => { if (event.target.closest('#publish-form')) saveDraftSoon(); });
  content.addEventListener('change', event => {
    const key = event.target.dataset.filter;
    if (key) {
      const page = route().page; const active = filters[page] ? page : 'home';
      filters[active][key] = event.target.value;
      const id = event.target.id; render(); document.getElementById(id)?.focus();
    } else if (event.target.closest('#publish-form')) {
      saveDraftSoon();
      if (event.target.name === 'type') { errors = {}; renderPublish(); }
    }
  });
  document.addEventListener('click', async event => {
    const type = event.target.closest('[data-type]');
    if (type) { const page = filters[route().page] ? route().page : 'home'; filters[page].type = type.dataset.type; render(); content.querySelector(`[data-type="${type.dataset.type}"]`)?.focus(); return; }
    const button = event.target.closest('[data-action]');
    if (!button) return;
    const action = button.dataset.action;
    if (action === 'detail') { backURL = location.hash || '#/home'; return; }
    if (action === 'reset-filters') {
      const page = filters[route().page] ? route().page : 'home';
      filters[page] = { type: 'all', category: 'all', place: 'all', status: page === 'home' ? 'active' : 'all' };
      render(); return;
    }
    if (action === 'copy') {
      const item = state.items.find(entry => entry.id === button.dataset.id); if (!item) return;
      const value = `${item.contactType}：${item.contactValue}`;
      try { await navigator.clipboard.writeText(value); toast('联系方式已复制'); }
      catch { const node = document.getElementById('contact-value'); const range = document.createRange(); range.selectNodeContents(node); const selection = window.getSelection(); selection.removeAllRanges(); selection.addRange(range); toast('已选中联系方式，请按 Ctrl+C 或长按复制'); }
    } else if (action === 'finish') {
      const item = state.items.find(entry => entry.id === button.dataset.id);
      if (!item || item.ownerId !== state.ownerId || item.isDemo) { toast('只能修改自己发布的信息'); return; }
      pendingId = item.id;
      document.getElementById('dialog-message').textContent = `将“${item.name}”标记为“${item.type === 'lost' ? '已找到' : '已归还'}”？`;
      dialog.showModal();
    } else if (action === 'cancel-finish') { dialog.close(); pendingId = null; }
    else if (action === 'confirm-finish') {
      try {
        const id = pendingId; if (!id) return;
        commit(items => D.finishItem(items, id, state.ownerId));
        dialog.close(); pendingId = null; render(); toast('状态已更新并保存');
      } catch (error) { dialog.close(); pendingId = null; toast(error.message); }
    }
  });
  window.addEventListener('hashchange', () => { if (dialog.open) dialog.close(); pendingId = null; errors = {}; render(true); });
  window.addEventListener('storage', event => {
    if (event.key !== S.KEY) return;
    const fresh = repo.load(); state = fresh.state; readOnly = !fresh.ok;
    storageNotice(fresh.error); if (route().page !== 'publish') render();
  });
  window.addEventListener('pagehide', () => { if (route().page === 'publish') repo.saveDraft(state.ownerId, readForm()); });
  storageNotice(loaded.error);
  render();
}());
