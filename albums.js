(() => {
  'use strict';

  // Apple iTunes Search metadata verified 2026-10-20, TW storefront.
  // Medium assignments are UI examples, not verified physical editions.
  const artworkBase = 'https://is1-ssl.mzstatic.com/image/thumb/';
  const examples = [
    ['范特西', '周杰伦', 'vinyl', 535739206, 'Music124/v4/a4/f2/f0/a4f2f0d4-cc80-d1a0-7f20-a0cc842a523c/JAY.jpg'],
    ['黑色柳丁', '陶喆', 'vinyl', 914664926, 'Music114/v4/05/7a/97/057a9723-2dbd-873b-81e0-5090879b2942/825646245352.jpg'],
    ['新地球', '林俊杰', 'cd', 1788007687, 'Music211/v4/57/5a/1b/575a1bc9-ca86-7549-e873-b55663ba6276/4711508105925.jpg'],
    ['七里香', '周杰伦', 'vinyl', 536114662, 'Music115/v4/29/c1/2d/29c12de6-54b4-f549-9d9f-07d8a04221ea/JAY.jpg'],
    ['叶惠美', '周杰伦', 'cd', 535824731, 'Music115/v4/45/8a/e4/458ae484-dc8b-5683-ce04-8d2948346462/JAY.jpg'],
    ['太平盛世', '陶喆', 'cd', 905206649, 'Music125/v4/fe/ad/e7/feade7c8-826b-0379-fbf4-e59606db8e4c/825646245406.jpg'],
    ['因你而在', '林俊杰', 'cd', 1694849133, 'Music116/v4/86/80/48/86804834-eb90-62a1-2170-cd96f9963cac/4711099729722.jpg'],
    ['十一月的萧邦', '周杰伦', 'vinyl', 536009641, 'Music115/v4/9e/35/ad/9e35ad1e-749e-75b6-0539-1e80cea1817b/JAY11.jpg']
  ];
  const records = examples.map(([title, artist, format, collectionId, artwork], index) => ({
    id: `demo-${collectionId}`, title, artist, format, collectionId,
    cover: `${artworkBase}${artwork}/600x600bb.jpg`,
    originalArtworkUrl: `${artworkBase}${artwork}/100x100bb.jpg`,
    storeUrl: `https://music.apple.com/tw/album/${collectionId}?uo=4`,
    source: 'iTunes Store', note: '', order: index
  }));
  const badgeUrl = 'https://tools.applemediaservices.com/api/badges/listen-on-apple-music/badge/zh-tw?size=250x83';
  const $ = id => document.getElementById(id);
  const create = (tag, className, text) => {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (text !== undefined) element.textContent = text;
    return element;
  };
  const imageUrl = value => {
    try {
      const url = new URL(value);
      return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password ? url.href : '';
    } catch { return ''; }
  };
  const medium = format => format === 'vinyl' ? '黑胶' : 'CD';
  const pad = count => String(count).padStart(2, '0');
  const normalize = text => text.normalize('NFKC').toLocaleLowerCase().replace(/\s+/g, '');
  const collator = new Intl.Collator('zh-CN', { numeric: true });
  let activeFormat = 'all';
  let dialogOpener = null;
  let scrollY = 0;
  let toastTimer;

  function renderCover(host, record, eager = false) {
    host.replaceChildren();
    const placeholder = create('span', 'cover-placeholder');
    placeholder.append(create('span', '', '◎'), create('strong', '', record.title), create('small', '', 'LIVELOG / NO COVER'));
    placeholder.setAttribute('role', 'img');
    placeholder.setAttribute('aria-label', `${record.title}，暂无可用封面`);
    host.append(placeholder);
    const src = imageUrl(record.cover);
    if (!src) return;
    const image = create('img');
    image.alt = `${record.artist}《${record.title}》专辑封面`;
    image.width = image.height = 600;
    image.loading = eager ? 'eager' : 'lazy';
    image.decoding = 'async';
    if (eager) image.fetchPriority = 'high';
    image.addEventListener('load', () => { placeholder.hidden = true; });
    image.addEventListener('error', () => { image.remove(); placeholder.hidden = false; }, { once: true });
    image.src = src;
    host.append(image);
  }

  function storeBadge(record, existingLink) {
    const link = existingLink || create('a');
    link.href = record.storeUrl;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.setAttribute('aria-label', `在 Apple Music 查看${record.title}`);
    const image = create('img', 'store-badge');
    image.src = badgeUrl;
    image.alt = '在 Apple Music 聆听';
    image.width = 100;
    image.height = 34;
    link.replaceChildren(image);
    return link;
  }

  function updateStats() {
    $('albumCount').textContent = pad(records.length);
    $('vinylCount').textContent = pad(records.filter(record => record.format === 'vinyl').length);
    $('cdCount').textContent = pad(records.filter(record => record.format === 'cd').length);
    $('artistCount').textContent = pad(new Set(records.map(record => normalize(record.artist))).size);
    $('allFilterCount').textContent = records.length;
  }

  function renderRecords() {
    const query = normalize($('albumSearch').value.trim());
    const visible = records.filter(record => (activeFormat === 'all' || record.format === activeFormat) && normalize(`${record.title} ${record.artist}`).includes(query));
    const sort = $('albumSort').value;
    visible.sort((a, b) => sort === 'title' ? collator.compare(a.title, b.title) : sort === 'artist' ? collator.compare(a.artist, b.artist) || a.order - b.order : a.order - b.order);
    const fragment = document.createDocumentFragment();
    visible.forEach(record => {
      const card = create('article', 'record-card');
      const button = create('button', 'record-open');
      button.type = 'button';
      button.setAttribute('aria-label', `查看${record.artist}《${record.title}》，${medium(record.format)}演示`);
      const cover = create('span', 'cover-frame');
      renderCover(cover, record);
      const index = create('span', 'card-index', `NO. ${pad(record.order + 1)}`);
      index.setAttribute('aria-hidden', 'true');
      cover.append(index);
      const format = create('span', 'card-medium');
      const icon = create('span', `format-dot ${record.format}-dot`);
      icon.setAttribute('aria-hidden', 'true');
      format.append(icon, document.createTextNode(`${medium(record.format)} · 演示`), create('span', '', record.format === 'vinyl' ? 'VINYL' : 'COMPACT DISC'));
      const title = create('h3', '', record.title);
      title.title = record.title;
      const artist = create('span', 'card-artist');
      const arrow = create('span', 'card-arrow', '↗');
      arrow.setAttribute('aria-hidden', 'true');
      artist.append(create('span', 'artist-name', record.artist), arrow);
      button.append(cover, format, title, artist);
      button.addEventListener('click', () => showDetail(record, button));
      const source = create('div', 'card-source');
      const caption = create('span', 'source-caption');
      caption.append(create('span', '', record.source ? '专辑资料 / iTunes' : '本次添加'), create('span', '', 'DEMO COLLECTION'));
      source.append(caption);
      if (record.storeUrl) source.append(storeBadge(record));
      card.append(button, source);
      fragment.append(card);
    });
    $('recordGrid').replaceChildren(fragment);
    $('emptyState').hidden = visible.length > 0;
    $('resultCount').textContent = visible.length === records.length ? `共 ${records.length} 张示例专辑` : `显示 ${visible.length} / ${records.length} 张示例专辑`;
  }

  // Native modality makes the background inert; wrap Tab inside the dialog too.
  function openDialog(dialog, opener) {
    dialogOpener = opener;
    scrollY = window.scrollY;
    document.body.style.position = 'fixed';
    document.body.style.top = `-${scrollY}px`;
    document.body.style.width = '100%';
    dialog.showModal();
    dialog.scrollTop = 0;
    if (dialog === $('addDialog')) form.elements.namedItem('title').focus();
  }

  function showDetail(record, opener) {
    $('detailTitle').textContent = record.title;
    $('detailArtist').textContent = record.artist;
    $('detailFormat').textContent = `${medium(record.format)} · 演示介质`;
    $('detailNote').textContent = record.note || '未记录';
    renderCover($('detailCover'), record, true);
    $('detailSource').replaceChildren();
    if (record.storeUrl) $('detailSource').append(storeBadge(record), create('span', '', '专辑资料与封面来源\niTunes Store / Apple'));
    else $('detailSource').append(create('span', '', '本次添加的演示记录 · 刷新后恢复'));
    openDialog($('detailDialog'), opener);
  }

  document.querySelectorAll('dialog').forEach(dialog => {
    dialog.addEventListener('keydown', event => {
      if (event.key !== 'Tab') return;
      const controls = [...dialog.querySelectorAll('a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex="0"]')].filter(element => element.getClientRects().length);
      const first = controls[0];
      const last = controls.at(-1);
      if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog)) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    });
    dialog.querySelectorAll('[data-close]').forEach(button => button.addEventListener('click', () => dialog.close()));
    dialog.addEventListener('click', event => {
      const rect = dialog.getBoundingClientRect();
      if (event.target === dialog && (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom)) dialog.close();
    });
    dialog.addEventListener('close', () => {
      document.body.style.position = '';
      document.body.style.top = '';
      document.body.style.width = '';
      window.scrollTo({ top: scrollY, behavior: 'instant' });
      if (dialogOpener?.isConnected) dialogOpener.focus({ preventScroll: true });
      dialogOpener = null;
    });
  });

  document.querySelectorAll('[data-open-add]').forEach(button => button.addEventListener('click', () => {
    $('addForm').reset();
    $('formError').textContent = '';
    $('addForm').querySelectorAll('input').forEach(input => input.setCustomValidity(''));
    openDialog($('addDialog'), button);
  }));

  const form = $('addForm');
  ['title', 'artist'].forEach(name => {
    const input = form.elements.namedItem(name);
    input.addEventListener('input', () => input.setCustomValidity(input.value && !input.value.trim() ? '请填写有效内容，不能仅包含空格。' : ''));
  });
  const coverInput = form.elements.namedItem('cover');
  coverInput.addEventListener('input', () => {
    coverInput.setCustomValidity(coverInput.value && !imageUrl(coverInput.value.trim()) ? '请填写 HTTP 或 HTTPS 图片地址。' : '');
  });
  form.addEventListener('submit', event => {
    event.preventDefault();
    const values = new FormData(form);
    const title = String(values.get('title')).trim();
    const artist = String(values.get('artist')).trim();
    const format = String(values.get('format'));
    const rawCover = String(values.get('cover')).trim();
    const cover = imageUrl(rawCover);
    if (!title || !artist || !['vinyl', 'cd'].includes(format) || (rawCover && !cover)) {
      $('formError').textContent = '请填写专辑名、音乐人及介质；封面只支持 HTTP / HTTPS 地址。';
      return;
    }
    records.push({ id: `session-${records.length + 1}`, title, artist, format, cover, note: String(values.get('note')).trim(), source: '', storeUrl: '', order: records.length });
    activeFormat = 'all';
    $('albumSearch').value = '';
    $('albumSort').value = 'default';
    syncFilters();
    updateStats();
    renderRecords();
    $('addDialog').close();
    $('toast').textContent = '已添加演示记录，刷新后恢复。';
    $('toast').classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => $('toast').classList.remove('show'), 4500);
  });

  function syncFilters() {
    document.querySelectorAll('[data-format]').forEach(button => {
      const active = button.dataset.format === activeFormat;
      button.classList.toggle('active', active);
      button.setAttribute('aria-pressed', String(active));
    });
  }
  document.querySelectorAll('[data-format]').forEach(button => button.addEventListener('click', () => {
    activeFormat = button.dataset.format;
    syncFilters();
    renderRecords();
  }));
  $('albumSearch').addEventListener('input', renderRecords);
  $('albumSort').addEventListener('change', renderRecords);
  $('clearFilters').addEventListener('click', () => {
    activeFormat = 'all';
    $('albumSearch').value = '';
    syncFilters();
    renderRecords();
    $('albumSearch').focus();
  });

  const navigation = $('navigation');
  const menu = $('menuButton');
  function closeNavigation() { navigation.classList.remove('show'); menu.setAttribute('aria-expanded', 'false'); }
  menu.addEventListener('click', () => {
    const open = navigation.classList.toggle('show');
    menu.setAttribute('aria-expanded', String(open));
  });
  navigation.querySelectorAll('a').forEach(link => link.addEventListener('click', closeNavigation));
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && navigation.classList.contains('show')) { closeNavigation(); menu.focus(); }
  });
  document.addEventListener('click', event => { if (!navigation.contains(event.target) && !menu.contains(event.target)) closeNavigation(); });

  const themeKey = 'echoes-color-mode-v1';
  function syncTheme(theme) {
    document.documentElement.dataset.theme = theme;
    const iconPath = theme === 'light' ? 'public/livelog-icon-light.svg' : 'public/livelog-icon.svg';
    document.querySelectorAll('[data-brand-icon]').forEach(icon => icon.setAttribute(icon.tagName === 'LINK' ? 'href' : 'src', iconPath));
    document.querySelectorAll('[data-set-theme]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.setTheme === theme)));
    $('browserThemeColor').content = theme === 'light' ? '#f8f5ef' : '#0b1322';
  }
  document.querySelectorAll('[data-set-theme]').forEach(button => button.addEventListener('click', () => {
    syncTheme(button.dataset.setTheme);
    try { localStorage.setItem(themeKey, button.dataset.setTheme); } catch { /* Private/file browsing may block storage. */ }
  }));
  matchMedia('(prefers-color-scheme: light)').addEventListener('change', event => {
    let saved;
    try { saved = localStorage.getItem(themeKey); } catch {}
    if (saved !== 'light' && saved !== 'dark') syncTheme(event.matches ? 'light' : 'dark');
  });
  window.addEventListener('storage', event => {
    if (event.key === themeKey) syncTheme(event.newValue === 'light' || event.newValue === 'dark' ? event.newValue : (matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark'));
  });
  syncTheme(document.documentElement.dataset.theme);
  renderCover($('featuredCover'), records[0], true);
  storeBadge(records[0], $('featuredStore'));
  $('featuredAlbum').addEventListener('click', () => showDetail(records[0], $('featuredAlbum')));
  updateStats();
  renderRecords();
})();
