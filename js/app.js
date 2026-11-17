/* Liste 40k — app (JS vanilla, nessuna dipendenza). */
(function () {
  'use strict';

  var P = window.ListParser;
  var LS_LISTS = 'l40k.lists';
  var LS_THEME = 'l40k.theme';
  var DEFAULT_SEARCH = 'https://www.google.com/search?q=site%3Awahapedia.ru+%22{q}%22';

  var app = document.getElementById('app');
  var titleEl = document.getElementById('title');
  var backBtn = document.getElementById('btn-back');
  var themeBtn = document.getElementById('btn-theme');
  var toastEl = document.getElementById('toast');

  var db = { meta: {}, units: {} };
  var dbIndex = {};
  var dbError = null;
  var fasi = null;
  var dbReady = Promise.all([loadDatasheets(), loadFasi()]);
  var cache = {}; // id -> risultato del parsing
  var draft = '';
  var lastErrors = null;

  // ---------- utilità ----------
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function fmtPts(n) { return n == null ? '—' : n.toLocaleString('it-IT') + ' pt'; }
  function plural(n, one, many) { return n + ' ' + (n === 1 ? one : many); }
  function toast(msg) {
    toastEl.textContent = msg;
    toastEl.classList.add('show');
    clearTimeout(toast._t);
    toast._t = setTimeout(function () { toastEl.classList.remove('show'); }, 2200);
  }
  function lsGet(key, fallback) {
    try { var v = localStorage.getItem(key); return v == null ? fallback : JSON.parse(v); } catch (e) { return fallback; }
  }
  function lsSet(key, val) {
    try { localStorage.setItem(key, JSON.stringify(val)); return true; } catch (e) { return false; }
  }

  // ---------- dati ----------
  function loadFasi() {
    return fetch('data/fasi.json', { cache: 'no-cache' })
      .then(function (r) { if (!r.ok) throw new Error(); return r.json(); })
      .then(function (j) { fasi = j; })
      .catch(function () { fasi = null; });
  }
  function fasiFor(army) {
    return fasi && army.parsed.header.name === fasi.meta.list ? fasi : null;
  }

  function loadDatasheets() {
    return fetch('data/datasheets.json', { cache: 'no-cache' })
      .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
      .then(function (json) {
        db = json && json.units ? json : { meta: {}, units: json || {} };
        dbIndex = {};
        Object.keys(db.units).forEach(function (k) {
          var e = db.units[k];
          dbIndex[P.normalizeName(k)] = e;
          if (e && e.name) dbIndex[P.normalizeName(e.name)] = e;
          (e && e.aliases || []).forEach(function (a) { dbIndex[P.normalizeName(a)] = e; });
        });
      })
      .catch(function (err) {
        dbError = 'Impossibile caricare data/datasheets.json (' + err.message + '). Verrà mostrato solo il contenuto della lista.';
      });
  }
  function sheetFor(name) { return dbIndex[P.normalizeName(name)] || null; }
  function hasRules(e) {
    if (!e) return false;
    var s = Array.isArray(e.statline) ? e.statline[0] : e.statline;
    return !!((s && s.M) || (e.ranged && e.ranged.length) || (e.melee && e.melee.length));
  }
  function wahapediaUrl(unitName, entry) {
    if (entry && entry.wahapediaUrl) return entry.wahapediaUrl;
    var tpl = (db.meta && db.meta.wahapediaSearchUrl) || DEFAULT_SEARCH;
    return tpl.replace('{q}', encodeURIComponent(unitName));
  }

  // ---------- liste salvate ----------
  function getLists() { return lsGet(LS_LISTS, []); }
  function saveList(text, parsed) {
    var lists = getLists();
    var existing = lists.find(function (l) { return l.text === text; });
    if (existing) { existing.savedAt = Date.now(); lsSet(LS_LISTS, lists); return existing.id; }
    var id = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    lists.unshift({
      id: id,
      name: parsed.header.name || 'Lista senza nome',
      points: parsed.header.points,
      faction: [parsed.header.faction, parsed.header.subfaction].filter(Boolean).join(' – '),
      text: text,
      savedAt: Date.now()
    });
    if (!lsSet(LS_LISTS, lists)) toast('Attenzione: salvataggio non riuscito (spazio o modalità privata).');
    return id;
  }
  function deleteList(id) {
    lsSet(LS_LISTS, getLists().filter(function (l) { return l.id !== id; }));
    delete cache[id];
  }
  function getArmy(id) {
    if (cache[id]) return cache[id];
    var l = getLists().find(function (x) { return x.id === id; });
    if (!l) return null;
    var parsed = P.parseList(l.text);
    if (!parsed.ok) return null;
    // indice piatto delle unità, con riferimento al gruppo
    var flat = [];
    parsed.attached.forEach(function (g) {
      g.units.forEach(function (u) { u._group = g; flat.push(u); });
    });
    parsed.sections.forEach(function (s) { s.units.forEach(function (u) { u._section = s.title; flat.push(u); }); });
    parsed.others.forEach(function (u) { flat.push(u); });
    flat.forEach(function (u, i) { u._uid = i; });
    cache[id] = { id: id, meta: l, parsed: parsed, flat: flat };
    return cache[id];
  }

  // ---------- tema ----------
  function applyTheme(t) {
    if (t === 'light' || t === 'dark') document.documentElement.dataset.theme = t;
    else delete document.documentElement.dataset.theme;
  }
  function getTheme() {
    try { return localStorage.getItem(LS_THEME) || 'auto'; } catch (e) { return 'auto'; }
  }
  themeBtn.addEventListener('click', function () {
    var cur = getTheme();
    var next = cur === 'auto' ? 'light' : cur === 'light' ? 'dark' : 'auto';
    try { if (next === 'auto') localStorage.removeItem(LS_THEME); else localStorage.setItem(LS_THEME, next); } catch (e) {}
    applyTheme(next);
    toast({ auto: 'Tema: automatico', light: 'Tema: chiaro', dark: 'Tema: scuro' }[next]);
  });

  // ---------- router ----------
  function go(hash) { location.hash = hash; }
  backBtn.addEventListener('click', function () {
    var parts = location.hash.replace(/^#\/?/, '').split('/');
    if (parts[0] === 'army' && (parts[2] === 'u' || parts[2] === 'fasi')) go('#/army/' + parts[1]);
    else go('#/liste');
  });
  window.addEventListener('hashchange', route);

  function route() {
    var parts = location.hash.replace(/^#\/?/, '').split('/').map(decodeURIComponent);
    dbReady.then(function () {
      if (parts[0] === 'army' && parts[1]) {
        var army = getArmy(parts[1]);
        if (!army) { toast('Lista non trovata.'); go('#/liste'); return; }
        if (parts[2] === 'u' && parts[3] != null) renderUnit(army, parseInt(parts[3], 10));
        else if (parts[2] === 'fasi' && fasiFor(army)) renderPhases(army);
        else renderArmy(army);
      } else if (parts[0] === 'liste') {
        renderHome();
      } else {
        // avvio: apre direttamente l'armata più recente
        var lists = getLists();
        if (lists.length) location.replace('#/army/' + lists[0].id);
        else renderHome();
      }
      app.focus({ preventScroll: true });
    });
  }

  function setChrome(title, back) {
    titleEl.textContent = title;
    document.title = title === 'Liste 40k' ? title : title + ' · Liste 40k';
    backBtn.hidden = !back;
  }

  // ---------- schermata 1: liste ----------
  function renderHome() {
    setChrome('Liste 40k', false);
    var lists = getLists();
    var html = '';
    html += '<section class="card">';
    html += '<label for="list-text" class="section-title" style="display:block;margin-top:0">Nuova lista</label>';
    html += '<textarea id="list-text" placeholder="Incolla qui la lista esportata da New Recruit…" autocapitalize="off" autocomplete="off" spellcheck="false">' + esc(draft) + '</textarea>';
    if (lastErrors) {
      html += '<div class="notice error"><b>Non riesco a leggere la lista.</b><ul>' +
        lastErrors.map(function (e) { return '<li>' + esc(e) + '</li>'; }).join('') + '</ul></div>';
    }
    html += '<div class="row" style="margin-top:10px">';
    html += '<button class="btn primary" id="btn-parse" type="button">Analizza e salva</button>';
    html += '<label class="btn file-label">Importa .txt<input type="file" id="file-input" accept=".txt,text/plain"></label>';
    html += '</div></section>';

    html += '<h2 class="section-title">Liste salvate</h2>';
    if (!lists.length) {
      html += '<p class="muted small">Nessuna lista salvata. Le liste vengono salvate solo su questo dispositivo.</p>';
    } else {
      html += '<ul class="saved card">' + lists.map(function (l) {
        return '<li><a href="#/army/' + esc(l.id) + '"><strong>' + esc(l.name) + '</strong>' +
          '<span class="muted small">' + esc([l.faction, fmtPts(l.points), new Date(l.savedAt).toLocaleDateString('it-IT')].filter(Boolean).join(' · ')) + '</span></a>' +
          '<button class="btn danger" type="button" data-del="' + esc(l.id) + '" aria-label="Elimina ' + esc(l.name) + '">Elimina</button></li>';
      }).join('') + '</ul>';
    }
    if (dbError) html += '<div class="notice warn">' + esc(dbError) + '</div>';
    app.innerHTML = html;

    var ta = document.getElementById('list-text');
    ta.addEventListener('input', function () { draft = ta.value; });
    document.getElementById('btn-parse').addEventListener('click', function () { analyze(ta.value); });
    document.getElementById('file-input').addEventListener('change', function (ev) {
      var f = ev.target.files && ev.target.files[0];
      if (!f) return;
      var reader = new FileReader();
      reader.onload = function () { draft = String(reader.result); analyze(draft); };
      reader.onerror = function () { toast('Impossibile leggere il file.'); };
      reader.readAsText(f);
    });
    app.querySelectorAll('[data-del]').forEach(function (b) {
      b.addEventListener('click', function () {
        if (confirm('Eliminare questa lista dal dispositivo?')) { deleteList(b.dataset.del); renderHome(); }
      });
    });
  }

  function analyze(text) {
    var parsed = P.parseList(text);
    if (!parsed.ok) { lastErrors = parsed.errors; draft = text; renderHome(); return; }
    lastErrors = null;
    draft = '';
    var id = saveList(text, parsed);
    delete cache[id];
    go('#/army/' + id);
  }

  // ---------- schermata 2: armata ----------
  var filterText = '';

  function unitSearchText(u) {
    var e = sheetFor(u.name) || {};
    return P.normalizeName([
      u.name, u.role, u.roleDetail,
      u.wargear.map(function (w) { return w.name; }).join(' '),
      u.enhancements.map(function (x) { return x.name; }).join(' '),
      (e.keywords || []).join(' '), (e.faction_keywords || []).join(' ')
    ].join(' '));
  }

  function unitRow(army, u) {
    var e = sheetFor(u.name);
    var isLeader = u.role && !/bodyguard/i.test(u.role);
    var bits = [plural(u.models, 'modello', 'modelli')];
    if (u.enhancements.length) bits.push(u.enhancements.map(function (x) { return x.name; }).join(', '));
    return '<a class="unit-row" href="#/army/' + esc(army.id) + '/u/' + u._uid + '" data-search="' + esc(unitSearchText(u)) + '">' +
      '<span class="grow"><span class="name">' + esc(u.name) + '</span>' +
      (u.role ? '<span class="role' + (isLeader ? ' leader' : '') + '">' + esc(u.role) + '</span>' : '') +
      (u.warlord ? '<span class="role leader">Warlord</span>' : '') +
      '<span class="sub" style="display:block"><span class="dot' + (hasRules(e) ? ' on' : '') + '" title="' + (hasRules(e) ? 'Datasheet compilata' : 'Datasheet da compilare') + '"></span>' + esc(bits.join(' · ')) + '</span></span>' +
      '<span class="pts">' + fmtPts(u.points) + '</span><span class="chev" aria-hidden="true">›</span></a>';
  }

  function renderArmy(army) {
    var p = army.parsed, h = p.header;
    setChrome(h.name || 'Armata', true);
    var html = '<section class="card army-head">';
    html += '<h2>' + esc(h.name || 'Armata') + '</h2>';
    html += '<div class="muted">' + esc([h.faction, h.subfaction].filter(Boolean).join(' – ')) + '</div>';
    html += '<div class="army-meta">';
    html += '<span class="chip accent">' + fmtPts(h.points != null ? h.points : p.totalPoints) + '</span>';
    if (h.gameSize) html += '<span class="chip">' + esc(h.gameSize.name) + (h.gameSize.points ? ' (' + fmtPts(h.gameSize.points) + ')' : '') + '</span>';
    h.detachments.forEach(function (d) { html += '<span class="chip">' + esc(d.name) + (d.points != null ? ' · ' + d.points + ' DP' : '') + '</span>'; });
    h.other.forEach(function (o) { html += '<span class="chip">' + esc(o) + '</span>'; });
    html += '<span class="chip">' + plural(army.flat.length, 'unità', 'unità') + '</span>';
    html += '</div></section>';

    if (p.warnings.length) {
      html += '<details class="notice warn"><summary>' + plural(p.warnings.length, 'avviso', 'avvisi') + ' nel parsing</summary><ul>' +
        p.warnings.map(function (w) { return '<li>' + esc(w) + '</li>'; }).join('') + '</ul></details>';
    }
    if (dbError) html += '<div class="notice warn">' + esc(dbError) + '</div>';

    if (fasiFor(army)) {
      html += '<a class="btn primary block phases-cta" href="#/army/' + esc(army.id) + '/fasi">Fasi di gioco: cosa posso attivare</a>';
    }
    html += '<input type="search" id="filter" placeholder="Cerca per nome, arma o keyword" value="' + esc(filterText) + '" autocomplete="off" autocapitalize="off">';

    if (p.attached.length) {
      html += '<h2 class="section-title">Attached units</h2>';
      p.attached.forEach(function (g) {
        var pts = g.units.reduce(function (s, u) { return s + (u.points || 0); }, 0);
        html += '<section class="card group" data-group><div class="group-label">Gruppo ' + g.index + ' · ' + fmtPts(pts) + '</div>' +
          g.units.map(function (u) { return unitRow(army, u); }).join('') + '</section>';
      });
    }
    p.sections.forEach(function (s) {
      html += '<h2 class="section-title">' + esc(s.title) + '</h2><section class="card group" data-group>' +
        s.units.map(function (u) { return unitRow(army, u); }).join('') + '</section>';
    });
    if (p.others.length) {
      html += '<h2 class="section-title">Other datasheets</h2><section class="card group" data-group>' +
        p.others.map(function (u) { return unitRow(army, u); }).join('') + '</section>';
    }
    html += '<p class="muted small" id="no-results" hidden>Nessuna unità corrisponde alla ricerca.</p>';
    html += '<p class="muted small"><span class="dot on"></span>datasheet compilata · <span class="dot"></span>da compilare in data/datasheets.json</p>';
    app.innerHTML = html;

    var input = document.getElementById('filter');
    function applyFilter() {
      filterText = input.value;
      var q = P.normalizeName(filterText);
      var any = false;
      app.querySelectorAll('[data-group]').forEach(function (sec) {
        var visible = 0;
        sec.querySelectorAll('.unit-row').forEach(function (row) {
          var show = !q || row.dataset.search.indexOf(q) !== -1;
          row.hidden = !show;
          if (show) visible++;
        });
        sec.hidden = !visible;
        var title = sec.previousElementSibling;
        if (title && title.classList.contains('section-title')) {
          // nasconde il titolo di sezione se tutti i gruppi successivi sono vuoti
          var n = sec, anyVis = false;
          while (n && n.matches && n.matches('[data-group]')) { if (!n.hidden) anyVis = true; n = n.nextElementSibling; }
          title.hidden = !anyVis;
        }
        if (visible) any = true;
      });
      document.getElementById('no-results').hidden = any;
    }
    input.addEventListener('input', applyFilter);
    if (filterText) applyFilter();
  }

  // ---------- schermata 3: datasheet ----------
  var STAT_KEYS = ['M', 'T', 'Sv', 'W', 'Ld', 'OC'];

  function statBlock(s) {
    var html = '<div class="stats">' + STAT_KEYS.map(function (k) {
      return '<div class="stat"><div class="k">' + k + '</div><div class="v">' + esc(s && s[k] ? s[k] : '—') + '</div></div>';
    }).join('') + '</div>';
    if (s && s.Inv) html += '<div class="inv"><b>' + esc(s.Inv) + '</b> Tiro salvezza invulnerabile</div>';
    return html;
  }

  function equippedQty(u, weaponName) {
    var n = P.normalizeName(weaponName);
    var hit = u.wargear.find(function (w) {
      var wn = P.normalizeName(w.name);
      return wn === n || n.indexOf(wn) === 0 || wn.indexOf(n) === 0;
    });
    return hit ? hit.qty : 0;
  }

  function weaponTable(u, rows, kind) {
    if (!rows || !rows.length) return '<p class="empty">Nessun profilo inserito.</p>';
    var cols = kind === 'ranged' ? ['Range', 'A', 'BS', 'S', 'AP', 'D'] : ['A', 'WS', 'S', 'AP', 'D'];
    var head = '<tr><th>Arma</th>' +
      cols.map(function (c) { return '<th>' + c + '</th>'; }).join('') + '</tr>';
    var body = rows.map(function (w) {
      var q = equippedQty(u, w.name);
      return '<tr' + (q ? ' class="equipped"' : '') + '><td>' + (q ? '<span class="qty">' + q + '×</span> ' : '') + esc(w.name) +
        (w.note ? '<span class="note">[' + esc(w.note) + ']</span>' : '') + '</td>' +
        cols.map(function (c) { return '<td>' + esc(w[c] != null && w[c] !== '' ? w[c] : '—') + '</td>'; }).join('') + '</tr>';
    }).join('');
    return '<div class="table-wrap"><table>' + head + body + '</table></div>';
  }

  function abilitiesBlock(list) {
    if (!list || !list.length) return '';
    return list.map(function (a) {
      if (typeof a === 'string') return '<div class="ability"><b>' + esc(a) + '</b></div>';
      return '<div class="ability"><b>' + esc(a.name) + '</b>' + (a.text ? '<p>' + esc(a.text) + '</p>' : '') + '</div>';
    }).join('');
  }

  function renderUnit(army, uid) {
    var u = army.flat[uid];
    if (!u) { go('#/army/' + army.id); return; }
    var e = sheetFor(u.name);
    var filled = hasRules(e);
    setChrome(u.name, true);

    var sub = [fmtPts(u.points), plural(u.models, 'modello', 'modelli')];
    if (u.attachedAs) sub.push(u.attachedAs);
    if (u.warlord) sub.push('Warlord');

    var html = '<article class="card ds">';
    html += '<div class="ds-head"><h2>' + esc(u.name) + '</h2><div class="sub">' + esc(sub.join(' · ')) + '</div></div>';
    html += '<div class="ds-body">';

    if (!filled) {
      html += '<div class="notice warn">Datasheet non ancora compilata in <code>data/datasheets.json</code>. Sotto trovi i dati presi dalla lista; per le regole usa il bottone Wahapedia.</div>';
    }

    // statline (una o più righe profilo)
    var st = e && e.statline;
    if (Array.isArray(st) && st.length) {
      st.forEach(function (s) { html += (s.name ? '<div class="profile-name">' + esc(s.name) + '</div>' : '') + statBlock(s); });
    } else {
      html += statBlock(st);
    }

    // relazioni leader/bodyguard
    if (u._group) {
      var others = u._group.units.filter(function (x) { return x !== u; });
      if (others.length) {
        html += '<h3>' + (/bodyguard/i.test(u.role || '') ? 'Unità aggregate' : 'Si unisce a') + '</h3>';
        html += others.map(function (o) {
          return '<a class="unit-row" style="padding-left:0;padding-right:0" href="#/army/' + esc(army.id) + '/u/' + o._uid + '"><span class="grow"><span class="name">' +
            esc(o.name) + '</span>' + (o.role ? '<span class="role">' + esc(o.role) + '</span>' : '') + '</span><span class="pts">' + fmtPts(o.points) + '</span><span class="chev">›</span></a>';
        }).join('');
      }
    }

    if (u.enhancements.length) {
      html += '<h3>Enhancement</h3>' + u.enhancements.map(function (x) {
        var info = (db.enhancements || {})[x.name] || {};
        return '<div class="ability"><b>' + esc(x.name) + '</b><span class="muted small">' + esc(info.detail || x.detail || '') + '</span>' +
          (info.text ? '<p>' + esc(info.text) + '</p>' : '') + '</div>';
      }).join('');
    }

    html += '<h3>Armi a distanza</h3>' + weaponTable(u, e && e.ranged, 'ranged');
    html += '<h3>Armi da mischia</h3>' + weaponTable(u, e && e.melee, 'melee');

    var ab = (e && e.abilities) || {};
    var abHtml = '';
    function namesOrBlocks(list) {
      // abilità senza testo (solo nome) come etichette, altrimenti blocchi completi
      if (list.every(function (a) { return typeof a === 'string' || !a.text; })) {
        return kwBlock(list.map(function (a) { return typeof a === 'string' ? a : a.name; }));
      }
      return abilitiesBlock(list);
    }
    if (ab.core && ab.core.length) abHtml += '<div class="profile-name">Core</div>' + namesOrBlocks(ab.core);
    if (ab.faction && ab.faction.length) abHtml += '<div class="profile-name">Fazione</div>' + namesOrBlocks(ab.faction);
    var uniche = (ab.uniche || []).filter(function (a) { return !a.tipo; });
    var wargearAb = (ab.uniche || []).filter(function (a) { return a.tipo === 'Wargear'; });
    var info = (ab.uniche || []).filter(function (a) { return a.tipo === 'Info'; });
    if (uniche.length) abHtml += '<div class="profile-name">Uniche</div>' + abilitiesBlock(uniche);
    if (wargearAb.length) abHtml += '<div class="profile-name">Wargear</div>' + abilitiesBlock(wargearAb);
    html += '<h3>Abilities</h3>' + (abHtml || '<p class="empty">Nessuna abilità inserita.</p>');
    if (info.length) html += '<h3>Altre informazioni</h3>' + abilitiesBlock(info);

    // equipaggiamento dalla lista
    html += '<h3>Equipaggiamento (dalla lista)</h3><ul class="wargear-list">';
    u.entries.forEach(function (en) {
      if (en.children.length) {
        html += '<li class="profile"><span class="qty">' + en.qty + '×</span><span>' + esc(en.name) + '</span></li>';
        en.children.forEach(function (c) { html += '<li class="child"><span class="qty">' + c.qty + '×</span><span>' + esc(c.name) + '</span></li>'; });
      } else {
        html += '<li><span class="qty">' + en.qty + '×</span><span>' + esc(en.name) + '</span></li>';
      }
    });
    u.extra.forEach(function (x) { html += '<li><span class="qty">·</span><span>' + esc(x.key ? x.key + ': ' + x.value : x.value) + '</span></li>'; });
    html += '</ul>';

    html += '<h3>Keywords</h3>' + kwBlock(e && e.keywords);
    html += '<h3>Faction keywords</h3>' + kwBlock(e && e.faction_keywords);

    html += '<h3>Punti</h3><p style="margin:0"><b>' + fmtPts(u.points) + '</b> <span class="muted small">(dalla lista, ' + plural(u.models, 'modello', 'modelli') + ')</span></p>';

    html += '<div style="margin-top:18px"><a class="btn primary block" href="' + esc(wahapediaUrl(u.name, e)) + '" target="_blank" rel="noopener">Apri su Wahapedia</a></div>';
    html += '</div></article>';

    app.innerHTML = html;
    window.scrollTo(0, 0);
  }

  function kwBlock(list) {
    if (!list || !list.length) return '<p class="empty">Nessuna keyword inserita.</p>';
    return '<div class="kw">' + list.map(function (k) { return '<span class="chip">' + esc(k) + '</span>'; }).join('') + '</div>';
  }

  // ---------- schermata 4: fasi di gioco ----------
  var KIND_LABEL = { auto: 'Si attiva da sola', scelta: 'Da attivare', strat: 'Stratagemma' };
  var KIND_ORDER = ['auto', 'scelta', 'strat'];
  var KIND_TITLE = { auto: 'Si attivano da sole: ricordatele', scelta: 'Da attivare / scegliere', strat: 'Stratagemmi' };

  function renderPhases(army) {
    var F = fasiFor(army);
    var view = lsGet('l40k.fasi.view', { phase: 'comando', turn: 'mio' });
    if (!F.phases.some(function (p) { return p.id === view.phase; })) view.phase = F.phases[0].id;
    var usedKey = 'l40k.used.' + army.id, cpKey = 'l40k.cp.' + army.id;
    var used = lsGet(usedKey, {});
    var cp = lsGet(cpKey, 0);
    setChrome('Fasi di gioco', true);

    function unitLink(name) {
      var u = army.flat.find(function (x) { return x.name === name; });
      return u ? '<a class="chip unit-chip" href="#/army/' + esc(army.id) + '/u/' + u._uid + '">' + esc(name) + '</a>' : '<span class="chip">' + esc(name) + '</span>';
    }
    function usedId(r) { return r.id + (r.once === 'battaglia' ? '' : '@' + view.turn); }

    var html = '<section class="card phases-top">';
    html += '<div class="seg" role="tablist" aria-label="Turno">' +
      '<button type="button" data-turn="mio" class="' + (view.turn === 'mio' ? 'on' : '') + '">Mio turno</button>' +
      '<button type="button" data-turn="avv" class="' + (view.turn === 'avv' ? 'on' : '') + '">Turno avversario</button></div>';
    html += '<div class="phase-tabs" role="tablist" aria-label="Fase">' + F.phases.map(function (p) {
      var n = rulesFor(p.id).length;
      return '<button type="button" data-phase="' + p.id + '" class="' + (p.id === view.phase ? 'on' : '') + '">' + esc(p.name) + ' <span class="count">' + n + '</span></button>';
    }).join('') + '</div>';
    html += '<div class="cp-row"><span class="muted small">CP</span>' +
      '<button type="button" class="btn cp-btn" data-cp="-1" aria-label="Togli un CP">−</button><b class="cp-val">' + cp + '</b>' +
      '<button type="button" class="btn cp-btn" data-cp="1" aria-label="Aggiungi un CP">+</button>' +
      '<span class="grow"></span><button type="button" class="btn small-btn" id="btn-reset-turn">Nuovo turno</button></div>';
    html += '</section>';

    function rulesFor(phase) {
      return F.rules.filter(function (r) {
        return r.phases.indexOf(phase) !== -1 && (phase === 'inizio' || phase === 'sempre' || r.turn === 'entrambi' || r.turn === view.turn);
      });
    }

    var list = rulesFor(view.phase);
    if (!list.length) html += '<p class="empty">Niente da attivare in questa fase.</p>';
    KIND_ORDER.forEach(function (k) {
      var group = list.filter(function (r) { return r.kind === k; });
      if (!group.length) return;
      html += '<h2 class="section-title">' + KIND_TITLE[k] + '</h2>';
      group.forEach(function (r) {
        var id = usedId(r);
        var isUsed = !!used[id];
        html += '<article class="card rule' + (isUsed ? ' used' : '') + '">';
        html += '<label class="rule-head"><input type="checkbox" data-used="' + esc(id) + '"' + (isUsed ? ' checked' : '') + '>' +
          '<span class="grow"><b class="rule-name">' + esc(r.name) + '</b>' +
          '<span class="rule-src">' + esc(r.source) + '</span></span>' +
          (r.cp != null ? '<span class="cp-badge">' + r.cp + ' CP</span>' : '') + '</label>';
        html += '<div class="badges"><span class="kind kind-' + r.kind + '">' + KIND_LABEL[r.kind] + '</span>' +
          (r.turn === 'entrambi' && view.phase !== 'inizio' && view.phase !== 'sempre' ? '<span class="kind">Entrambi i turni</span>' : '') +
          (r.once === 'battaglia' ? '<span class="kind warn">1 volta per battaglia</span>' : '') +
          (r.once === 'fase' ? '<span class="kind">1 volta per fase</span>' : '') + '</div>';
        var when = r.when.replace(/^quando\s+/i, '');
        html += '<p class="rule-when"><b>Quando:</b> ' + esc(when.charAt(0).toUpperCase() + when.slice(1)) + '</p>';
        html += '<p class="rule-it">' + esc(r.it) + '</p>';
        if (r.units && r.units.length && r.units.length < army.flat.length - 1) {
          html += '<div class="kw rule-units">' + r.units.map(unitLink).join('') + '</div>';
        }
        html += '<details><summary>Testo originale</summary><p class="rule-orig">' + esc(r.text) + '</p></details>';
        html += '</article>';
      });
    });
    html += '<p class="muted small">Spunta le regole già usate. "Nuovo turno" azzera le spunte (non quelle "1 volta per battaglia"); tieni premuto "Nuovo turno" per iniziare una nuova partita.</p>';
    app.innerHTML = html;

    app.querySelectorAll('[data-turn]').forEach(function (b) {
      b.addEventListener('click', function () { view.turn = b.dataset.turn; lsSet('l40k.fasi.view', view); renderPhases(army); });
    });
    app.querySelectorAll('[data-phase]').forEach(function (b) {
      b.addEventListener('click', function () { view.phase = b.dataset.phase; lsSet('l40k.fasi.view', view); renderPhases(army); });
    });
    var active = app.querySelector('.phase-tabs .on');
    if (active && active.scrollIntoView) active.scrollIntoView({ block: 'nearest', inline: 'center' });
    app.querySelectorAll('[data-used]').forEach(function (c) {
      c.addEventListener('change', function () {
        if (c.checked) used[c.dataset.used] = true; else delete used[c.dataset.used];
        lsSet(usedKey, used);
        c.closest('.rule').classList.toggle('used', c.checked);
      });
    });
    app.querySelectorAll('[data-cp]').forEach(function (b) {
      b.addEventListener('click', function () {
        cp = Math.max(0, cp + parseInt(b.dataset.cp, 10));
        lsSet(cpKey, cp);
        app.querySelector('.cp-val').textContent = cp;
      });
    });
    var resetBtn = document.getElementById('btn-reset-turn');
    var pressTimer = null, longPressed = false;
    function startPress() {
      longPressed = false;
      pressTimer = setTimeout(function () {
        longPressed = true;
        if (confirm('Nuova partita? Azzera tutte le spunte (anche "1 volta per battaglia") e i CP.')) {
          lsSet(usedKey, {}); lsSet(cpKey, 0); renderPhases(army); toast('Nuova partita');
        }
      }, 700);
    }
    function endPress() { clearTimeout(pressTimer); }
    resetBtn.addEventListener('pointerdown', startPress);
    resetBtn.addEventListener('pointerup', endPress);
    resetBtn.addEventListener('pointerleave', endPress);
    resetBtn.addEventListener('contextmenu', function (e) { e.preventDefault(); });
    resetBtn.addEventListener('click', function () {
      if (longPressed) return;
      Object.keys(used).forEach(function (k) { if (k.indexOf('@') !== -1) delete used[k]; });
      lsSet(usedKey, used);
      renderPhases(army);
      toast('Spunte del turno azzerate');
    });
  }

  // ---------- avvio ----------
  applyTheme(getTheme());
  // primo avvio: importa la lista inclusa nell'app
  (getLists().length ? Promise.resolve() : fetch('data/lista-templari.txt')
    .then(function (r) { if (!r.ok) throw new Error(); return r.text(); })
    .then(function (t) { var p = P.parseList(t); if (p.ok) saveList(t, p); })
    .catch(function () {})
  ).then(route);

  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    window.addEventListener('load', function () {
      navigator.serviceWorker.register('service-worker.js').catch(function (err) {
        console.warn('Service worker non registrato:', err);
      });
    });
  }
})();
