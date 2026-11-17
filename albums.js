(() => {
  'use strict';

  const records = [];
  const verifiedMotionCovers = new Map(
    (window.ALBUM_MOTION_DATA || []).map(record => [record.collectionId, record])
  );
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
  const isSingleTitle = title => typeof title === 'string' &&
    /(?:\s+[-–—]\s*|[\[(【]\s*)(?:single|单曲|單曲|シングル)\s*[\])】]?$/iu.test(title.normalize('NFKC').trim());
  const collator = new Intl.Collator('zh-CN', { numeric: true });
  const spendingNumber = new Intl.NumberFormat('zh-CN');
  const pricePattern = /^(?:(nt\$|us\$|hk\$|[¥$€£]|[a-z]{3})\s*)?(\d{1,3}(?:,\d{3})+|\d+)(?:\.(\d{1,2}))?\s*([a-z]{3}|元|人民币|新台币|港币|美元|日元|欧元|英镑)?$/i;
  const priceCurrencies = new Map([
    ['nt$', 'TWD'], ['新台币', 'TWD'], ['twd', 'TWD'],
    ['us$', 'USD'], ['美元', 'USD'], ['usd', 'USD'],
    ['hk$', 'HKD'], ['港币', 'HKD'], ['hkd', 'HKD'],
    ['元', 'CNY'], ['人民币', 'CNY'], ['rmb', 'CNY'], ['cny', 'CNY'],
    ['日元', 'JPY'], ['jpy', 'JPY'],
    ['€', 'EUR'], ['欧元', 'EUR'], ['eur', 'EUR'],
    ['£', 'GBP'], ['英镑', 'GBP'], ['gbp', 'GBP']
  ]);
  let activeFormat = 'all';
  let dialogOpener = null;
  let scrollY = 0;
  let toastTimer;
  let featuredRecord;
  let featuredMotion = null;
  let detailMotion = null;
  const cardMotionPlayers = [];

  function motionControl(host, record, button, status) {
    if (typeof window.mountAlbumMotionCover !== 'function') {
      button.hidden = true;
      if (status) status.textContent = '动态封面暂不可用，已显示静态封面';
      return null;
    }
    const player = window.mountAlbumMotionCover({
      host, src: record.motionUrl,
      onState: ({ state, message }) => {
        const active = state === 'playing' || state === 'loading';
        button.textContent = active ? 'Ⅱ 暂停动态封面' : state === 'failed' ? '↻ 重试动态封面' : '▷ 播放动态封面';
        button.setAttribute('aria-pressed', String(active));
        button.setAttribute('aria-label', `${active ? '暂停' : '播放'}${record.title}动态封面`);
        if (status) status.textContent = message;
      }
    });
    button.onclick = () => player.toggle();
    return player;
  }
  function suspendBackgroundMotion(suspended) {
    featuredMotion?.setSuspended(suspended);
    cardMotionPlayers.forEach(player => player.setSuspended(suspended));
  }

  function renderCover(host, record, eager = false) {
    host.replaceChildren();
    const placeholder = create('span', 'cover-placeholder');
    placeholder.append(create('span', '', '◎'), create('strong', '', record.title), create('small', '', '暂无封面'));
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
    const original = imageUrl(record.originalArtworkUrl);
    image.addEventListener('error', () => {
      if (original && image.src !== original) {
        image.src = original;
        return;
      }
      image.remove();
      placeholder.hidden = false;
    });
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

  function renderFeaturedAlbum() {
    const record = records[0];
    if (!record || record === featuredRecord) return;
    featuredRecord = record;
    featuredMotion?.destroy();
    featuredMotion = null;
    const button = $('featuredAlbum');
    button.hidden = false;
    button.setAttribute('aria-label', `查看《${record.title}》专辑详情`);
    button.onclick = () => showDetail(record, button);
    $('featuredPlaceholder').hidden = true;
    renderCover($('featuredCover'), record, true);
    $('featuredCaption').hidden = false;
    $('featuredTitle').textContent = record.title;
    $('featuredArtist').textContent = record.artist ? `/ ${record.artist}` : '';
    $('featuredArtist').hidden = !record.artist;
    $('featuredStore').hidden = !record.storeUrl;
    if (record.storeUrl) storeBadge(record, $('featuredStore'));
    $('featuredMotionBar').hidden = !record.motionUrl;
    if (record.motionUrl) {
      featuredMotion = motionControl($('featuredCover'), record, $('featuredMotionToggle'), $('featuredMotionStatus'));
    }
  }

  function refreshShelf() {
    renderFeaturedAlbum();
    updateStats();
    renderRecords();
    suspendBackgroundMotion(Boolean(document.querySelector('dialog[open]')));
  }

  function updateStats() {
    $('albumCount').textContent = pad(records.length);
    $('vinylCount').textContent = pad(records.filter(record => record.format === 'vinyl').length);
    $('cdCount').textContent = pad(records.filter(record => record.format === 'cd').length);
    $('artistCount').textContent = pad(new Set(records.map(record => normalize(record.artist)).filter(Boolean)).size);
    $('allFilterCount').textContent = records.length;
    renderTotalSpending();
  }

  function renderTotalSpending() {
    const totals = new Map();
    for (const { price } of records) {
      if (typeof price !== 'string') continue;
      const match = price.normalize('NFKC').trim().toLowerCase().match(pricePattern);
      if (!match) continue;
      const [, symbol = '', amount, fraction = '', unit = ''] = match;
      const prefixCurrency = priceCurrencies.get(symbol) || symbol.toUpperCase();
      const suffixCurrency = priceCurrencies.get(unit) || unit.toUpperCase();
      if (prefixCurrency && suffixCurrency && prefixCurrency !== suffixCurrency &&
          symbol !== '¥' && symbol !== '$') continue;
      if (!suffixCurrency && !prefixCurrency) continue;
      const currency = suffixCurrency || prefixCurrency;
      const cents = BigInt(amount.replaceAll(',', '') + fraction.padEnd(2, '0'));
      totals.set(currency, (totals.get(currency) ?? 0n) + cents);
    }

    const spending = $('totalSpending');
    if (!totals.size) {
      const row = create('p');
      row.append(create('strong', '', '0'));
      spending.replaceChildren(row);
      return;
    }
    spending.replaceChildren(...Array.from(totals, ([currency, cents]) => {
      const whole = spendingNumber.format(cents / 100n);
      const fraction = cents % 100n;
      const amount = fraction === 0n ? whole : `${whole}.${String(fraction).padStart(2, '0')}`;
      const row = create('p');
      row.append(create('strong', '', amount), create('span', '', currency));
      return row;
    }));
  }

  function renderRecords() {
    cardMotionPlayers.forEach(player => player.destroy());
    cardMotionPlayers.length = 0;
    const query = normalize($('albumSearch').value.trim());
    const visible = records.filter(record => (activeFormat === 'all' || record.format === activeFormat) && normalize(`${record.title} ${record.artist}`).includes(query));
    const sort = $('albumSort').value;
    visible.sort((a, b) => sort === 'title' ? collator.compare(a.title, b.title) : sort === 'artist' ? collator.compare(a.artist, b.artist) || a.order - b.order : a.order - b.order);
    const fragment = document.createDocumentFragment();
    visible.forEach(record => {
      const card = create('article', 'record-card');
      const button = create('button', 'record-open');
      button.type = 'button';
      button.setAttribute('aria-label', `查看${record.artist}《${record.title}》，${medium(record.format)}`);
      const cover = create('span', 'cover-frame');
      renderCover(cover, record);
      const format = create('span', 'card-medium');
      const icon = create('span', `format-dot ${record.format}-dot`);
      icon.setAttribute('aria-hidden', 'true');
      format.append(icon, document.createTextNode(medium(record.format)));
      const title = create('h3', '', record.title);
      title.title = record.title;
      const artist = create('span', 'card-artist');
      const arrow = create('span', 'card-arrow', '↗');
      arrow.setAttribute('aria-hidden', 'true');
      artist.append(create('span', 'artist-name', record.artist || '未记录'), arrow);
      button.append(cover, format, title, artist);
      button.addEventListener('click', () => showDetail(record, button));
      card.append(button);
      if (record.motionUrl) {
        const toggle = create('button', 'motion-toggle card-motion-toggle');
        toggle.type = 'button';
        toggle.setAttribute('aria-pressed', 'false');
        card.append(toggle);
        const player = motionControl(cover, record, toggle);
        if (player) cardMotionPlayers.push(player);
      }
      fragment.append(card);
    });
    $('recordGrid').replaceChildren(fragment);
    $('emptyState').hidden = visible.length > 0;
    const hasAlbums = records.length > 0;
    $('emptyStateTitle').textContent = hasAlbums ? '没有匹配的唱片' : '暂无唱片';
    $('emptyStateHelp').textContent = hasAlbums ? '试试其他关键词或清空筛选。' : '添加你的第一张唱片。';
    $('clearFilters').hidden = !hasAlbums;
    $('emptyAddAlbum').hidden = hasAlbums;
    $('resultCount').textContent = visible.length === records.length ? `共 ${records.length} 张专辑` : `显示 ${visible.length} / ${records.length} 张专辑`;
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
    suspendBackgroundMotion(true);
    if (dialog === $('addDialog')) form.elements.namedItem('title').focus();
  }

  function showDetail(record, opener) {
    detailMotion?.destroy();
    detailMotion = null;
    $('detailTitle').textContent = record.title;
    $('detailArtist').textContent = record.artist || '未记录';
    $('detailFormat').textContent = medium(record.format);
    $('detailVersion').textContent = record.version || '未记录';
    $('detailPrice').textContent = record.price || '未记录';
    $('detailPurchaseChannel').textContent = record.purchaseChannel || '未记录';
    $('detailNote').textContent = record.note || '未记录';
    renderCover($('detailCover'), record, true);
    $('detailSource').replaceChildren();
    if (record.storeUrl) $('detailSource').append(storeBadge(record), create('span', '', `来源：${record.source} / Apple`));
    openDialog($('detailDialog'), opener);
    $('detailMotionBar').hidden = !record.motionUrl;
    if (record.motionUrl) detailMotion = motionControl($('detailCover'), record, $('detailMotionToggle'), $('detailMotionStatus'));
  }

  document.querySelectorAll('dialog').forEach(dialog => {
    const close = () => {
      if (dialog.id !== 'addDialog' || !savingAlbum) dialog.close();
    };
    dialog.addEventListener('cancel', event => {
      if (dialog.id === 'addDialog' && savingAlbum) event.preventDefault();
    });
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
    dialog.querySelectorAll('[data-close]').forEach(button => button.addEventListener('click', close));
    dialog.addEventListener('click', event => {
      const rect = dialog.getBoundingClientRect();
      if (event.target === dialog && (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom)) close();
    });
    dialog.addEventListener('close', () => {
      if (dialog === $('detailDialog')) { detailMotion?.destroy(); detailMotion = null; }
      if (dialog === $('addDialog')) resetCoverSearch();
      document.body.style.position = '';
      document.body.style.top = '';
      document.body.style.width = '';
      window.scrollTo({ top: scrollY, behavior: 'instant' });
      if (dialogOpener?.isConnected) dialogOpener.focus({ preventScroll: true });
      dialogOpener = null;
      suspendBackgroundMotion(false);
    });
  });

  document.querySelectorAll('[data-open-add]').forEach(button => button.addEventListener('click', () => {
    form.reset();
    addRecordId = '';
    resetCoverSearch();
    $('formError').textContent = '';
    form.querySelectorAll('input').forEach(input => input.setCustomValidity(''));
    openDialog($('addDialog'), button);
  }));

  const form = $('addForm');
  const titleInput = form.elements.namedItem('title');
  const artistInput = form.elements.namedItem('artist');
  const coverInput = form.elements.namedItem('cover');
  const coverSearchButton = $('coverSearchButton');
  const coverSearchStatus = $('coverSearchStatus');
  const coverResults = $('coverSearchResults');
  const addSubmitButton = form.querySelector('button[type="submit"]');
  let coverSearchRequest;
  let selectedCover = null;
  let addRecordId = '';
  let savingAlbum = false;
  const coverPreviewPlayers = [];

  async function requestAlbums(url, signal) {
    if (window.location.protocol !== 'file:') {
      const response = await fetch(url, { signal });
      if (!response.ok) throw new Error('iTunes Search failed');
      return response.json();
    }

    // iTunes Search does not allow the opaque Origin of a file:// page via CORS.
    // Run its documented JSONP callback in an iframe without access to this page.
    return new Promise((resolve, reject) => {
      const frame = create('iframe');
      frame.hidden = true;
      frame.setAttribute('sandbox', 'allow-scripts');
      function finish(payload) {
        window.removeEventListener('message', receive);
        signal.removeEventListener('abort', cancel);
        frame.remove();
        if (payload) resolve(payload);
        else reject(new Error('iTunes Search failed'));
      }
      function receive(event) {
        if (event.origin === 'null' && event.source === frame.contentWindow) finish(event.data);
      }
      function cancel() { finish(null); }
      url.searchParams.set('callback', 'receiveAlbumResults');
      const scriptUrl = url.href.replaceAll('&', '&amp;');
      frame.srcdoc = `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline' https://itunes.apple.com">
        <script>function receiveAlbumResults(data) { parent.postMessage(data, '*'); }</script>
        <script src="${scriptUrl}" onerror="parent.postMessage(null, '*')"></script>`;
      window.addEventListener('message', receive);
      signal.addEventListener('abort', cancel, { once: true });
      document.body.append(frame);
    });
  }

  async function requestMotionCovers(candidates, signal) {
    const localFile = window.location.protocol === 'file:';
    if (!localFile && !['127.0.0.1', 'localhost'].includes(window.location.hostname)) return [];
    const origin = localFile ? 'http://127.0.0.1:8765' : window.location.origin;
    const url = new URL('/api/album-motion', origin);
    candidates.filter(candidate => !candidate.motionUrl && candidate.storeUrl).slice(0, 12)
      .forEach(candidate => url.searchParams.append('url', candidate.storeUrl));
    if (!url.search) return [];

    try {
      const response = await fetch(url, { signal });
      if (!response.ok) return [];
      const albums = await response.json();
      return Array.isArray(albums) ? albums : [];
    } catch {
      return [];
    }
  }

  function usesLocalAlbumService() {
    return window.location.protocol === 'http:' && ['127.0.0.1', 'localhost'].includes(window.location.hostname);
  }

  function addSavedAlbum(album) {
    if (!album || typeof album.id !== 'string' || typeof album.title !== 'string' ||
        typeof album.artist !== 'string' || !['vinyl', 'cd'].includes(album.format) ||
        records.some(record => record.id === album.id)) return;
    const assetUrl = value => imageUrl(typeof value === 'string' && value.startsWith('/public/albums/')
      ? new URL(value, window.location.origin).href
      : value);
    records.push({
      ...album,
      cover: assetUrl(album.cover),
      motionUrl: assetUrl(album.motionUrl),
      storeUrl: imageUrl(album.storeUrl),
      order: records.length
    });
  }

  async function loadSavedAlbums() {
    if (!usesLocalAlbumService()) return;
    try {
      const response = await fetch('/api/albums');
      if (!response.ok) return;
      const albums = await response.json();
      if (!Array.isArray(albums)) return;
      albums.forEach(addSavedAlbum);
      refreshShelf();
    } catch { /* A static preview can still show the empty shelf. */ }
  }

  async function saveAlbum(record, candidate) {
    const request = new AbortController();
    const timeout = setTimeout(() => request.abort(), 60000);
    try {
      const response = await fetch('/api/albums', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...record,
          selectedCover: candidate ? {
            collectionId: candidate.collectionId,
            cover: candidate.cover,
            originalArtworkUrl: candidate.originalArtworkUrl,
            motionUrl: candidate.motionUrl
          } : null
        }),
        signal: request.signal
      });
      if (!response.headers.get('Content-Type')?.startsWith('application/json')) {
        throw new Error('请重启 LiveLog 本机服务后重试。');
      }
      const saved = await response.json();
      if (!response.ok) throw new Error(saved.error || '唱片保存失败，请重试。');
      if (saved?.id !== `record-${record.id}`) throw new Error('本机服务未返回唱片记录，请重试。');
      return saved;
    } finally {
      clearTimeout(timeout);
    }
  }

  function resetCoverSearch() {
    const previousRequest = coverSearchRequest;
    coverSearchRequest = null;
    previousRequest?.abort();
    if (selectedCover) coverInput.value = '';
    selectedCover = null;
    clearCoverResults();
    coverResults.hidden = true;
    coverSearchStatus.textContent = '';
    coverSearchButton.disabled = !titleInput.value.trim();
  }

  function clearCoverResults() {
    coverPreviewPlayers.forEach(player => player.destroy());
    coverPreviewPlayers.length = 0;
    coverResults.replaceChildren();
  }

  function renderCoverResults(candidates) {
    clearCoverResults();
    coverResults.hidden = !candidates.length;
    coverSearchStatus.textContent = candidates.length ? '请选择封面。' : '没有找到专辑封面，可以修改关键词或填写图片地址。';
    candidates.forEach(candidate => {
      const button = create('button', 'cover-choice');
      button.type = 'button';
      button.setAttribute('aria-pressed', String(selectedCover?.collectionId === candidate.collectionId));
      const thumbnail = create('span', 'cover-frame');
      renderCover(thumbnail, candidate, true);
      thumbnail.setAttribute('aria-hidden', 'true');
      button.append(thumbnail, create('span', 'cover-choice-title', candidate.title), create('span', 'cover-choice-artist', candidate.artist));
      if (candidate.motionUrl) {
        const preview = window.mountAlbumMotionCover?.({ host: thumbnail, src: candidate.motionUrl });
        if (preview) coverPreviewPlayers.push(preview);
      }
      button.addEventListener('click', () => {
        selectedCover = candidate;
        coverInput.value = candidate.cover;
        coverInput.setCustomValidity('');
        coverResults.querySelectorAll('button').forEach(option => option.setAttribute('aria-pressed', String(option === button)));
        coverSearchStatus.textContent = `已选用《${candidate.title}》的封面。`;
      });
      coverResults.append(button);
    });
  }

  async function searchCovers() {
    const title = titleInput.value.trim();
    if (!title || savingAlbum || coverSearchRequest || !$('addDialog').open) return;
    const request = new AbortController();
    coverSearchRequest = request;
    coverSearchStatus.textContent = '正在搜索封面…';
    const url = new URL('https://itunes.apple.com/search');
    const artist = artistInput.value.trim();
    const term = [title, artist].filter(Boolean).join(' ');
    const requestedTitle = normalize(title);
    const requestedArtist = normalize(artist);
    const verifiedMatches = [...verifiedMotionCovers.values()].filter(album =>
      !isSingleTitle(album.title) && normalize(album.title) === requestedTitle &&
      (!requestedArtist || normalize(album.artist) === requestedArtist)
    );
    url.search = new URLSearchParams({ term, media: 'music', entity: 'album', country: 'tw', limit: '24' });
    const timeout = setTimeout(() => request.abort(), 18000);
    try {
      const { results } = await requestAlbums(url, request.signal);
      if (coverSearchRequest !== request || !$('addDialog').open) return;
      const candidates = [];
      for (const result of results) {
        if (result?.wrapperType !== 'collection' || typeof result.collectionName !== 'string') continue;
        if (String(result.collectionType).toLowerCase() === 'single' || isSingleTitle(result.collectionName) ||
            isSingleTitle(result.collectionCensoredName)) continue;
        const verified = verifiedMotionCovers.get(result.collectionId);
        const originalArtworkUrl = imageUrl(result.artworkUrl100);
        if (!verified && !originalArtworkUrl) continue;
        candidates.push({
          collectionId: result.collectionId,
          title: result.collectionName,
          artist: typeof result.artistName === 'string' ? result.artistName : '',
          originalArtworkUrl,
          cover: verified?.cover || originalArtworkUrl.replace(/\/100x100bb\.jpg$/, '/600x600bb.jpg'),
          motionUrl: verified?.motionUrl,
          storeUrl: verified?.storeUrl || imageUrl(result.collectionViewUrl),
          source: verified?.source || 'iTunes Store'
        });
      }
      const relevant = candidates.filter(candidate =>
        normalize(candidate.title).includes(requestedTitle) &&
        (!requestedArtist || normalize(candidate.artist).includes(requestedArtist))
      );
      const hasMatch = relevant.length > 0 || verifiedMatches.length > 0;
      const rankedCandidates = hasMatch ? relevant : candidates;
      const resolved = await requestMotionCovers(hasMatch ? relevant : candidates.slice(0, 3), request.signal);
      if (coverSearchRequest !== request || !$('addDialog').open) return;
      const resolvedById = new Map(resolved.map(album => [album.collectionId, album]));
      for (const candidate of rankedCandidates) {
        const album = resolvedById.get(candidate.collectionId);
        const motionUrl = imageUrl(album?.motionUrl);
        if (!motionUrl) continue;
        candidate.motionUrl = motionUrl;
        candidate.cover = imageUrl(album.cover) || candidate.cover;
        candidate.storeUrl = imageUrl(album.storeUrl) || candidate.storeUrl;
        candidate.source = 'Apple Music';
      }
      // A regional search can return the same title under a different album ID.
      // Keep the verified edition as its own option with its own Apple Music link.
      for (const verified of verifiedMatches) {
        if (!rankedCandidates.some(candidate => candidate.motionUrl &&
              normalize(candidate.title) === normalize(verified.title) &&
              normalize(candidate.artist) === normalize(verified.artist))) {
          rankedCandidates.push(verified);
        }
      }
      rankedCandidates.sort((first, second) => Number(Boolean(second.motionUrl)) - Number(Boolean(first.motionUrl)));
      renderCoverResults(rankedCandidates.slice(0, 3));
    } catch {
      if (coverSearchRequest === request && $('addDialog').open) {
        if (verifiedMatches.length) renderCoverResults([verifiedMatches[0]]);
        else coverSearchStatus.textContent = '封面搜索失败，可以重试或填写图片地址。';
      }
    } finally {
      clearTimeout(timeout);
      if (coverSearchRequest === request) coverSearchRequest = null;
    }
  }

  function clearCoverSearchForInput() {
    resetCoverSearch();
    const title = titleInput.value;
    titleInput.setCustomValidity(title && !title.trim() ? '请填写专辑名称。' : '');
  }
  [titleInput, artistInput].forEach(input => {
    input.addEventListener('input', clearCoverSearchForInput);
  });
  coverSearchButton.addEventListener('click', searchCovers);
  coverInput.addEventListener('input', () => {
    if (selectedCover) {
      selectedCover = null;
      coverResults.querySelector('[aria-pressed="true"]')?.setAttribute('aria-pressed', 'false');
      coverSearchStatus.textContent = '请选择封面。';
    }
    coverInput.setCustomValidity(coverInput.value && !imageUrl(coverInput.value.trim()) ? '请填写 HTTP 或 HTTPS 图片地址。' : '');
  });
  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (savingAlbum) return;
    const values = new FormData(form);
    const title = String(values.get('title')).trim();
    const matchedCover = selectedCover?.cover === coverInput.value.trim() ? selectedCover : null;
    const artist = String(values.get('artist')).trim() || matchedCover?.artist || '';
    const format = String(values.get('format'));
    const rawCover = String(values.get('cover')).trim();
    const cover = imageUrl(rawCover);
    if (!title || !['vinyl', 'cd'].includes(format) || (rawCover && !cover)) {
      $('formError').textContent = '请填写专辑名称并选择介质。封面仅支持 HTTP / HTTPS 地址。';
      return;
    }
    $('formError').textContent = '';
    if (!usesLocalAlbumService()) {
      $('formError').textContent = '请打开本机唱片架保存唱片（http://127.0.0.1:8765/albums.html）。';
      return;
    }
    addRecordId ||= crypto.randomUUID();
    const record = {
      id: addRecordId, title, artist, format, cover,
      version: String(values.get('version')).trim(),
      price: String(values.get('price')).trim(),
      purchaseChannel: String(values.get('purchaseChannel')).trim(),
      note: String(values.get('note')).trim(),
      source: matchedCover?.source || '',
      storeUrl: matchedCover?.storeUrl || ''
    };
    savingAlbum = true;
    addSubmitButton.disabled = true;
    $('addSubmitLabel').textContent = '正在保存唱片…';
    try {
      addSavedAlbum(await saveAlbum(record, matchedCover));
    } catch (error) {
      $('formError').textContent = error.name === 'TypeError' || error.name === 'AbortError'
        ? '无法连接本机服务或保存超时，请重试。'
        : error.message;
      return;
    } finally {
      savingAlbum = false;
      addSubmitButton.disabled = false;
      $('addSubmitLabel').textContent = '添加唱片';
    }
    activeFormat = 'all';
    $('albumSearch').value = '';
    $('albumSort').value = 'default';
    syncFilters();
    refreshShelf();
    $('addDialog').close();
    $('toast').textContent = '唱片已保存到本机。';
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
    $('browserThemeColor').content = theme === 'light' ? '#f5f5f3' : '#050505';
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
  window.addEventListener('pagehide', () => {
    featuredMotion?.setSuspended(true);
    cardMotionPlayers.forEach(player => player.setSuspended(true));
    detailMotion?.setSuspended(true);
    coverPreviewPlayers.forEach(player => player.setSuspended(true));
  });
  window.addEventListener('pageshow', () => {
    suspendBackgroundMotion(Boolean(document.querySelector('dialog[open]')));
    detailMotion?.setSuspended(false);
    coverPreviewPlayers.forEach(player => player.setSuspended(false));
  });
  refreshShelf();
  loadSavedAlbums();
})();
