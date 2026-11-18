// Tour de Table : jeu d'ambiance en salle à code PIN.
// Le téléphone de l'hôte fait office de serveur ; les autres s'y connectent
// directement (WebRTC via PeerJS, service public gratuit et sans clé).
(() => {
  'use strict';
  const D = window.TDT_DATA;
  const app = document.getElementById('app');
  const params = new URLSearchParams(location.search);

  // --- Réglages réseau -------------------------------------------------------
  const PREFIX = 'tourdetable-v1-';
  const PEER_OPTS = params.get('peerhost')
    ? { host: params.get('peerhost'), port: +(params.get('peerport') || 9000), path: '/', secure: false, debug: 1, config: { iceServers: [] } }
    : { debug: 1 };
  const MAX_PLAYERS = 12;
  const MAX_PHOTOS = 10;
  const DUR = { annee: 25, pays: 20, emojis: 20, galerie: 20, auteur: 20, write: 60, reveal: 9 };
  const CATS = {
    annee: '📅 Photo → année',
    pays: '🌍 Photo → pays',
    galerie: '🖼️ Galerie des joueurs',
    emojis: '🎬 Film en emojis',
    auteur: '✍️ Qui a écrit ça ?'
  };

  // --- Petits outils ------------------------------------------------------------
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const rnd = (n) => Math.floor(Math.random() * n);
  const shuffle = (a) => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = rnd(i + 1); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const pick = (a) => a[rnd(a.length)];
  const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
  const commonsImg = (f) => 'https://commons.wikimedia.org/wiki/Special:FilePath/' + encodeURIComponent(f) + '?width=900';
  const commonsPage = (f) => 'https://commons.wikimedia.org/wiki/File:' + encodeURIComponent(f.replace(/ /g, '_'));
  const store = {
    get(k, d) { try { return localStorage.getItem(k) ?? d; } catch { return d; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch { /* navigation privée */ } }
  };
  let toastTimer;
  function toast(msg) {
    let t = document.querySelector('.toast');
    if (!t) { t = document.createElement('div'); t.className = 'toast'; document.body.appendChild(t); }
    t.textContent = msg;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.remove(), 2200);
  }

  // --- État local de ce téléphone --------------------------------------------------
  // Jeton par onglet : deux onglets du même navigateur comptent comme deux joueurs,
  // et un rechargement de page retrouve sa place dans la salle.
  let tok = ''; try { tok = sessionStorage.getItem('tdt-token') || ''; } catch { /* ignoré */ }
  const me = { name: store.get('tdt-name', ''), token: tok || uid() };
  try { sessionStorage.setItem('tdt-token', me.token); } catch { /* ignoré */ }
  const view = {
    screen: 'home', s: null, myId: null, media: {}, deadline: 0, key: '',
    myPhotos: [], err: '', pin: params.get('pin') || '', lost: false
  };
  let H = null;        // état de l'hôte (seulement sur le téléphone hôte)
  let client = null;   // connexion du joueur vers l'hôte

  function send(msg) {
    if (H) hostAction('p0', msg);
    else if (client && client.conn && client.conn.open) client.conn.send(msg);
    else toast('Connexion perdue, reconnexion…');
  }

  // ============================================================================
  //  HÔTE
  // ============================================================================
  function hostCreate() {
    H = {
      peer: null, pin: '', conns: new Map(), connObjs: new Map(),
      players: [{ id: 'p0', name: me.name, token: me.token, score: 0, connected: true, photos: [] }],
      seq: 1, phase: 'lobby', settings: { count: 10, cats: { annee: true, pays: true, galerie: true, emojis: true, auteur: true } },
      plan: [], step: 0, qid: 0, q: null, answers: {}, endsAt: 0, timer: null, reveal: null,
      pools: { annee: [], pays: [], status: 'chargement' }, used: new Set(), auteur: null
    };
    view.myId = 'p0';
    view.screen = 'connecting';
    render();
    openHostPeer(0);
    loadPools();
    keepAwake();
    window.addEventListener('beforeunload', (e) => { if (H && H.players.length > 1) { e.preventDefault(); e.returnValue = ''; } });
  }

  function openHostPeer(tries) {
    H.pin = String(1000 + rnd(9000));
    const peer = new Peer(PREFIX + H.pin, PEER_OPTS);
    H.peer = peer;
    peer.on('open', () => { hostBroadcast(); });
    peer.on('connection', (conn) => hostConn(conn));
    peer.on('disconnected', () => { setTimeout(() => { if (!peer.destroyed) peer.reconnect(); }, 1500); });
    peer.on('error', (e) => {
      if (e.type === 'unavailable-id' && tries < 5) { peer.destroy(); openHostPeer(tries + 1); return; }
      if (e.type === 'peer-unavailable') return;
      console.warn('peer error', e.type, e);
      if (['network', 'server-error', 'socket-error', 'socket-closed', 'browser-incompatible'].includes(e.type) && view.screen === 'connecting') {
        view.screen = 'home'; view.err = "Impossible de créer la salle (réseau). Vérifie ta connexion et réessaie."; H = null; render();
      }
    });
  }

  function hostConn(conn) {
    H.connObjs.set(conn.connectionId, conn);
    conn.on('data', (msg) => {
      if (!msg || typeof msg !== 'object') return;
      if (msg.t === 'join') return hostJoin(conn, msg);
      const pid = H.conns.get(conn.connectionId);
      if (pid) hostAction(pid, msg);
    });
    conn.on('close', () => {
      const pid = H.conns.get(conn.connectionId);
      H.conns.delete(conn.connectionId);
      H.connObjs.delete(conn.connectionId);
      const p = H.players.find((x) => x.id === pid);
      if (p && ![...H.conns.values()].includes(pid)) { p.connected = false; hostCheckDone(); hostBroadcast(); }
    });
  }

  function hostJoin(conn, msg) {
    const name = String(msg.name || '').trim().slice(0, 16) || 'Joueur';
    const token = String(msg.token || '').slice(0, 40);
    let p = token && token !== me.token ? H.players.find((x) => x.token === token) : null;
    if (!p) {
      if (H.players.length >= MAX_PLAYERS) { conn.send({ t: 'error', msg: 'La salle est pleine (12 joueurs maximum).' }); return; }
      let n = name, i = 2;
      while (H.players.some((x) => x.name.toLowerCase() === n.toLowerCase())) n = name + ' ' + i++;
      p = { id: 'p' + H.seq++, name: n, token, score: 0, connected: true, photos: [] };
      H.players.push(p);
    }
    p.connected = true;
    H.conns.set(conn.connectionId, p.id);
    if (H.q && H.q.mediaKey) conn.send({ t: 'media', key: H.q.mediaKey, data: H.q.mediaData });
    hostBroadcast();
  }

  function hostAction(pid, msg) {
    const p = H.players.find((x) => x.id === pid);
    if (!p) return;
    if (msg.t === 'photos' && Array.isArray(msg.list)) {
      p.photos = msg.list.filter((d) => typeof d === 'string' && d.startsWith('data:image/jpeg') && d.length < 500000).slice(0, MAX_PHOTOS);
      H.used.forEach((k) => { if (k.startsWith('g-' + pid + '-')) H.used.delete(k); });
      return hostBroadcast();
    }
    if (msg.t === 'answer' && H.phase === 'question' && !(pid in H.answers) && hostEligible(pid)) {
      H.answers[pid] = { v: msg.v, t: Date.now() };
      hostBroadcast();
      return hostCheckDone();
    }
    if (msg.t === 'write' && H.phase === 'write' && !(pid in H.auteur.texts)) {
      const text = String(msg.text || '').trim().slice(0, 80);
      if (!text) return;
      H.auteur.texts[pid] = text;
      hostBroadcast();
      return hostCheckDone();
    }
    if (pid !== 'p0') return; // les commandes ci-dessous sont réservées à l'hôte
    if (msg.t === 'start') return hostStart();
    if (msg.t === 'skip') return hostSkip();
    if (msg.t === 'again') {
      clearTimeout(H.timer);
      H.players = H.players.filter((x) => x.connected);
      H.players.forEach((x) => { x.score = 0; });
      Object.assign(H, { phase: 'lobby', plan: [], step: 0, q: null, reveal: null, answers: {}, auteur: null });
      return hostBroadcast();
    }
  }

  function connectedPlayers() { return H.players.filter((p) => p.connected); }
  function hostEligible(pid) {
    const p = H.players.find((x) => x.id === pid);
    return !!(p && p.connected && !(H.q && H.q.owner === pid));
  }

  function hostCheckDone() {
    if (H.phase === 'question') {
      const el = connectedPlayers().filter((p) => hostEligible(p.id));
      if (el.length && el.every((p) => p.id in H.answers)) hostEndQuestion();
    } else if (H.phase === 'write') {
      const cp = connectedPlayers();
      if (cp.every((p) => p.id in H.auteur.texts)) hostEndWrite();
    }
  }

  function hostSkip() {
    if (H.phase === 'question') hostEndQuestion();
    else if (H.phase === 'write') hostEndWrite();
    else if (H.phase === 'reveal') hostNext();
  }

  function availableCats() {
    const cp = connectedPlayers();
    const withPhotos = cp.filter((p) => p.photos.length).length;
    const a = [];
    const c = H.settings.cats;
    if (c.annee) a.push('annee');
    if (c.pays) a.push('pays');
    if (c.emojis) a.push('emojis');
    if (c.galerie && cp.length >= 3 && withPhotos >= 1) a.push('galerie');
    if (c.auteur && cp.length >= 3) a.push('auteur');
    return a;
  }

  function hostStart() {
    if (connectedPlayers().length < 2) return toast('Il faut au moins 2 joueurs');
    let cats = availableCats();
    if (!cats.length) cats = ['emojis'];
    const plan = [];
    let auteurLeft = H.settings.count >= 15 ? 2 : 1;
    while (plan.length < H.settings.count) {
      for (const c of shuffle(cats)) {
        if (plan.length >= H.settings.count) break;
        if (c === 'auteur') { if (!auteurLeft) continue; auteurLeft--; }
        if (plan[plan.length - 1] === c && cats.length > 1) continue;
        plan.push(c);
      }
    }
    H.players.forEach((p) => { p.score = 0; });
    H.plan = plan; H.step = 0;
    hostStep();
  }

  function hostStep() {
    const type = H.plan[H.step];
    if (type === 'auteur') {
      H.auteur = { prompt: pick(D.QUESTIONS_AUTEUR), texts: {}, queue: [] };
      H.q = null; H.reveal = null;
      H.phase = 'write'; H.qid++;
      hostTimer(DUR.write, hostEndWrite);
      return hostBroadcast();
    }
    const q = makeQuestion(type);
    if (!q) { H.step++; return H.step >= H.plan.length ? hostEnd() : hostStep(); }
    hostAsk(q);
  }

  function hostAsk(q) {
    H.q = q; H.answers = {}; H.reveal = null; H.phase = 'question'; H.qid++;
    if (q.mediaKey) {
      view.media[q.mediaKey] = q.mediaData;
      hostEachConn((conn) => conn.send({ t: 'media', key: q.mediaKey, data: q.mediaData }));
    }
    hostTimer(DUR[q.type], hostEndQuestion);
    hostBroadcast();
  }

  function hostTimer(sec, fn) {
    clearTimeout(H.timer);
    H.dur = sec * 1000;
    H.endsAt = Date.now() + H.dur;
    H.timer = setTimeout(fn, H.dur + 400);
  }

  function hostEachConn(fn) {
    for (const [cid, conn] of H.connObjs) {
      if (conn.open && H.conns.has(cid)) { try { fn(conn, H.conns.get(cid)); } catch (e) { console.warn(e); } }
    }
  }

  function takeUnused(list, keyFn) {
    const free = list.filter((x) => !H.used.has(keyFn(x)));
    if (!free.length) return null;
    const x = pick(free);
    H.used.add(keyFn(x));
    return x;
  }

  function makeQuestion(type) {
    if (type === 'annee') {
      const pool = H.pools.annee.length ? H.pools.annee : D.FALLBACK_ANNEE;
      const it = takeUnused(pool, (x) => 'a-' + x.f) || pick(pool);
      return {
        type, img: commonsImg(it.f), credit: commonsPage(it.f), answer: it.y, label: it.l,
        prompt: it.photo === false ? 'En quelle année ce lieu a-t-il été inauguré ?' : 'En quelle année cette photo a-t-elle été prise ?'
      };
    }
    if (type === 'pays') {
      const pool = H.pools.pays.length ? H.pools.pays : D.FALLBACK_PAYS;
      const it = takeUnused(pool, (x) => 'p-' + x.f) || pick(pool);
      const others = shuffle([...new Set(pool.map((x) => x.c).concat(D.PAYS_LEURRES))].filter((c) => c !== it.c)).slice(0, 3);
      const choices = shuffle([it.c, ...others]);
      return { type, img: commonsImg(it.f), credit: commonsPage(it.f), choices, answer: choices.indexOf(it.c), label: it.l, prompt: 'Dans quel pays se trouve ce lieu ?' };
    }
    if (type === 'emojis') {
      const it = takeUnused(D.FILMS, (x) => 'e-' + x[1]) || pick(D.FILMS);
      const choices = shuffle([it[1], ...shuffle(D.FILMS.filter((x) => x[1] !== it[1])).slice(0, 3).map((x) => x[1])]);
      return { type, emojis: it[0], choices, answer: choices.indexOf(it[1]), label: it[1], prompt: 'Quel film se cache derrière ces emojis ?' };
    }
    if (type === 'galerie') {
      const all = [];
      connectedPlayers().forEach((p) => p.photos.forEach((d, i) => all.push({ owner: p.id, i, d })));
      const it = takeUnused(all, (x) => 'g-' + x.owner + '-' + x.i);
      if (!it) return null;
      const cand = connectedPlayers();
      const choices = shuffle(cand.map((p) => p.id));
      const ownerName = H.players.find((p) => p.id === it.owner).name;
      return {
        type, mediaKey: 'g-' + it.owner + '-' + it.i + '-' + H.qid, mediaData: it.d, owner: it.owner,
        choices, choiceNames: choices.map((id) => H.players.find((p) => p.id === id).name),
        answer: choices.indexOf(it.owner), label: 'Photo de ' + ownerName, prompt: 'À qui appartient cette photo ?'
      };
    }
    return null;
  }

  function hostEndWrite() {
    if (H.phase !== 'write') return;
    clearTimeout(H.timer);
    const writers = Object.keys(H.auteur.texts).filter((id) => H.players.some((p) => p.id === id));
    if (writers.length < 2) { H.step++; return H.step >= H.plan.length ? hostEnd() : hostStep(); }
    H.auteur.queue = shuffle(writers).slice(0, 6);
    hostNextAuteur();
  }

  function hostNextAuteur() {
    const author = H.auteur.queue.shift();
    const writers = Object.keys(H.auteur.texts);
    const choices = shuffle(writers);
    hostAsk({
      type: 'auteur', owner: author, text: H.auteur.texts[author], prompt: H.auteur.prompt,
      choices, choiceNames: choices.map((id) => H.players.find((p) => p.id === id).name),
      answer: choices.indexOf(author), label: '« ' + H.auteur.texts[author] + ' »'
    });
  }

  function speedPts(a) {
    const frac = Math.max(0, Math.min(1, (H.endsAt - a.t) / H.dur));
    return 500 + Math.round(500 * frac);
  }

  function hostEndQuestion() {
    if (H.phase !== 'question') return;
    clearTimeout(H.timer);
    const q = H.q;
    const results = [];
    let fooled = 0;
    for (const p of H.players) {
      if (!hostEligible(p.id) && !(p.id in H.answers)) continue;
      const a = H.answers[p.id];
      let pts = 0, shown = '—';
      if (a) {
        if (q.type === 'annee') {
          const v = parseInt(a.v, 10);
          if (Number.isFinite(v)) { pts = Math.max(0, Math.round(1000 - 40 * Math.abs(v - q.answer))); shown = String(v); }
        } else {
          const v = +a.v;
          shown = q.choiceNames ? (q.choiceNames[v] ?? '—') : (q.choices[v] ?? '—');
          if (v === q.answer) pts = speedPts(a); else fooled++;
        }
      } else if (q.type === 'auteur') fooled++;
      p.score += pts;
      results.push({ id: p.id, name: p.name, shown, pts });
    }
    if (q.type === 'auteur' && fooled) {
      const owner = H.players.find((p) => p.id === q.owner);
      if (owner) { owner.score += 150 * fooled; results.push({ id: owner.id, name: owner.name, shown: 'auteur·rice, ' + fooled + ' piégé' + (fooled > 1 ? 's' : ''), pts: 150 * fooled }); }
    }
    results.sort((a, b) => b.pts - a.pts);
    H.reveal = {
      answer: q.type === 'annee' ? String(q.answer) : (q.choiceNames ? q.choiceNames[q.answer] : q.choices[q.answer]),
      label: q.label, credit: q.credit || null, results
    };
    H.phase = 'reveal';
    hostTimer(DUR.reveal, hostNext);
    hostBroadcast();
  }

  function hostNext() {
    if (H.phase !== 'reveal') return;
    if (H.q && H.q.type === 'auteur' && H.auteur && H.auteur.queue.length) return hostNextAuteur();
    H.step++;
    if (H.step >= H.plan.length) return hostEnd();
    hostStep();
  }

  function hostEnd() {
    clearTimeout(H.timer);
    H.phase = 'end'; H.q = null; H.reveal = null; H.qid++;
    hostBroadcast();
  }

  function publicState(forId) {
    const q = H.q;
    const pq = q && {
      type: q.type, prompt: q.prompt, img: q.img, mediaKey: q.mediaKey, emojis: q.emojis, text: q.text,
      choices: q.choiceNames || q.choices, owner: q.owner
    };
    return {
      phase: H.phase, pin: H.pin, qid: H.qid, step: H.step, total: H.plan.length,
      cat: H.plan[H.step] || null,
      remaining: Math.max(0, H.endsAt - Date.now()), dur: H.dur || 1,
      players: H.players.map((p) => ({
        id: p.id, name: p.name, score: p.score, connected: p.connected, photos: p.photos.length,
        answered: H.phase === 'write' ? !!(H.auteur && p.id in H.auteur.texts) : p.id in H.answers,
        eligible: H.phase === 'question' ? hostEligible(p.id) : H.phase === 'write' ? p.connected : false
      })),
      q: pq, reveal: H.reveal, write: H.phase === 'write' ? { prompt: H.auteur.prompt } : null,
      pools: H.pools.status, you: forId
    };
  }

  function hostBroadcast() {
    if (!H) return;
    hostEachConn((conn, pid) => conn.send({ t: 'state', s: publicState(pid) }));
    onState(publicState('p0'));
  }

  async function loadPools() {
    const q = (sparql) => {
      const ctl = new AbortController();
      const t = setTimeout(() => ctl.abort(), 25000);
      return fetch('https://query.wikidata.org/sparql?format=json&query=' + encodeURIComponent(sparql), { signal: ctl.signal })
        .then((r) => { if (!r.ok) throw new Error(r.status); return r.json(); })
        .then((j) => j.results.bindings)
        .finally(() => clearTimeout(t));
    };
    const okFile = (f) => /\.(jpe?g)$/i.test(f) && !/map|carte|montage|logo|plan/i.test(f);
    const dedupe = (rows, mk) => {
      const seen = new Map();
      for (const r of rows) {
        const i = r.i.value;
        let f; try { f = decodeURIComponent(r.f.value); } catch { continue; }
        if (!okFile(f) || seen.has(i)) continue;
        const it = mk(r, f);
        if (it) seen.set(i, it);
      }
      return [...seen.values()];
    };
    const [pays, annee] = await Promise.allSettled([q(D.SPARQL_PAYS), q(D.SPARQL_ANNEE)]);
    if (!H) return;
    if (pays.status === 'fulfilled') {
      H.pools.pays = dedupe(pays.value, (r, f) => ({ f, l: r.l.value, c: D.RENOMMER_PAYS[r.c.value] || r.c.value }));
    }
    if (annee.status === 'fulfilled') {
      H.pools.annee = dedupe(annee.value, (r, f) => {
        const y = +r.y.value;
        if (r.l.value.includes(String(y))) return null; // l'année est dans le nom : trop facile
        return { f, l: r.l.value, y, photo: false };
      });
    }
    if (H.pools.pays.length < 10) H.pools.pays = [];
    if (H.pools.annee.length < 10) H.pools.annee = [];
    const n = H.pools.pays.length + H.pools.annee.length;
    H.pools.status = n ? n + ' photos prêtes' : 'mode secours (' + (D.FALLBACK_PAYS.length + D.FALLBACK_ANNEE.length) + ' photos)';
    hostBroadcast();
  }

  async function keepAwake() {
    if (!('wakeLock' in navigator)) return;
    const lock = async () => { try { await navigator.wakeLock.request('screen'); } catch { /* refusé */ } };
    lock();
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && H) lock(); });
  }

  // ============================================================================
  //  JOUEUR
  // ============================================================================
  function joinRoom(pin) {
    view.screen = 'connecting'; view.err = ''; view.pin = pin; render();
    const peer = new Peer(undefined, PEER_OPTS);
    client = { peer, conn: null, pin, retries: 0, joined: false };
    peer.on('open', () => connectToHost());
    peer.on('error', (e) => {
      if (e.type === 'peer-unavailable') {
        if (client.joined) return scheduleReconnect();
        view.screen = 'home'; view.err = 'Aucune salle ouverte avec le code ' + pin + '.'; client = null; peer.destroy(); return render();
      }
      console.warn('peer error', e.type, e);
      if (!client.joined && view.screen === 'connecting') {
        view.screen = 'home'; view.err = 'Connexion impossible. Vérifie ton réseau et réessaie.'; client = null; peer.destroy(); render();
      } else scheduleReconnect();
    });
    peer.on('disconnected', () => { setTimeout(() => { if (!peer.destroyed) peer.reconnect(); }, 1500); });
  }

  function connectToHost() {
    const conn = client.peer.connect(PREFIX + client.pin, { reliable: true });
    client.conn = conn;
    const t = setTimeout(() => { if (!conn.open) { conn.close(); if (client.joined) scheduleReconnect(); else { view.screen = 'home'; view.err = "La salle ne répond pas. Le téléphone de l'hôte est peut-être en veille."; render(); } } }, 15000);
    conn.on('open', () => {
      clearTimeout(t);
      client.joined = true; client.retries = 0; view.lost = false;
      conn.send({ t: 'join', name: me.name, token: me.token });
      if (view.myPhotos.length) conn.send({ t: 'photos', list: view.myPhotos });
    });
    conn.on('data', (msg) => {
      if (msg.t === 'state') onState(msg.s);
      else if (msg.t === 'media') { view.media[msg.key] = msg.data; if (view.s) { view.key = ''; render(); } }
      else if (msg.t === 'error') { view.screen = 'home'; view.err = msg.msg; client.peer.destroy(); client = null; render(); }
    });
    conn.on('close', () => { if (client && client.conn === conn) scheduleReconnect(); });
  }

  function scheduleReconnect() {
    if (!client || client.reconnecting) return;
    view.lost = true; updateDynamic();
    client.reconnecting = true;
    client.retries++;
    setTimeout(() => {
      if (!client) return;
      client.reconnecting = false;
      if (client.retries > 20) { view.screen = 'home'; view.err = "La connexion avec l'hôte est perdue."; render(); return; }
      if (client.peer.disconnected) client.peer.reconnect();
      connectToHost();
    }, 2500);
  }

  // ============================================================================
  //  AFFICHAGE
  // ============================================================================
  function onState(s) {
    view.s = s; view.myId = s.you; view.screen = 'game';
    view.deadline = Date.now() + s.remaining;
    render();
  }

  function myPlayer() { return view.s && view.s.players.find((p) => p.id === view.myId); }
  const isHost = () => !!H;

  function screenKey() {
    if (view.screen !== 'game') return view.screen + '|' + view.err;
    const s = view.s, p = myPlayer() || {};
    return [s.phase, s.qid, p.answered, p.eligible, s.q && s.q.mediaKey && !!view.media[s.q.mediaKey]].join('|');
  }

  function render() {
    const k = screenKey();
    if (k === view.key) return updateDynamic();
    view.key = k;
    if (view.screen === 'home') app.innerHTML = homeHTML();
    else if (view.screen === 'connecting') app.innerHTML = '<div class="spinner"></div><p class="center mute">Connexion à la salle…</p>';
    else {
      const ph = view.s.phase;
      app.innerHTML = (ph === 'lobby' ? lobbyHTML() : ph === 'write' ? writeHTML() : ph === 'question' ? questionHTML() : ph === 'reveal' ? revealHTML() : endHTML());
    }
    bind();
    updateDynamic();
  }

  function homeHTML() {
    return `
      <div class="brand">Tour de <span>Table</span></div>
      <p class="tag">Une salle, un code, des manches surprises. Sans appli, sans compte.</p>
      <label>Ton pseudo<input id="name" maxlength="16" autocomplete="nickname" value="${esc(me.name)}" placeholder="Ex. Camille"></label>
      <button id="create" class="primary">Créer une salle</button>
      <div class="or">ou</div>
      <label>Code de la salle<input id="pin" inputmode="numeric" pattern="[0-9]*" maxlength="4" value="${esc(view.pin)}" placeholder="1234"></label>
      <button id="join">Rejoindre</button>
      <p class="err" id="err">${esc(view.err)}</p>
      <p class="mute small center">Les joueurs se connectent directement au téléphone de l'hôte : gardez-le allumé pendant la partie.</p>`;
  }

  function shareLink() {
    const u = new URL(location.href);
    u.search = '';
    if (params.get('peerhost')) { u.searchParams.set('peerhost', params.get('peerhost')); u.searchParams.set('peerport', params.get('peerport') || '9000'); }
    u.searchParams.set('pin', view.s.pin);
    return u.toString();
  }

  function qrSVG(text) {
    try { const q = qrcode(0, 'M'); q.addData(text); q.make(); return q.createSvgTag({ cellSize: 4, margin: 2, scalable: true }); } catch { return ''; }
  }

  function lobbyHTML() {
    const s = view.s;
    const link = shareLink();
    const host = isHost();
    return `
      <div class="top"><span>Salle</span><span>${host ? 'Tu es l’hôte' : 'Joueur'}</span></div>
      <div class="pin">${esc(s.pin)}</div>
      <div class="card">
        <div class="qr">${qrSVG(link)}</div>
        <button id="share" class="small ghost" style="align-self:center">📤 Partager le lien d'invitation</button>
      </div>
      <div class="card">
        <h3>Joueurs</h3>
        <div class="players" id="players"></div>
      </div>
      <div class="card">
        <h3>🖼️ Tes photos pour la manche Galerie</h3>
        <p class="mute small">Choisis jusqu'à ${MAX_PHOTOS} photos de ta galerie : les autres devront deviner à qui elles appartiennent. Elles sont réduites sur ton téléphone (la position GPS est supprimée), envoyées seulement aux joueurs de cette salle, et disparaissent quand la partie se ferme.</p>
        <input id="file" type="file" accept="image/*" multiple hidden>
        <button id="pickPhotos">Choisir mes photos</button>
        <div class="thumbs" id="thumbs"></div>
      </div>
      ${host ? `
      <div class="card">
        <h3>Réglages</h3>
        <label>Nombre de manches
          <select id="rounds">${[5, 10, 15, 20].map((n) => `<option ${n === H.settings.count ? 'selected' : ''}>${n}</option>`).join('')}</select>
        </label>
        <div class="cats">${Object.entries(CATS).map(([k, v]) => `<label><input type="checkbox" data-cat="${k}" ${H.settings.cats[k] ? 'checked' : ''}>${v}</label>`).join('')}</div>
        <p class="mute small" id="catsNote"></p>
        <p class="mute small">Banque d'images : <span id="pools"></span></p>
        <button id="start" class="primary">Lancer la partie</button>
      </div>` : `<div class="wait">En attente du lancement par l'hôte…</div>`}
      <div id="lost"></div>`;
  }

  function header() {
    const s = view.s;
    return `<div class="top"><span>Manche ${s.step + 1}/${s.total}</span><span>${esc(CATS[s.cat] || '')}</span></div>
      <div class="bar"><i id="bar"></i></div><div id="lost"></div>`;
  }

  function writeHTML() {
    const p = myPlayer() || {};
    return `${header()}
      <p class="prompt">${esc(view.s.write.prompt)}</p>
      <p class="mute small">Réponds en secret. Les autres devront deviner que c'est toi… ou se faire piéger.</p>
      ${p.answered ? `<div class="wait">Réponse envoyée ✅<br><span class="mute small" id="count"></span></div>` : `
        <textarea id="writeText" maxlength="80" placeholder="Ta réponse (80 caractères max)"></textarea>
        <button id="sendWrite" class="primary">Envoyer</button>`}
      ${hostSkipBtn('Passer à la suite')}`;
  }

  function questionHTML() {
    const s = view.s, q = s.q, p = myPlayer() || {};
    let media = '';
    if (q.img) media = `<img class="photo" src="${esc(q.img)}" alt="Photo mystère" referrerpolicy="no-referrer" onerror="this.outerHTML='<div class=wait>Image indisponible 😕</div>'">`;
    if (q.mediaKey) media = view.media[q.mediaKey] ? `<img class="photo" src="${view.media[q.mediaKey]}" alt="Photo mystère">` : '<div class="wait">Chargement de la photo…</div>';
    if (q.emojis) media = `<div class="emojis">${esc(q.emojis)}</div>`;
    if (q.text) media = `<div class="quote">« ${esc(q.text)} »</div><p class="mute small">${esc(q.prompt)}</p>`;
    let input = '';
    if (!p.eligible && !p.answered) {
      input = `<div class="wait">${q.owner === view.myId ? (q.type === 'auteur' ? "C'est ta réponse ! Croise les doigts 😏" : "C'est ta photo ! Regarde-les chercher 😏") : 'Tu regardes cette manche.'}<br><span class="mute small" id="count"></span></div>`;
    } else if (p.answered) {
      input = `<div class="wait">Réponse envoyée ✅<br><span class="mute small" id="count"></span></div>`;
    } else if (q.type === 'annee') {
      input = `<div class="row"><input id="year" type="number" inputmode="numeric" min="1800" max="2026" placeholder="Ex. 1975"><button id="sendYear" class="primary" style="flex:0 0 auto;width:auto">Valider</button></div>`;
    } else {
      input = `<div class="choices">${q.choices.map((c, i) => `<button data-choice="${i}">${esc(c)}</button>`).join('')}</div>`;
    }
    return `${header()}
      <p class="prompt">${q.type === 'auteur' ? 'Qui a écrit ça ?' : esc(q.prompt)}</p>
      ${media}${input}${hostSkipBtn('Fin du chrono')}`;
  }

  function revealHTML() {
    const s = view.s, r = s.reveal;
    return `${header()}
      <p class="mute center">La bonne réponse</p>
      <div class="answer">${esc(r.answer)}</div>
      <p class="center">${esc(r.label || '')}</p>
      ${r.credit ? `<p class="credit">Photo : <a href="${esc(r.credit)}" target="_blank" rel="noopener">Wikimedia Commons (auteur et licence)</a></p>` : ''}
      <div class="results">${r.results.map((x) => `<div class="res"><span><b>${esc(x.name)}</b> · <span class="mute">${esc(x.shown)}</span></span><span class="pts ${x.pts ? '' : 'zero'}">+${x.pts}</span></div>`).join('')}</div>
      <div class="card"><h3>Classement</h3><div class="scores" id="scores"></div></div>
      ${isHost() ? '<button id="skip" class="primary">Suivant ▶</button>' : '<p class="mute center small">La suite arrive…</p>'}`;
  }

  function endHTML() {
    const ps = view.s.players.slice().sort((a, b) => b.score - a.score);
    const pod = (p, cls, medal) => p ? `<div class="${cls}"><span>${medal}</span>${esc(p.name)}<br>${p.score}</div>` : '';
    return `
      <div class="brand center" style="margin-top:4vh">Fin de partie !</div>
      <div class="podium">${pod(ps[1], 'p2', '🥈')}${pod(ps[0], 'p1', '🥇')}${pod(ps[2], 'p3', '🥉')}</div>
      <div class="card"><div class="scores" id="scores"></div></div>
      ${isHost() ? '<button id="again" class="primary">Rejouer avec les mêmes joueurs</button>' : '<p class="mute center">L\'hôte peut relancer une partie.</p>'}
      <button id="quit" class="ghost">Quitter</button>`;
  }

  function hostSkipBtn(label) { return isHost() ? `<button id="skip" class="small ghost" style="align-self:center">${label} ⏭</button>` : ''; }

  function updateDynamic() {
    const s = view.s;
    const lost = document.getElementById('lost');
    if (lost) lost.innerHTML = view.lost ? '<div class="banner">Connexion perdue avec l’hôte, reconnexion…</div>' : '';
    if (!s || view.screen !== 'game') return;
    const pl = document.getElementById('players');
    if (pl) pl.innerHTML = s.players.map((p) => `<span class="chip ${p.connected ? '' : 'off'}">${p.id === 'p0' ? '👑 ' : ''}${esc(p.name)}${p.id === view.myId ? ' (toi)' : ''}${p.photos ? `<span class="ph">📷${p.photos}</span>` : ''}</span>`).join('');
    const th = document.getElementById('thumbs');
    if (th) th.innerHTML = view.myPhotos.map((d) => `<img src="${d}" alt="">`).join('');
    const pb = document.getElementById('pickPhotos');
    if (pb) pb.textContent = view.myPhotos.length ? `Changer mes photos (${view.myPhotos.length})` : 'Choisir mes photos';
    const pools = document.getElementById('pools');
    if (pools) pools.textContent = s.pools;
    const st = document.getElementById('start');
    if (st) {
      const n = s.players.filter((p) => p.connected).length;
      st.disabled = n < 2;
      st.textContent = n < 2 ? 'En attente d’un 2e joueur…' : `Lancer la partie (${n} joueurs)`;
    }
    const cn = document.getElementById('catsNote');
    if (cn && H) {
      const missing = [];
      const n = connectedPlayers().length;
      if (H.settings.cats.galerie && (n < 3 || !connectedPlayers().some((p) => p.photos.length))) missing.push('Galerie : 3 joueurs et au moins une photo');
      if (H.settings.cats.auteur && n < 3) missing.push('Qui a écrit ça : 3 joueurs');
      cn.textContent = missing.length ? 'Pas encore disponible → ' + missing.join(' · ') : '';
    }
    const cnt = document.getElementById('count');
    if (cnt) {
      const el = s.players.filter((p) => p.eligible);
      cnt.textContent = `${el.filter((p) => p.answered).length}/${el.length} ont répondu`;
    }
    const sc = document.getElementById('scores');
    if (sc) sc.innerHTML = s.players.slice().sort((a, b) => b.score - a.score).map((p, i) => `<div class="score ${p.id === view.myId ? 'me' : ''}"><span>${i + 1}. ${esc(p.name)}</span><span>${p.score}</span></div>`).join('');
  }

  // Barre de temps
  (function tick() {
    const bar = document.getElementById('bar');
    if (bar && view.s) {
      const frac = Math.max(0, Math.min(1, (view.deadline - Date.now()) / (view.s.dur || 1)));
      bar.style.transform = `scaleX(${frac})`;
    }
    requestAnimationFrame(tick);
  })();

  function bind() {
    const on = (id, ev, fn) => { const el = document.getElementById(id); if (el) el.addEventListener(ev, fn); };
    const readName = () => {
      const n = (document.getElementById('name').value || '').trim().slice(0, 16);
      if (!n) { view.err = 'Choisis un pseudo.'; document.getElementById('err').textContent = view.err; return null; }
      me.name = n; store.set('tdt-name', n); return n;
    };
    on('create', 'click', () => { if (readName()) hostCreate(); });
    on('join', 'click', () => {
      if (!readName()) return;
      const pin = (document.getElementById('pin').value || '').replace(/\D/g, '');
      if (pin.length !== 4) { view.err = 'Le code fait 4 chiffres.'; document.getElementById('err').textContent = view.err; return; }
      joinRoom(pin);
    });
    on('pin', 'keydown', (e) => { if (e.key === 'Enter') document.getElementById('join').click(); });
    on('share', 'click', async () => {
      const link = shareLink();
      const text = `Rejoins ma partie de Tour de Table ! Code : ${view.s.pin}`;
      try {
        if (navigator.share) await navigator.share({ title: 'Tour de Table', text, url: link });
        else { await navigator.clipboard.writeText(text + ' ' + link); toast('Lien copié !'); }
      } catch { /* partage annulé */ }
    });
    on('pickPhotos', 'click', () => document.getElementById('file').click());
    on('file', 'change', async (e) => {
      const files = [...e.target.files].slice(0, MAX_PHOTOS);
      if (!files.length) return;
      toast('Préparation des photos…');
      const out = [];
      for (const f of files) { const d = await shrink(f).catch(() => null); if (d) out.push(d); }
      view.myPhotos = out;
      send({ t: 'photos', list: out });
      toast(out.length + ' photo' + (out.length > 1 ? 's' : '') + ' ajoutée' + (out.length > 1 ? 's' : ''));
      updateDynamic();
    });
    on('rounds', 'change', (e) => { H.settings.count = +e.target.value; });
    document.querySelectorAll('[data-cat]').forEach((el) => el.addEventListener('change', () => { H.settings.cats[el.dataset.cat] = el.checked; updateDynamic(); }));
    on('start', 'click', () => send({ t: 'start' }));
    on('skip', 'click', () => send({ t: 'skip' }));
    on('again', 'click', () => send({ t: 'again' }));
    on('quit', 'click', () => { location.href = location.pathname + (params.get('peerhost') ? `?peerhost=${params.get('peerhost')}&peerport=${params.get('peerport') || 9000}` : ''); });
    document.querySelectorAll('[data-choice]').forEach((b) => b.addEventListener('click', () => {
      b.classList.add('sel');
      document.querySelectorAll('[data-choice]').forEach((x) => { x.disabled = true; });
      send({ t: 'answer', v: +b.dataset.choice });
    }));
    const sendYear = () => {
      const v = parseInt(document.getElementById('year').value, 10);
      if (!Number.isFinite(v) || v < 1000 || v > 2100) return toast('Entre une année, ex. 1975');
      send({ t: 'answer', v });
    };
    on('sendYear', 'click', sendYear);
    on('year', 'keydown', (e) => { if (e.key === 'Enter') sendYear(); });
    on('sendWrite', 'click', () => {
      const t = document.getElementById('writeText').value.trim();
      if (!t) return toast('Écris quelque chose !');
      send({ t: 'write', text: t });
    });
  }

  // Réduit une photo (720 px max, JPEG) : la copie ne garde aucune métadonnée (GPS, appareil…)
  function shrink(file) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        const m = 720, r = Math.min(1, m / Math.max(img.naturalWidth, img.naturalHeight));
        const c = document.createElement('canvas');
        c.width = Math.round(img.naturalWidth * r); c.height = Math.round(img.naturalHeight * r);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        URL.revokeObjectURL(url);
        resolve(c.toDataURL('image/jpeg', 0.72));
      };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('image illisible')); };
      img.src = url;
    });
  }

  render();
  window.__tdt = { view, get H() { return H; } }; // utile pour les tests
})();
