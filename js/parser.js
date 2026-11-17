/*
 * Parser per liste d'armata Warhammer 40.000 in formato testo "New Recruit".
 * Nessuna regola di gioco è codificata qui: il parser legge solo la struttura del testo.
 * Funziona sia nel browser (window.ListParser) sia in Node (module.exports) per i test.
 */
(function (root) {
  'use strict';

  var BULLET_L1 = /^[•·▪●■\-*+]$/;          // punti di primo livello
  var BULLET_L2 = /^[◦○▫◇–—>]$/;           // sotto-punti

  var RE_POINTS = /^(.*?)\s*\(\s*([\d.,\s]+)\s*(?:points?|pts|punti|pt)\s*\)\s*$/i;
  var RE_DETACHMENT = /^(.*?)\s*\(\s*([\d.,]+)\s*detachment\s*points?\s*\)\s*$/i;
  var RE_ATTACHED_HEADER = /^attached\s+units?$/i;
  var RE_OTHER_HEADER = /^other\s+datasheets?$/i;
  var RE_ATTACHED_BLOCK = /^attached\s+unit\s*(\d+)?\s*:?$/i;
  var RE_FOOTER = /^exported\s+with\b/i;
  var RE_QTY = /^(\d+)\s*x\s+(.+)$/i;
  var RE_KV = /^([A-Za-zÀ-ÿ' ]{2,40}):\s*(.*)$/;
  var RE_ROLE = /^([^()]+?)\s*(?:\(([^)]*)\))?$/;
  var GAME_SIZES = /^(combat patrol|incursion|strike force|onslaught|pattuglia|incursione|forza d'attacco|assalto)\b/i;
  var DASH_SPLIT = /\s+[–—-]\s+/;

  function toInt(s) {
    if (s == null) return null;
    var digits = String(s).replace(/[^\d]/g, '');
    return digits ? parseInt(digits, 10) : null;
  }

  function cleanLine(raw) {
    // normalizza spazi (inclusi NBSP e tab) mantenendo l'indentazione iniziale come conteggio
    var line = raw.replace(/ /g, ' ').replace(/\t/g, '    ').replace(/\s+$/, '');
    var indent = line.length - line.replace(/^\s+/, '').length;
    return { text: line.trim(), indent: indent };
  }

  function isSectionTitle(text) {
    // titoli tutti maiuscoli senza punti, es. "ATTACHED UNITS", "CHARACTERS"
    return text.length > 2 && text === text.toUpperCase() && /[A-Z]/.test(text) && !RE_POINTS.test(text);
  }

  function splitBullet(text) {
    var first = text.charAt(0);
    if (BULLET_L1.test(first) && text.length > 1 && /\s/.test(text.charAt(1))) {
      return { level: 1, body: text.slice(1).trim() };
    }
    if (BULLET_L2.test(first) && text.length > 1 && /\s/.test(text.charAt(1))) {
      return { level: 2, body: text.slice(1).trim() };
    }
    return null;
  }

  function nextIsBullet(rawLines, i) {
    for (var j = i + 1; j < rawLines.length; j++) {
      var t = cleanLine(rawLines[j]).text;
      if (t) return !!splitBullet(t);
    }
    return false;
  }

  function parseQty(body) {
    var m = body.match(RE_QTY);
    if (m) return { qty: parseInt(m[1], 10), name: m[2].trim() };
    return { qty: 1, name: body.trim(), implicitQty: true };
  }

  function newUnit(name, points, lineNo) {
    return {
      name: name,
      points: points,
      line: lineNo,
      attachedAs: null,   // testo grezzo, es. "Leader (Character)"
      role: null,         // "Leader" | "Bodyguard" | "Support" | ...
      roleDetail: null,   // "Character" | "Battleline" | ...
      warlord: false,
      enhancements: [],   // [{name, detail}]
      extra: [],          // altre righe chiave: valore non riconosciute
      entries: [],        // [{name, qty, children:[{name, qty}]}]
      models: 1
    };
  }

  function finalizeUnit(u) {
    // n° modelli: somma delle quantità dei punti di primo livello che hanno sotto-punti
    // (in New Recruit sono i profili dei modelli); altrimenti 1.
    var modelEntries = u.entries.filter(function (e) { return e.children.length > 0; });
    if (modelEntries.length) {
      u.models = modelEntries.reduce(function (s, e) { return s + e.qty; }, 0);
      u.modelProfiles = modelEntries.map(function (e) { return { name: e.name, qty: e.qty }; });
    } else {
      u.models = 1;
      u.modelProfiles = [];
    }
    // elenco piatto dell'equipaggiamento (armi/oggetti) con quantità sommate
    var map = {};
    var order = [];
    u.entries.forEach(function (e) {
      var items = e.children.length ? e.children : [e];
      items.forEach(function (it) {
        var k = it.name.toLowerCase();
        if (!map[k]) { map[k] = { name: it.name, qty: 0 }; order.push(k); }
        map[k].qty += it.qty;
      });
    });
    u.wargear = order.map(function (k) { return map[k]; });
    return u;
  }

  function parseHeader(lines, result) {
    // lines: [{text, lineNo}] prima della prima sezione/unità
    if (!lines.length) {
      result.warnings.push('Intestazione mancante: nome armata e punti non trovati.');
      return;
    }
    var h = result.header;
    var first = lines[0].text;
    var pm = first.match(RE_POINTS);
    if (pm) { h.name = pm[1].trim(); h.points = toInt(pm[2]); }
    else { h.name = first; result.warnings.push('Riga 1: punti totali non trovati in "' + first + '".'); }

    var plain = [];
    lines.slice(1).forEach(function (l) {
      var t = l.text;
      var dm = t.match(RE_DETACHMENT);
      if (dm) { h.detachments.push({ name: dm[1].trim(), points: toInt(dm[2]) }); return; }
      // formato compatto "Missione – Strike Force (2.000 Points)"
      var parts = t.split(DASH_SPLIT);
      var last = parts[parts.length - 1];
      var gm = last.match(RE_POINTS);
      if (gm && (GAME_SIZES.test(gm[1].trim()) || parts.length > 1 || h.detachments.length)) {
        h.gameSize = { name: gm[1].trim(), points: toInt(gm[2]) };
        if (parts.length > 1) plain.push({ text: parts.slice(0, -1).join(' – '), afterDetachment: true });
        return;
      }
      if (parts.length === 2 && !h.faction) {
        // formato compatto "Space Marines – Black Templars"
        h.faction = parts[0].trim();
        h.subfaction = parts[1].trim();
        return;
      }
      plain.push({ text: t, afterDetachment: h.detachments.length > 0 });
    });

    plain.forEach(function (p) {
      if (!p.afterDetachment && !h.faction) h.faction = p.text;
      else if (!p.afterDetachment && !h.subfaction) h.subfaction = p.text;
      else h.other.push(p.text);
    });
  }

  function parseList(input) {
    var result = {
      ok: false,
      header: { name: null, points: null, faction: null, subfaction: null, detachments: [], gameSize: null, other: [] },
      attached: [],   // [{index, units:[unit]}]
      others: [],     // [unit]
      sections: [],   // sezioni non standard: [{title, units}]
      footer: null,
      warnings: [],
      errors: []
    };

    if (typeof input !== 'string' || !input.trim()) {
      result.errors.push('Il testo è vuoto: incolla una lista esportata da New Recruit.');
      return result;
    }

    var rawLines = input.replace(/\r\n?/g, '\n').split('\n');
    var headerLines = [];
    var phase = 'header';          // header | attached | other | custom
    var currentGroup = null;
    var currentSection = null;
    var unit = null;
    var lastEntry = null;
    var lastEntryIndent = 0;

    function closeUnit() {
      if (!unit) return;
      finalizeUnit(unit);
      if (phase === 'attached') {
        if (!currentGroup) {
          currentGroup = { index: result.attached.length + 1, units: [] };
          result.attached.push(currentGroup);
        }
        currentGroup.units.push(unit);
      } else if (phase === 'custom' && currentSection) {
        currentSection.units.push(unit);
      } else {
        result.others.push(unit);
      }
      unit = null;
      lastEntry = null;
    }

    for (var i = 0; i < rawLines.length; i++) {
      var lineNo = i + 1;
      var cl = cleanLine(rawLines[i]);
      var t = cl.text;
      if (!t) continue;

      if (RE_FOOTER.test(t)) { closeUnit(); result.footer = t; continue; }

      var bullet = splitBullet(t);

      if (!bullet) {
        if (RE_ATTACHED_HEADER.test(t)) { closeUnit(); phase = 'attached'; currentGroup = null; continue; }
        if (RE_OTHER_HEADER.test(t)) { closeUnit(); phase = 'other'; currentGroup = null; continue; }
        var ab = t.match(RE_ATTACHED_BLOCK);
        if (ab) {
          closeUnit();
          phase = 'attached';
          currentGroup = { index: ab[1] ? parseInt(ab[1], 10) : result.attached.length + 1, units: [] };
          result.attached.push(currentGroup);
          continue;
        }
        if (phase !== 'header' && isSectionTitle(t)) {
          closeUnit();
          phase = 'custom';
          currentSection = { title: t, units: [] };
          result.sections.push(currentSection);
          continue;
        }
        if (phase === 'header') {
          if (headerLines.length && isSectionTitle(t)) {
            phase = 'custom';
            currentSection = { title: t, units: [] };
            result.sections.push(currentSection);
            continue;
          }
          // lista senza titoli di sezione: una riga "Nome (N Points)" seguita da un punto elenco è già un'unità
          if (headerLines.length && RE_POINTS.test(t) && nextIsBullet(rawLines, i)) {
            phase = 'other';
          } else {
            headerLines.push({ text: t, lineNo: lineNo });
            continue;
          }
        }
        var um = t.match(RE_POINTS);
        if (um) {
          closeUnit();
          unit = newUnit(um[1].trim(), toInt(um[2]), lineNo);
          continue;
        }
        if (unit && lastEntry && cl.indent > lastEntryIndent) {
          // riga indentata senza simbolo: trattala come sotto-punto
          bullet = { level: 2, body: t };
        } else {
          result.warnings.push('Riga ' + lineNo + ' ignorata (formato non riconosciuto): "' + t + '"');
          continue;
        }
      }

      if (!unit) {
        result.warnings.push('Riga ' + lineNo + ' ignorata: punto elenco fuori da un\'unità: "' + t + '"');
        continue;
      }

      // con "-" o "*" usati per entrambi i livelli, decide l'indentazione
      var level = bullet.level;
      if (level === 1 && lastEntry && cl.indent > lastEntryIndent + 1 && /^[-*+]/.test(t)) level = 2;

      var body = bullet.body;
      if (level === 1) {
        var kv = body.match(RE_KV);
        if (kv && !RE_QTY.test(body)) {
          var key = kv[1].trim().toLowerCase();
          var val = kv[2].trim();
          if (key === 'attached as') {
            unit.attachedAs = val;
            var rm = val.match(RE_ROLE);
            unit.role = rm ? rm[1].trim() : val;
            unit.roleDetail = rm && rm[2] ? rm[2].trim() : null;
          } else if (key === 'enhancement' || key === 'enhancements') {
            val.split(/\s*,\s*(?![^(]*\))/).forEach(function (e) {
              var em = e.match(RE_ROLE);
              unit.enhancements.push({ name: em ? em[1].trim() : e, detail: em && em[2] ? em[2].trim() : null });
            });
          } else {
            unit.extra.push({ key: kv[1].trim(), value: val });
          }
          lastEntry = null;
          continue;
        }
        if (/^warlord$/i.test(body)) { unit.warlord = true; lastEntry = null; continue; }
        var q = parseQty(body);
        if (q.implicitQty) {
          // riga di primo livello senza "Nx": opzione/etichetta (es. "Epic Hero")
          unit.extra.push({ key: null, value: body });
          lastEntry = null;
          continue;
        }
        lastEntry = { name: q.name, qty: q.qty, children: [] };
        lastEntryIndent = cl.indent;
        unit.entries.push(lastEntry);
      } else {
        var q2 = parseQty(body);
        if (!lastEntry) {
          // sotto-punto senza genitore: lo aggancio come voce autonoma
          unit.entries.push({ name: q2.name, qty: q2.qty, children: [] });
          result.warnings.push('Riga ' + lineNo + ': sotto-punto senza modello di riferimento, aggiunto all\'unità "' + unit.name + '".');
          continue;
        }
        lastEntry.children.push({ name: q2.name, qty: q2.qty });
      }
    }
    closeUnit();

    parseHeader(headerLines, result);

    // controlli finali
    result.attached = result.attached.filter(function (g) { return g.units.length; });
    var all = allUnits(result);
    if (!all.length) {
      result.errors.push('Nessuna unità trovata. Ogni unità deve avere una riga del tipo "Nome Unità (123 Points)".');
      return result;
    }
    result.attached.forEach(function (g) {
      var leaders = g.units.filter(function (u) { return u.role && !/bodyguard/i.test(u.role); });
      var guards = g.units.filter(function (u) { return u.role && /bodyguard/i.test(u.role); });
      if (!guards.length) result.warnings.push('Attached unit ' + g.index + ': nessuna unità "Bodyguard" trovata.');
      if (!leaders.length) result.warnings.push('Attached unit ' + g.index + ': nessun personaggio Leader trovato.');
    });
    var sum = all.reduce(function (s, u) { return s + (u.points || 0); }, 0);
    result.totalPoints = sum;
    if (result.header.points != null && sum !== result.header.points) {
      result.warnings.push('La somma dei punti delle unità (' + sum + ') non corrisponde al totale dichiarato (' + result.header.points + ').');
    }
    result.ok = true;
    return result;
  }

  function allUnits(result) {
    var out = [];
    result.attached.forEach(function (g) { out = out.concat(g.units); });
    result.sections.forEach(function (s) { out = out.concat(s.units); });
    return out.concat(result.others);
  }

  function normalizeName(name) {
    return String(name || '')
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/[’‘`´]/g, "'")
      .replace(/[–—]/g, '-')
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase();
  }

  var api = { parseList: parseList, allUnits: allUnits, normalizeName: normalizeName };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.ListParser = api;
})(typeof window !== 'undefined' ? window : this);
