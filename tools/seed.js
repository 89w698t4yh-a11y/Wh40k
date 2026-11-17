#!/usr/bin/env node
/*
 * Aggiunge a data/datasheets.json una voce vuota per ogni unità di una lista
 * che non è ancora presente. Compila solo i dati che vengono dalla lista
 * (nome, punti, equipaggiamento); i campi-regole restano vuoti da compilare a mano.
 * Le voci esistenti non vengono mai sovrascritte (aggiorna solo "fromList").
 *
 * Uso:  node tools/seed.js percorso/lista.txt [data/datasheets.json]
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { parseList, allUnits, normalizeName } = require('../js/parser.js');

const listPath = process.argv[2];
const dataPath = process.argv[3] || path.join(__dirname, '..', 'data', 'datasheets.json');
if (!listPath) {
  console.error('Uso: node tools/seed.js lista.txt [data/datasheets.json]');
  process.exit(1);
}

const parsed = parseList(fs.readFileSync(listPath, 'utf8'));
if (!parsed.ok) {
  console.error('Errore nel parsing della lista:\n- ' + parsed.errors.join('\n- '));
  process.exit(1);
}
parsed.warnings.forEach(w => console.warn('Avviso: ' + w));

const db = fs.existsSync(dataPath)
  ? JSON.parse(fs.readFileSync(dataPath, 'utf8'))
  : { meta: {}, units: {} };
db.units = db.units || {};

const byNorm = {};
Object.keys(db.units).forEach(k => { byNorm[normalizeName(k)] = k; });

function emptyEntry(name) {
  return {
    name,
    fromList: { points: [], wargear: [] },
    statline: { M: '', T: '', Sv: '', Inv: '', W: '', Ld: '', OC: '' },
    ranged: [],
    melee: [],
    abilities: { core: [], faction: [], uniche: [] },
    keywords: [],
    faction_keywords: [],
    wahapediaUrl: ''
  };
}

let added = 0;
allUnits(parsed).forEach(u => {
  let key = byNorm[normalizeName(u.name)];
  if (!key) {
    key = u.name;
    db.units[key] = emptyEntry(u.name);
    byNorm[normalizeName(key)] = key;
    added++;
  }
  const e = db.units[key];
  e.fromList = e.fromList || { points: [], wargear: [] };
  if (!e.fromList.points.some(p => p.models === u.models && p.points === u.points)) {
    e.fromList.points.push({ models: u.models, points: u.points });
    e.fromList.points.sort((a, b) => a.models - b.models || a.points - b.points);
  }
  u.wargear.forEach(w => {
    if (!e.fromList.wargear.includes(w.name)) e.fromList.wargear.push(w.name);
  });
});

fs.writeFileSync(dataPath, JSON.stringify(db, null, 2) + '\n');
console.log(`Aggiunte ${added} nuove voci, totale ${Object.keys(db.units).length}. File: ${dataPath}`);
