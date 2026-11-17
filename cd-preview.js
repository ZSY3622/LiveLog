(() => {
  'use strict';
  const records = (window.CONCERT_DATA || []).filter(record => record.poster);
  const stage = document.querySelector('.cd-stage');
  const track = document.querySelector('.cd-track');
  const panel = document.querySelector('.cd-index-panel');
  const indexButton = document.querySelector('#cd-index');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  let position = 0, target = 0, selected = -1, frame = 0, pointer = null, settleTimer;
  const clamp = value => Math.max(0, Math.min(records.length - 1, value));
  const spacing = () => {
    const diameter = track.firstElementChild?.offsetWidth || 400;
    return innerWidth <= 991 ? diameter * 2.2 / 3 : diameter * .82;
  };
  const discs = records.map((record, index) => {
    const disc = document.createElement('button');
    disc.className = 'cd-disc';
    disc.tabIndex = -1;
    disc.setAttribute('aria-label', `${record.artist} ${record.title}`);
    const art = document.createElement('img');
    art.src = record.poster;
    art.alt = '';
    art.draggable = false;
    art.decoding = 'async';
    const hub = document.createElement('span');
    hub.className = 'cd-hub';
    const front = document.createElement('span');
    front.className = 'cd-face cd-front';
    front.append(art, hub);
    const back = document.createElement('span');
    back.className = 'cd-face cd-back';
    back.append(hub.cloneNode(true));
    disc.append(front, back);
    track.append(disc);
    const entry = document.createElement('button');
    entry.textContent = `${String(index + 1).padStart(2, '0')}　${record.artist} — ${record.title}`;
    entry.addEventListener('click', () => { go(index); toggleIndex(false); stage.focus(); });
    panel.append(entry);
    return disc;
  });
  function updateInfo() {
    const index = clamp(Math.round(position));
    if (index === selected || !records.length) return;
    selected = index;
    const record = records[index];
    for (const [id, text] of Object.entries({title: record.title, artist: record.artist, date: record.date, venue: [record.city, record.venue].filter(Boolean).join(' · '), count: `${String(index + 1).padStart(2, '0')} / ${String(records.length).padStart(2, '0')}`})) {
      document.querySelector(`#cd-${id}`).textContent = text || '未记录';
    }
    document.querySelector('#cd-prev').disabled = index === 0;
    document.querySelector('#cd-next').disabled = index === records.length - 1;
    [...panel.children].forEach((entry, i) => entry.setAttribute('aria-current', String(i === index)));
  }
  function render() {
    frame = 0;
    const delta = target - position;
    position = reduced.matches ? target : position + delta * .115;
    if (Math.abs(delta) < .0005) position = target;
    const compact = innerWidth <= 991;
    const diameter = discs[0]?.offsetWidth || 400;
    const unit = diameter / (compact ? 3 : 2);
    track.style.perspective = `${4.4 * unit / 1.08}px`;
    discs.forEach((disc, index) => {
      const offset = index - position;
      const distance = Math.abs(offset);
      disc.style.visibility = distance > 2.5 ? 'hidden' : 'visible';
      let x, y, depth, yaw, scale;
      if (compact) {
        // Reference's <=991px layout: side discs drop and recede in screen space.
        x = offset * 2.2 * unit;
        y = Math.min(distance, 2.5) * unit;
        depth = -Math.min(distance, 2.5) * .5 * unit;
        yaw = -30 + Math.max(0, Math.min(1, -offset)) * 60;
        scale = (1.5 - Math.min(distance, 1) * .9) / 1.5;
      } else {
        // Reference's desktop ellipse, transformed by its -30° X/Y gallery pose.
        // Convert Three.js's upward Y axis to CSS's downward Y axis.
        const angle = offset * .35;
        const localX = Math.sin(angle) * 2.3 * 2.4 * unit;
        const localZ = (1 - Math.cos(angle)) * 2.4 * unit;
        const rotatedZ = .5 * localX + Math.sqrt(3) / 2 * localZ;
        x = Math.sqrt(3) / 2 * localX - .5 * localZ;
        y = -.5 * rotatedZ;
        depth = Math.sqrt(3) / 2 * rotatedZ;
        yaw = -30 - angle * 180 / Math.PI;
        scale = Math.max(.8, 1 - distance * .12);
      }
      disc.style.zIndex = String(1000 + Math.round(depth));
      disc.style.transform = `translate3d(${x}px, ${y}px, ${depth}px) scale(${scale}) rotateX(${reduced.matches ? 0 : 30}deg) rotateY(${reduced.matches ? 0 : yaw}deg)`;
    });
    updateInfo();
    if (position !== target) wake();
  }
  function wake() { if (!frame) frame = requestAnimationFrame(render); }
  function go(index) { target = clamp(index); wake(); }
  function toggleIndex(open) {
    panel.hidden = !open;
    indexButton.setAttribute('aria-expanded', String(open));
    indexButton.querySelector('span').textContent = open ? '−' : '＋';
  }
  stage.addEventListener('pointerdown', event => {
    if (event.button !== 0 || !records.length) return;
    clearTimeout(settleTimer);
    pointer = { id: event.pointerId, x: event.clientX, start: position, lastX: event.clientX, time: performance.now(), velocity: 0 };
    target = position;
    stage.setPointerCapture(event.pointerId);
    stage.classList.add('is-dragging');
  });
  stage.addEventListener('pointermove', event => {
    if (!pointer || pointer.id !== event.pointerId) return;
    const now = performance.now();
    pointer.velocity = (event.clientX - pointer.lastX) / Math.max(1, now - pointer.time);
    pointer.lastX = event.clientX;
    pointer.time = now;
    target = clamp(pointer.start + (pointer.x - event.clientX) / spacing());
    wake();
  });
  function release(event) {
    if (!pointer || pointer.id !== event.pointerId) return;
    const velocity = performance.now() - pointer.time < 100 ? pointer.velocity : 0;
    go(Math.round(target - Math.max(-1, Math.min(1, velocity)) * .16));
    pointer = null;
    stage.classList.remove('is-dragging');
  }
  stage.addEventListener('pointerup', release);
  stage.addEventListener('pointercancel', release);
  stage.addEventListener('lostpointercapture', release);
  stage.addEventListener('wheel', event => {
    if (event.ctrlKey || Math.abs(event.deltaX) <= Math.abs(event.deltaY)) return;
    event.preventDefault();
    target = clamp(target + event.deltaX * (event.deltaMode === 1 ? 16 : 1) / spacing());
    wake();
    clearTimeout(settleTimer);
    settleTimer = setTimeout(() => go(Math.round(target)), 150);
  }, {passive: false});
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape') { toggleIndex(false); indexButton.focus(); }
    if (!panel.hidden || !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    if (event.key === 'Home') go(0);
    else if (event.key === 'End') go(records.length - 1);
    else go(Math.round(target) + (event.key === 'ArrowRight' ? 1 : -1));
  });
  document.querySelector('#cd-prev').addEventListener('click', () => go(Math.round(target) - 1));
  document.querySelector('#cd-next').addEventListener('click', () => go(Math.round(target) + 1));
  indexButton.addEventListener('click', () => toggleIndex(panel.hidden));
  addEventListener('resize', wake);
  reduced.addEventListener('change', wake);
  if (!records.length) document.querySelector('#cd-title').textContent = '暂无唱片';
  wake();
})();
