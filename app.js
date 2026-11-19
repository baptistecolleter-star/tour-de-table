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
  // Chaque reprise de partie par un autre joueur ouvre une « génération » de salle : 1234, 1234-2, 1234-3…
  const peerId = (pin, gen) => PREFIX + pin + (gen > 1 ? '-' + gen : '');
  const MAX_GEN = 6;
  const PEER_OPTS = params.get('peerhost')
    ? { host: params.get('peerhost'), port: +(params.get('peerport') || 9000), path: '/', secure: false, debug: 1, config: { iceServers: [] } }
    : { debug: 1 };
  const MAX_PLAYERS = 12;
  const MAX_PHOTOS = 20; // photos tirées au hasard dans la sélection du joueur
  const Q = window.TDT_Q;
  const DUR = { susceptible: 20, plusmoins: 15, chiffre: 25, echelle: 25, galerie: 20, auteur: 20, write: 60, reveal: 11 };
  const CATS = {
    susceptible: '👉 Qui est le plus susceptible de…',
    echelle: '🔟 Sur une échelle de 1 à 10',
    plusmoins: '⚖️ Plus ou moins',
    chiffre: '🔢 Le juste chiffre',
    galerie: '🖼️ Galerie des joueurs',
    auteur: '✍️ Qui a écrit ça ?'
  };
  const fmt = (n) => Number(n).toLocaleString('fr-FR');
  const RULES = {
    susceptible: 'Vote pour la personne qui colle le mieux. Tu gagnes si tu votes comme la majorité.',
    echelle: 'Un joueur se note en secret, les autres devinent sa note. Plus tu es proche, plus tu marques.',
    plusmoins: 'Deux choix, une seule bonne réponse. Plus tu es rapide, plus tu marques.',
    chiffre: 'Donne ton estimation. Le plus proche gagne un bonus.',
    galerie: 'Une photo d’un joueur : devine à qui elle appartient.',
    auteur: 'Réponds en secret, puis devine qui a écrit chaque réponse. Piège les autres !'
  };
  const PACKS = window.TDT_PACKS;
  const CFG = window.TDT_CONFIG;
  const AMB = {
    decontracte: { nom: '😎 Décontractée', desc: 'Fun et léger, pour tout le monde' },
    serieux: { nom: '🕯️ Sérieuse', desc: 'Des questions qui font parler de soi' },
    coquin: { nom: '🔥 Coquine', desc: 'Osé et flirt, réservé aux adultes', pack: 'coquin', adulte: true },
    noel: { nom: '🎄 Noël en famille', desc: 'Cadeaux, bûche et repas de fête', pack: 'noel', occasion: true },
    anniv: { nom: '🎂 Anniversaire', desc: 'Pour fêter quelqu’un comme il se doit', pack: 'anniv', occasion: true },
    evjf: { nom: '💍 EVJF / EVG', desc: 'Enterrement de vie de jeune fille ou de garçon (18+)', pack: 'evjf', occasion: true, adulte: true },
    afterwork: { nom: '🍻 Afterwork', desc: 'Entre collègues, sans parler boulot (enfin presque)', pack: 'afterwork', occasion: true },
    etudiant: { nom: '🎓 Soirée étudiante', desc: 'Partiels, coloc et pâtes au beurre', pack: 'etudiant', occasion: true }
  };

  // --- Petits outils ------------------------------------------------------------
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const rnd = (n) => Math.floor(Math.random() * n);
  const shuffle = (a) => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = rnd(i + 1); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const pick = (a) => a[rnd(a.length)];
  const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
  const store = {
    get(k, d) { try { return localStorage.getItem(k) ?? d; } catch { return d; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch { /* navigation privée */ } }
  };
  // Packs débloqués par pub sur ce téléphone : { coquin: { jusqua: timestamp } }
  const packs = {
    all() { try { return JSON.parse(store.get('tdt-packs', '{}')) || {}; } catch { return {}; } },
    has(id) { const p = packs.all()[id]; return !!p && !!p.jusqua && p.jusqua > Date.now(); },
    unlock(id) {
      const all = packs.all();
      all[id] = { jusqua: Date.now() + CFG.dureePub * 3600e3 };
      store.set('tdt-packs', JSON.stringify(all));
    },
    label(id) {
      const p = packs.all()[id];
      if (!packs.has(id)) return '';
      return 'Débloqué jusqu’à ' + new Date(p.jusqua).toLocaleString('fr-FR', { weekday: 'short', hour: '2-digit', minute: '2-digit' });
    }
  };
  const perso = {
    get() { try { return Object.assign({ susceptible: [], echelle: [], auteur: [] }, JSON.parse(store.get('tdt-perso', '{}'))); } catch { return { susceptible: [], echelle: [], auteur: [] }; } },
    set(v) { store.set('tdt-perso', JSON.stringify(v)); }
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
    if (H) hostAction(H.hostId, msg);
    else if (client && client.conn && client.conn.open) client.conn.send(msg);
    else toast('Connexion perdue, reconnexion…');
  }

  // ============================================================================
  //  HÔTE
  // ============================================================================
  function hostCreate() {
    H = {
      peer: null, pin: '', gen: 1, hostId: 'p0', conns: new Map(), connObjs: new Map(), lastSnap: 0, aloneSince: 0,
      players: [{ id: 'p0', name: me.name, token: me.token, score: 0, connected: true, photos: view.myPhotos.slice() }],
      seq: 1, stats: {}, phase: 'lobby', settings: { count: 10, ambiance: 'decontracte', cats: { susceptible: true, echelle: true, plusmoins: true, chiffre: true, galerie: true, auteur: true } }, targets: {},
      plan: [], step: 0, qid: 0, q: null, answers: {}, endsAt: 0, timer: null, reveal: null,
      used: new Set(), auteur: null
    };
    view.myId = 'p0';
    view.screen = 'connecting';
    render();
    openHostPeer(0);
    hostStartLoops();
    track('salle-creee');
  }

  // Ouvre la salle. pinFixe : reprise d'une partie existante (pas de nouveau code).
  function openHostPeer(tries, pinFixe, onTaken) {
    if (!pinFixe) H.pin = String(1000 + rnd(9000));
    const peer = new Peer(peerId(H.pin, H.gen), PEER_OPTS);
    H.peer = peer;
    peer.on('open', () => { hostBroadcast(); });
    peer.on('connection', (conn) => hostConn(conn));
    peer.on('disconnected', () => { setTimeout(() => { if (!peer.destroyed) peer.reconnect(); }, 1500); });
    peer.on('error', (e) => {
      if (e.type === 'unavailable-id' && pinFixe) { peer.destroy(); if (onTaken) onTaken(); return; }
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
      if (!H || !msg || typeof msg !== 'object') return;
      if (msg.t === 'join') return hostJoin(conn, msg);
      const pid = H.conns.get(conn.connectionId);
      if (!pid) return;
      if (msg.t === 'hb') {
        const p = H.players.find((x) => x.id === pid);
        if (p) { p.lastSeen = Date.now(); if (typeof msg.rtt === 'number') p.rtt = Math.round(msg.rtt); }
        try { conn.send({ t: 'hb', ts: msg.ts }); } catch { /* fermée */ }
        return;
      }
      hostAction(pid, msg);
    });
    conn.on('close', () => {
      if (!H) return;
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
    p.connected = true; p.lastSeen = Date.now();
    H.conns.set(conn.connectionId, p.id);
    track('joueur-rejoint');
    if (H.q && H.q.mediaKey) conn.send({ t: 'media', key: H.q.mediaKey, data: H.q.mediaData });
    hostBroadcast(true);
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
    if (msg.t === 'joker' && H.phase !== 'end' && !p.joker && (p.jokers || 0) < 3) {
      p.joker = true; p.jokers = (p.jokers || 0) + 1;
      return hostBroadcast();
    }
    if (pid !== H.hostId) return; // les commandes ci-dessous sont réservées à l'hôte
    if (msg.t === 'start') return hostStart();
    if (msg.t === 'skip') return hostSkip();
    if (msg.t === 'again') {
      clearTimeout(H.timer);
      H.players = H.players.filter((x) => x.connected);
      H.players.forEach((x) => { x.score = 0; });
      Object.assign(H, { stats: {}, phase: 'lobby', plan: [], step: 0, q: null, reveal: null, answers: {}, auteur: null });
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
    if (c.plusmoins) a.push('plusmoins');
    if (c.chiffre) a.push('chiffre');
    if (c.echelle && cp.length >= 2) a.push('echelle');
    if (c.susceptible && cp.length >= 3) a.push('susceptible');
    if (c.galerie && cp.length >= 3 && withPhotos >= 1) a.push('galerie');
    if (c.auteur && cp.length >= 3) a.push('auteur');
    return a;
  }

  function hostStart() {
    if (connectedPlayers().length < 2) return toast('Il faut au moins 2 joueurs');
    const amb = AMB[H.settings.ambiance];
    if (amb && amb.pack && !packs.has(amb.pack)) return openUnlock(amb.pack);
    let cats = availableCats();
    if (!cats.length) cats = ['plusmoins'];
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
    H.players.forEach((p) => { p.score = 0; p.joker = false; p.jokers = 0; });
    H.stats = {};
    H.plan = plan; H.step = 0;
    track('partie-lancee');
    hostStep();
  }

  function hostStep() {
    const type = H.plan[H.step];
    if (type === 'auteur') {
      H.auteur = { prompt: poolFor('auteur'), texts: {}, queue: [] };
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

  // Banque de questions selon l'ambiance, plus les questions personnalisées
  function poolFor(type) {
    const amb = H.settings.ambiance;
    const base = amb === 'decontracte' ? (type === 'auteur' ? D.QUESTIONS_AUTEUR : Q[type]) : PACKS[amb][type];
    const mine = packs.has('perso') ? perso.get()[type].filter(Boolean) : [];
    const freeMine = mine.filter((x) => !H.used.has(type + '-' + x));
    const fromMine = freeMine.length && Math.random() < 0.5;
    const list = fromMine ? freeMine : base;
    const it = takeUnused(list, (x) => type + '-' + x) || pick(list);
    return it;
  }

  function makeQuestion(type) {
    const names = (ids) => ids.map((id) => H.players.find((p) => p.id === id).name);
    if (type === 'susceptible') {
      const it = poolFor('susceptible').replace(/^(qui est le plus susceptible de\s*)/i, '').replace(/\s*\?$/, '');
      const choices = shuffle(connectedPlayers().map((p) => p.id));
      return { type, prompt: 'Qui est le plus susceptible ' + (/^[aeéèêëiîïoôuûyh]/i.test(it) ? 'd’' : 'de ') + it + ' ?', choices, choiceNames: names(choices) };
    }
    if (type === 'echelle') {
      const it = poolFor('echelle');
      const cp = connectedPlayers();
      const min = Math.min(...cp.map((p) => H.targets[p.id] || 0));
      const target = pick(cp.filter((p) => (H.targets[p.id] || 0) === min));
      H.targets[target.id] = (H.targets[target.id] || 0) + 1;
      return { type, prompt: it, target: target.id, targetName: target.name, choices: ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10'] };
    }
    if (type === 'plusmoins') {
      const it = takeUnused(Q.plusmoins, (x) => 'pm-' + x.q + x.a + x.b) || pick(Q.plusmoins);
      const flip = Math.random() < 0.5;
      const choices = flip ? [it.b, it.a] : [it.a, it.b];
      const vals = flip ? [it.vb, it.va] : [it.va, it.vb];
      return { type, prompt: it.q, choices, answer: flip ? 1 - it.r : it.r, label: choices[0] + ' : ' + vals[0] + ' · ' + choices[1] + ' : ' + vals[1] };
    }
    if (type === 'chiffre') {
      const it = takeUnused(Q.chiffre, (x) => 'c-' + x.q) || pick(Q.chiffre);
      return { type, prompt: it.q, answer: it.v, unit: it.u || '', annee: !!it.y, label: it.d || '' };
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
        if (q.type === 'chiffre') {
          const v = +a.v;
          if (Number.isFinite(v)) {
            shown = fmt(v) + (q.unit ? ' ' + q.unit : '');
            pts = q.annee ? Math.max(0, Math.round(1000 - 40 * Math.abs(v - q.answer)))
              : v > 0 ? Math.max(0, Math.round(1000 * (1 - Math.abs(Math.log2(v / q.answer)) / 2))) : 0;
          }
        } else if (q.type === 'susceptible') {
          shown = '→ ' + (q.choiceNames[+a.v] ?? '—');
        } else if (q.type === 'echelle') {
          const v = +a.v + 1;
          shown = p.id === q.target ? 'sa note : ' + v : String(v);
        } else {
          const v = +a.v;
          shown = q.choiceNames ? (q.choiceNames[v] ?? '—') : (q.choices[v] ?? '—');
          if (v === q.answer) pts = speedPts(a); else fooled++;
        }
      } else if (q.type === 'auteur') fooled++;
      p.score += pts;
      results.push({ id: p.id, name: p.name, shown, pts });
    }
    let answerText = null, extraLabel = null;
    const st = (id) => (H.stats[id] = H.stats[id] || { elu: 0, previsible: 0, piege: 0, culture: 0, oeil: 0 });
    if (q.type === 'plusmoins' || q.type === 'chiffre') results.forEach((r) => { st(r.id).culture += r.pts; });
    if (q.type === 'galerie') results.forEach((r) => { if (r.pts) st(r.id).oeil++; });
    if (q.type === 'susceptible') {
      const tally = {};
      Object.values(H.answers).forEach((a) => { tally[+a.v] = (tally[+a.v] || 0) + 1; });
      const max = Math.max(0, ...Object.values(tally));
      const top = Object.keys(tally).filter((k) => tally[k] === max).map(Number);
      for (const r of results) {
        const a = H.answers[r.id];
        if (a && top.includes(+a.v)) { r.pts = 500; H.players.find((p) => p.id === r.id).score += 500; }
      }
      answerText = max ? top.map((i) => q.choiceNames[i]).join(' et ') : 'Personne n’a voté';
      if (max) top.forEach((i) => { const s2 = st(q.choices[i]); s2.elu++; s2.eluPrompt = q.prompt; });
      var tallyArr = Object.entries(tally).sort((x, y) => y[1] - x[1]).map(([i, n]) => ({ name: q.choiceNames[i], n }));
      extraLabel = Object.entries(tally).sort((x, y) => y[1] - x[1]).map(([i, n]) => q.choiceNames[i] + ' : ' + n + ' vote' + (n > 1 ? 's' : '')).join(' · ');
    }
    if (q.type === 'echelle') {
      const ta = H.answers[q.target];
      if (!ta) { answerText = '?'; extraLabel = q.targetName + ' n’a pas répondu à temps'; }
      else {
        const truth = +ta.v + 1;
        let good = 0;
        for (const r of results) {
          if (r.id === q.target) continue;
          const a = H.answers[r.id];
          if (!a) continue;
          const d = Math.abs(+a.v + 1 - truth);
          const pts = d === 0 ? 1000 : d === 1 ? 600 : d === 2 ? 300 : 0;
          if (d <= 1) good++;
          r.pts = pts; H.players.find((p) => p.id === r.id).score += pts;
        }
        const me = results.find((r) => r.id === q.target);
        st(q.target).previsible += good;
        if (me) { me.pts = 100 * good; H.players.find((p) => p.id === q.target).score += me.pts; }
        answerText = truth + ' / 10';
        extraLabel = q.targetName + ' : « ' + q.prompt + ' »';
      }
    }
    if (q.type === 'chiffre') {
      const best = results.filter((r) => H.answers[r.id]).sort((x, y) => Math.abs(H.answers[x.id].v - q.answer) - Math.abs(H.answers[y.id].v - q.answer))[0];
      if (best) { best.pts += 200; best.shown += ' 🎯'; H.players.find((p) => p.id === best.id).score += 200; }
    }
    if (q.type === 'auteur' && fooled) {
      const owner = H.players.find((p) => p.id === q.owner);
      if (owner) st(owner.id).piege += fooled;
      if (owner) { owner.score += 150 * fooled; results.push({ id: owner.id, name: owner.name, shown: 'auteur·rice, ' + fooled + ' piégé' + (fooled > 1 ? 's' : ''), pts: 150 * fooled }); }
    }
    // Joker ×2 (obtenu en regardant une pub) : double les points de la manche
    for (const r of results) {
      const pl = H.players.find((x) => x.id === r.id);
      if (!pl || !pl.joker) continue;
      if (r.pts > 0) { pl.score += r.pts; r.pts *= 2; r.shown += ' 🃏×2'; }
      pl.joker = false;
    }
    results.sort((a, b) => b.pts - a.pts);
    H.reveal = {
      tally: typeof tallyArr !== 'undefined' ? tallyArr : null, question: q.type === 'susceptible' ? q.prompt : null,
      answer: answerText ?? (q.type === 'chiffre' ? fmt(q.answer) + (q.unit ? ' ' + q.unit : '') : (q.choiceNames ? q.choiceNames[q.answer] : q.choices[q.answer])),
      title: q.type === 'susceptible' ? 'Élu(e) par le groupe' : q.type === 'echelle' ? 'La note de ' + q.targetName : 'La bonne réponse',
      label: extraLabel ?? q.label, credit: q.type === 'chiffre' || q.type === 'plusmoins' ? 'wikidata' : null, results
    };
    H.phase = 'reveal';
    hostTimer(DUR.reveal, hostNext);
    hostBroadcast();
  }

  function hostNext() {
    if (H.phase !== 'reveal' && H.phase !== 'pub') return;
    if (H.phase === 'reveal') {
      if (H.q && H.q.type === 'auteur' && H.auteur && H.auteur.queue.length) return hostNextAuteur();
      // Une pause pub toutes les N manches, placée au milieu de chaque bloc (10 manches → après la 5e)
      const done = H.step + 1, every = +CFG.pubToutesLesManches || 0;
      if (every && done % every === Math.ceil(every / 2) % every && done < H.plan.length) {
        H.phase = 'pub'; H.q = null; H.reveal = null; H.qid++; track('pause-pub');
        hostTimer(+CFG.pubDureeSecondes || 8, hostNext);
        return hostBroadcast();
      }
    }
    H.step++;
    if (H.step >= H.plan.length) return hostEnd();
    hostStep();
  }

  function hostEnd() {
    clearTimeout(H.timer);
    H.phase = 'end'; H.q = null; H.reveal = null; H.qid++;
    track('podium');
    hostBroadcast();
  }

  // Trophées de fin de partie (pour l'écran final et la carte à partager)
  function awards() {
    const out = [];
    const best = (k) => {
      let id = null, v = 0;
      for (const [pid, x] of Object.entries(H.stats || {})) if ((x[k] || 0) > v) { v = x[k]; id = pid; }
      const p = id && H.players.find((y) => y.id === id);
      return p ? { name: p.name, v, x: H.stats[id] } : null;
    };
    const e = best('elu');
    if (e) out.push({ e: '👉', t: e.x.eluPrompt ? e.x.eluPrompt.replace(/^Qui est /, '').replace(/ \?$/, '') : 'Élu par le groupe', n: e.name });
    const pv = best('previsible'); if (pv) out.push({ e: '🔮', t: 'Le livre ouvert : le plus facile à deviner', n: pv.name });
    const pg = best('piege'); if (pg) out.push({ e: '🕵️', t: 'Roi du bluff : a piégé ' + pg.v + ' fois', n: pg.name });
    const cu = best('culture'); if (cu) out.push({ e: '🧠', t: 'Le cerveau : champion des chiffres', n: cu.name });
    const oe = best('oeil'); if (oe) out.push({ e: '👀', t: 'Œil de lynx : reconnaît toutes les photos', n: oe.name });
    return out.slice(0, 4);
  }

  function publicState(forId) {
    const q = H.q;
    const pq = q && {
      type: q.type, prompt: q.prompt, mediaKey: q.mediaKey, text: q.text, unit: q.unit, annee: q.annee,
      choices: q.choiceNames || q.choices, owner: q.owner, target: q.target, targetName: q.targetName
    };
    return {
      phase: H.phase, pin: H.pin, qid: H.qid, step: H.step, total: H.plan.length,
      cat: H.plan[H.step] || null,
      remaining: Math.max(0, H.endsAt - Date.now()), dur: H.dur || 1,
      hostId: H.hostId, gen: H.gen,
      players: H.players.map((p) => ({
        id: p.id, name: p.name, score: p.score, connected: p.connected, photos: p.photos.length,
        joker: !!p.joker, jokers: p.jokers || 0,
        net: p.id === H.hostId ? 'hote' : !p.connected ? 'perdu' : (Date.now() - (p.lastSeen || 0) > 7000 || (p.rtt || 0) > 800) ? 'faible' : 'ok', rtt: p.rtt || null,
        answered: H.phase === 'write' ? !!(H.auteur && p.id in H.auteur.texts) : p.id in H.answers,
        eligible: H.phase === 'question' ? hostEligible(p.id) : H.phase === 'write' ? p.connected : false
      })),
      q: pq, reveal: H.reveal, write: H.phase === 'write' ? { prompt: H.auteur.prompt } : null,
      ambiance: H.settings.ambiance, awards: H.phase === 'end' ? awards() : null, you: forId
    };
  }

  function hostBroadcast(forceSnap) {
    if (!H) return;
    const sendSnap = forceSnap || Date.now() - H.lastSnap > 1500 || H.phase !== H.snapPhase || H.qid !== H.snapQid;
    const snap = sendSnap ? snapshot() : null;
    if (sendSnap) { H.lastSnap = Date.now(); H.snapPhase = H.phase; H.snapQid = H.qid; }
    hostEachConn((conn, pid) => { conn.send({ t: 'state', s: publicState(pid) }); if (snap) conn.send({ t: 'snap', d: snap }); });
    onState(publicState(H.hostId));
  }

  // Copie de la partie envoyée aux joueurs : si l'hôte décroche, l'un d'eux reprend
  // la partie là où elle en était (scores, manche en cours, questions déjà posées).
  function snapshot() {
    const q = H.q ? Object.assign({}, H.q, { mediaData: null }) : null;
    // JSON aller-retour : retire les valeurs « undefined » que l'envoi réseau refuse
    return JSON.parse(JSON.stringify({
      pin: H.pin, gen: H.gen, hostId: H.hostId, seq: H.seq, phase: H.phase, settings: H.settings, targets: H.targets,
      plan: H.plan, step: H.step, qid: H.qid, q, answers: H.answers, remaining: Math.max(0, H.endsAt - Date.now()), dur: H.dur,
      reveal: H.reveal, used: [...H.used], auteur: H.auteur, stats: H.stats,
      players: H.players.map((p) => ({ id: p.id, name: p.name, token: p.token, score: p.score, connected: p.connected, joker: !!p.joker, jokers: p.jokers || 0 }))
    }));
  }

  function hostStartLoops() {
    if (H.loops) return;
    H.loops = true;
    keepAwake();
    if (!window.__tdtUnload) {
      window.__tdtUnload = true;
      window.addEventListener('beforeunload', (e) => { if (H && H.players.length > 1) { e.preventDefault(); e.returnValue = ''; } });
    }
    const mine = H;
    // Qualité des connexions + détection d'un retour après une coupure de l'hôte
    const loop = setInterval(() => {
      if (H !== mine) return clearInterval(loop);
      if (H.players.length > 1) hostBroadcast(true);
      const open = [...H.connObjs.values()].some((c) => c.open);
      const others = H.players.some((p) => p.id !== H.hostId);
      if (others && !open) {
        H.aloneSince = H.aloneSince || Date.now();
        if (Date.now() - H.aloneSince > 9000) probeSuccessor();
      } else H.aloneSince = 0;
    }, 3000);
  }

  // L'hôte revient après une coupure : si un autre joueur a repris la partie, il la rejoint.
  function probeSuccessor() {
    if (!H || H.probing || !H.peer || H.peer.destroyed || H.peer.disconnected) return;
    H.probing = true;
    const mine = H;
    const c = H.peer.connect(peerId(H.pin, H.gen + 1), { reliable: true });
    const t = setTimeout(() => { try { c.close(); } catch { /* */ } mine.probing = false; }, 6000);
    c.on('open', () => {
      clearTimeout(t); c.close();
      if (H !== mine) return;
      const pin = H.pin, gen = H.gen + 1;
      clearTimeout(H.timer);
      try { H.peer.destroy(); } catch { /* */ }
      H = null;
      toast('Un autre joueur a repris la partie, tu la rejoins');
      joinRoom(pin, gen);
    });
    c.on('error', () => { clearTimeout(t); mine.probing = false; });
  }

  // Un joueur devient le nouvel hôte à partir de la dernière copie reçue.
  function takeOver(snap) {
    const mine = snap.players.find((p) => p.token === me.token);
    if (!mine) return false;
    const old = client; client = null;
    try { clearInterval(old.hb); old.peer.destroy(); } catch { /* */ }
    H = {
      peer: null, pin: snap.pin, gen: snap.gen + 1, hostId: mine.id, conns: new Map(), connObjs: new Map(), lastSnap: 0, aloneSince: 0,
      players: snap.players.map((p) => Object.assign({}, p, { connected: p.id === mine.id, photos: p.id === mine.id ? view.myPhotos.slice() : [], lastSeen: Date.now() })),
      seq: snap.seq, phase: snap.phase, settings: snap.settings, targets: snap.targets || {}, plan: snap.plan, step: snap.step, qid: snap.qid + 1,
      q: snap.q, answers: snap.answers || {}, endsAt: 0, dur: snap.dur, timer: null, reveal: snap.reveal, used: new Set(snap.used || []), auteur: snap.auteur, stats: snap.stats || {}
    };
    if (H.q && H.q.mediaKey) H.q.mediaData = view.media[H.q.mediaKey];
    view.myId = mine.id; view.lost = false;
    openHostPeer(0, true, () => { H = null; joinRoom(snap.pin, snap.gen + 1); });
    hostStartLoops();
    // Relance du chrono de la phase en cours, avec de la marge pour les reconnexions
    const left = Math.max(12000, snap.remaining || 0) / 1000;
    if (H.phase === 'question') hostTimer(left, hostEndQuestion);
    else if (H.phase === 'write') hostTimer(left, hostEndWrite);
    else if (H.phase === 'reveal' || H.phase === 'pub') hostTimer(6, hostNext);
    hostBroadcast();
    toast('L’hôte a décroché : tu reprends la partie 👑');
    track('reprise-hote');
    return true;
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
  function joinRoom(pin, gen) {
    if (!view.s) view.screen = 'connecting';
    view.err = ''; view.pin = pin; render();
    const prev = client;
    if (prev) { try { clearInterval(prev.hb); prev.peer.destroy(); } catch { /* */ } }
    const peer = new Peer(undefined, PEER_OPTS);
    const c = client = { peer, conn: null, pin, gen: gen || 1, retries: 0, joined: false, lastMsg: 0, snap: prev && prev.snap, lostSince: 0 };
    peer.on('open', () => connectToHost());
    peer.on('error', (e) => {
      if (client !== c) return;
      if (e.type === 'peer-unavailable') {
        if (c.joined || c.migrating) return hostLost();
        // Salle introuvable : elle a peut-être été reprise par un autre joueur (génération suivante)
        if (c.gen < MAX_GEN) { c.gen++; return connectToHost(); }
        view.screen = 'home'; view.err = 'Aucune salle ouverte avec le code ' + pin + '.'; client = null; clearInterval(c.hb); peer.destroy(); return render();
      }
      console.warn('peer error', e.type, e);
      if (!c.joined && view.screen === 'connecting') {
        view.screen = 'home'; view.err = 'Connexion impossible. Vérifie ton réseau et réessaie.'; client = null; clearInterval(c.hb); peer.destroy(); render();
      } else hostLost();
    });
    peer.on('disconnected', () => { setTimeout(() => { if (!peer.destroyed) peer.reconnect(); }, 1500); });
    c.hb = setInterval(() => heartbeat(c), 3000);
  }

  function connectToHost() {
    const c = client;
    if (!c || c.peer.destroyed) return;
    const conn = c.peer.connect(peerId(c.pin, c.gen), { reliable: true });
    c.conn = conn;
    const t = setTimeout(() => {
      if (conn.open || client !== c) return;
      try { conn.close(); } catch { /* */ }
      if (c.joined || c.migrating) hostLost();
      else { view.screen = 'home'; view.err = "La salle ne répond pas. Le téléphone de l'hôte est peut-être en veille."; client = null; clearInterval(c.hb); c.peer.destroy(); render(); }
    }, 12000);
    conn.on('open', () => {
      clearTimeout(t);
      c.joined = true; c.retries = 0; c.lostSince = 0; c.migrating = false; c.lastMsg = Date.now();
      view.lost = false; updateDynamic();
      conn.send({ t: 'join', name: me.name, token: me.token });
      if (view.myPhotos.length) conn.send({ t: 'photos', list: view.myPhotos });
    });
    conn.on('data', (msg) => {
      if (client !== c || c.conn !== conn) return;
      c.lastMsg = Date.now();
      if (msg.t === 'state') { c.gen = msg.s.gen || c.gen; onState(msg.s); }
      else if (msg.t === 'snap') c.snap = msg.d;
      else if (msg.t === 'hb') { c.rtt = Date.now() - msg.ts; if (view.pingWanted) { view.pingWanted = false; showPing(c.rtt); } }
      else if (msg.t === 'media') { view.media[msg.key] = msg.data; if (view.s) { view.key = ''; render(); } }
      else if (msg.t === 'error') { view.screen = 'home'; view.err = msg.msg; clearInterval(c.hb); c.peer.destroy(); client = null; render(); }
    });
    conn.on('close', () => { if (client === c && c.conn === conn) hostLost(); });
  }

  // Battement toutes les 3 s : mesure la latence et détecte un hôte muet
  function heartbeat(c) {
    if (client !== c) return clearInterval(c.hb);
    if (c.conn && c.conn.open) { try { c.conn.send({ t: 'hb', ts: Date.now(), rtt: c.rtt }); } catch { /* */ } }
    if (c.joined && c.lastMsg && Date.now() - c.lastMsg > 7000) hostLost();
  }

  // L'hôte ne répond plus : on retente, puis le premier joueur de la liste reprend la partie.
  function hostLost() {
    const c = client;
    if (!c || c.recovering) return;
    c.recovering = true;
    c.lostSince = c.lostSince || Date.now();
    view.lost = true; updateDynamic();
    setTimeout(() => {
      if (client !== c) return;
      c.recovering = false;
      const lostFor = Date.now() - c.lostSince;
      const snap = c.snap;
      if (snap && lostFor > 5000) {
        // Ordre de succession : joueurs connectés (hors ancien hôte), dans l'ordre d'arrivée
        const order = snap.players.filter((p) => p.connected && p.id !== snap.hostId).map((p) => p.token);
        const rank = order.indexOf(me.token);
        if (rank === 0 || (rank > 0 && lostFor > 5000 + rank * 6000)) { if (takeOver(snap)) return; }
        // Sinon on cherche la salle reprise par un autre joueur
        c.migrating = true;
        c.gen = snap.gen + 1;
      }
      if (lostFor > 90000) { view.screen = 'home'; view.err = 'La connexion avec la partie est perdue.'; client = null; clearInterval(c.hb); c.peer.destroy(); render(); return; }
      if (c.peer.disconnected && !c.peer.destroyed) c.peer.reconnect();
      connectToHost();
    }, 2500);
  }

  function showPing(rtt) {
    toast(`Connexion à l’hôte : ${rtt} ms ${rtt < 300 ? '✅ parfaite' : rtt < 800 ? '🟠 correcte' : '🔴 lente, rapproche-toi du Wi-Fi'}`);
  }

  // ============================================================================
  //  AFFICHAGE
  // ============================================================================
  function onState(s) {
    view.s = s; view.myId = s.you; view.screen = 'game';
    view.deadline = Date.now() + s.remaining;
    render();
    soundFor(s);
  }

  function myPlayer() { return view.s && view.s.players.find((p) => p.id === view.myId); }
  const isHost = () => !!H;

  function screenKey() {
    if (view.screen !== 'game') return view.screen + '|' + view.err;
    const s = view.s, p = myPlayer() || {};
    return [s.phase, s.qid, p.answered, p.eligible, s.q && s.q.mediaKey && !!view.media[s.q.mediaKey], s.ambiance, view.rev || 0].join('|');
  }

  function render() {
    const k = screenKey();
    if (k === view.key) return updateDynamic();
    view.key = k;
    if (view.screen === 'home') app.innerHTML = homeHTML();
    else if (view.screen === 'connecting') app.innerHTML = '<div class="spinner"></div><p class="center mute">Connexion à la salle…</p>';
    else {
      const ph = view.s.phase;
      app.innerHTML = (ph === 'lobby' ? lobbyHTML() : ph === 'write' ? writeHTML() : ph === 'question' ? questionHTML() : ph === 'reveal' ? revealHTML() : ph === 'pub' ? pubHTML() : endHTML());
      if (ph === 'pub') showInterstitial(view.s.qid);
    }
    bind();
    updateDynamic();
  }

  function homeHTML() {
    return `
      <div class="home-hero" aria-hidden="true">
        <div class="hcard"><b>Plus ou moins</b><span>Lequel est le plus haut ?</span><i>⚖️</i></div>
        <div class="hcard"><b>De 1 à 10</b><span>« J’adore le karaoké. »</span><i>🔟</i></div>
        <div class="hcard"><b>Qui est le plus susceptible…</b><span>… de rater son train ?</span><i>👉</i></div>
      </div>
      <h1 class="logo">Tour de Table</h1>
      <p class="tag">Le jeu de soirée où vos téléphones deviennent les cartes. Un code, et tout le monde joue.</p>
      <label>Ton pseudo<input id="name" maxlength="16" autocomplete="nickname" value="${esc(me.name)}" placeholder="Ex. Camille"></label>
      <button id="create" class="primary big">⚡ Créer une partie</button>
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
    const det = (id, title, body) => `<details class="card fold" data-fold="${id}" ${view.open && view.open[id] ? 'open' : ''}><summary><h3>${title}</h3></summary>${body}</details>`;
    const photos = `<p class="mute small">Ouvre ta galerie et sélectionne autant de photos que tu veux (un album entier, ou glisse le doigt pour en cocher plein d'un coup). Le jeu en tire ${MAX_PHOTOS} au hasard, tu refuses celles que tu ne veux pas montrer, puis tu valides. Rien n'est envoyé avant ta validation.</p>
        <p class="mute small">Les photos sont réduites sur ton téléphone (la position GPS est supprimée), envoyées seulement aux joueurs de cette salle, et disparaissent quand la partie se ferme.</p>
        <input id="file" type="file" accept="image/*" multiple hidden>
        <button id="pickPhotos">Choisir mes photos</button>
        <div class="thumbs" id="thumbs"></div>`;
    return `
      <div class="top"><span>Salle</span><span>${host ? 'Tu es l’hôte' : 'Joueur'}</span></div>
      <div class="pin" role="img" aria-label="Code de la salle : ${esc(s.pin)}">${[...String(s.pin)].map((d) => `<span>${esc(d)}</span>`).join('')}</div>
      <div class="card">
        <div class="qr">${qrSVG(link)}</div>
        <button id="share" class="small ghost" style="align-self:center">📤 Inviter (WhatsApp, SMS…)</button>
      </div>
      <div class="card">
        <h3>Joueurs</h3>
        <div class="players" id="players"></div>
        <div class="row" style="justify-content:space-between"><span class="mute small" style="flex:1">🟢 bonne · 🟠 faible · ⚪ déconnecté</span><button id="pingBtn" class="small ghost" style="flex:0 0 auto">📶 Tester</button></div>
      </div>
      ${host ? `
      <div class="card">
        <h3>Ambiance de la soirée</h3>
        <div class="amb" id="amb">${Object.entries(AMB).filter(([, a]) => !a.occasion).map(([k, a]) => `<button data-amb="${k}" class="${H.settings.ambiance === k ? 'sel' : ''}"><b>${a.nom}${a.pack && !packs.has(a.pack) ? ' 🔒' : ''}</b><span>${a.desc}</span></button>`).join('')}</div>
        <h3 style="margin-top:6px">Spécial occasion</h3>
        <div class="amb occ">${Object.entries(AMB).filter(([, a]) => a.occasion).map(([k, a]) => `<button data-amb="${k}" class="${H.settings.ambiance === k ? 'sel' : ''}"><b>${a.nom}${a.pack && !packs.has(a.pack) ? ' 🔒' : ''}</b></button>`).join('')}</div>
        <p class="mute small">🔒 = gratuit en regardant une pub (ouvert 24 h).</p>
      </div>
      <button id="start" class="primary big">⚡ Lancer la partie</button>
      <p class="mute small center">${H.settings.count} manches, toutes les catégories disponibles. Tout se règle ci-dessous.</p>
      ${det('photos', '🖼️ Mes photos (facultatif)', photos)}
      ${det('packs', '🎁 Packs gratuits avec pub', Object.entries(CFG.packs).map(([id, pk]) => `
          <div class="pack">
            <div><b>${pk.nom}</b><p class="mute small">${pk.desc}</p></div>
            <div class="packact">${packs.has(id) ? `<span class="ok small">✓ ${packs.label(id)}</span>${id === 'perso' ? '<button class="small" id="editPerso">Mes questions</button>' : ''}` : `<button class="small primary" data-unlock="${id}">📺 Débloquer</button>`}</div>
          </div>`).join(''))}
      ${det('reglages', '⚙️ Réglages', `
        <label>Nombre de manches
          <select id="rounds">${[5, 10, 15, 20].map((n) => `<option ${n === H.settings.count ? 'selected' : ''}>${n}</option>`).join('')}</select>
        </label>
        <div class="cats">${Object.entries(CATS).map(([k, v]) => `<label><input type="checkbox" data-cat="${k}" ${H.settings.cats[k] ? 'checked' : ''}>${v}</label>`).join('')}</div>`)}
      <p class="mute small" id="catsNote"></p>` : `
      <div class="wait">Ambiance : <b>${esc(AMB[s.ambiance]?.nom || '')}</b><br>En attente du lancement par l'hôte…</div>
      ${det('photos', '🖼️ Mes photos (facultatif)', photos)}`}
      ${AMB[s.ambiance] && AMB[s.ambiance].adulte ? '<div class="banner">🔞 Cette partie contient des questions coquines réservées aux adultes. Chacun peut passer une question qui le met mal à l’aise.</div>' : ''}
      <div id="lost"></div>`;
  }

  function header() {
    const s = view.s;
    return `<div class="top"><span>Manche ${s.step + 1}/${s.total}</span><span>${esc(CATS[s.cat] || '')}</span></div>
      <div class="bar"><i id="bar"></i></div>${s.phase !== 'reveal' && RULES[s.cat] ? `<p class="rule">${RULES[s.cat]}</p>` : ''}<div id="lost"></div>`;
  }

  function writeHTML() {
    const p = myPlayer() || {};
    return `${header()}
      <div class="qcard"><p class="prompt">${esc(view.s.write.prompt)}</p>
      <p class="mute small">Réponds en secret. Les autres devront deviner que c'est toi… ou se faire piéger.</p></div>
      ${p.answered ? `<div class="wait">Réponse envoyée ✅<br><span class="mute small" id="count"></span></div>` : `
        <textarea id="writeText" maxlength="80" placeholder="Ta réponse (80 caractères max)"></textarea>
        <button id="sendWrite" class="primary">Envoyer</button>`}
      ${hostSkipBtn('Passer à la suite')}`;
  }

  function questionHTML() {
    const s = view.s, q = s.q, p = myPlayer() || {};
    let media = '';
    let prompt = esc(q.prompt);
    if (q.mediaKey) media = view.media[q.mediaKey] ? `<img class="photo" src="${view.media[q.mediaKey]}" alt="Photo mystère">` : '<div class="wait">Chargement de la photo…</div>';
    if (q.text) { media = `<div class="quote">« ${esc(q.text)} »</div><p class="mute small">${esc(q.prompt)}</p>`; prompt = 'Qui a écrit ça ?'; }
    if (q.type === 'echelle') {
      const mine = q.target === view.myId;
      prompt = mine ? 'Note-toi de 1 à 10 (en secret)' : `Quelle note va se donner ${esc(q.targetName)} ?`;
      media = `<div class="quote">${esc(q.prompt)}</div><p class="mute small">1 = pas du tout d'accord · 10 = complètement</p>`;
    }
    let input = '';
    if (!p.eligible && !p.answered) {
      input = `<div class="wait">${q.owner === view.myId ? (q.type === 'auteur' ? "C'est ta réponse ! Croise les doigts 😏" : "C'est ta photo ! Regarde-les chercher 😏") : 'Tu regardes cette manche.'}<br><span class="mute small" id="count"></span></div>`;
    } else if (p.answered) {
      input = `<div class="wait">Réponse envoyée ✅<br><span class="mute small" id="count"></span></div>`;
    } else if (q.type === 'chiffre') {
      input = `<div class="row"><input id="num" type="text" inputmode="decimal" autocomplete="off" placeholder="${q.annee ? 'Ex. 1975' : 'Ton estimation'}"><button id="sendNum" class="primary" style="flex:0 0 auto;width:auto">Valider</button></div>${q.unit ? `<p class="mute small center">En ${esc(q.unit)}</p>` : ''}`;
    } else {
      const cls = q.type === 'echelle' ? 'choices scale' : q.type === 'plusmoins' ? 'choices duo' : 'choices';
      input = `<div class="${cls}">${q.choices.map((c, i) => `<button data-choice="${i}">${esc(c)}</button>`).join('')}</div>`;
    }
    return `${header()}
      <div class="qcard"><p class="prompt">${prompt}</p>${media}</div>
      ${input}${hostSkipBtn('Fin du chrono')}`;
  }

  function revealHTML() {
    const s = view.s, r = s.reveal, me = myPlayer() || {};
    const maxN = r.tally ? Math.max(1, ...r.tally.map((t) => t.n)) : 1;
    const jokerBtn = s.phase === 'reveal' && !me.joker && (me.jokers || 0) < 3 && s.step + 1 < s.total
      ? `<button id="jokerBtn" class="joker">🃏 Joker ×2 pour la prochaine manche <small>📺 pub · ${3 - (me.jokers || 0)} restant${3 - (me.jokers || 0) > 1 ? 's' : ''}</small></button>`
      : me.joker ? '<p class="center ok small">🃏 Ton joker ×2 est prêt pour la prochaine manche</p>' : '';
    return `${header()}
      ${r.question ? `<p class="center mute small">${esc(r.question)}</p>` : ''}
      ${r.tally ? `<div class="tally">${r.tally.map((t, i) => `<div class="trow pop" style="animation-delay:${0.3 + i * 0.45}s"><span>${esc(t.name)}</span><div class="tbar"><i style="width:${Math.round((t.n / maxN) * 100)}%;animation-delay:${0.3 + i * 0.45}s"></i></div><b>${t.n}</b></div>`).join('')}</div>` : ''}
      <p class="mute center">${esc(r.title || 'La bonne réponse')}</p>
      <div class="answer suspense" style="animation-delay:${r.tally ? 0.6 + r.tally.length * 0.45 : 1.4}s">${esc(r.answer)}</div>
      <p class="center pop" style="animation-delay:${r.tally ? 0.8 + r.tally.length * 0.45 : 1.6}s">${esc(r.label || '')}</p>
      ${r.credit ? '<p class="credit">Source des chiffres : <a href="https://www.wikidata.org" target="_blank" rel="noopener">Wikidata</a></p>' : ''}
      <div class="results">${r.results.map((x, i) => `<div class="res pop ${x.id === view.myId ? 'mine' : ''}" style="animation-delay:${1.8 + i * 0.15}s"><span><b>${esc(x.name)}</b> · <span class="mute">${esc(x.shown)}</span></span><span class="pts ${x.pts ? '' : 'zero'}">+${x.pts}</span></div>`).join('')}</div>
      ${jokerBtn}
      <div class="card"><h3>Classement</h3><div class="scores" id="scores"></div></div>
      ${isHost() ? '<button id="skip" class="primary">Suivant ▶</button>' : '<p class="mute center small">La suite arrive…</p>'}`;
  }

  function pubHTML() {
    return `<div class="pubpause">
      <p class="top" style="justify-content:center">Petite pause pub</p>
      <div class="adbox big"><b>Espace publicitaire</b><span>${ads.real() ? 'Chargement de la publicité…' : '(démonstration : une vraie régie afficherait une pub ici)'}</span></div>
      <div class="bar"><i id="bar"></i></div>
      <p class="mute center small">La partie reprend toute seule dans quelques secondes. Merci de soutenir le jeu ❤️</p>
    </div>`;
  }

  function endHTML() {
    const ps = view.s.players.slice().sort((a, b) => b.score - a.score);
    const pod = (p, cls, medal) => p ? `<div class="${cls}"><span>${medal}</span>${esc(p.name)}<br>${p.score}</div>` : '';
    const aw = view.s.awards || [];
    return `
      <div class="brand center" style="margin-top:4vh">Fin de partie !</div>
      <div class="podium">${pod(ps[1], 'p2', '🥈')}${pod(ps[0], 'p1', '🥇')}${pod(ps[2], 'p3', '🥉')}</div>
      ${aw.length ? `<div class="card"><h3>Les trophées de la soirée</h3>${aw.map((a) => `<div class="award"><span>${a.e}</span><div><b>${esc(a.n)}</b><p class="mute small">${esc(a.t)}</p></div></div>`).join('')}</div>` : ''}
      <button id="shareCard" class="primary">📸 Partager le podium (story, WhatsApp…)</button>
      <div class="card"><div class="scores" id="scores"></div></div>
      ${isHost() ? '<button id="again" class="primary">🔁 Rejouer avec les mêmes joueurs</button>' : '<p class="mute center small">L’hôte peut relancer une partie avec le même groupe.</p><button id="newGame">🎲 Créer ma propre partie</button>'}
      <button id="quit" class="ghost">Quitter</button>`;
  }

  // Carte de fin au format story (1080 × 1920) : podium, trophées, lien du jeu
  function drawCard() {
    const s = view.s, W = 1080, Hh = 1920;
    const c = document.createElement('canvas'); c.width = W; c.height = Hh;
    const g = c.getContext('2d');
    const bg = g.createLinearGradient(0, 0, W, Hh); bg.addColorStop(0, '#1a7356'); bg.addColorStop(0.6, '#0f5c46'); bg.addColorStop(1, '#08392b');
    g.fillStyle = bg; g.fillRect(0, 0, W, Hh);
    const font = (w, px) => w >= 800 ? `${px}px "Bowlby One", "Arial Black", sans-serif` : `${w} ${px}px "Instrument Sans", system-ui, sans-serif`;
    const text = (t, x, y, f, col, align = 'center', maxW = W - 120) => { g.font = f; g.fillStyle = col; g.textAlign = align; g.fillText(t, x, y, maxW); };
    g.font = font(900, 92);
    const w1 = g.measureText('Tour de ').width, w2 = g.measureText('Table').width, xs = (W - w1 - w2) / 2;
    text('Tour de ', xs, 190, font(900, 92), '#f4efe2', 'left');
    text('Table', xs + w1, 190, font(900, 92), '#f4efe2', 'left');
    text('Notre soirée du ' + new Date().toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' }), W / 2, 260, font(600, 40), '#a9cdbd');
    const ps = s.players.slice().sort((a, b) => b.score - a.score);
    const cols = [[ps[1], 360, '#47b8ff', '🥈'], [ps[0], 480, '#ffc22e', '🥇'], [ps[2], 290, '#b79bff', '🥉']];
    const base = 900, bw = 290, gap = 30, x0 = (W - (3 * bw + 2 * gap)) / 2;
    cols.forEach(([p, h, col, medal], i) => {
      if (!p) return;
      const x = x0 + i * (bw + gap);
      g.fillStyle = col; g.beginPath(); g.roundRect ? g.roundRect(x, base - h, bw, h, [28, 28, 0, 0]) : g.rect(x, base - h, bw, h); g.fill();
      g.lineWidth = 6; g.strokeStyle = '#1e1b16'; g.stroke();
      const dark = true;
      text(medal, x + bw / 2, base - h + 90, font(400, 72), '#fff');
      text(p.name, x + bw / 2, base - h + 170, font(800, 46), '#1e1b16', 'center', bw - 30);
      text(fmt(p.score) + ' pts', x + bw / 2, base - h + 230, font(700, 38), '#1e1b16', 'center', bw - 30);
    });
    let y = 990;
    (s.awards || []).slice(0, 4).forEach((a) => {
      g.fillStyle = '#fff5e3'; g.beginPath(); g.roundRect ? g.roundRect(80, y, W - 160, 130, 26) : g.rect(80, y, W - 160, 130); g.fill();
      g.lineWidth = 5; g.strokeStyle = '#1e1b16'; g.stroke();
      text(a.e, 150, y + 88, font(400, 60), '#1e1b16');
      text(a.n, 220, y + 58, font(800, 40), '#1e1b16', 'left', W - 340);
      text(a.t, 220, y + 105, font(600, 32), '#6a5f4d', 'left', W - 340);
      y += 150;
    });
    text('Joue gratuitement, sans appli :', W / 2, 1790, font(600, 36), '#a9cdbd');
    text(location.host + location.pathname.replace(/index\.html$/, ''), W / 2, 1845, font(800, 36), '#ffc22e');
    return c;
  }

  async function shareCard() {
    try { await document.fonts.load('40px "Bowlby One"'); } catch { /* */ }
    const c = drawCard();
    const blob = await new Promise((r) => c.toBlob(r, 'image/png'));
    const file = new File([blob], 'tour-de-table-podium.png', { type: 'image/png' });
    const url = location.origin + location.pathname;
    try {
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title: 'Tour de Table', text: '🎲 Notre soirée Tour de Table ! Joue gratuitement sans appli : ' + url });
        track('carte-partagee');
        return;
      }
    } catch { return; }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = 'tour-de-table-podium.png';
    document.body.appendChild(a); a.click(); a.remove();
    toast('Image du podium téléchargée');
    track('carte-telechargee');
  }

  function hostSkipBtn(label) { return isHost() ? `<button id="skip" class="small ghost" style="align-self:center">${label} ⏭</button>` : ''; }

  function updateDynamic() {
    const s = view.s;
    const lost = document.getElementById('lost');
    if (lost) lost.innerHTML = view.lost ? '<div class="banner">Connexion perdue avec l’hôte, reconnexion… Si l’hôte ne revient pas, un autre joueur reprend la partie automatiquement.</div>' : '';
    if (!s || view.screen !== 'game') return;
    const pl = document.getElementById('players');
    const TOK = ['#ffc22e', '#47b8ff', '#ff5b3d', '#b79bff', '#63e0a5', '#ff8fc7', '#f2f2f2', '#ffa64d'];
    if (pl) pl.innerHTML = s.players.map((p, i) => `<span class="chip ${p.connected ? '' : 'off'}" style="--c:${TOK[i % TOK.length]}"><span class="tok">${esc((p.name || '?').charAt(0).toUpperCase())}</span><i class="dot ${p.net || ''}"></i>${p.id === s.hostId ? '👑 ' : ''}${esc(p.name)}${p.joker ? ' 🃏' : ''}${p.id === view.myId ? ' (toi)' : ''}${p.photos ? `<span class="ph">📷${p.photos}</span>` : ''}</span>`).join('');
    const th = document.getElementById('thumbs');
    if (th) th.innerHTML = view.myPhotos.map((d) => `<img src="${d}" alt="">`).join('');
    const pb = document.getElementById('pickPhotos');
    if (pb) pb.textContent = view.myPhotos.length ? `✓ ${view.myPhotos.length} photos validées · modifier` : 'Ouvrir ma galerie';
    const st = document.getElementById('start');
    if (st) {
      const n = s.players.filter((p) => p.connected).length;
      st.disabled = n < 2;
      st.textContent = n < 2 ? 'En attente d’un 2e joueur…' : `⚡ Lancer la partie (${n} joueurs)`;
    }
    const cn = document.getElementById('catsNote');
    if (cn && H) {
      const missing = [];
      const n = connectedPlayers().length;
      if (H.settings.cats.galerie && (n < 3 || !connectedPlayers().some((p) => p.photos.length))) missing.push('Galerie : 3 joueurs et au moins une photo');
      if (H.settings.cats.auteur && n < 3) missing.push('Qui a écrit ça : 3 joueurs');
      if (H.settings.cats.susceptible && n < 3) missing.push('Plus susceptible : 3 joueurs');
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

  // --- Sons (générés, sans fichier) et vibrations -------------------------------
  const sfx = {
    ctx: null,
    on: store.get('tdt-son', '1') === '1',
    unlock() { try { if (!sfx.ctx) sfx.ctx = new (window.AudioContext || window.webkitAudioContext)(); if (sfx.ctx.state === 'suspended') sfx.ctx.resume(); } catch { /* pas d'audio */ } },
    note(freq, start, dur, type = 'sine', vol = 0.18) {
      if (!sfx.on || !sfx.ctx) return;
      const t0 = sfx.ctx.currentTime + start, o = sfx.ctx.createOscillator(), gn = sfx.ctx.createGain();
      o.type = type; o.frequency.value = freq;
      gn.gain.setValueAtTime(0.0001, t0); gn.gain.exponentialRampToValueAtTime(vol, t0 + 0.02); gn.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      o.connect(gn).connect(sfx.ctx.destination); o.start(t0); o.stop(t0 + dur + 0.05);
    },
    tick() { sfx.note(880, 0, 0.08, 'square', 0.06); },
    good() { sfx.note(660, 0, 0.15); sfx.note(990, 0.12, 0.3); buzz([40, 40, 80]); },
    bad() { sfx.note(220, 0, 0.25, 'sawtooth', 0.08); sfx.note(180, 0.18, 0.3, 'sawtooth', 0.08); buzz(200); },
    drum() { for (let i = 0; i < 10; i++) sfx.note(140 + (i % 2) * 20, i * 0.11, 0.09, 'triangle', 0.12); },
    fanfare() { [523, 659, 784, 1047].forEach((f, i) => sfx.note(f, i * 0.16, i === 3 ? 0.6 : 0.2, 'triangle', 0.2)); buzz([80, 60, 80, 60, 200]); }
  };
  function buzz(p) { try { if (sfx.on && navigator.vibrate) navigator.vibrate(p); } catch { /* */ } }
  document.addEventListener('pointerdown', sfx.unlock, { passive: true });
  const muteBtn = document.createElement('button');
  muteBtn.className = 'mute-btn'; muteBtn.setAttribute('aria-label', 'Son');
  const setMute = () => { muteBtn.textContent = sfx.on ? '🔊' : '🔇'; };
  muteBtn.onclick = () => { sfx.on = !sfx.on; store.set('tdt-son', sfx.on ? '1' : '0'); setMute(); sfx.unlock(); };
  setMute(); document.body.appendChild(muteBtn);

  // Réactions sonores à chaque nouvel écran
  let lastSoundKey = '';
  function soundFor(s) {
    const k = s.phase + '|' + s.qid;
    if (k === lastSoundKey) return;
    lastSoundKey = k;
    if (s.phase === 'reveal') {
      sfx.drum();
      const mine = s.reveal && s.reveal.results.find((x) => x.id === view.myId);
      setTimeout(() => { if (view.s && view.s.phase === 'reveal') (mine && mine.pts > 0 ? sfx.good() : mine ? sfx.bad() : null); }, 1300);
    } else if (s.phase === 'end') sfx.fanfare();
  }

  // Barre de temps + tic-tac des 5 dernières secondes
  let lastTickSec = -1;
  (function tick() {
    const bar = document.getElementById('bar');
    if (bar && view.s) {
      const left = view.deadline - Date.now();
      const frac = Math.max(0, Math.min(1, left / (view.s.dur || 1)));
      bar.style.transform = `scaleX(${frac})`;
      const sec = Math.ceil(left / 1000);
      if ((view.s.phase === 'question' || view.s.phase === 'write') && sec <= 5 && sec > 0 && sec !== lastTickSec) { lastTickSec = sec; sfx.tick(); }
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
      const text = `🎲 Rejoins ma partie de Tour de Table ! Code ${view.s.pin} · rien à installer, ça s'ouvre dans le navigateur :`;
      try {
        if (navigator.share) await navigator.share({ title: 'Tour de Table', text, url: link });
        else { await navigator.clipboard.writeText(text + ' ' + link); toast('Lien copié !'); }
      } catch { /* partage annulé */ }
    });
    on('pickPhotos', 'click', () => {
      if (view.photoSel && view.photoSel.length) return openPhotoReview();
      document.getElementById('file').click();
    });
    on('file', 'change', async (e) => {
      const files = [...e.target.files].filter((f) => !f.type || f.type.startsWith('image/'));
      e.target.value = '';
      if (!files.length) return;
      await drawPhotos(files);
    });
    on('rounds', 'change', (e) => { H.settings.count = +e.target.value; refreshLobby(); });
    document.querySelectorAll('[data-fold]').forEach((d) => d.addEventListener('toggle', () => { view.open = view.open || {}; view.open[d.dataset.fold] = d.open; }));
    document.querySelectorAll('[data-cat]').forEach((el) => el.addEventListener('change', () => { H.settings.cats[el.dataset.cat] = el.checked; updateDynamic(); }));
    document.querySelectorAll('[data-amb]').forEach((b) => b.addEventListener('click', () => {
      const k = b.dataset.amb, a = AMB[k];
      if (a.pack && !packs.has(a.pack)) return openUnlock(a.pack);
      if (a.adulte && !confirmAdult(k)) return;
      H.settings.ambiance = k; hostBroadcast(); view.key = ''; render();
    }));
    document.querySelectorAll('[data-unlock]').forEach((b) => b.addEventListener('click', () => openUnlock(b.dataset.unlock)));
    on('editPerso', 'click', openPerso);
    on('pingBtn', 'click', () => {
      if (H) {
        const others = H.players.filter((p) => p.id !== H.hostId);
        const weak = others.filter((p) => p.connected && ((p.rtt || 0) > 800 || Date.now() - (p.lastSeen || 0) > 7000));
        const off = others.filter((p) => !p.connected);
        return toast(others.length ? `Tu es l’hôte · ${others.length - off.length} connecté(s)${weak.length ? ' · faible : ' + weak.map((p) => p.name).join(', ') : ' · tout est bon ✅'}${off.length ? ' · déconnecté : ' + off.map((p) => p.name).join(', ') : ''}` : 'Tu es l’hôte : invite des joueurs !');
      }
      if (client && client.conn && client.conn.open) { view.pingWanted = true; client.conn.send({ t: 'hb', ts: Date.now(), rtt: client.rtt }); }
      else toast('Pas connecté à l’hôte pour le moment');
    });
    on('start', 'click', () => send({ t: 'start' }));
    on('skip', 'click', () => send({ t: 'skip' }));
    on('again', 'click', () => send({ t: 'again' }));
    on('shareCard', 'click', shareCard);
    on('jokerBtn', 'click', () => {
      const done = () => { closeModal(); send({ t: 'joker' }); const jb = document.getElementById('jokerBtn'); if (jb) jb.outerHTML = '<p class="center ok small">🃏 Ton joker ×2 est prêt pour la prochaine manche</p>'; toast('🃏 Joker ×2 activé pour la prochaine manche'); track('joker-pub'); };
      if (ads.real()) ads.rewarded(done, () => toast('Pub indisponible pour le moment'));
      else playDemoAd(done, 'Récupérer mon joker');
    });
    on('newGame', 'click', () => { location.href = location.pathname + (params.get('peerhost') ? `?peerhost=${params.get('peerhost')}&peerport=${params.get('peerport') || 9000}` : ''); });
    on('quit', 'click', () => { location.href = location.pathname + (params.get('peerhost') ? `?peerhost=${params.get('peerhost')}&peerport=${params.get('peerport') || 9000}` : ''); });
    document.querySelectorAll('[data-choice]').forEach((b) => b.addEventListener('click', () => {
      b.classList.add('sel');
      document.querySelectorAll('[data-choice]').forEach((x) => { x.disabled = true; });
      send({ t: 'answer', v: +b.dataset.choice });
    }));
    const sendNum = () => {
      const raw = (document.getElementById('num').value || '').replace(/[\s\u00a0\u202f]/g, '').replace(',', '.');
      const v = parseFloat(raw);
      if (!Number.isFinite(v) || v < 0) return toast('Entre un nombre');
      send({ t: 'answer', v });
    };
    on('sendNum', 'click', sendNum);
    on('num', 'keydown', (e) => { if (e.key === 'Enter') sendNum(); });
    on('sendWrite', 'click', () => {
      const t = document.getElementById('writeText').value.trim();
      if (!t) return toast('Écris quelque chose !');
      send({ t: 'write', text: t });
    });
  }

  // --- Compteur anonyme (GoatCounter, sans cookie) : inactif tant que non configuré ---
  function track(evt) {
    const code = CFG && CFG.goatcounter;
    if (!code) return;
    try { new Image().src = `https://${code}.goatcounter.com/count?p=${encodeURIComponent('/evenement/' + evt)}&t=${encodeURIComponent(evt)}&e=true&rnd=${Math.random().toString(36).slice(2)}`; } catch { /* */ }
  }

  // --- Fenêtres : déblocage des packs et questions personnalisées -----------------
  function modal(html) {
    closeModal();
    const m = document.createElement('div');
    m.className = 'modal'; m.id = 'modal';
    m.innerHTML = `<div class="sheet">${html}</div>`;
    m.addEventListener('click', (e) => { if (e.target === m) closeModal(); });
    document.body.appendChild(m);
    return m;
  }
  function closeModal() { const m = document.getElementById('modal'); if (m) m.remove(); }
  function refreshLobby() { view.rev = (view.rev || 0) + 1; view.key = ''; render(); }
  let adult = false;
  function confirmAdult(k) {
    if (adult) return true;
    const m = modal(`<h3>🔞 Réservé aux adultes</h3><p>Cette ambiance propose des questions osées. Tous les joueurs doivent avoir 18 ans ou plus et être d’accord pour y jouer.</p>
      <button class="primary" id="adultYes">Tous les joueurs ont 18 ans ou plus</button><button class="ghost" id="adultNo">Annuler</button>`);
    m.querySelector('#adultYes').onclick = () => { adult = true; closeModal(); H.settings.ambiance = k || 'coquin'; hostBroadcast(); refreshLobby(); };
    m.querySelector('#adultNo').onclick = closeModal;
    return false;
  }
  function openUnlock(id) {
    const pk = CFG.packs[id];
    const m = modal(`<h3>${pk.nom}</h3><p>${pk.desc}</p>
      <button class="primary" id="ad">📺 Regarder une pub pour débloquer (${CFG.dureePub} h)</button>
      ${ads.real() ? '' : '<p class="mute small">Mode démo : fausse publicité, aucun revenu.</p>'}
      <button class="ghost" id="cancel">Plus tard</button>`);
    m.querySelector('#cancel').onclick = closeModal;
    m.querySelector('#ad').onclick = () => {
      const done = () => { track('pub-recompensee'); packs.unlock(id); closeModal(); toast(pk.nom + ' débloqué pour ' + CFG.dureePub + ' h'); refreshLobby(); };
      if (ads.real()) { closeModal(); ads.rewarded(done, () => toast('Pub indisponible pour le moment, réessaie plus tard')); }
      else playDemoAd(done);
    };
  }
  function playDemoAd(onReward, label) {
    let left = CFG.pubDemoSecondes;
    const m = modal(`<h3>Publicité</h3><div class="adbox"><b>Espace publicitaire</b><span>(démonstration : une vraie régie afficherait une vidéo ici)</span></div>
      <p class="center" id="adLeft"></p><button class="primary" id="adDone" disabled>${label || 'Récupérer mon pack'}</button>`);
    const tick = () => {
      const el = m.querySelector('#adLeft'); if (!el) return clearInterval(t);
      el.textContent = left > 0 ? `Encore ${left} s…` : 'Merci !';
      m.querySelector('#adDone').disabled = left > 0;
      left--;
    };
    const t = setInterval(tick, 1000); tick();
    m.querySelector('#adDone').onclick = () => { clearInterval(t); onReward(); };
  }

  // --- Régie publicitaire : Google AdSense « H5 Games Ads » (Ad Placement API) ---
  // Active seulement si CFG.adsenseClient est rempli ; sinon pubs de démonstration.
  const ads = {
    loaded: false,
    real() { return !!CFG.adsenseClient; },
    load() {
      if (!ads.real() || ads.loaded) return;
      ads.loaded = true;
      const sc = document.createElement('script');
      sc.async = true; sc.crossOrigin = 'anonymous';
      sc.src = 'https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=' + encodeURIComponent(CFG.adsenseClient);
      if (CFG.adsenseTest) sc.setAttribute('data-adbreak-test', 'on');
      sc.setAttribute('data-ad-frequency-hint', '30s');
      document.head.appendChild(sc);
      window.adsbygoogle = window.adsbygoogle || [];
      window.adBreak = window.adConfig = (o) => window.adsbygoogle.push(o);
      window.adConfig({ preloadAdBreaks: 'on', sound: 'on' });
    },
    interstitial() { if (ads.real()) window.adBreak({ type: 'next', name: 'entre-manches' }); },
    rewarded(onReward, onFail) {
      let ok = false;
      window.adBreak({
        type: 'reward', name: 'debloquer-pack',
        beforeReward: (showAdFn) => showAdFn(),
        adViewed: () => { ok = true; },
        adDismissed: () => {},
        adBreakDone: () => { if (ok) onReward(); else onFail(); }
      });
    }
  };
  ads.load();
  let lastInterstitial = -1;
  function showInterstitial(qid) {
    if (qid === lastInterstitial) return;
    lastInterstitial = qid;
    ads.interstitial();
  }

  function openPerso() {
    const v = perso.get();
    const box = (k, label, ph) => `<label>${label}<textarea data-perso="${k}" rows="5" placeholder="${ph}">${esc(v[k].join('\n'))}</textarea></label>`;
    const m = modal(`<h3>✏️ Mes questions</h3><p class="mute small">Une question par ligne. Elles se mélangent à celles du jeu, quelle que soit l’ambiance.</p>
      ${box('susceptible', '👉 Qui est le plus susceptible de…', 'oublier ses clés\nchanter du ABBA en soirée')}
      ${box('echelle', '🔟 Phrases à noter de 1 à 10', 'J’aime les karaokés.')}
      ${box('auteur', '✍️ Questions « Qui a écrit ça ? »', 'Ton plus beau souvenir avec le groupe ?')}
      <button class="primary" id="savePerso">Enregistrer</button><button class="ghost" id="cancel">Annuler</button>`);
    m.querySelector('#cancel').onclick = closeModal;
    m.querySelector('#savePerso').onclick = () => {
      const out = {};
      m.querySelectorAll('[data-perso]').forEach((t) => { out[t.dataset.perso] = t.value.split('\n').map((x) => x.trim()).filter(Boolean).slice(0, 200).map((x) => x.slice(0, 140)); });
      perso.set(out); closeModal();
      toast((out.susceptible.length + out.echelle.length + out.auteur.length) + ' questions enregistrées');
    };
  }

  // --- Galerie : tirage au hasard de 20 photos, refus possible, validation ----------
  // view.photoPool : photos sélectionnées mais pas (encore) tirées
  // view.photoSel  : tirage en cours [{ data }] ; view.myPhotos : sélection validée et envoyée
  async function drawPhotos(files) {
    view.photoPool = shuffle(files);
    view.photoSel = [];
    view.refused = 0;
    const m = modal(`<h3>🎲 Tirage de tes photos…</h3><p class="mute small" id="drawProg">Préparation</p>`);
    while (view.photoSel.length < MAX_PHOTOS && view.photoPool.length) {
      const d = await shrink(view.photoPool.shift()).catch(() => null);
      if (d) view.photoSel.push({ data: d });
      const pr = m.querySelector('#drawProg'); if (pr) pr.textContent = `${view.photoSel.length} / ${Math.min(MAX_PHOTOS, view.photoSel.length + view.photoPool.length)}`;
    }
    if (!view.photoSel.length) { closeModal(); return toast('Aucune photo lisible dans ta sélection'); }
    openPhotoReview();
  }

  function openPhotoReview() {
    const sel = view.photoSel || [];
    const left = (view.photoPool || []).length;
    const m = modal(`
      <h3>Tes ${sel.length} photos tirées au hasard</h3>
      <p class="mute small">Touche ✕ pour refuser une photo${left ? ' : une autre la remplace au hasard' : ''}. Les autres joueurs ne verront rien avant que tu valides.</p>
      <div class="pgrid">${sel.map((p, i) => `<div class="pitem"><img src="${p.data}" alt="Photo ${i + 1}"><button class="pno" data-refuse="${i}" aria-label="Refuser cette photo">✕</button></div>`).join('')}</div>
      <p class="mute small center">${left ? `${left} photo${left > 1 ? 's' : ''} en réserve pour remplacer celles que tu refuses.` : 'Plus de photo en réserve : une photo refusée sera simplement retirée.'}</p>
      <button class="primary" id="photosOk">Valider ces ${sel.length} photos</button>
      <div class="row"><button class="small" id="photosAgain">🔀 Nouveau tirage</button><button class="small" id="photosNone">Ne pas jouer avec mes photos</button></div>`);
    m.querySelectorAll('[data-refuse]').forEach((b) => b.addEventListener('click', async () => {
      const i = +b.dataset.refuse;
      b.disabled = true;
      let rep = null;
      while (!rep && view.photoPool.length) rep = await shrink(view.photoPool.shift()).catch(() => null);
      view.refused = (view.refused || 0) + 1;
      if (rep) view.photoSel[i] = { data: rep }; else view.photoSel.splice(i, 1);
      if (!view.photoSel.length) { closeModal(); view.myPhotos = []; send({ t: 'photos', list: [] }); updateDynamic(); return toast('Aucune photo gardée'); }
      openPhotoReview();
    }));
    // Toucher une miniature : l'afficher en grand avant de décider
    m.querySelectorAll('.pitem img').forEach((img, i) => img.addEventListener('click', () => {
      const lb = document.createElement('div');
      lb.className = 'lightbox';
      lb.innerHTML = `<img src="${view.photoSel[i].data}" alt="Photo ${i + 1}"><div class="row"><button id="lbKeep">Garder</button><button class="refuse" id="lbNo">✕ Refuser</button></div>`;
      document.body.appendChild(lb);
      lb.querySelector('#lbKeep').onclick = () => lb.remove();
      lb.querySelector('#lbNo').onclick = () => { lb.remove(); m.querySelector(`[data-refuse="${i}"]`).click(); };
      lb.addEventListener('click', (e) => { if (e.target === lb) lb.remove(); });
    }));
    m.querySelector('#photosOk').onclick = () => {
      view.myPhotos = view.photoSel.map((p) => p.data);
      send({ t: 'photos', list: view.myPhotos });
      closeModal(); updateDynamic();
      toast(`${view.myPhotos.length} photos prêtes pour la manche Galerie`);
    };
    m.querySelector('#photosAgain').onclick = () => { closeModal(); view.photoSel = []; document.getElementById('file')?.click(); };
    m.querySelector('#photosNone').onclick = () => { closeModal(); view.photoSel = []; view.photoPool = []; view.myPhotos = []; send({ t: 'photos', list: [] }); updateDynamic(); toast('Tes photos ne seront pas utilisées'); };
  }

  // Réduit une photo (720 px max, JPEG) : la copie ne garde aucune métadonnée (GPS, appareil…)
  function shrink(file) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        const m = 640, r = Math.min(1, m / Math.max(img.naturalWidth, img.naturalHeight));
        const c = document.createElement('canvas');
        c.width = Math.round(img.naturalWidth * r); c.height = Math.round(img.naturalHeight * r);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        URL.revokeObjectURL(url);
        resolve(c.toDataURL('image/jpeg', 0.7));
      };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('image illisible')); };
      img.src = url;
    });
  }

  render();
  window.__tdt = { view, get H() { return H; }, dbg: () => client && { snap: !!client.snap, gen: client.gen, lostSince: client.lostSince, joined: client.joined, recovering: client.recovering, migrating: client.migrating, open: client.conn && client.conn.open, peerDisc: client.peer.disconnected } }; // utile pour les tests
})();
