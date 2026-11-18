// Télécharge des chiffres vérifiés depuis Wikidata (gratuit, sans clé).
// Lancé par GitHub Actions ; résultat brut dans outils/brut/*.json
import { writeFileSync, mkdirSync } from 'node:fs';
const L = (v) => `?${v} rdfs:label ?${v}L FILTER(LANG(?${v}L) = "fr")`;
const Q = {
  pays_population: `SELECT ?i ?iL (MAX(?p) AS ?v) (MAX(?sl) AS ?s) WHERE { ?i wdt:P31 wd:Q6256; wdt:P1082 ?p; wikibase:sitelinks ?sl. ${L('i')} } GROUP BY ?i ?iL`,
  pays_superficie: `SELECT ?i ?iL (MAX(?a) AS ?v) (MAX(?sl) AS ?s) WHERE { ?i wdt:P31 wd:Q6256; p:P2046/psn:P2046/wikibase:quantityAmount ?a; wikibase:sitelinks ?sl. ${L('i')} } GROUP BY ?i ?iL`,
  villes_population: `SELECT ?i ?iL ?cL (MAX(?p) AS ?v) (MAX(?sl) AS ?s) WHERE { VALUES ?t { wd:Q515 wd:Q1637706 wd:Q5119 wd:Q200250 wd:Q1549591 } ?i wdt:P31 ?t; wdt:P1082 ?p; wdt:P17 ?c; wikibase:sitelinks ?sl. FILTER(?sl > 90 && ?p > 200000) ${L('i')} ${L('c')} } GROUP BY ?i ?iL ?cL`,
  montagnes_altitude: `SELECT ?i ?iL ?cL (MAX(?e) AS ?v) (MAX(?sl) AS ?s) WHERE { ?i wdt:P31 wd:Q8502; wikibase:sitelinks ?sl. FILTER(?sl > 45) ?i p:P2044/psn:P2044/wikibase:quantityAmount ?e. OPTIONAL { ?i wdt:P17 ?c. ${L('c')} } ${L('i')} } GROUP BY ?i ?iL ?cL`,
  batiments_hauteur: `SELECT ?i ?iL ?cL (MAX(?h) AS ?v) (MAX(?sl) AS ?s) WHERE { VALUES ?t { wd:Q11303 wd:Q12518 wd:Q41176 wd:Q11166728 } ?i wdt:P31 ?t; p:P2048/psn:P2048/wikibase:quantityAmount ?h; wikibase:sitelinks ?sl. FILTER(?sl > 25) OPTIONAL { ?i wdt:P17 ?c. ${L('c')} } ${L('i')} } GROUP BY ?i ?iL ?cL`,
  fleuves_longueur: `SELECT ?i ?iL (MAX(?x) AS ?v) (MAX(?sl) AS ?s) WHERE { VALUES ?t { wd:Q4022 wd:Q573344 } ?i wdt:P31 ?t; p:P2043/psn:P2043/wikibase:quantityAmount ?x; wikibase:sitelinks ?sl. FILTER(?sl > 40) ${L('i')} } GROUP BY ?i ?iL`,
  monuments_annee: `SELECT ?i ?iL ?cL (MIN(YEAR(?d)) AS ?v) (MAX(?sl) AS ?s) WHERE { ?i wdt:P1619 ?d; wikibase:sitelinks ?sl. FILTER(?sl > 50) OPTIONAL { ?i wdt:P17 ?c. ${L('c')} } ${L('i')} } GROUP BY ?i ?iL ?cL`,
  personnes_naissance: `SELECT ?i ?iL (SAMPLE(?dL) AS ?dL) (MIN(YEAR(?b)) AS ?v) (MAX(?sl) AS ?s) WHERE { ?i wikibase:sitelinks ?sl. FILTER(?sl > 170) ?i wdt:P31 wd:Q5; wdt:P569 ?b. OPTIONAL { ?i wdt:P106 ?d. ${L('d')} } ${L('i')} } GROUP BY ?i ?iL`,
  films_annee: `SELECT ?i ?iL (MIN(YEAR(?d)) AS ?v) (MAX(?sl) AS ?s) WHERE { ?i wdt:P31 wd:Q11424; wdt:P577 ?d; wikibase:sitelinks ?sl. FILTER(?sl > 70) ${L('i')} } GROUP BY ?i ?iL`
};
import { rmSync } from 'node:fs';
rmSync('outils/brut', { recursive: true, force: true });
mkdirSync('outils/brut', { recursive: true });
for (const [nom, q] of Object.entries(Q)) {
  for (let essai = 1; essai <= 3; essai++) try {
    const r = await fetch('https://query.wikidata.org/sparql?format=json&query=' + encodeURIComponent(q), {
      headers: { 'User-Agent': 'TourDeTable/1.0 (https://github.com/baptistecolleter-star/tour-de-table)', Accept: 'application/sparql-results+json' }
    });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const rows = (await r.json()).results.bindings.map((b) => Object.fromEntries(Object.entries(b).map(([k, v]) => [k, v.value])));
    writeFileSync(`outils/brut/${nom}.json`, JSON.stringify(rows));
    console.log(nom, rows.length);
    break;
  } catch (e) {
    console.log(nom, 'essai', essai, 'ERREUR', e.message);
    if (essai === 3) writeFileSync(`outils/brut/${nom}.erreur.txt`, String(e));
    else await new Promise((s) => setTimeout(s, 10000));
  }
  await new Promise((s) => setTimeout(s, 1500));
}
