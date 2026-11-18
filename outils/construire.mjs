// Construit questions.js : 500 questions par catégorie.
// - susceptible.txt et echelle.txt : questions rédigées à la main
// - outils/brut/*.json : chiffres Wikidata (récupérés par outils/wikidata.mjs)
// Usage : node outils/construire.mjs
import { readFileSync, writeFileSync, existsSync } from 'node:fs';

const N = 500;
let seed = 42;
const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
const shuffle = (a) => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const lines = (f) => [...new Set(readFileSync(new URL(f, import.meta.url), 'utf8').split('\n').map((l) => l.trim()).filter(Boolean))];
const brut = (nom) => {
  const f = new URL(`brut/${nom}.json`, import.meta.url);
  return existsSync(f) ? JSON.parse(readFileSync(f, 'utf8')) : [];
};
const fmt = (n) => Math.round(n).toLocaleString('fr-FR');
const fmtPop = (n) => n >= 1e6 ? (n / 1e6).toLocaleString('fr-FR', { maximumFractionDigits: 1 }) + ' million' + (n >= 2e6 ? 's' : '') : fmt(n);
const okLabel = (l) => l && !/^Q\d+$/.test(l) && l.length <= 45;
const PAYS = { 'République populaire de Chine': 'Chine', 'Royaume des Pays-Bas': 'Pays-Bas', 'État de Palestine': 'Palestine', 'République démocratique du Congo': 'RD Congo' };
const pays = (c) => (c ? PAYS[c] || c : '');
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

// Dédoublonne par élément Wikidata et applique un filtre de vraisemblance
function prep(nom, ok, map = (r) => r) {
  const seen = new Map();
  for (const r of brut(nom)) {
    const v = +r.v;
    if (r.cL && /empire|union des républiques|yougoslavie|tchécoslovaquie|prusse|royaume d|allemande|ottoman|dynastie|colonie/i.test(r.cL)) continue;
    if (!okLabel(r.iL) || r.iL === 'Jérusalem' || !Number.isFinite(v) || !ok(v, r) || seen.has(r.i)) continue;
    seen.set(r.i, map({ ...r, v, s: +r.s || 0 }));
  }
  return [...seen.values()].sort((a, b) => b.s - a.s); // les plus connus d'abord
}

const D = {
  pays_population: prep('pays_population', (v) => v >= 100000 && v < 2e9),
  pays_superficie: prep('pays_superficie', (v) => v > 1e8, (r) => ({ ...r, v: r.v / 1e6 })), // m² -> km²
  villes_population: prep('villes_population', (v) => v >= 200000 && v < 4e7),
  montagnes_altitude: prep('montagnes_altitude', (v) => v >= 300 && v <= 8849),
  batiments_hauteur: prep('batiments_hauteur', (v) => v >= 40 && v <= 830),
  fleuves_longueur: prep('fleuves_longueur', (v) => v >= 100000 && v <= 7e6, (r) => ({ ...r, v: r.v / 1000 })), // m -> km
  monuments_annee: prep('monuments_annee', (v, r) => v >= 500 && v <= 2025 && !r.iL.includes(String(v))),
  personnes_naissance: prep('personnes_naissance', (v) => v >= 1000 && v <= 2004),
  films_annee: prep('films_annee', (v, r) => v >= 1920 && v <= 2025 && !r.iL.includes(String(v)))
};
for (const [k, v] of Object.entries(D)) console.log(k.padEnd(22), v.length);

// ---------- Plus ou moins -----------------------------------------------------------
const PM = {
  pays_population: { q: 'Quel pays compte le plus d’habitants ?', name: (r) => r.iL, val: (r) => fmtPop(r.v) + ' hab.', big: true },
  pays_superficie: { q: 'Quel pays est le plus grand ?', name: (r) => r.iL, val: (r) => fmt(r.v) + ' km²', big: true },
  villes_population: { q: 'Quelle ville compte le plus d’habitants ?', name: (r) => r.iL + (r.cL ? ' (' + pays(r.cL) + ')' : ''), val: (r) => fmtPop(r.v) + ' hab.', big: true },
  montagnes_altitude: { q: 'Quel sommet est le plus haut ?', name: (r) => cap(r.iL), val: (r) => fmt(r.v) + ' m', big: true },
  batiments_hauteur: { q: 'Quel édifice est le plus haut ?', name: (r) => cap(r.iL), val: (r) => fmt(r.v) + ' m', big: true },
  fleuves_longueur: { q: 'Quel cours d’eau est le plus long ?', name: (r) => cap(r.iL), val: (r) => fmt(r.v) + ' km', big: true },
  monuments_annee: { q: 'Lequel a été inauguré (ou ouvert au public) en premier ?', name: (r) => cap(r.iL), val: (r) => String(r.v), big: false, gap: 15 },
  personnes_naissance: { q: 'Qui est né(e) en premier ?', name: (r) => r.iL, val: (r) => 'né(e) en ' + r.v, big: false, gap: 4 },
  films_annee: { q: 'Quel film est sorti en premier ?', name: (r) => r.iL, val: (r) => String(r.v), big: false, gap: 3 }
};
function pairs(nom, n) {
  const t = PM[nom], list = shuffle(D[nom].slice(0, Math.max(60, n * 2.2))), out = [], used = new Set();
  for (let i = 0; i < list.length && out.length < n; i++) {
    for (let j = i + 1; j < list.length && out.length < n; j++) {
      const a = list[i], b = list[j];
      if (used.has(a.i) || used.has(b.i) || t.name(a) === t.name(b)) continue;
      const ok = t.big ? Math.max(a.v, b.v) / Math.min(a.v, b.v) >= 1.12 && Math.max(a.v, b.v) / Math.min(a.v, b.v) <= 4
                       : Math.abs(a.v - b.v) >= t.gap && Math.abs(a.v - b.v) <= 120;
      if (!ok) continue;
      used.add(a.i); used.add(b.i);
      const r = t.big ? (a.v > b.v ? 0 : 1) : (a.v < b.v ? 0 : 1);
      out.push({ q: t.q, a: t.name(a), b: t.name(b), va: t.val(a), vb: t.val(b), r });
      break;
    }
  }
  return out;
}

// ---------- Le juste chiffre --------------------------------------------------------
const JC = {
  pays_population: (r) => ({ q: `Combien d’habitants compte ce pays : ${r.iL} ?`, v: Math.round(r.v), u: 'habitants' }),
  pays_superficie: (r) => ({ q: `Quelle est la superficie de ce pays : ${r.iL} ?`, v: Math.round(r.v), u: 'km²' }),
  villes_population: (r) => ({ q: `Combien d’habitants compte la ville de ${r.iL}${r.cL ? ' (' + pays(r.cL) + ')' : ''} ?`, v: Math.round(r.v), u: 'habitants', d: 'Population de la ville selon Wikidata' }),
  montagnes_altitude: (r) => ({ q: `Quelle est l’altitude du sommet ${cap(r.iL)}${r.cL ? ' (' + pays(r.cL) + ')' : ''} ?`, v: Math.round(r.v), u: 'm' }),
  batiments_hauteur: (r) => ({ q: `Quelle est la hauteur de l’édifice ${cap(r.iL)}${r.cL ? ' (' + pays(r.cL) + ')' : ''} ?`, v: Math.round(r.v), u: 'm' }),
  fleuves_longueur: (r) => ({ q: `Quelle est la longueur du cours d’eau ${cap(r.iL)} ?`, v: Math.round(r.v), u: 'km' }),
  monuments_annee: (r) => ({ q: `En quelle année a été inauguré(e) ou ouvert(e) au public : ${cap(r.iL)}${r.cL ? ' (' + pays(r.cL) + ')' : ''} ?`, v: r.v, y: 1 }),
  personnes_naissance: (r) => ({ q: `En quelle année est né(e) ${r.iL}${r.dL ? ' (' + r.dL + ')' : ''} ?`, v: r.v, y: 1 }),
  films_annee: (r) => ({ q: `En quelle année est sorti le film « ${r.iL} » ?`, v: r.v, y: 1 })
};

function spread(keys, makeN, total) {
  const per = Math.ceil(total / keys.length) + 10;
  let all = [];
  for (const k of keys) all = all.concat(makeN(k, per));
  const seen = new Set();
  all = shuffle(all).filter((x) => { const k = JSON.stringify(x); if (seen.has(k)) return false; seen.add(k); return true; });
  return all.slice(0, total);
}

const plusmoins = spread(Object.keys(PM).filter((k) => D[k].length > 10), pairs, N);
const chiffre = spread(Object.keys(JC).filter((k) => D[k].length > 10), (k, n) => D[k].slice(0, n).map(JC[k]), N);
const susceptible = lines('susceptible.txt').slice(0, N);
const echelle = lines('echelle.txt').slice(0, N);

console.log({ susceptible: susceptible.length, echelle: echelle.length, plusmoins: plusmoins.length, chiffre: chiffre.length });
const out = `// Généré par outils/construire.mjs — ne pas modifier à la main.
// Chiffres « Plus ou moins » et « Le juste chiffre » : Wikidata (CC0).
window.TDT_Q = ${JSON.stringify({ susceptible, echelle, plusmoins, chiffre })};
`;
writeFileSync(new URL('../questions.js', import.meta.url), out);
