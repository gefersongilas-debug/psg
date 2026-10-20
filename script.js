/* PSG — transições de navegação sem recarregar o documento (HTTP/HTTPS). */
(() => {
  'use strict';
  const root = document.documentElement;
  const canNavigate = location.protocol === 'http:' || location.protocol === 'https:';
  const motionOK = !matchMedia('(prefers-reduced-motion: reduce)').matches;
  const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
  const cache = new Map();
  const heroCache = new Map();
  let revealObserver;
  let navigationSerial = 0;
  const scriptURL = document.currentScript?.src || new URL('script.js', document.baseURI).href;
  const homeHeroURL = new URL('assets/web/hero-industria.webp', scriptURL).href;

  function routeFor(link) {
    let url;
    try { url = new URL(link, document.baseURI); } catch { return null; }
    if (url.protocol !== location.protocol || url.origin !== location.origin) return null;
    let p = url.pathname.replace(/\/+/g, '/');
    if (p === '/' || p === '/index.html') return {path:'/', url};
    if (/^\/a-psg\/(?:index\.html)?$/.test(p)) return {path:'/a-psg/', url};
    if (/^\/solucoes\/(?:index\.html)?$/.test(p)) return {path:'/solucoes/', url};
    return null;
  }

  function initializeInteractions() {
    const header = document.querySelector('.topbar');
    const menu = document.querySelector('.menu');
    const links = document.querySelector('.navlinks');
    const updateHeader = () => header?.classList.toggle('scrolled', scrollY > 30);
    updateHeader();
    menu?.addEventListener('click', () => {
      const opened = !!links?.classList.toggle('open');
      menu.setAttribute('aria-expanded', String(opened));
      menu.setAttribute('aria-label', opened ? 'Fechar menu' : 'Abrir menu');
    });
    links?.querySelectorAll('a').forEach(a => a.addEventListener('click', () => {
      links.classList.remove('open');
      menu?.setAttribute('aria-expanded', 'false');
      menu?.setAttribute('aria-label', 'Abrir menu');
    }));
    // Avoid recreating observers and leaving listeners attached to old page nodes.
    revealObserver?.disconnect();
    if ('IntersectionObserver' in window) {
      revealObserver = new IntersectionObserver(entries => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            entry.target.classList.add('visible');
            revealObserver.unobserve(entry.target);
          }
        }
      }, {threshold:.12});
      document.querySelectorAll('.reveal').forEach(el => revealObserver.observe(el));
    } else {
      document.querySelectorAll('.reveal').forEach(el => el.classList.add('visible'));
    }
    document.querySelectorAll('.solution-button').forEach(btn => {
      btn.addEventListener('click', () => {
        const item = btn.parentElement;
        const content = item.querySelector('.solution-content');
        if (!content) return;
        item.classList.toggle('open');
        content.style.maxHeight = item.classList.contains('open') ? content.scrollHeight + 'px' : '0';
      });
    });
  }
  addEventListener('scroll', () => {
    document.querySelector('.topbar')?.classList.toggle('scrolled', scrollY > 30);
  }, {passive:true});
  initializeInteractions();

  if (!canNavigate) {
    // file:// blocks fetch and cross-document View Transitions; fade before full navigation.
    document.addEventListener('click', event => {
      const a = event.target.closest?.('a[href]');
      if (!a || event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return;
      if (a.target && a.target !== '_self') return;
      const url = new URL(a.href);
      if (url.protocol !== 'file:' || url.pathname === location.pathname) return;
      if (!/\/(?:index\.html|a-psg\/index\.html|solucoes\/index\.html)$/.test(url.pathname)) return;
      event.preventDefault();
      root.classList.add('psg-leaving');
      setTimeout(() => location.assign(url.href), motionOK ? 135 : 0);
    });
    return;
  }

  function getPage(route) {
    if (!cache.has(route)) {
      // Parsing from the fetched HTML, never executing embedded scripts twice.
      cache.set(route, fetch(route, {credentials:'same-origin'}).then(async response => {
        if (!response.ok || !(response.headers.get('content-type') || '').includes('text/html')) throw Error('Página indisponível');
        return {doc:new DOMParser().parseFromString(await response.text(),'text/html'), base:response.url};
      }).catch(error => {cache.delete(route);throw error}));
    }
    return cache.get(route);
  }

  function warmHero(doc, base) {
    const hero = doc.querySelector('.inner-hero-bg');
    const src = hero ? new URL(hero.getAttribute('src'), base).href : homeHeroURL;
    if (!heroCache.has(src)) {
      const img = new Image();
      img.src = src;
      heroCache.set(src, img.decode?.().catch(() => {}) || Promise.resolve());
    }
    return heroCache.get(src);
  }

  function fixRelativeReferences(node, base) {
    // When a fragment is moved between folders, URL attributes must remain correct.
    for (const el of [node, ...node.querySelectorAll('[href],[src],[srcset],[poster]')]) {
      for (const name of ['href','src','poster']) {
        const value = el.getAttribute(name);
        if (value && !/^(?:[a-z][a-z\d+.-]*:|\/\/)/i.test(value)) {
          el.setAttribute(name, new URL(value,base).href);
        }
      }
      const srcset = el.getAttribute('srcset');
      if (srcset) el.setAttribute('srcset', srcset.split(',').map(v => {
        const parts = v.trim().split(/\s+/);
        parts[0] = new URL(parts[0],base).href;
        return parts.join(' ');
      }).join(', '));
    }
  }

  async function navigate(route, opts={}) {
    const serial = ++navigationSerial;
    if (route === routeFor(location.href)?.path && !opts.isHistory) {
      if (opts.hash) document.querySelector(opts.hash)?.scrollIntoView({behavior:'smooth'});
      return;
    }
    root.classList.remove('psg-leaving','psg-entering');
    root.classList.add('psg-navigating');
    try {
      const {doc, base} = await getPage(route);
      if (serial !== navigationSerial) return;
      if (!doc.querySelector('header.topbar') || !doc.querySelector('main') || !doc.querySelector('footer.footer')) throw Error('HTML incompleto');
      // Decode only the next first-screen picture; cap the wait to avoid slow navigation.
      await Promise.race([warmHero(doc, base), wait(550)]);
      if (serial !== navigationSerial) return;
      root.classList.add('psg-leaving');
      if (motionOK) await wait(160);
      if (serial !== navigationSerial) return;
      root.classList.add('psg-entering');
      const newHeader = doc.querySelector('header.topbar').cloneNode(true);
      const newMain = doc.querySelector('main').cloneNode(true);
      const newFooter = doc.querySelector('footer.footer').cloneNode(true);
      for (const fragment of [newHeader,newMain,newFooter]) fixRelativeReferences(fragment,base);
      document.querySelector('header.topbar').replaceWith(newHeader);
      document.querySelector('main').replaceWith(newMain);
      document.querySelector('footer.footer').replaceWith(newFooter);
      document.body.className = doc.body.className;
      document.title = doc.title;
      const description = doc.querySelector('meta[name="description"]')?.content;
      if (description) document.querySelector('meta[name="description"]')?.setAttribute('content',description);
      // PushState retains real, indexable URLs and native back/forward history.
      if (!opts.isHistory) {
        history.replaceState({...history.state,scrollY:scrollY},'');
        history.pushState({scrollY:0},'',route+(opts.hash||''));
      }
      const y = opts.isHistory ? (history.state?.scrollY||0) : 0;
      scrollTo({top:y,behavior:'instant'});
      if (opts.hash) document.querySelector(opts.hash)?.scrollIntoView({behavior:'instant'});
      initializeInteractions();
      root.classList.remove('psg-leaving');
      requestAnimationFrame(() => requestAnimationFrame(() => root.classList.remove('psg-entering')));
    } catch (error) {
      // Network errors never strand the visitor with an unresponsive website.
      root.classList.remove('psg-leaving','psg-entering');
      if (opts.isHistory) location.reload();
      else location.assign(route+(opts.hash||''));
    } finally {
      if (serial === navigationSerial) root.classList.remove('psg-navigating');
    }
  }

  const current = routeFor(location.href);
  if (current) {
    const snapshot = '<!doctype html>' + document.documentElement.outerHTML;
    cache.set(current.path,Promise.resolve({doc:new DOMParser().parseFromString(snapshot,'text/html'),base:location.href}));
    if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
    // Idle-fetch only the two tiny HTML documents, not full image galleries.
    const warmPages = () => ['/','/a-psg/','/solucoes/'].filter(x=>x!==current.path).forEach(x => getPage(x).catch(()=>{}));
    if ('requestIdleCallback' in window) requestIdleCallback(warmPages,{timeout:1800});
    else setTimeout(warmPages,850);
  }

  document.addEventListener('pointerover', e => {
    const a = e.target.closest?.('a[href]');
    const target = a && routeFor(a.href);
    if (target && target.path !== routeFor(location.href)?.path) {
      getPage(target.path).then(({doc,base}) => warmHero(doc,base)).catch(()=>{});
    }
  });
  document.addEventListener('focusin', e => {
    const a = e.target.closest?.('a[href]');
    const target = a && routeFor(a.href);
    if (target && target.path !== routeFor(location.href)?.path) getPage(target.path).catch(()=>{});
  });
  document.addEventListener('click', e => {
    const a = e.target.closest?.('a[href]');
    if (!a || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.altKey || e.shiftKey || a.hasAttribute('download') || (a.target && a.target !== '_self')) return;
    const target = routeFor(a.href);
    if (!target) return;
    const currentPath = routeFor(location.href)?.path;
    if (target.path === currentPath) return; // native anchors and same-page behavior
    e.preventDefault();
    navigate(target.path,{hash:target.url.hash});
  });
  addEventListener('popstate', () => {
    const target=routeFor(location.href);
    if (target) navigate(target.path,{isHistory:true,hash:target.url.hash});
  });
  addEventListener('pageshow', () => root.classList.remove('psg-leaving','psg-entering','psg-navigating'));
})();
