const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

class Element extends EventTarget {
  constructor() {
    super();
    this.dataset = {};
    this.attributes = new Map();
    this.classes = new Set();
    this.children = [];
    this.classList = { add: name => this.classes.add(name), remove: name => this.classes.delete(name) };
  }
  setAttribute(name, value) { this.attributes.set(name, value); }
  removeAttribute(name) { this.attributes.delete(name); }
  getAttribute(name) { return this.attributes.get(name); }
  set src(value) { this.setAttribute('src', value); }
  get src() { return this.getAttribute('src') || ''; }
  append(child) { this.children.push(child); }
  remove() { this.removed = true; }
  getBoundingClientRect() { return { width: 300, height: 300, top: 20, bottom: 320 }; }
}

function setup(t, { safari = false, reduced = false, src = 'https://example.com/cover.m3u8', localVideo = false } = {}) {
  const document = new Element();
  document.hidden = false;
  const media = new Element();
  media.matches = reduced;
  const states = [];
  const instances = [];
  const timers = new Map();
  let timerId = 0;
  class Video extends Element {
    constructor() { super(); this.paused = true; this.playCalls = 0; }
    // Modern Chrome may report "maybe" while still needing the HLS.js path.
    canPlayType() { return 'maybe'; }
    play() { this.playCalls += 1; this.paused = false; return this.pending || Promise.resolve(); }
    pause() { this.paused = true; }
    load() {}
  }
  document.createElement = () => new Video();
  class Hls {
    static Events = { MANIFEST_PARSED: 'manifest', ERROR: 'error' };
    static isSupported() { return true; }
    constructor(options) { this.options = options; this.handlers = new Map(); instances.push(this); }
    on(name, fn) { this.handlers.set(name, fn); }
    loadSource(url) { this.source = url; }
    attachMedia(video) { this.video = video; }
    destroy() { this.destroyed = true; }
    emit(name, payload) { this.handlers.get(name)?.(name, payload); }
  }
  let observer;
  class Observer {
    constructor(callback) { this.callback = callback; observer = this; }
    observe() {}
    disconnect() { this.disconnected = true; }
    show(visible) { this.callback([{ isIntersecting: visible, intersectionRatio: visible ? 1 : 0 }]); }
  }
  const window = {
    Hls, matchMedia: () => media, innerHeight: 900,
    location: { protocol: 'file:' }, navigator: { vendor: safari ? 'Apple Computer, Inc.' : 'Google Inc.' }
  };
  const context = vm.createContext({
    window, document, URL, AbortController, IntersectionObserver: Observer,
    setTimeout(fn) { const id = ++timerId; timers.set(id, fn); return id; },
    clearTimeout(id) { timers.delete(id); }
  });
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../album-motion.js'), 'utf8'), context);
  const host = new Element();
  const player = window.mountAlbumMotionCover({ host, src, localVideo, onState: value => states.push(value.state) });
  t.after(() => player.destroy());
  return { player, host, video: host.children[0], observer, instances, document, media, timers, states, Hls };
}

test('local Chrome lazily uses HLS.js with no file worker, not a misleading native maybe', t => {
  const { observer, instances, host } = setup(t);
  assert.equal(instances.length, 0);
  observer.show(true);
  assert.equal(host.dataset.motionEngine, 'hls.js');
  assert.equal(instances[0].options.enableWorker, false);
  assert.equal(instances[0].options.capLevelToPlayerSize, true);
});

test('Safari plays the original playlist natively, muted and inline', t => {
  const { observer, instances, host, video } = setup(t, { safari: true });
  observer.show(true);
  assert.equal(instances.length, 0);
  assert.equal(host.dataset.motionEngine, 'native');
  assert.equal(video.src, 'https://example.com/cover.m3u8');
  assert.equal(video.muted && video.defaultMuted && video.loop && video.playsInline, true);
});

test('an archived MP4 plays directly from disk and releases the file offscreen', t => {
  const src = 'file:///LiveLog/public/albums/first%20love/motion.mp4';
  const { observer, instances, host, video } = setup(t, { src, localVideo: true });
  assert.equal(video.src, '');
  observer.show(true);
  assert.equal(host.dataset.motionEngine, 'file');
  assert.equal(instances.length, 0);
  assert.equal(video.src, src);
  assert.equal(video.playCalls, 1);
  observer.show(false);
  assert.equal(video.src, '');
});

test('reduced motion prevents automatic requests but permits explicit playback', t => {
  const { observer, instances, player } = setup(t, { reduced: true });
  observer.show(true);
  assert.equal(instances.length, 0);
  player.toggle();
  assert.equal(instances.length, 1);
});

test('leaving view, opening a modal, and backgrounding release the active stream', t => {
  const { observer, player, instances, document } = setup(t);
  observer.show(true);
  observer.show(false);
  assert.equal(instances[0].destroyed, true);
  observer.show(true);
  player.setSuspended(true);
  assert.equal(instances[1].destroyed, true);
  player.setSuspended(false);
  document.hidden = true;
  document.dispatchEvent(new Event('visibilitychange'));
  assert.equal(instances[2].destroyed, true);
});

test('fatal stream failures keep the static cover and allow an explicit retry', t => {
  const { observer, host, player, instances, Hls } = setup(t);
  observer.show(true);
  instances[0].emit(Hls.Events.ERROR, { fatal: true });
  assert.equal(host.dataset.motionState, 'failed');
  assert.equal(host.classes.has('motion-active'), false);
  assert.equal(instances[0].destroyed, true);
  player.toggle();
  assert.equal(instances.length, 2);
});

test('closing during a pending play cannot revive video, timers or observers', async t => {
  const { observer, player, video, instances, Hls, timers } = setup(t);
  let resolve;
  video.pending = new Promise(r => { resolve = r; });
  observer.show(true);
  instances[0].emit(Hls.Events.MANIFEST_PARSED);
  player.destroy();
  resolve();
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(video.paused, true);
  assert.equal(video.removed, true);
  assert.equal(observer.disconnected, true);
  assert.equal(instances[0].destroyed, true);
  assert.equal(timers.size, 0);
});

test('autoplay rejection offers manual playback and releases media', async t => {
  const { observer, video, host } = setup(t, { safari: true });
  video.pending = Promise.reject(Object.assign(new Error('Autoplay blocked'), { name: 'NotAllowedError' }));
  observer.show(true);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(host.dataset.motionState, 'blocked');
  assert.equal(video.src, '');
});

test('a stalled load times out to a static cover, rather than loading forever', t => {
  const { observer, host, timers, instances } = setup(t);
  observer.show(true);
  [...timers.values()][0]();
  assert.equal(host.dataset.motionState, 'failed');
  assert.equal(instances[0].destroyed, true);
});

test('file video requests and credential-bearing URLs are rejected', t => {
  for (const src of ['file:///private/video.m3u8', 'https://user:pass@example.com/video.m3u8']) {
    const { observer, host, instances } = setup(t, { src });
    observer.show(true);
    assert.equal(host.dataset.motionState, 'failed');
    assert.equal(instances.length, 0);
  }
});
