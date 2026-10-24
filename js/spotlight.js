/*
 * Table Spotlight: one table in the middle with every column described, the tables it
 * points to on the left and the tables pointing to it on the right, wired column to column.
 */
(function () {
  'use strict';

  var X = window.SchemaExplorer;
  var $ = function (id) { return document.getElementById(id); };
  var esc = X.esc;
  var fmt = X.fmt;
  var root = $('spot');
  var history = [];
  var current = null;
  var opts = { allCols: false, guessed: true };
  var resizeObs = null;
  var zoom = 1;
  var pinned = null;

  function S() { return X.S; }

  function relsOf(name) {
    var g = S().g;
    var keep = function (r) { return r.kind !== 'view' && !r.missingTarget && (opts.guessed || r.kind === 'fk'); };
    return {
      out: g.relations.filter(function (r) { return r.from === name && r.to !== name && keep(r); }),
      inn: g.relations.filter(function (r) { return r.to === name && r.from !== name && keep(r); }),
      self: g.relations.filter(function (r) { return r.from === name && r.to === name && r.kind !== 'view'; }),
      views: g.relations.filter(function (r) { return r.kind === 'view' && r.to === name; })
    };
  }

  function ruleClass(r) {
    if (r.kind === 'inferred') return 'guess';
    if (r.onDelete === 'CASCADE') return 'cascade';
    if (/SET/.test(r.onDelete || '')) return 'setnull';
    return 'restrict';
  }

  function ruleLabel(r) {
    if (r.kind === 'inferred') return 'guessed';
    return (r.onDelete || 'restrict').toLowerCase();
  }

  function keyTags(t, c, fkKind) {
    var s = '';
    if (t.primaryKey.indexOf(c.name) >= 0) s += '<span class="tag pk">PK</span>';
    if (fkKind) s += '<span class="tag ' + (fkKind === 'fk' ? 'fk' : 'inf') + '">' + (fkKind === 'fk' ? 'FK' : 'FK?') + '</span>';
    if (t.indexes.some(function (i) { return i.type === 'UNIQUE' && i.columns.length === 1 && i.columns[0] === c.name; })) s += '<span class="tag uq">UQ</span>';
    return s;
  }

  function shortType(c) {
    return c.type.replace(' unsigned', '').replace(/^(varchar|char)\((\d+)\)/, '$1($2)');
  }

  // ---------- cards ----------

  function mainCard(name) {
    var g = S().g;
    var t = g.model.tables[name];
    var v = g.model.views[name];
    var color = X.colorOf(name);
    var r = relsOf(name);
    var fkOf = {};
    r.out.concat(r.self).forEach(function (x) { x.cols.forEach(function (c) { fkOf[c] = x; }); });
    var h = '<div class="sp-card sp-main" style="--c:' + color + '">';
    h += '<div class="sp-card-head"><span class="sp-dot"></span><span class="sp-name">' + esc(name) + '</span><span class="sp-meta">' +
      (t ? t.columns.length + ' columns' + (t.rows != null ? ' &middot; ' + fmt(t.rows) + ' rows' : '') : 'view') + '</span></div>';
    if (!t) {
      h += '<pre class="code" style="margin:10px">' + esc(v ? v.sql : '') + '</pre></div>';
      return h;
    }
    t.columns.forEach(function (c) {
      var rel = fkOf[c.name];
      var d = SchemaModel.describeColumn(g, name, c);
      var isPk = t.primaryKey.indexOf(c.name) >= 0;
      h += '<div class="sp-row' + (isPk ? ' is-pk' : '') + (rel ? ' is-fk' : '') + '" data-col="' + esc(c.name) + '">' +
        '<div class="sp-row-top"><span class="sp-tags">' + keyTags(t, c, rel && rel.kind) + '</span><span class="sp-col">' + esc(c.name) + '</span>' +
        '<span class="sp-type">' + esc(shortType(c)) + (c.nullable ? '<i title="can be empty">?</i>' : '') + '</span></div>' +
        '<div class="sp-desc' + (d.auto ? ' auto' : '') + '"' + (d.auto ? ' title="Written from the column name. Add a COMMENT to the column to replace it."' : '') + '>' + esc(d.text) +
        (c.default != null && c.default !== 'NULL' && !c.autoIncrement ? ' <span class="sp-default">default ' + esc(c.default) + '</span>' : '') + '</div></div>';
    });
    h += '</div>';
    return h;
  }

  function sideCard(other, rels, side, idx) {
    var g = S().g;
    var t = g.model.tables[other];
    var color = X.colorOf(other);
    var cols = [];
    rels.forEach(function (r) {
      (side === 'left' ? r.refCols : r.cols).forEach(function (c) { if (cols.indexOf(c) < 0) cols.push(c); });
    });
    var shown = opts.allCols && t ? t.columns.map(function (c) { return c.name; }) : cols;
    var issues = S().issues.byTable[other];
    var h = '<div class="sp-card sp-side" data-table="' + esc(other) + '" style="--c:' + color + ';--i:' + idx + '">';
    h += '<div class="sp-card-head" data-nav="' + esc(other) + '" title="Spotlight ' + esc(other) + '"><span class="sp-dot"></span><span class="sp-name">' + esc(other) + '</span>' +
      (issues ? '<span class="sp-flag sev-' + (issues.high ? 'high' : issues.medium ? 'medium' : 'low') + '" title="' + issues.list.length + ' problems">!</span>' : '') +
      '<span class="sp-meta">' + (t && t.rows != null ? fmt(t.rows) + ' rows' : '') + '</span></div>';
    shown.forEach(function (cn) {
      var c = t && t.columns.find(function (x) { return x.name === cn; });
      var linked = cols.indexOf(cn) >= 0;
      var rel = rels.find(function (r) { return (side === 'left' ? r.refCols : r.cols).indexOf(cn) >= 0; });
      h += '<div class="sp-row sp-mini' + (linked ? ' linked' : '') + '" data-col="' + esc(cn) + '">' +
        '<span class="sp-col">' + esc(cn) + '</span><span class="sp-type">' + esc(c ? shortType(c) : '') + '</span>' +
        (linked && rel ? '<span class="sp-rule r-' + ruleClass(rel) + '">' + esc(ruleLabel(rel)) + '</span>' : '') + '</div>';
    });
    if (t && !opts.allCols && t.columns.length > shown.length) h += '<div class="sp-more">+' + (t.columns.length - shown.length) + ' more columns</div>';
    h += '</div>';
    return h;
  }

  function groupBy(rels, key) {
    var map = {};
    var order = [];
    rels.forEach(function (r) {
      var k = r[key];
      if (!map[k]) { map[k] = []; order.push(k); }
      map[k].push(r);
    });
    return order.map(function (k) { return { table: k, rels: map[k] }; });
  }

  // ---------- render ----------

  function open(name, fromHistory) {
    var g = S().g;
    if (!g || (!g.model.tables[name] && !g.model.views[name])) return;
    if (current && current !== name && !fromHistory) history.push(current);
    current = name;
    root.classList.add('on');
    render();
    try { window.history.replaceState(null, '', '#spot=' + encodeURIComponent(name)); } catch (e) { /* file:// */ }
  }

  function close() {
    root.classList.remove('on');
    root.innerHTML = '';
    current = null;
    history = [];
    if (resizeObs) resizeObs.disconnect();
    try { window.history.replaceState(null, '', '#'); } catch (e) { /* file:// */ }
  }

  function back() {
    var prev = history.pop();
    if (prev) open(prev, true); else close();
  }

  function render() {
    var name = current;
    var g = S().g;
    var t = g.model.tables[name];
    var r = relsOf(name);
    var parents = groupBy(r.out, 'to');
    var children = groupBy(r.inn, 'from');
    var issues = S().issues.byTable[name];
    var impact = t ? SchemaModel.deleteImpact(g, name) : null;
    var uniq = function (list) { var seen = {}; return list.filter(function (x) { if (seen[x.table]) return false; seen[x.table] = true; return true; }); };

    var h = '<div class="sp-top">';
    h += '<button class="small" id="spBack" title="Back (Backspace)">&larr;</button>';
    h += '<div class="sp-title"><div class="sp-crumbs">' + history.slice(-4).map(function (n) { return '<a class="lnk" data-nav="' + esc(n) + '">' + esc(n) + '</a> &rsaquo; '; }).join('') +
      '<b class="mono">' + esc(name) + '</b> <span class="sp-group" style="--c:' + X.colorOf(name) + '">' + esc(X.groupOf(name) || '') + '</span>' +
      (issues ? ' <a class="sp-issue-link" id="spIssueLink" title="Show the problems and fixes">' + X.issueSummaryChips(issues) + '</a>' : '') + '</div>' +
      '<div class="sp-summary">' + esc(t ? SchemaModel.describeTable(g, name) : 'View built from ' + (g.model.views[name].refs.join(', ') || 'other tables') + '.') + '</div></div>';
    h += '<div class="sp-actions">' +
      '<label class="check"><input type="checkbox" id="spAll"' + (opts.allCols ? ' checked' : '') + '> all columns</label>' +
      '<label class="check"><input type="checkbox" id="spGuess"' + (opts.guessed ? ' checked' : '') + '> guessed links</label>' +
      '<button class="small" id="spMap">On the map</button>' +
      (t ? '<button class="small" id="spImpact">Delete impact</button><button class="small" id="spSelect">Copy SELECT</button>' : '') +
      '<button class="small" id="spFull" title="Full screen (P)"><span class="not-present">Full screen</span><span class="only-present">Exit full screen</span></button>' +
      '<button class="small" id="spClose" title="Close (Esc)">&times;</button></div>';
    h += '</div>';

    h += '<div class="sp-body" id="spBody"><div class="sp-stage" id="spStage"><div class="sp-canvas' + (parents.length > 9 ? ' wide-left' : '') + (children.length > 9 ? ' wide-right' : '') + '" id="spCanvas"><svg class="sp-lines" id="spLines"></svg>';
    h += '<div class="sp-col-wrap sp-left' + (parents.length > 9 ? ' many' : '') + '"><div class="sp-col-title">Points to <b>' + parents.length + '</b></div>' +
      (parents.length ? parents.map(function (p, i) { return sideCard(p.table, p.rels, 'left', i); }).join('') : '<div class="sp-empty">This table points to no other table.</div>') + '</div>';
    h += '<div class="sp-col-wrap sp-center"><div class="sp-col-title">' + esc(name) + '</div>';
    if (issues) {
      h += '<details class="sp-panel sp-issues" id="spIssues"><summary><span class="sp-panel-title" style="display:inline">Problems and fixes</span> ' + X.issueSummaryChips(issues) +
        '<div class="sp-issue-titles">' + issues.list.map(function (i) { return '<div>' + esc(i.title) + (i.column ? ' <code>' + esc(i.column) + '</code>' : '') + '</div>'; }).join('') + '</div></summary>' +
        issues.list.map(function (i) { return X.issueHtml(i, false); }).join('') + '</details>';
    }
    h += mainCard(name);

    if (r.self.length) h += '<div class="sp-note">Points to itself through ' + r.self.map(function (x) { return '<code>' + esc(x.cols.join(', ')) + '</code>'; }).join(', ') + ' (a tree, such as parent and child rows).</div>';
    var morphs = g.morphs.filter(function (x) { return x.table === name; });
    if (morphs.length) h += '<div class="sp-note">Polymorphic link' + (morphs.length > 1 ? 's' : '') + ': ' + morphs.map(function (x) { return '<code>' + esc(x.typeCol + ' + ' + x.idCol) + '</code>'; }).join(', ') + '. Each row can point to a different table.</div>';
    if (r.views.length) h += '<div class="sp-note">Used by view' + (r.views.length > 1 ? 's' : '') + ': ' + r.views.map(function (x) { return '<a class="lnk mono" data-nav="' + esc(x.from) + '">' + esc(x.from) + '</a>'; }).join(', ') + '.</div>';

    if (impact) {
      var cas = uniq(impact.cascade), nul = uniq(impact.setNull), res = uniq(impact.restrict);
      h += '<div class="sp-panel"><div class="sp-panel-title">Deleting one row</div><div class="sp-impact">' +
        '<div><b class="c-danger">' + cas.length + '</b> tables lose rows</div><div><b class="c-warn">' + nul.length + '</b> get a field emptied</div><div><b class="c-purple">' + res.length + '</b> can block it</div></div>' +
        (cas.length ? '<div class="sp-chips">' + cas.map(function (x) { return '<a class="chip" data-nav="' + esc(x.table) + '">' + esc(x.table) + '</a>'; }).join('') + '</div>' : '') + '</div>';
    }
    if (t && t.indexes.length) {
      h += '<div class="sp-panel"><div class="sp-panel-title">Indexes</div>' + t.indexes.map(function (i) {
        return '<div class="sp-idx"><span class="tag ' + (i.type === 'UNIQUE' ? 'uq' : 'ix') + '">' + esc(i.type) + '</span> <span class="mono">' + esc(i.columns.join(', ')) + '</span> <small class="hint">' + esc(i.name || '') + '</small></div>';
      }).join('') + '</div>';
    }
    h += '</div>';
    h += '<div class="sp-col-wrap sp-right' + (children.length > 9 ? ' many' : '') + '"><div class="sp-col-title">Pointed to by <b>' + children.length + '</b></div>' +
      (children.length ? children.map(function (c, i) { return sideCard(c.table, c.rels, 'right', i); }).join('') : '<div class="sp-empty">No table points to this one.</div>') + '</div>';
    h += '</div></div></div>';

    h += '<div class="sp-zoom" id="spZoom"><button data-z="out" title="Zoom out (-)">&minus;</button><button data-z="100" id="spZoomVal" title="Actual size (1)">100%</button>' +
      '<button data-z="in" title="Zoom in (+)">+</button><button data-z="fit" title="Fit everything (0)">Fit</button></div>';

    h += '<div class="sp-legend"><span><i class="ln r-cascade"></i>cascade</span><span><i class="ln r-setnull"></i>set null</span><span><i class="ln r-restrict"></i>restrict</span><span><i class="ln r-guess"></i>guessed, no foreign key</span>' +
      '<span class="hint">Click a table name to step into it. Hover or click a column to trace its links. Ctrl + wheel or pinch to zoom, drag the background to move.</span></div>';

    root.innerHTML = h;
    pinned = null;
    bind(name, r);
    layoutStage();
    $('spBody').scrollTop = 0;
    $('spBody').scrollLeft = 0;
    requestAnimationFrame(function () { layoutStage(); drawLines(); });
    if (resizeObs) resizeObs.disconnect();
    if (window.ResizeObserver) {
      resizeObs = new ResizeObserver(function () { layoutStage(); drawLines(); });
      resizeObs.observe($('spCanvas'));
      resizeObs.observe($('spBody'));
    }
  }

  // ---------- zoom and pan ----------

  // The canvas is laid out at the width of the view, then scaled; the stage around it
  // takes the scaled size so the scrollbars stay right.
  function layoutStage() {
    var body = $('spBody'), stage = $('spStage'), canvas = $('spCanvas');
    if (!body || !canvas) return;
    var w = body.clientWidth + 'px';
    if (canvas.style.width !== w) canvas.style.width = w;
    canvas.style.transform = 'scale(' + zoom + ')';
    stage.style.width = Math.round(canvas.offsetWidth * zoom) + 'px';
    stage.style.height = Math.round(canvas.offsetHeight * zoom) + 'px';
    var label = $('spZoomVal');
    if (label) label.textContent = Math.round(zoom * 100) + '%';
  }

  function setZoom(z, cx, cy) {
    var body = $('spBody');
    if (!body) return;
    z = Math.max(0.25, Math.min(2.5, z));
    if (cx == null) { cx = body.clientWidth / 2; cy = body.clientHeight / 2; }
    var px = (body.scrollLeft + cx) / zoom, py = (body.scrollTop + cy) / zoom;
    zoom = z;
    layoutStage();
    body.scrollLeft = px * z - cx;
    body.scrollTop = py * z - cy;
  }

  function fitAll() {
    var body = $('spBody'), canvas = $('spCanvas');
    if (!body || !canvas) return;
    setZoom(Math.min(1, body.clientWidth / canvas.offsetWidth, body.clientHeight / canvas.offsetHeight), 0, 0);
    body.scrollLeft = 0;
    body.scrollTop = 0;
  }

  function zoomAction(kind) {
    if (kind === 'in') setZoom(zoom * 1.2);
    else if (kind === 'out') setZoom(zoom / 1.2);
    else if (kind === 'fit') fitAll();
    else if (kind === '100') setZoom(1);
  }

  function bindZoom() {
    var body = $('spBody');
    $('spZoom').querySelectorAll('[data-z]').forEach(function (b) { b.onclick = function () { zoomAction(b.dataset.z); }; });
    body.addEventListener('wheel', function (e) {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      var r = body.getBoundingClientRect();
      setZoom(zoom * Math.exp(-e.deltaY * 0.0022), e.clientX - r.left, e.clientY - r.top);
    }, { passive: false });
    var drag = null;
    body.addEventListener('mousedown', function (e) {
      if (e.button !== 0 || e.target.closest('.sp-card, .sp-panel, .sp-note, button, a, input, label, pre, .chip')) return;
      drag = { x: e.clientX, y: e.clientY, l: body.scrollLeft, t: body.scrollTop };
      body.classList.add('dragging');
      e.preventDefault();
    });
    window.addEventListener('mousemove', function (e) {
      if (!drag) return;
      body.scrollLeft = drag.l - (e.clientX - drag.x);
      body.scrollTop = drag.t - (e.clientY - drag.y);
    });
    window.addEventListener('mouseup', function () {
      if (!drag) return;
      drag = null;
      body.classList.remove('dragging');
    });
  }

  // ---------- wiring ----------

  var links = [];

  // position inside the canvas from layout offsets, so the scale does not matter
  function anchor(el, side) {
    var canvas = $('spCanvas');
    var x = 0, y = 0, n = el;
    while (n && n !== canvas) { x += n.offsetLeft; y += n.offsetTop; n = n.offsetParent; }
    return { x: side === 'right' ? x + el.offsetWidth : x, y: y + el.offsetHeight / 2 };
  }

  function drawLines() {
    var canvas = $('spCanvas');
    var svg = $('spLines');
    if (!canvas || !svg || !current) return;
    svg.setAttribute('width', canvas.scrollWidth);
    svg.setAttribute('height', canvas.scrollHeight);
    var main = canvas.querySelector('.sp-main');
    var r = relsOf(current);
    var paths = [];
    links = [];
    var rowIn = function (card, col) { return card && card.querySelector('.sp-row[data-col="' + cssEsc(col) + '"]'); };

    r.out.forEach(function (rel) {
      var card = canvas.querySelector('.sp-left .sp-side[data-table="' + cssEsc(rel.to) + '"]');
      rel.cols.forEach(function (c, i) {
        var from = rowIn(main, c);
        var to = rowIn(card, rel.refCols[i] || 'id') || (card && card.querySelector('.sp-card-head'));
        if (from && to) links.push({ a: anchor(to, 'right'), b: anchor(from, 'left'), cls: ruleClass(rel), mainCol: c, other: rel.to, otherCol: rel.refCols[i] || 'id', title: rel.from + '.' + c + ' -> ' + rel.to + '.' + (rel.refCols[i] || 'id') + ' (' + ruleLabel(rel) + ')' });
      });
    });
    r.inn.forEach(function (rel) {
      var card = canvas.querySelector('.sp-right .sp-side[data-table="' + cssEsc(rel.from) + '"]');
      rel.cols.forEach(function (c, i) {
        var from = rowIn(main, rel.refCols[i] || 'id') || main.querySelector('.sp-card-head');
        var to = rowIn(card, c) || (card && card.querySelector('.sp-card-head'));
        if (from && to) links.push({ a: anchor(from, 'right'), b: anchor(to, 'left'), cls: ruleClass(rel), mainCol: rel.refCols[i] || 'id', other: rel.from, otherCol: c, title: rel.from + '.' + c + ' -> ' + rel.to + '.' + (rel.refCols[i] || 'id') + ' (' + ruleLabel(rel) + ')' });
      });
    });
    r.self.forEach(function (rel) {
      rel.cols.forEach(function (c, i) {
        var from = rowIn(main, c), to = rowIn(main, rel.refCols[i] || 'id');
        if (from && to) links.push({ self: true, a: anchor(from, 'right'), b: anchor(to, 'right'), cls: ruleClass(rel), mainCol: c, other: current, otherCol: rel.refCols[i] || 'id', title: 'self: ' + c + ' -> ' + (rel.refCols[i] || 'id') });
      });
    });

    links.forEach(function (l, i) {
      var d;
      if (l.self) {
        var bulge = 46;
        d = 'M' + l.a.x + ',' + l.a.y + ' C' + (l.a.x + bulge) + ',' + l.a.y + ' ' + (l.b.x + bulge) + ',' + l.b.y + ' ' + l.b.x + ',' + l.b.y;
      } else {
        var dx = Math.max(40, (l.b.x - l.a.x) * 0.5);
        d = 'M' + l.a.x + ',' + l.a.y + ' C' + (l.a.x + dx) + ',' + l.a.y + ' ' + (l.b.x - dx) + ',' + l.b.y + ' ' + l.b.x + ',' + l.b.y;
      }
      paths.push('<path class="sp-line r-' + l.cls + '" data-l="' + i + '" d="' + d + '"><title>' + esc(l.title) + '</title></path>' +
        '<circle class="sp-end r-' + l.cls + '" data-l="' + i + '" cx="' + l.a.x + '" cy="' + l.a.y + '" r="3"></circle>' +
        '<circle class="sp-end r-' + l.cls + '" data-l="' + i + '" cx="' + l.b.x + '" cy="' + l.b.y + '" r="3"></circle>');
    });
    svg.innerHTML = paths.join('');
  }

  function cssEsc(s) { return String(s).replace(/["\\]/g, '\\$&'); }

  function trace(match) {
    var svg = $('spLines');
    var canvas = $('spCanvas');
    if (!svg) return;
    canvas.classList.toggle('tracing', !!match);
    svg.querySelectorAll('[data-l]').forEach(function (el) {
      var l = links[+el.dataset.l];
      el.classList.toggle('on', !!match && match(l));
    });
    canvas.querySelectorAll('.sp-row, .sp-side').forEach(function (el) { el.classList.remove('lit'); });
    if (!match) return;
    links.forEach(function (l) {
      if (!match(l)) return;
      var main = canvas.querySelector('.sp-main');
      var mr = main.querySelector('.sp-row[data-col="' + cssEsc(l.mainCol) + '"]');
      if (mr) mr.classList.add('lit');
      var card = canvas.querySelector('.sp-side[data-table="' + cssEsc(l.other) + '"]');
      if (card) {
        card.classList.add('lit');
        var orow = card.querySelector('.sp-row[data-col="' + cssEsc(l.otherCol) + '"]');
        if (orow) orow.classList.add('lit');
      }
    });
  }

  function bind(name, r) {
    $('spBack').onclick = back;
    $('spClose').onclick = close;
    $('spFull').onclick = function () { X.present(); };
    $('spMap').onclick = function () { close(); X.setFocus(name, 1); };
    if ($('spImpact')) $('spImpact').onclick = function () { close(); X.impactOf(name); };
    if ($('spSelect')) $('spSelect').onclick = function () {
      var used = {};
      var alias = function (n) { var a = n.split('_').map(function (p) { return p[0]; }).join(''); var b = a, i = 2; while (used[a]) a = b + (i++); used[a] = true; return a; };
      var me = alias(name);
      var lines = ['SELECT ' + me + '.*', 'FROM `' + name + '` ' + me];
      r.out.forEach(function (rel) {
        var a = alias(rel.to);
        if (rel.kind === 'inferred') lines.push('-- guessed link, no foreign key:');
        lines.push('LEFT JOIN `' + rel.to + '` ' + a + ' ON ' + rel.cols.map(function (c, i) { return a + '.`' + (rel.refCols[i] || 'id') + '` = ' + me + '.`' + c + '`'; }).join(' AND '));
      });
      X.copy(lines.join('\n') + ';', 'SELECT with every parent table copied');
    };
    $('spAll').onchange = function () { opts.allCols = this.checked; render(); };
    $('spGuess').onchange = function () { opts.guessed = this.checked; render(); };
    root.querySelectorAll('[data-nav]').forEach(function (el) {
      el.onclick = function () { open(el.dataset.nav); };
    });
    var canvas = $('spCanvas');
    var byCol = function (c) { return function (l) { return l.mainCol === c; }; };
    var byTable = function (t) { return function (l) { return l.other === t; }; };
    var restore = function () { trace(pinned ? pinned.match : null); };
    var pin = function (key, match, el) {
      canvas.querySelectorAll('.pinned').forEach(function (x) { x.classList.remove('pinned'); });
      if (pinned && pinned.key === key) { pinned = null; } else { pinned = { key: key, match: match }; el.classList.add('pinned'); }
      restore();
    };
    canvas.querySelectorAll('.sp-main .sp-row').forEach(function (row) {
      var c = row.dataset.col;
      row.onmouseenter = function () { trace(byCol(c)); };
      row.onmouseleave = restore;
      row.onclick = function () { pin('c:' + c, byCol(c), row); };
    });
    canvas.querySelectorAll('.sp-side').forEach(function (card) {
      var t = card.dataset.table;
      card.onmouseenter = function () { trace(byTable(t)); };
      card.onmouseleave = restore;
      card.onclick = function (e) { if (!e.target.closest('[data-nav]')) pin('t:' + t, byTable(t), card); };
    });
    bindZoom();
    if ($('spIssues')) {
      X.bindProblemButtons($('spIssues'));
      $('spIssueLink').onclick = function () { $('spIssues').open = true; $('spIssues').scrollIntoView({ behavior: 'smooth', block: 'start' }); };
    }
  }

  // keys while the spotlight is open
  document.addEventListener('keydown', function (e) {
    if (!current) return;
    var typing = /INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName) && document.activeElement.type !== 'checkbox';
    if ($('cmdDlg').open || $('importDlg').open) return;
    if (e.key === 'Escape') { e.preventDefault(); close(); }
    else if ((e.key === 'Backspace' && !typing) || (e.key === 'ArrowLeft' && e.altKey)) { e.preventDefault(); back(); }
    else if ((e.key === 'p' || e.key === 'P') && !typing && !e.ctrlKey && !e.metaKey) X.present();
    else if (!typing && !e.ctrlKey && !e.metaKey && (e.key === '+' || e.key === '=')) { e.preventDefault(); zoomAction('in'); }
    else if (!typing && !e.ctrlKey && !e.metaKey && e.key === '-') { e.preventDefault(); zoomAction('out'); }
    else if (!typing && !e.ctrlKey && !e.metaKey && e.key === '0') { e.preventDefault(); zoomAction('fit'); }
    else if (!typing && !e.ctrlKey && !e.metaKey && e.key === '1') { e.preventDefault(); zoomAction('100'); }
  });

  window.Spotlight = {
    open: open,
    close: close,
    isOpen: function () { return !!current; },
    refresh: function () { if (current) { layoutStage(); drawLines(); } },
    zoom: function (z) { if (z == null) return zoom; setZoom(z); }
  };

  var hm = location.hash.match(/spot=([^&]+)/);
  if (hm) setTimeout(function () { open(decodeURIComponent(hm[1])); }, 80);
})();
