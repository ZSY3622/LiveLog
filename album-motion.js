(() => {
  'use strict';

  // The caller owns the static cover; this adapter only overlays video while playing.
  window.mountAlbumMotionCover = ({ host, src, localVideo = false, autoplay = true, onState = () => {} }) => {
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const events = new AbortController();
    const video = document.createElement('video');
    video.className = 'motion-video';
    video.muted = video.defaultMuted = true;
    video.loop = true;
    video.playsInline = true;
    video.preload = 'none';
    video.tabIndex = -1;
    video.setAttribute('aria-hidden', 'true');
    video.setAttribute('muted', '');
    video.setAttribute('playsinline', '');
    host.append(video);

    let hls = null;
    let initialized = false;
    let destroyed = false;
    let suspended = false;
    let visible = false;
    let failed = false;
    let intent = autoplay ? 'auto' : 'paused';
    let state = 'idle';
    let generation = 0;
    let timeout;

    function notify(next) {
      if (destroyed) return;
      state = next;
      host.dataset.motionState = state;
      if (state !== 'playing' && state !== 'loading') host.classList.remove('motion-active');
      onState({ state, message: state === 'failed' ? '动态封面暂不可用，已显示静态封面' : '' });
    }
    function clearTimeouts() { clearTimeout(timeout); timeout = undefined; }
    function release() {
      clearTimeouts();
      generation += 1;
      initialized = false;
      video.pause();
      if (hls) { hls.destroy(); hls = null; }
      video.removeAttribute('src');
      video.load();
      host.classList.remove('motion-active');
    }
    function fail() {
      if (destroyed || failed) return;
      failed = true;
      release();
      notify('failed');
    }
    function canRun() {
      return !destroyed && !failed && visible && !suspended && !document.hidden && (intent === 'playing' || (intent === 'auto' && !reducedMotion.matches));
    }
    function watchLoading() {
      clearTimeouts();
      timeout = setTimeout(fail, 15000);
    }
    function requestPlay() {
      if (!canRun()) return;
      const token = generation;
      let promise;
      try { promise = video.play(); } catch { fail(); return; }
      Promise.resolve(promise).then(() => {
        // A close, pause or filter change may have won the race with play().
        if (destroyed || token !== generation || !canRun()) {
          if (destroyed || !canRun()) video.pause();
        }
      }).catch(error => {
        if (destroyed || token !== generation || !canRun()) return;
        if (error.name === 'NotAllowedError') {
          release();
          intent = 'paused';
          notify('blocked');
        } else if (error.name !== 'AbortError') fail();
      });
    }
    function initialize() {
      if (initialized || !canRun()) return;
      let url;
      try {
        url = new URL(src);
        const localMp4 = window.location.protocol === 'file:' && url.protocol === 'file:' && url.pathname.endsWith('/motion.mp4');
        if (url.username || url.password || (localVideo ? !localMp4 : !['http:', 'https:'].includes(url.protocol))) {
          throw new Error('Invalid source');
        }
      } catch { fail(); return; }
      initialized = true;
      notify('loading');
      watchLoading();
      if (localVideo) {
        host.dataset.motionEngine = 'file';
        video.src = url.href;
        requestPlay();
        return;
      }
      const Hls = window.Hls;
      const supported = typeof Hls?.isSupported === 'function' && Hls.isSupported();
      const native = video.canPlayType('application/vnd.apple.mpegurl');
      // Safari has a reliable native HLS path; Chrome uses MSE even if canPlayType says "maybe".
      const useNative = native && (/Apple/.test(window.navigator.vendor || '') || !supported);
      if (useNative) {
        host.dataset.motionEngine = 'native';
        video.src = url.href;
        requestPlay();
      } else if (supported) {
        host.dataset.motionEngine = 'hls.js';
        try {
          hls = new Hls({
            // file:// cannot reliably start a worker from a local script URL.
            enableWorker: window.location.protocol !== 'file:',
            capLevelToPlayerSize: true,
            maxBufferLength: 8,
            maxMaxBufferLength: 12,
            backBufferLength: 0,
            maxBufferSize: 8 * 1000 * 1000,
            testBandwidth: false
          });
          const instance = hls;
          instance.on(Hls.Events.MANIFEST_PARSED, () => { if (hls === instance && !destroyed) requestPlay(); });
          instance.on(Hls.Events.ERROR, (_event, data) => { if (hls === instance && data.fatal) fail(); });
          instance.loadSource(url.href);
          instance.attachMedia(video);
        } catch { fail(); }
      } else fail();
    }
    function pause() {
      if (destroyed) return;
      if (initialized) release();
      if (!failed) notify(intent === 'auto' && reducedMotion.matches ? 'idle' : 'paused');
    }
    function refresh() {
      if (destroyed) return;
      if (canRun()) {
        if (!initialized) initialize();
      } else pause();
    }
    function toggle() {
      if (destroyed) return;
      if (state === 'playing' || state === 'loading') {
        intent = 'paused';
        pause();
      } else {
        failed = false;
        intent = 'playing';
        // A direct click is allowed before the first observer callback arrives.
        const rect = host.getBoundingClientRect();
        visible = rect.width > 0 && rect.height > 0 && rect.bottom > 0 && rect.top < window.innerHeight;
        refresh();
      }
    }
    video.addEventListener('playing', () => {
      if (!canRun()) { video.pause(); return; }
      clearTimeouts();
      host.classList.add('motion-active');
      notify('playing');
    }, { signal: events.signal });
    video.addEventListener('waiting', () => {
      if (!canRun() || !initialized) return;
      notify('loading');
      watchLoading();
    }, { signal: events.signal });
    video.addEventListener('error', () => { if (initialized) fail(); }, { signal: events.signal });
    document.addEventListener('visibilitychange', refresh, { signal: events.signal });
    function motionPreferenceChanged() {
      if (reducedMotion.matches && intent === 'auto') pause();
      refresh();
    }
    reducedMotion.addEventListener('change', motionPreferenceChanged);
    const observer = new IntersectionObserver(entries => {
      visible = entries.some(entry => entry.isIntersecting && entry.intersectionRatio >= 0.25);
      refresh();
    }, { threshold: [0, 0.25] });
    notify('idle');
    observer.observe(host);

    return {
      toggle,
      setSuspended(value) { suspended = Boolean(value); refresh(); },
      destroy() {
        if (destroyed) return;
        destroyed = true;
        observer.disconnect();
        events.abort();
        reducedMotion.removeEventListener('change', motionPreferenceChanged);
        release();
        video.remove();
        delete host.dataset.motionState;
        delete host.dataset.motionEngine;
      }
    };
  };
})();
