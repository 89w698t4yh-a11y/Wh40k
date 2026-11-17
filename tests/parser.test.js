// Esegui dalla radice del repo con: node --test
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { parseList, allUnits, normalizeName } = require('../js/parser.js');

const LIST = fs.readFileSync(path.join(__dirname, 'fixtures', 'templari.txt'), 'utf8');

test('intestazione', () => {
  const r = parseList(LIST);
  assert.equal(r.ok, true, r.errors.join('\n'));
  assert.equal(r.header.name, 'Templari');
  assert.equal(r.header.points, 1995);
  assert.equal(r.header.faction, 'Space Marines');
  assert.equal(r.header.subfaction, 'Black Templars');
  assert.deepEqual(r.header.detachments, [{ name: "Marshal's Household and Vow-sworn Crusaders", points: 3 }]);
  assert.deepEqual(r.header.other, ['Purge the Foe']);
  assert.deepEqual(r.header.gameSize, { name: 'Strike Force', points: 2000 });
  assert.match(r.footer, /v2\.8\.1/);
});

test('attached units: raggruppamento leader + bodyguard', () => {
  const r = parseList(LIST);
  assert.equal(r.attached.length, 3);
  assert.deepEqual(r.attached.map(g => g.units.map(u => u.name)), [
    ['High Marshal Helbrecht', 'Sword Brethren Squad'],
    ['Execrator', 'Crusade Ancient', 'Crusader Squad'],
    ['Marshal', 'Sword Brethren Squad'],
  ]);
  const [helbrecht, sbs] = r.attached[0].units;
  assert.equal(helbrecht.role, 'Leader');
  assert.equal(helbrecht.roleDetail, 'Character');
  assert.equal(helbrecht.warlord, true);
  assert.equal(helbrecht.points, 125);
  assert.equal(sbs.role, 'Bodyguard');
  assert.deepEqual(sbs.enhancements, [{ name: 'Fervent Exemplars', detail: 'Upgrade' }]);
  assert.equal(sbs.models, 10);
  assert.deepEqual(sbs.wargear.find(w => w.name === 'Hand Flamer'), { name: 'Hand Flamer', qty: 4 });
  const ancient = r.attached[1].units[1];
  assert.equal(ancient.role, 'Support');
  const crusaders = r.attached[1].units[2];
  assert.equal(crusaders.roleDetail, 'Battleline');
  assert.equal(crusaders.models, 20);
  // Heavy Bolt Pistol: 1 (Sword Brother) + 10 (Initiate)
  assert.equal(crusaders.wargear.find(w => w.name === 'Heavy Bolt Pistol').qty, 11);
  assert.equal(crusaders.wargear.find(w => w.name === 'Bolt Pistol').qty, 19);
});

test('other datasheets', () => {
  const r = parseList(LIST);
  assert.deepEqual(r.others.map(u => [u.name, u.points, u.models]), [
    ['Assault Intercessors with Jump Packs', 95, 5],
    ['Brutalis Dreadnought', 160, 1],
    ['Gladiator Lancer', 175, 1],
    ['Land Raider Redeemer', 245, 1],
    ['Repulsor Executioner', 275, 1],
  ]);
  const lr = r.others[3];
  assert.equal(lr.wargear.find(w => w.name === 'Flamestorm Cannon').qty, 2);
});

test('punti totali coerenti, nessun avviso', () => {
  const r = parseList(LIST);
  assert.equal(allUnits(r).length, 12);
  assert.equal(r.totalPoints, 1995);
  assert.deepEqual(r.warnings, []);
});

test('robusto a tab, CRLF, NBSP e indentazioni diverse', () => {
  const messy = LIST.replace(/\n/g, '\r\n').replace(/^ {2}/gm, '\t').replace(/^ {5}/gm, '  ').replace(/ \(/g, '  (');
  const r = parseList(messy);
  assert.equal(r.ok, true);
  assert.equal(allUnits(r).length, 12);
  assert.equal(r.attached[1].units[2].models, 20);
});

test('formato compatto su una riga e lista senza sezioni', () => {
  const txt = [
    'Prova (100 Points)',
    'Space Marines – Black Templars',
    'Purge the Foe – Strike Force (2.000 Points)',
    '',
    'Marshal (80 Points)',
    '- 1x Plasma Pistol',
    'Altro (20 pts)',
    '  • 2x Thing',
  ].join('\n');
  const r = parseList(txt);
  assert.equal(r.header.faction, 'Space Marines');
  assert.equal(r.header.subfaction, 'Black Templars');
  assert.deepEqual(r.header.gameSize, { name: 'Strike Force', points: 2000 });
  assert.deepEqual(r.header.other, ['Purge the Foe']);
  assert.deepEqual(r.others.map(u => u.name), ['Marshal', 'Altro']);
});

test('errori chiari', () => {
  assert.match(parseList('').errors[0], /vuoto/);
  assert.match(parseList('ciao\nmondo').errors[0], /Nessuna unità/);
});

test('normalizzazione nomi', () => {
  assert.equal(normalizeName('  Marshal’s   Household '), "marshal's household");
});
