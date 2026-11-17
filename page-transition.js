/* Shared document navigation curtain; loaded in <head> before first paint. */
(() => {
  'use strict';
  const root = document.documentElement;
  const classes = ['page-cover', 'page-leaving', 'page-revealing'];
  let leaving = false;
  let navigationTimer;
  let cleanupTimer;
  const reset = () => {
    clearTimeout(navigationTimer);
    clearTimeout(cleanupTimer);
    leaving = false;
    root.classList.remove(...classes);
  };
  const reveal = () => {
    reset();
    root.classList.add('page-revealing');
    cleanupTimer = setTimeout(reset, 450);
  };
  const pendingKey = 'livelog-page-transition';
  let arriving = false;
  try {
    const pending = JSON.parse(sessionStorage.getItem(pendingKey) || 'null');
    sessionStorage.removeItem(pendingKey);
    arriving = pending?.href === location.href && Date.now() - pending.time < 10000;
  } catch (_) { /* Storage may be unavailable for local files. */ }
  if (arriving) {
    root.classList.add('page-cover');
    // A slow resource must never leave the page blocked.
    cleanupTimer = setTimeout(reset, 3000);
    document.addEventListener('DOMContentLoaded', reveal, { once: true });
  }
  window.addEventListener('pageshow', event => {
    if (event.persisted) reveal();
  });
  document.addEventListener('click', event => {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey ||
        event.ctrlKey || event.shiftKey || event.altKey) return;
    const link = event.target.closest?.('a[href]');
    if (!link || link.hasAttribute('download') ||
        (link.target && link.target !== '_self')) return;
    const next = new URL(link.href, location.href);
    const current = new URL(location.href);
    // Only the two local pages participate; hashes, media and external links stay native.
    if (next.protocol !== current.protocol || next.host !== current.host ||
        !['http:', 'https:', 'file:'].includes(next.protocol) ||
        next.pathname.slice(0, next.pathname.lastIndexOf('/') + 1) !==
          current.pathname.slice(0, current.pathname.lastIndexOf('/') + 1) ||
        !/\/(?:index|albums)\.html$/.test(next.pathname) ||
        (next.pathname === current.pathname && next.search === current.search) ||
        (current.pathname.endsWith('/') && next.pathname === current.pathname + 'index.html')) return;
    event.preventDefault();
    if (leaving) return;
    reset();
    leaving = true;
    root.classList.add('page-leaving');
    navigationTimer = setTimeout(() => {
      try {
        sessionStorage.setItem(pendingKey, JSON.stringify({ href: next.href, time: Date.now() }));
      } catch (_) { /* Navigation remains available without storage. */ }
      location.assign(next.href);
      cleanupTimer = setTimeout(reset, 4000);
    }, 300);
  });
})();
