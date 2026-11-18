// Télécharge des chiffres vérifiés depuis Wikidata (gratuit, sans clé).
// Lancé par GitHub Actions ; résultat brut dans outils/brut/*.json
import { writeFileSync, mkdirSync } from 'node:fs';
const L = (v) => `?${v} rdfs:label ?${v}L FILTER(LANG(?${v}L) = "fr")`;
const Q = {
  pays_population: `SELECT ?i ?iL (MAX(?p) AS ?v) WHERE { ?i wdt:P31 wd:Q6256; wdt:P1082 ?p. ${L('i')} } GROUP BY ?i ?iL`,
  pays_superficie: `SELECT ?i ?iL (MAX(?a) AS ?v) WHERE { ?i wdt:P31 wd:Q6256; p:P2046/psn:P2046/wikibase:quantityAmount ?a. ${L('i')} } GROUP BY ?i ?iL`,
  villes_population: `SELECT ?i ?iL ?cL (MAX(?p) AS ?v) WHERE { VALUES ?t { wd:Q515 wd:Q1637706 wd:Q5119 wd:Q200250 wd:Q1549591 } ?i wdt:P31 ?t; wdt:P1082 ?p; wdt:P17 ?c; wikibase:sitelinks ?sl. FILTER(?sl > 50 && ?p > 200000) ${L('i')} ${L('c')} } GROUP BY ?i ?iL ?cL`,
  montagnes_altitude: `SELECT ?i ?iL ?cL (MAX(?e) AS ?v) WHERE { ?i wdt:P31 wd:Q8502; p:P2044/psn:P2044/wikibase:quantityAmount ?e; wikibase:sitelinks ?sl. FILTER(?sl > 25) OPTIONAL { ?i wdt:P17 ?c. ${L('c')} } ${L('i')} } GROUP BY ?i ?iL ?cL`,
  batiments_hauteur: `SELECT ?i ?iL ?cL (MAX(?h) AS ?v) WHERE { VALUES ?t { wd:Q11303 wd:Q12518 wd:Q41176 wd:Q11166728 } ?i wdt:P31 ?t; p:P2048/psn:P2048/wikibase:quantityAmount ?h; wikibase:sitelinks ?sl. FILTER(?sl > 25) OPTIONAL { ?i wdt:P17 ?c. ${L('c')} } ${L('i')} } GROUP BY ?i ?iL ?cL`,
  fleuves_longueur: `SELECT ?i ?iL (MAX(?x) AS ?v) WHERE { VALUES ?t { wd:Q4022 wd:Q573344 } ?i wdt:P31 ?t; p:P2043/psn:P2043/wikibase:quantityAmount ?x; wikibase:sitelinks ?sl. FILTER(?sl > 40) ${L('i')} } GROUP BY ?i ?iL`,
  monuments_annee: `SELECT ?i ?iL ?cL (MIN(YEAR(?d)) AS ?v) WHERE { ?i wdt:P1619 ?d; wikibase:sitelinks ?sl. FILTER(?sl > 50) OPTIONAL { ?i wdt:P17 ?c. ${L('c')} } ${L('i')} } GROUP BY ?i ?iL ?cL`,
  personnes_naissance: `SELECT ?i ?iL ?dL (MIN(YEAR(?b)) AS ?v) WHERE { ?i wdt:P31 wd:Q5; wdt:P569 ?b; wikibase:sitelinks ?sl. FILTER(?sl > 140) OPTIONAL { ?i wdt:P106 ?d. ${L('d')} } ${L('i')} } GROUP BY ?i ?iL ?dL`,
  films_annee: `SELECT ?i ?iL (MIN(YEAR(?d)) AS ?v) WHERE { ?i wdt:P31 wd:Q11424; wdt:P577 ?d; wikibase:sitelinks ?sl. FILTER(?sl > 70) ${L('i')} } GROUP BY ?i ?iL`
};
mkdirSync('outils/brut', { recursive: true });
for (const [nom, q] of Object.entries(Q)) {
  try {
    const r = await fetch('https://query.wikidata.org/sparql?format=json&query=' + encodeURIComponent(q), {
      headers: { 'User-Agent': 'TourDeTable/1.0 (https://github.com/baptistecolleter-star/tour-de-table)', Accept: 'application/sparql-results+json' }
    });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const rows = (await r.json()).results.bindings.map((b) => Object.fromEntries(Object.entries(b).map(([k, v]) => [k, v.value])));
    writeFileSync(`outils/brut/${nom}.json`, JSON.stringify(rows));
    console.log(nom, rows.length);
  } catch (e) {
    writeFileSync(`outils/brut/${nom}.erreur.txt`, String(e));
    console.log(nom, 'ERREUR', e.message);
  }
  await new Promise((s) => setTimeout(s, 1500));
}
