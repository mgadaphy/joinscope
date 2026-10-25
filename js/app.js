/* Joinscope UI. Depends on cytoscape, cytoscape-fcose, SchemaParser and SchemaModel. */
(function () {
  'use strict';

  var $ = function (id) { return document.getElementById(id); };
  var esc = function (s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  };
  var store = {
    get: function (k, d) { try { var v = localStorage.getItem('joinscope:' + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set: function (k, v) { try { localStorage.setItem('joinscope:' + k, JSON.stringify(v)); return true; } catch (e) { return false; } }
  };
  var fmt = function (n) { return n == null ? '' : Number(n).toLocaleString(); };

  var PALETTE = ['#4e79a7', '#f28e2b', '#e15759', '#59a14f', '#b07aa1', '#2f9ec4', '#edc948', '#9c755f', '#ff9da7', '#76b7b2',
    '#d37295', '#8cd17d', '#a0cbe8', '#f1ce63', '#86bcb6', '#c9a227', '#7f8fd6', '#e6894f', '#5fb39b', '#c58dd8'];
  var NEUTRAL = '#9aa3ad';

  if (typeof cytoscapeFcose !== 'undefined') cytoscape.use(cytoscapeFcose);

  var S = {
    schemas: [],
    current: null,
    g: null,
    opts: Object.assign({ layout: 'fcose', group: 'domain', hub: 20, inferred: true, views: true, boxes: false, er: false, erCols: 'keys', isolated: false, spacing: 1, problems: false, effects: !(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) }, store.get('opts', {})),
    hiddenGroups: {},
    shownHubs: {},
    focus: null,
    selected: null,
    overlay: null,
    issues: { list: [], byTable: {} },
    d: null
  };
  var cy;

  // ---------- schemas ----------

  function addSchema(entry, persist) {
    S.schemas = S.schemas.filter(function (s) { return s.id !== entry.id; });
    S.schemas.push(entry);
    if (persist) {
      var saved = store.get('schemas', []).filter(function (s) { return s.id !== entry.id; });
      saved.push({ id: entry.id, name: entry.name, when: entry.when, model: entry.model });
      if (!store.set('schemas', saved)) toast('Loaded, but too big to remember after closing the page.');
    }
    fillSchemaSelects();
  }

  function forgetSchema(id) {
    store.set('schemas', store.get('schemas', []).filter(function (s) { return s.id !== id; }));
    S.schemas = S.schemas.filter(function (s) { return s.id !== id; });
    fillSchemaSelects();
    loadSchema(S.schemas[0] ? S.schemas[0].id : null);
  }

  function fillSchemaSelects() {
    var optOf = function (s) { return '<option value="' + esc(s.id) + '">' + esc(s.name) + '</option>'; };
    var opts = S.schemas.map(optOf).join('');
    var real = S.schemas.filter(function (s) { return !s.transient; }).map(optOf).join('');
    var keepA = $('cmpA').value, keepB = $('cmpB').value;
    $('schemaSelect').innerHTML = opts + '<option value="__forget">Forget this imported schema</option>';
    $('cmpA').innerHTML = real;
    $('cmpB').innerHTML = real;
    if (S.current) $('schemaSelect').value = S.current.id;
    var realList = S.schemas.filter(function (s) { return !s.transient; });
    if (realList[1]) $('cmpB').value = realList[realList.length - 1].id;
    if (keepA && realList.some(function (s) { return s.id === keepA; })) $('cmpA').value = keepA;
    if (keepB && realList.some(function (s) { return s.id === keepB; })) $('cmpB').value = keepB;
  }

  function loadSchema(id) {
    var entry = S.schemas.find(function (s) { return s.id === id; });
    if (!entry) { $('statusBar').textContent = 'No schema loaded. Use Import.'; return; }
    S.current = entry;
    S.g = SchemaModel.build(entry.model);
    var dialectLabel = document.querySelector('header h1 span');
    if (dialectLabel) dialectLabel.textContent = entry.diff ? 'Compare' : (DIALECT_NAMES[entry.model.dialect] || 'MySQL / MariaDB');
    S.issues = SchemaModel.issues(S.g);
    renderIssueBadge();
    S.hiddenGroups = {};
    S.shownHubs = {};
    S.focus = null;
    S.overlay = null;
    S.selected = null;
    store.set('lastSchema', id);
    $('schemaSelect').value = id;
    $('tableList').innerHTML = S.g.names.concat(Object.keys(entry.model.views)).map(function (n) { return '<option value="' + esc(n) + '">'; }).join('');
    $('details').classList.remove('on');
    $('pathOut').innerHTML = '';
    $('impactOut').innerHTML = '';
    recompute();
    render(true);
    renderInsights();
  }

  // ---------- derived state ----------

  function recompute() {
    var g = S.g;
    var rels = SchemaModel.activeRelations(g, S.opts);
    var hubs = SchemaModel.hubs(g.names, rels.filter(function (r) { return r.kind !== 'view'; }), S.opts.hub);
    var groups;
    if (S.opts.group === 'domain') groups = SchemaModel.domainGroups(g, rels);
    else if (S.opts.group === 'cluster') groups = SchemaModel.clusterGroups(g, rels, hubs);
    else groups = {};
    var nodeNames = g.names.slice();
    if (S.opts.views) nodeNames = nodeNames.concat(Object.keys(g.model.views));
    var counts = {};
    nodeNames.forEach(function (n) {
      var k = g.model.views[n] ? 'views' : (groups[n] || 'all tables');
      groups[n] = k;
      counts[k] = (counts[k] || 0) + 1;
    });
    var list = Object.keys(counts).sort(function (a, b) {
      var na = /^(other|no links|views)$/.test(a), nb = /^(other|no links|views)$/.test(b);
      if (na !== nb) return na ? 1 : -1;
      return counts[b] - counts[a] || (a < b ? -1 : 1);
    });
    var colors = {};
    var pi = 0;
    list.forEach(function (k) { colors[k] = /^(other|no links|views|all tables)$/.test(k) ? NEUTRAL : PALETTE[pi++ % PALETTE.length]; });
    S.d = {
      rels: rels,
      hubs: hubs,
      groups: groups,
      groupList: list.map(function (k) { return { name: k, count: counts[k], color: colors[k] }; }),
      colors: colors,
      degree: SchemaModel.degrees(nodeNames, rels),
      nodeNames: nodeNames
    };
    renderLegend();
    renderHubChips();
  }

  // ---------- graph ----------

  function css(name) { return getComputedStyle(document.documentElement).getPropertyValue(name).trim(); }

  function blend(hex, bgHex, amount) {
    var p = function (h) { h = h.replace('#', ''); if (h.length === 3) h = h.split('').map(function (c) { return c + c; }).join(''); return [0, 2, 4].map(function (i) { return parseInt(h.substr(i, 2), 16); }); };
    var a = p(hex), b = p(bgHex);
    return '#' + a.map(function (v, i) { return Math.round(v * amount + b[i] * (1 - amount)).toString(16).padStart(2, '0'); }).join('');
  }

  function erLabel(name) {
    var m = S.g.model;
    var t = m.tables[name];
    if (!t) return { text: name + '\n(view)', w: name.length, h: 2 };
    var fkCols = {};
    S.g.relations.forEach(function (r) {
      if (r.from === name && r.kind !== 'view' && (r.kind === 'fk' || S.opts.inferred)) r.cols.forEach(function (c) { fkCols[c] = r.kind; });
    });
    var cols = t.columns.filter(function (c) {
      if (S.opts.erCols === 'all') return true;
      return t.primaryKey.indexOf(c.name) >= 0 || fkCols[c.name];
    });
    var more = t.columns.length - cols.length;
    if (cols.length > 40) { more += cols.length - 40; cols = cols.slice(0, 40); }
    var nameW = Math.max.apply(null, cols.map(function (c) { return c.name.length; }).concat([4]));
    var lines = cols.map(function (c) {
      var mark = t.primaryKey.indexOf(c.name) >= 0 ? '#' : fkCols[c.name] === 'fk' ? '>' : fkCols[c.name] ? '~' : ' ';
      var type = c.type.replace(/\(\d+\)/, '').replace(' unsigned', '').slice(0, 14);
      return mark + ' ' + c.name.padEnd(nameW) + '  ' + type + (c.nullable ? '?' : '');
    });
    if (more > 0) lines.push('  +' + more + ' more column' + (more > 1 ? 's' : ''));
    var head = name + (t.rows != null ? '  (' + fmt(t.rows) + ' rows)' : '');
    var w = Math.max.apply(null, lines.map(function (l) { return l.length; }).concat([head.length]));
    var text = head + '\n' + '-'.repeat(w) + '\n' + lines.join('\n');
    return { text: text, w: w, h: lines.length + 2 };
  }

  function visibleSets() {
    var d = S.d;
    var nodes = {};
    var f = S.focus;
    d.nodeNames.forEach(function (n) {
      if (S.hiddenGroups[d.groups[n]] && !(f && n in f.dist)) return;
      if (f && !(n in f.dist)) return;
      nodes[n] = true;
    });
    var edges = d.rels.filter(function (r) {
      if (!nodes[r.from] || !nodes[r.to]) return false;
      if (!f && d.hubs[r.to] && !S.shownHubs[r.to]) return false;
      return true;
    });
    // the differences map shows every table, without touching the saved setting
    if (!f && !S.opts.isolated && !(S.current && S.current.diff)) {
      var linked = {};
      edges.forEach(function (r) { linked[r.from] = true; linked[r.to] = true; });
      Object.keys(nodes).forEach(function (n) {
        var deg = d.degree[n] ? d.degree[n].inn + d.degree[n].out : 0;
        if (!linked[n] && deg === 0 && n !== S.selected) delete nodes[n];
      });
    }
    return { nodes: nodes, edges: edges };
  }

  function buildElements(vis) {
    var d = S.d;
    var panel = css('--panel') || '#ffffff';
    var els = [];
    var groupsUsed = {};
    Object.keys(vis.nodes).forEach(function (n) {
      var group = d.groups[n];
      var color = d.colors[group] || NEUTRAL;
      var deg = d.degree[n] ? d.degree[n].inn + d.degree[n].out : 0;
      var isView = !!S.g.model.views[n];
      var data = { id: n, label: n, group: group, color: color, size: Math.round(16 + 5 * Math.sqrt(deg)) };
      var classes = [isView ? 'view' : 'tbl'];
      if (d.hubs[n] && !S.shownHubs[n] && !S.focus) { classes.push('hub'); data.label = n + '  (' + d.hubs[n] + ' links hidden)'; }
      if (S.opts.er) {
        var er = erLabel(n);
        data.er = er.text;
        data.w = Math.round(er.w * 6.15 + 22);
        data.h = Math.round(er.h * 13.2 + 18);
        data.tint = blend(color, panel, 0.16);
        classes.push('er');
      }
      var dst = S.current.diff && S.current.diff.status[n];
      if (dst) { classes.push('diff-' + dst); data.label = n + (dst === 'added' ? '  (new)' : dst === 'removed' ? '  (missing)' : '  (changed)'); }
      var iss = S.opts.problems && S.issues.byTable[n];
      if (iss) {
        var sev = iss.high ? 'high' : iss.medium ? 'medium' : 'low';
        classes.push('issue-' + sev);
        data.label += '  ! ' + iss.list.length;
      }
      if (S.opts.boxes && S.opts.group !== 'none' && !S.focus) { data.parent = 'grp:' + group; groupsUsed[group] = true; }
      els.push({ group: 'nodes', data: data, classes: classes.join(' ') });
    });
    Object.keys(groupsUsed).forEach(function (gName) {
      els.push({ group: 'nodes', data: { id: 'grp:' + gName, label: gName, color: d.colors[gName] || NEUTRAL }, classes: 'grp' });
    });
    vis.edges.forEach(function (r) {
      els.push({ group: 'edges', data: { id: r.id, source: r.from, target: r.to, label: r.cols.join(', ') + (r.kind === 'fk' && r.onDelete && r.onDelete !== 'RESTRICT' ? '  on delete ' + r.onDelete.toLowerCase() : '') }, classes: r.kind });
    });
    return els;
  }

  function style() {
    var text = css('--text'), bg = css('--bg'), edge = css('--edge'), accent = css('--accent'), mono = css('--mono');
    var hud = document.documentElement.getAttribute('data-theme') === 'hud';
    var extra = [
      { selector: 'node.issue-high', style: { 'outline-width': 3, 'outline-color': css('--danger'), 'outline-offset': 2, 'outline-opacity': 0.95 } },
      { selector: 'node.issue-medium', style: { 'outline-width': 3, 'outline-color': css('--warn'), 'outline-offset': 2, 'outline-opacity': 0.95 } },
      { selector: 'node.issue-low', style: { 'outline-width': 2, 'outline-color': css('--muted'), 'outline-offset': 2, 'outline-opacity': 0.6 } },
      { selector: 'edge.flow', style: { 'line-style': 'dashed', 'line-dash-pattern': [7, 5] } },
      { selector: 'node.diff-added', style: { 'outline-width': 4, 'outline-color': css('--ok'), 'outline-offset': 2 } },
      { selector: 'node.diff-removed', style: { 'outline-width': 4, 'outline-color': css('--danger'), 'outline-offset': 2, 'background-opacity': 0.35, 'border-style': 'dashed' } },
      { selector: 'node.diff-changed', style: { 'outline-width': 4, 'outline-color': css('--warn'), 'outline-offset': 2 } }
    ];
    if (S.opts.effects) {
      extra.push(
        { selector: 'node.sel', style: { 'underlay-color': accent, 'underlay-opacity': 0.35, 'underlay-padding': 9, 'underlay-shape': 'ellipse' } },
        { selector: 'node.er.sel', style: { 'underlay-shape': 'round-rectangle' } },
        { selector: 'edge.flow', style: { 'underlay-color': accent, 'underlay-padding': 2, 'underlay-opacity': 0.18 } }
      );
    }
    if (hud) {
      extra.push(
        { selector: 'node.tbl, node.view', style: { 'underlay-color': 'data(color)', 'underlay-padding': 5, 'underlay-opacity': 0.28, 'underlay-shape': 'ellipse', 'border-color': 'data(color)', 'border-width': 1.5, 'background-opacity': 0.85, 'font-family': mono } },
        { selector: 'node.er', style: { 'underlay-shape': 'round-rectangle', 'underlay-padding': 4, 'underlay-opacity': 0.18 } },
        { selector: 'node.sel', style: { 'underlay-color': accent, 'underlay-opacity': 0.55, 'underlay-padding': 10 } },
        { selector: 'edge', style: { 'opacity': 0.55 } },
        { selector: 'edge.hl, edge.ov-path', style: { 'underlay-color': accent, 'underlay-padding': 3, 'underlay-opacity': 0.25 } }
      );
    }
    return base().concat(extra);
    function base() { return [
      { selector: 'node', style: { 'label': 'data(label)', 'font-size': 10, 'color': text, 'min-zoomed-font-size': 7, 'text-valign': 'bottom', 'text-margin-y': 3,
        'text-background-color': bg, 'text-background-opacity': 0.75, 'text-background-padding': 1.5, 'text-background-shape': 'roundrectangle',
        'background-color': 'data(color)', 'width': 'data(size)', 'height': 'data(size)', 'border-width': 1, 'border-color': bg } },
      { selector: 'node.view', style: { 'shape': 'diamond' } },
      { selector: 'node.hub', style: { 'border-width': 3, 'border-style': 'double', 'border-color': text } },
      { selector: 'node.er', style: { 'shape': 'round-rectangle', 'label': 'data(er)', 'width': 'data(w)', 'height': 'data(h)', 'background-color': 'data(tint)',
        'border-color': 'data(color)', 'border-width': 2, 'text-valign': 'center', 'text-halign': 'center', 'text-wrap': 'wrap', 'text-justification': 'left',
        'font-family': mono, 'font-size': 10, 'line-height': 1.32, 'text-margin-y': 0, 'text-background-opacity': 0, 'min-zoomed-font-size': 5 } },
      { selector: 'node.grp', style: { 'shape': 'round-rectangle', 'background-color': 'data(color)', 'background-opacity': 0.07, 'border-color': 'data(color)',
        'border-width': 1.5, 'border-style': 'dashed', 'label': 'data(label)', 'text-valign': 'top', 'text-halign': 'center', 'font-size': 13, 'font-weight': 600,
        'color': 'data(color)', 'padding': 16, 'text-background-opacity': 0, 'text-margin-y': -4 } },
      { selector: 'edge', style: { 'width': 1.2, 'line-color': edge, 'target-arrow-color': edge, 'target-arrow-shape': 'triangle', 'arrow-scale': 0.75,
        'curve-style': 'bezier', 'opacity': 0.85, 'font-size': 9, 'color': text, 'text-rotation': 'autorotate', 'text-background-color': bg,
        'text-background-opacity': 0.85, 'text-background-padding': 1, 'min-zoomed-font-size': 7 } },
      { selector: 'edge.inferred', style: { 'line-style': 'dashed', 'line-dash-pattern': [5, 4] } },
      { selector: 'edge.view', style: { 'line-style': 'dotted', 'target-arrow-shape': 'none' } },
      { selector: '.faded', style: { 'opacity': 0.12 } },
      { selector: 'edge.faded', style: { 'opacity': 0.05 } },
      { selector: 'node.grp.faded', style: { 'opacity': 0.35 } },
      { selector: 'node.hl', style: { 'border-width': 3, 'border-color': accent, 'opacity': 1 } },
      { selector: 'edge.hl', style: { 'line-color': accent, 'target-arrow-color': accent, 'width': 2.2, 'opacity': 1, 'z-index': 10 } },
      { selector: 'edge.lbl', style: { 'label': 'data(label)', 'opacity': 1, 'z-index': 12 } },
      { selector: 'node.sel', style: { 'border-width': 5, 'border-color': accent, 'z-index': 20 } },
      { selector: 'edge.ov-path', style: { 'line-color': css('--path'), 'target-arrow-color': css('--path'), 'width': 3.5, 'label': 'data(label)', 'opacity': 1, 'z-index': 15 } },
      { selector: 'node.ov-path', style: { 'border-color': css('--path'), 'border-width': 4 } },
      { selector: 'node.ov-root', style: { 'border-color': text, 'border-width': 5 } },
      { selector: 'node.ov-cascade', style: { 'background-color': css('--danger') } },
      { selector: 'node.ov-null', style: { 'background-color': css('--warn') } },
      { selector: 'node.ov-restrict', style: { 'background-color': css('--purple') } },
      { selector: 'node.er.ov-cascade', style: { 'background-color': 'data(tint)', 'border-color': css('--danger'), 'border-width': 4 } },
      { selector: 'node.er.ov-null', style: { 'background-color': 'data(tint)', 'border-color': css('--warn'), 'border-width': 4 } },
      { selector: 'node.er.ov-restrict', style: { 'background-color': 'data(tint)', 'border-color': css('--purple'), 'border-width': 4 } },
      { selector: 'edge.ov-cascade', style: { 'line-color': css('--danger'), 'target-arrow-color': css('--danger'), 'width': 2.5, 'label': 'data(label)', 'opacity': 1 } },
      { selector: 'edge.ov-null', style: { 'line-color': css('--warn'), 'target-arrow-color': css('--warn'), 'width': 2.5, 'label': 'data(label)', 'opacity': 1 } },
      { selector: 'edge.ov-restrict', style: { 'line-color': css('--purple'), 'target-arrow-color': css('--purple'), 'width': 2.5, 'label': 'data(label)', 'opacity': 1 } }
    ]; }
  }

  function layoutOptions(nodeCount) {
    var er = S.opts.er;
    var sp = S.opts.spacing || 1;
    var f = S.focus;
    var groupOf = function (n) { return S.d.groups[n.id()] || ''; };
    if (f && f.kind === 'path') return { name: 'breadthfirst', roots: '#' + cssId(f.root), directed: false, spacingFactor: (er ? 1.1 : 1.3) * sp, animate: false };
    if (f && f.kind === 'impact') return { name: 'breadthfirst', roots: '#' + cssId(f.root), directed: false, spacingFactor: (er ? 1 : 1.15) * sp, animate: false };
    var layout = S.opts.layout;
    if (!f && S.opts.boxes && S.opts.group !== 'none') return packedGroupsLayout();
    if (f && layout === 'fcose') {
      var max = Math.max.apply(null, Object.keys(f.dist).map(function (k) { return f.dist[k]; }));
      return { name: 'concentric', concentric: function (n) { return max - (f.dist[n.id()] || 0); }, levelWidth: function () { return 1; }, minNodeSpacing: (er ? 40 : 60) * sp, spacingFactor: 1.15, animate: false };
    }
    switch (layout) {
      case 'concentric':
        return { name: 'concentric', concentric: function (n) { return n.degree(); }, levelWidth: function () { return 3; }, minNodeSpacing: (er ? 25 : 10) * sp, animate: false };
      case 'breadthfirst':
        return { name: 'breadthfirst', directed: false, roots: cy.nodes('.tbl,.view').filter(function (n) { return n.outgoers('edge').length === 0 && n.incomers('edge').length > 0; }), spacingFactor: (er ? 1 : 0.9) * sp, animate: false };
      case 'grid':
        return { name: 'grid', avoidOverlap: true, avoidOverlapPadding: (er ? 20 : 8) * sp, sort: function (a, b) { return groupOf(a) < groupOf(b) ? -1 : groupOf(a) > groupOf(b) ? 1 : (a.id() < b.id() ? -1 : 1); }, animate: false };
      case 'circle':
        return { name: 'circle', spacingFactor: sp, sort: function (a, b) { return groupOf(a) < groupOf(b) ? -1 : groupOf(a) > groupOf(b) ? 1 : 0; }, animate: false };
      default:
        return {
          name: 'fcose', quality: nodeCount > 400 ? 'draft' : 'default', randomize: true, animate: false,
          nodeRepulsion: function () { return (er ? 60000 : 16000) * sp * sp; }, idealEdgeLength: function () { return (er ? 170 : 105) * sp; },
          nodeSeparation: (er ? 140 : 90) * sp, gravity: 0.3, gravityRangeCompound: 1.5, packComponents: true, tile: true,
          tilingPaddingVertical: er ? 40 : 16, tilingPaddingHorizontal: er ? 40 : 16, numIter: 2500, nestingFactor: 0.1
        };
    }
  }

  // each group becomes a tidy block of tables; blocks are packed in rows like a map
  function packedGroupsLayout() {
    var er = S.opts.er;
    var sp = S.opts.spacing || 1;
    var byGroup = {};
    cy.nodes('.tbl,.view').forEach(function (n) { (byGroup[n.data('group')] = byGroup[n.data('group')] || []).push(n); });
    var blocks = Object.keys(byGroup).map(function (k) {
      var list = byGroup[k].sort(function (a, b) { return b.degree() - a.degree() || (a.id() < b.id() ? -1 : 1); });
      var cw = (er ? Math.max.apply(null, list.map(function (n) { return n.data('w'); })) + 50 : 130) * sp;
      var ch = (er ? Math.max.apply(null, list.map(function (n) { return n.data('h'); })) + 50 : 80) * sp;
      var cols = Math.max(1, Math.ceil(Math.sqrt(list.length * (er ? 1 : 1.6))));
      var rows = Math.ceil(list.length / cols);
      return { list: list, cw: cw, ch: ch, cols: cols, w: cols * cw, h: rows * ch + (er ? 0 : ch * 0.3) };
    }).sort(function (a, b) { return b.list.length - a.list.length; });
    var area = blocks.reduce(function (s, b) { return s + (b.w + 70) * (b.h + 90); }, 0);
    var maxW = Math.max(Math.sqrt(area) * 1.5, blocks[0] ? blocks[0].w : 0);
    var pos = {};
    var x = 0, y = 0, rowH = 0;
    blocks.forEach(function (b) {
      if (x > 0 && x + b.w > maxW) { x = 0; y += rowH + 90; rowH = 0; }
      b.list.forEach(function (n, i) {
        // odd columns sit a little lower so links inside a block do not run through other tables
        var shift = !er && b.cols > 1 && (i % b.cols) % 2 ? b.ch * 0.28 : 0;
        pos[n.id()] = { x: x + (i % b.cols) * b.cw + b.cw / 2, y: y + Math.floor(i / b.cols) * b.ch + b.ch / 2 + shift };
      });
      x += b.w + 70;
      rowH = Math.max(rowH, b.h);
    });
    return { name: 'preset', positions: function (n) { return pos[n.id()]; }, animate: false };
  }

  // The graph only learns its size from the window by default. Opening the details panel,
  // full screen or the side drawer change the stage without a window resize, so watch it.
  var needsFit = false;
  function stageUsable() { var el = $('cy'); return el.clientWidth > 40 && el.clientHeight > 40; }
  function fitGraph() {
    if (!cy) return;
    if (!stageUsable()) { needsFit = true; return; }
    cy.resize();
    cy.fit(undefined, 30);
    var cap = cy.nodes().length <= 12 ? 1.6 : 1.25;
    if (cy.zoom() > cap) { cy.zoom(cap); cy.center(); }
    needsFit = false;
  }
  function flyToFit() {
    cy.resize();
    var cap = cy.nodes().length <= 12 ? 1.6 : 1.25;
    cy.stop();
    cy.fit(undefined, 30);
    var target = { zoom: Math.min(cy.zoom(), cap), pan: null };
    if (cy.zoom() > cap) { cy.zoom(cap); cy.center(); }
    target.pan = Object.assign({}, cy.pan());
    // start a little further out and glide in
    cy.zoom({ level: target.zoom * 0.55, renderedPosition: { x: cy.width() / 2, y: cy.height() / 2 } });
    cy.animate({ zoom: target.zoom, pan: target.pan }, { duration: 650, easing: 'ease-out-cubic' });
    needsFit = false;
  }

  function watchStageSize() {
    var last = { w: 0, h: 0 };
    var onSize = function () {
      var el = $('cy');
      var w = el.clientWidth, h = el.clientHeight;
      if (w === last.w && h === last.h) return;
      var wasTiny = last.w < 40 || last.h < 40;
      var dw = w - last.w, dh = h - last.h;
      last = { w: w, h: h };
      if (!cy || w < 40 || h < 40) return;
      cy.resize();
      if (needsFit || wasTiny) fitGraph();
      // keep what was in the middle in the middle when a panel opens or closes
      else cy.panBy({ x: dw / 2, y: dh / 2 });
    };
    if (window.ResizeObserver) new ResizeObserver(onSize).observe($('cy'));
    window.addEventListener('resize', onSize);
  }

  function cssId(id) { return String(id).replace(/([^\w-])/g, '\\$1'); }

  function render(relayout) {
    if (!S.g) return;
    // a new map layout (options, focus, another schema) is meant to be seen
    if (relayout) leaveSpotlight();
    var positions = {};
    if (!relayout && cy) cy.nodes().forEach(function (n) { positions[n.id()] = Object.assign({}, n.position()); });
    var vis = visibleSets();
    var els = buildElements(vis);
    var allKnown = !relayout && els.every(function (e) { return e.group !== 'nodes' || positions[e.data.id] || e.classes === 'grp'; });
    if (!cy) {
      cy = cytoscape({ container: $('cy'), elements: [], style: style(), wheelSensitivity: 0.25, minZoom: 0.05, maxZoom: 4, boxSelectionEnabled: false });
      watchStageSize();
      bindGraphEvents();
    }
    cy.batch(function () {
      cy.elements().remove();
      els.forEach(function (e) { if (allKnown && positions[e.data.id]) e.position = positions[e.data.id]; });
      cy.add(els);
    });
    var tableCount = Object.keys(vis.nodes).length;
    if (allKnown) {
      // keep positions
    } else if (tableCount) {
      // tables are placed at once; with effects on, the camera flies in to them
      try { cy.layout(layoutOptions(tableCount)).run(); } catch (err) { console.error(err); cy.layout({ name: 'grid' }).run(); }
      if (S.opts.effects && stageUsable()) flyToFit(); else fitGraph();
    }
    applyHighlights();
    renderFocusBar();
    var hiddenHubs = Object.keys(S.d.hubs).filter(function (h) { return !S.shownHubs[h]; }).length;
    var totalTables = S.d.nodeNames.length;
    var unlinkedHidden = !S.focus && !S.opts.isolated && !(S.current && S.current.diff) ? S.d.nodeNames.filter(function (n) { return !vis.nodes[n] && !S.hiddenGroups[S.d.groups[n]]; }).length : 0;
    $('statusBar').innerHTML = 'Showing ' + tableCount + ' of ' + totalTables + ' tables, ' + vis.edges.length + ' links' +
      (hiddenHubs && !S.focus ? ', links of ' + hiddenHubs + ' hub table' + (hiddenHubs > 1 ? 's' : '') + ' hidden' : '') +
      (unlinkedHidden ? '. <a class="lnk" id="showUnlinked">' + (unlinkedHidden === 1 ? 'Show the table with no links' : 'Show the ' + unlinkedHidden + ' tables with no links') + '</a>' : '') +
      '. Click a table for details, double-click for its Spotlight.';
    if ($('showUnlinked')) $('showUnlinked').onclick = function () { S.opts.isolated = true; $('optIsolated').checked = true; store.set('opts', S.opts); render(true); };
  }

  function applyHighlights() {
    if (!cy) return;
    cy.elements().removeClass('faded hl sel lbl flow');
    var ov = S.overlay;
    var sel = S.selected ? cy.getElementById(S.selected) : null;
    if (sel && sel.length) {
      var hood = sel.closedNeighborhood();
      cy.elements().not(hood).not('.grp').addClass('faded');
      hood.addClass('hl');
      if (hood.edges().length <= 12) hood.edges().addClass('lbl');
      sel.addClass('sel');
    } else if (ov) {
      cy.elements().forEach(function (e) {
        if (e.hasClass('grp')) return;
        if (!(ov.nodes[e.id()] || ov.edges[e.id()])) e.addClass('faded');
      });
    }
    cy.nodes().removeStyle('underlay-opacity');
    if (S.opts.effects) cy.edges('.hl, .ov-path, .ov-cascade, .ov-null, .ov-restrict').addClass('flow');
  }

  function setOverlay(ov) {
    if (cy) cy.elements().removeClass('ov-path ov-root ov-cascade ov-null ov-restrict');
    S.overlay = ov;
    if (ov && cy) {
      Object.keys(ov.nodes).forEach(function (id) { cy.getElementById(id).addClass(ov.nodes[id]); });
      Object.keys(ov.edges).forEach(function (id) { cy.getElementById(id).addClass(ov.edges[id]); });
    }
    applyHighlights();
  }

  function bindGraphEvents() {
    var tip = $('tip');
    cy.on('tap', 'node', function (e) {
      if (e.target.hasClass('grp')) return;
      select(e.target.id(), { center: false });
    });
    cy.on('dbltap', 'node', function (e) {
      if (e.target.hasClass('grp')) { soloGroup(e.target.data('label')); return; }
      openSpotlight(e.target.id());
    });
    cy.on('tap', function (e) { if (e.target === cy) clearSelection(); });
    cy.on('tap', 'edge', function (e) {
      var r = S.g.relations.find(function (x) { return x.id === e.target.id(); });
      if (r) toast(relText(r));
    });
    cy.on('mouseover', 'node', function (e) {
      var n = e.target;
      if (n.hasClass('grp')) return;
      var id = n.id();
      var t = S.g.model.tables[id];
      var dg = S.d.degree[id] || { inn: 0, out: 0 };
      tip.innerHTML = '<b class="mono">' + esc(id) + '</b><span>' + esc(S.d.groups[id]) + '</span><br>' +
        (t ? t.columns.length + ' columns' + (t.rows != null ? ', ' + fmt(t.rows) + ' rows' : '') + '<br>' : 'view<br>') +
        'uses ' + dg.out + ' table' + (dg.out === 1 ? '' : 's') + ', used by ' + dg.inn;
      var p = e.renderedPosition;
      tip.style.left = Math.min(p.x + 14, $('stage').clientWidth - 270) + 'px';
      tip.style.top = (p.y + 14) + 'px';
      tip.style.display = 'block';
    });
    cy.on('mouseout', 'node', function () { tip.style.display = 'none'; });
    cy.on('mouseover', 'edge', function (e) { e.target.addClass('lbl'); });
    cy.on('mouseout', 'edge', function (e) { if (!S.selected || cy.getElementById(S.selected).closedNeighborhood().edges().length > 12) e.target.removeClass('lbl'); });
    cy.on('pan zoom', function () { tip.style.display = 'none'; });
  }

  // ---------- focus ----------

  function leaveSpotlight() {
    if (window.Spotlight && window.Spotlight.isOpen()) window.Spotlight.close();
  }

  function setFocus(name, depth) {
    leaveSpotlight();
    var dist = SchemaModel.neighbourhood(S.d.rels, name, depth, S.d.hubs);
    S.focus = { kind: 'hood', root: name, depth: depth, dist: dist, label: 'Around ' + name };
    S.overlay = null;
    S.selected = name;
    render(true);
    showDetails(name);
  }

  function setCustomFocus(kind, root, names, label) {
    leaveSpotlight();
    var dist = {};
    names.forEach(function (n, i) { dist[n] = i; });
    dist[root] = 0;
    S.focus = { kind: kind, root: root, dist: dist, label: label };
    S.selected = null;
    render(true);
  }

  function clearFocus() {
    leaveSpotlight();
    S.focus = null;
    setOverlay(null);
    render(true);
  }

  function renderFocusBar() {
    var bar = $('focusBar');
    var f = S.focus;
    if (!f && S.current && S.current.diff) {
      var c = S.current.diff.counts;
      bar.innerHTML = '<b>' + esc(S.current.name) + '</b><span class="tag added">' + c.added + ' new</span><span class="tag removed">' + c.removed + ' missing</span><span class="tag changed">' + c.changed + ' changed</span>' +
        '<button class="small" id="diffExit">Back to ' + esc((S.schemas.find(function (s) { return s.id === S.current.baseId; }) || {}).name || 'the schema') + '</button>';
      bar.style.display = 'flex';
      $('diffExit').onclick = function () { loadSchema(S.current.baseId); };
      return;
    }
    if (!f) { bar.style.display = 'none'; return; }
    var html = '<b>' + esc(f.label) + '</b>';
    if (f.kind === 'hood') {
      html += '<span class="hint" style="margin:0">steps:</span>' + [1, 2, 3].map(function (d) {
        return '<button class="small' + (d === f.depth ? ' primary' : '') + '" data-depth="' + d + '">' + d + '</button>';
      }).join('');
    }
    html += '<button class="small" id="focusExit">Show everything</button>';
    bar.innerHTML = html;
    bar.style.display = 'flex';
    bar.querySelectorAll('[data-depth]').forEach(function (b) {
      b.onclick = function () { setFocus(f.root, +b.dataset.depth); };
    });
    $('focusExit').onclick = clearFocus;
  }

  // ---------- selection & details ----------

  function select(name, o) {
    S.selected = name;
    applyHighlights();
    showDetails(name);
    try { history.replaceState(null, '', '#table=' + encodeURIComponent(name)); } catch (e) { /* file:// in some browsers */ }
    var n = cy && cy.getElementById(name);
    if (o && o.center && n && n.length) cy.animate({ center: { eles: n }, zoom: Math.max(cy.zoom(), S.opts.er ? 0.8 : 1.1) }, { duration: 300 });
  }

  function clearSelection() {
    S.selected = null;
    $('details').classList.remove('on');
    applyHighlights();
  }

  function relText(r) {
    return r.from + '.' + r.cols.join(', ') + ' -> ' + r.to + '.' + r.refCols.join(', ') + (r.kind === 'inferred' ? ' (guessed, no foreign key)' : r.onDelete ? '  on delete ' + r.onDelete.toLowerCase() : '');
  }

  function ruleTag(rule) {
    if (!rule) return '';
    var cls = rule === 'CASCADE' ? 'cascade' : /SET/.test(rule) ? 'setnull' : 'restrict';
    return '<span class="tag ' + cls + '" title="on delete">' + esc(rule.toLowerCase()) + '</span>';
  }

  function tableLink(n) { return '<a class="lnk mono" data-goto="' + esc(n) + '">' + esc(n) + '</a>'; }

  function showDetails(name) {
    var g = S.g;
    var m = g.model;
    var t = m.tables[name];
    var v = m.views[name];
    var panel = $('details');
    var group = S.d.groups[name];
    var color = S.d.colors[group] || NEUTRAL;
    var out = g.relations.filter(function (r) { return r.from === name; });
    var inn = g.relations.filter(function (r) { return r.to === name && r.from !== name; });
    var visible = cy && cy.getElementById(name).length;
    var h = '<div class="d-head"><h2><span class="sw" style="width:12px;height:12px;border-radius:3px;background:' + color + ';flex:none"></span>' + esc(name) +
      '<button class="ghost small" id="dClose" style="margin-left:auto" title="Close">&times;</button></h2>';
    h += '<div class="meta">' + esc(v ? 'view' : group) + (t ? ' &middot; ' + t.columns.length + ' columns' : '') +
      (t && t.rows != null ? ' &middot; ' + fmt(t.rows) + ' rows' : '') + (t && t.autoIncrement ? ' &middot; next id ' + fmt(t.autoIncrement) : '') +
      (t && t.engine ? ' &middot; ' + esc(t.engine) : '') + '</div>';
    if (t && t.comment) h += '<div class="meta">' + esc(t.comment) + '</div>';
    h += '<div class="actions">' +
      '<button class="small" data-act="spot">Open Spotlight</button>' +
      '<button class="small" data-act="focus1">Neighbours</button><button class="small" data-act="focus2">2 steps</button>' +
      '<button class="small" data-act="from">Path from here</button><button class="small" data-act="to">Path to here</button>' +
      (t ? '<button class="small" data-act="impact">Delete impact</button><button class="small" data-act="select">Copy SELECT</button>' : '') +
      '<button class="small" data-act="mermaid">Copy Mermaid</button></div>';
    if (!visible) h += '<div class="hint">Not in the current view. <a class="lnk" data-act="focus1">Show it with its neighbours</a></div>';
    var tIssues = S.issues.byTable[name];
    if (tIssues) h += '<div class="issue-strip">' + issueSummaryChips(tIssues) + ' <a class="lnk" id="dSeeFixes">see the problems and fixes</a></div>';
    if (t) h += '<p class="hint" style="margin-bottom:0">' + esc(SchemaModel.describeTable(g, name)) + '</p>';
    h += '</div><div class="d-body">';
    if (tIssues) {
      h += '<details class="box d-issues" id="dIssues"><summary>Problems and fixes <small>(' + tIssues.list.length + ')</small></summary>' +
        tIssues.list.map(function (i) { return issueHtml(i, false); }).join('') + '</details>';
    }
    if (S.current.diff && S.current.diff.status[name]) h += diffDetailsHtml(name);
    var use = m.usage && m.usage[name];
    if (use) {
      h += '<h3>Used in the code</h3><div class="rel">' + (use.files ? use.files + ' file' + (use.files > 1 ? 's' : '') + (use.model ? ', model <span class="mono">' + esc(use.model) + '</span>' : ', no model') +
        '<details style="margin-top:4px"><summary class="hint">files</summary><ul class="list">' + use.samples.map(function (p) { return '<li><small class="mono">' + esc(p) + '</small></li>'; }).join('') + (use.files > use.samples.length ? '<li><small>...</small></li>' : '') + '</ul></details>'
        : '<b>Not referenced anywhere in the code</b> (outside migrations).') + '</div>';
    }

    if (t) {
      var fkCol = {};
      out.forEach(function (r) { if (r.kind !== 'view') r.cols.forEach(function (c) { fkCol[c] = r; }); });
      var uq = {};
      var ix = {};
      t.indexes.forEach(function (i) { if (i.type === 'UNIQUE' && i.columns.length === 1) uq[i.columns[0]] = true; else ix[i.columns[0]] = true; });
      h += '<h3>Columns</h3><table class="cols"><thead><tr><th>Column</th><th>Type</th><th>Null</th><th>Default</th></tr></thead><tbody>';
      t.columns.forEach(function (c) {
        var tags = '';
        var pk = t.primaryKey.indexOf(c.name) >= 0;
        if (pk) tags += '<span class="tag pk">PK</span> ';
        var r = fkCol[c.name];
        if (r) tags += '<span class="tag ' + (r.kind === 'fk' ? 'fk' : 'inf') + '" title="' + (r.kind === 'fk' ? 'foreign key' : 'guessed link, no foreign key') + '">' + (r.kind === 'fk' ? 'FK' : 'FK?') + '</span> ';
        if (uq[c.name]) tags += '<span class="tag uq">UQ</span> ';
        else if (ix[c.name] && !pk && !r) tags += '<span class="tag ix">IX</span> ';
        h += '<tr class="' + (pk || r ? 'key' : '') + '"><td class="name">' + tags + esc(c.name) +
          (r ? '<br><small>&rarr; ' + tableLink(r.to) + '</small>' : '') + (c.comment ? '<br><small class="hint">' + esc(c.comment) + '</small>' : '') + '</td>' +
          '<td class="type">' + esc(c.type) + (c.autoIncrement ? '<br><small>auto increment</small>' : '') + '</td><td>' + (c.nullable ? 'yes' : '') + '</td><td class="type">' + esc(c.default == null ? '' : c.default) + '</td></tr>';
      });
      h += '</tbody></table>';
    }

    var relBlock = function (title, list, dir) {
      if (!list.length) return '';
      var s = '<h3>' + title + ' <small style="text-transform:none">(' + list.length + ')</small></h3>';
      list.forEach(function (r) {
        var other = dir === 'out' ? r.to : r.from;
        s += '<div class="rel">' + tableLink(other) + ' ';
        if (r.kind === 'view') s += '<span class="hint">view uses this table</span>';
        else {
          s += (r.kind === 'inferred' ? '<span class="tag inf">guessed</span> ' : ruleTag(r.onDelete) + ' ') + (r.missingTarget ? '<span class="tag removed">table missing</span> ' : '') +
            '<br><span class="mono">' + esc(r.from + '.' + r.cols.join(', ')) + ' &rarr; ' + esc(r.to + '.' + r.refCols.join(', ')) + '</span>' +
            (r.nullable ? ' <small class="hint">optional</small>' : '') + (r.unique ? ' <small class="hint">one-to-one</small>' : '');
        }
        s += '</div>';
      });
      return s;
    };
    h += relBlock('Uses (points to)', out, 'out');
    h += relBlock('Used by (points here)', inn, 'in');

    var morphs = g.morphs.filter(function (x) { return x.table === name; });
    if (morphs.length) {
      h += '<h3>Polymorphic links</h3>';
      morphs.forEach(function (x) { h += '<div class="rel"><span class="mono">' + esc(x.typeCol + ' + ' + x.idCol) + '</span><br><small class="hint">Points to different tables row by row (a polymorphic link).</small></div>'; });
    }
    if (t && t.indexes.length) {
      h += '<h3>Indexes</h3>';
      t.indexes.forEach(function (i) { h += '<div class="rel"><span class="tag ' + (i.type === 'UNIQUE' ? 'uq' : 'ix') + '">' + esc(i.type) + '</span> <span class="mono">' + esc(i.name || '') + '</span> (' + esc(i.columns.join(', ')) + ')</div>'; });
    }
    if (t && t.triggers.length) {
      h += '<h3>Triggers</h3>';
      m.triggers.filter(function (x) { return x.table === name; }).forEach(function (x) {
        h += '<details class="box"><summary class="mono">' + esc(x.name) + ' <small>' + esc(x.timing + ' ' + x.event) + '</small></summary><pre class="code">' + esc(x.body) + '</pre></details>';
      });
    }
    if (v) h += '<h3>Definition</h3><pre class="code">' + esc(v.sql) + '</pre>';
    h += '</div>';
    panel.innerHTML = h;
    panel.classList.add('on');
    panel.scrollTop = 0;
    $('dClose').onclick = clearSelection;
    if ($('dIssues')) {
      bindProblemButtons($('dIssues'));
      $('dSeeFixes').onclick = function () { $('dIssues').open = true; $('dIssues').scrollIntoView({ behavior: 'smooth', block: 'start' }); };
    }
    panel.querySelectorAll('[data-act]').forEach(function (b) {
      b.onclick = function () { detailAction(b.dataset.act, name); };
    });
  }

  function detailAction(act, name) {
    if (act !== 'spot' && act !== 'mermaid' && act !== 'select') leaveSpotlight();
    if (act === 'spot') openSpotlight(name);
    else if (act === 'focus1') setFocus(name, 1);
    else if (act === 'focus2') setFocus(name, 2);
    else if (act === 'from' || act === 'to') {
      $(act === 'from' ? 'pathFrom' : 'pathTo').value = name;
      openTab('path');
      if ($('pathFrom').value && $('pathTo').value) runPath();
    } else if (act === 'impact') { $('impactTable').value = name; openTab('impact'); runImpact(); }
    else if (act === 'mermaid') {
      var rels = S.g.relations.filter(function (r) { return (r.from === name || r.to === name) && r.kind !== 'view' && (r.kind === 'fk' || S.opts.inferred); });
      var names = [name];
      rels.forEach(function (r) { [r.from, r.to].forEach(function (n) { if (names.indexOf(n) < 0 && S.g.model.tables[n]) names.push(n); }); });
      copy(SchemaModel.mermaid(S.g, names, rels), 'Mermaid diagram copied. Paste it into a .md file or mermaid.live');
    } else if (act === 'select') {
      var out = S.g.relations.filter(function (r) { return r.from === name && r.kind !== 'view' && !r.missingTarget && r.from !== r.to; });
      var used = {};
      var alias = function (n) { var a = n.split('_').map(function (p) { return p[0]; }).join(''); var b = a, i = 2; while (used[a]) a = b + (i++); used[a] = true; return a; };
      var me = alias(name);
      var qi = SchemaModel.sqlFor(S.g.model.dialect).q;
      var lines = ['SELECT ' + me + '.*', 'FROM ' + qi(name) + ' ' + me];
      out.forEach(function (r) {
        var a = alias(r.to);
        // the note goes on its own line, so the closing ; never ends up inside a comment
        if (r.kind === 'inferred') lines.push('-- guessed link, no foreign key:');
        lines.push('LEFT JOIN ' + qi(r.to) + ' ' + a + ' ON ' + r.cols.map(function (c, i) { return a + '.' + qi(r.refCols[i] || 'id') + ' = ' + me + '.' + qi(c); }).join(' AND '));
      });
      copy(lines.join('\n') + ';', 'SELECT with every parent table copied');
    }
  }

  // ---------- legend & options ----------

  function renderLegend() {
    var html = S.d.groupList.map(function (gr) {
      return '<div class="row' + (S.hiddenGroups[gr.name] ? ' off' : '') + '" data-g="' + esc(gr.name) + '"><span class="sw" style="background:' + gr.color + '"></span>' +
        '<span>' + esc(gr.name) + '</span><span class="n">' + gr.count + '</span></div>';
    }).join('');
    $('legend').innerHTML = html;
    $('groupCount').textContent = '(' + S.d.groupList.length + ')';
    $('legend').querySelectorAll('.row').forEach(function (row) {
      var clickTimer = null;
      row.onclick = function () {
        clearTimeout(clickTimer);
        clickTimer = setTimeout(function () {
          var k = row.dataset.g;
          if (S.hiddenGroups[k]) delete S.hiddenGroups[k]; else S.hiddenGroups[k] = true;
          renderLegend();
          render(true);
        }, 220);
      };
      row.ondblclick = function () { clearTimeout(clickTimer); soloGroup(row.dataset.g); };
    });
  }

  function soloGroup(k) {
    var others = S.d.groupList.filter(function (g) { return g.name !== k; });
    var alreadySolo = others.every(function (g) { return S.hiddenGroups[g.name]; }) && !S.hiddenGroups[k];
    S.hiddenGroups = {};
    if (!alreadySolo) others.forEach(function (g) { S.hiddenGroups[g.name] = true; });
    renderLegend();
    render(true);
  }

  function renderHubChips() {
    var keys = Object.keys(S.d.hubs).sort(function (a, b) { return S.d.hubs[b] - S.d.hubs[a]; });
    if (!keys.length) { $('hubChips').innerHTML = ''; return; }
    $('hubChips').innerHTML = '<div class="hint">Hub tables are linked from almost everywhere, so their links are hidden to keep the picture readable. Click one to show its links.</div><div class="chips">' +
      keys.map(function (k) { return '<span class="chip' + (S.shownHubs[k] ? ' on' : '') + '" data-hub="' + esc(k) + '">' + esc(k) + ' <b>' + S.d.hubs[k] + '</b></span>'; }).join('') + '</div>';
    $('hubChips').querySelectorAll('[data-hub]').forEach(function (c) {
      c.onclick = function () {
        var k = c.dataset.hub;
        if (S.shownHubs[k]) delete S.shownHubs[k]; else S.shownHubs[k] = true;
        renderHubChips();
        render(true);
      };
    });
  }

  function bindOptions() {
    var map = { optLayout: 'layout', optGroup: 'group', optHub: 'hub', optErCols: 'erCols' };
    var checks = { optInferred: 'inferred', optViews: 'views', optBoxes: 'boxes', optEr: 'er', optIsolated: 'isolated', optProblems: 'problems' };
    Object.keys(map).forEach(function (id) {
      $(id).value = String(S.opts[map[id]]);
      $(id).onchange = function () {
        S.opts[map[id]] = id === 'optHub' ? +this.value : this.value;
        store.set('opts', S.opts);
        if (id === 'optHub' || id === 'optGroup') { S.hiddenGroups = {}; recompute(); }
        render(true);
      };
    });
    Object.keys(checks).forEach(function (id) {
      $(id).checked = !!S.opts[checks[id]];
      $(id).onchange = function () {
        S.opts[checks[id]] = this.checked;
        store.set('opts', S.opts);
        $('erColsField').style.display = S.opts.er ? '' : 'none';
        if (id === 'optInferred' || id === 'optViews') recompute();
        render(id !== 'optProblems');
      };
    });
    $('erColsField').style.display = S.opts.er ? '' : 'none';
    var sp = $('optSpacing');
    var spLabel = function () { $('spacingVal').textContent = Math.round(S.opts.spacing * 100) + '%'; };
    sp.value = S.opts.spacing;
    spLabel();
    sp.oninput = function () { S.opts.spacing = +this.value; spLabel(); };
    sp.onchange = function () { store.set('opts', S.opts); render(true); };
  }

  // ---------- path ----------

  function resolveName(v) {
    v = (v || '').trim();
    if (!v) return null;
    if (S.g.model.tables[v] || S.g.model.views[v]) return v;
    var lower = v.toLowerCase();
    return S.g.names.find(function (n) { return n.toLowerCase() === lower; }) || null;
  }

  var lastPaths = [];
  function runPath() {
    var a = resolveName($('pathFrom').value);
    var b = resolveName($('pathTo').value);
    var out = $('pathOut');
    if (!a || !b) { out.innerHTML = '<p class="hint">Pick two tables from the list.</p>'; return; }
    if (a === b) { out.innerHTML = '<p class="hint">Those are the same table.</p>'; return; }
    var rels = SchemaModel.activeRelations(S.g, { inferred: $('pathInferred').checked, views: false });
    var avoid = $('pathAvoidHubs').checked ? SchemaModel.hubs(S.g.names, rels, S.opts.hub || 20) : null;
    lastPaths = SchemaModel.findPaths(rels, a, b, avoid, 4);
    if (!lastPaths.length) {
      out.innerHTML = '<p class="hint">No chain of links connects these tables' + (avoid ? ' without going through a hub table. Untick "Avoid hub tables" to allow it.' : '.') + '</p>';
      return;
    }
    showPath(0, a, b);
  }

  function showPath(i, a, b) {
    var steps = lastPaths[i];
    var html = '';
    if (lastPaths.length > 1) {
      html += '<h3>Routes</h3><div class="chips">' + lastPaths.map(function (p, k) {
        return '<span class="chip' + (k === i ? ' on' : '') + '" data-route="' + k + '">' + (k === 0 ? 'Shortest' : 'Route ' + (k + 1)) + ' (' + p.length + ' step' + (p.length > 1 ? 's' : '') + ')</span>';
      }).join('') + '</div>';
    }
    html += '<h3>Chain</h3><ol class="steps">';
    steps.forEach(function (s) {
      var r = s.rel;
      html += '<li>' + tableLink(s.from) + ' &rarr; ' + tableLink(s.to) + '<br><small class="mono">' + esc(r.from + '.' + r.cols.join(',') + ' = ' + r.to + '.' + r.refCols.join(',')) + '</small>' +
        (r.kind === 'inferred' ? ' <span class="tag inf">guessed</span>' : '') + '</li>';
    });
    html += '</ol><h3>SQL</h3><pre class="code">' + esc(SchemaModel.joinSql(steps, a, S.g.model.dialect)) + '</pre><button class="small" id="copyPathSql">Copy SQL</button>';
    $('pathOut').innerHTML = html;
    $('copyPathSql').onclick = function () { copy(SchemaModel.joinSql(steps, a, S.g.model.dialect), 'SQL copied'); };
    $('pathOut').querySelectorAll('[data-route]').forEach(function (c) { c.onclick = function () { showPath(+c.dataset.route, a, b); }; });

    var names = [a];
    steps.forEach(function (s) { names.push(s.to); });
    setCustomFocus('path', a, names, 'Path: ' + a + ' to ' + b);
    var ov = { nodes: {}, edges: {} };
    names.forEach(function (n) { ov.nodes[n] = 'ov-path'; });
    ov.nodes[a] = 'ov-path ov-root';
    steps.forEach(function (s) { ov.edges[s.rel.id] = 'ov-path'; });
    setOverlay(ov);
    ensureEdges(steps.map(function (s) { return s.rel; }), 'ov-path');
  }

  // a guessed link used by a path may be switched off in the view; draw it anyway
  function ensureEdges(rels, cls) {
    rels.forEach(function (r) {
      if (cy.getElementById(r.id).length || !cy.getElementById(r.from).length || !cy.getElementById(r.to).length) return;
      cy.add({ group: 'edges', data: { id: r.id, source: r.from, target: r.to, label: r.cols.join(', ') }, classes: r.kind + ' ' + cls });
    });
  }

  // ---------- delete impact ----------

  function runImpact() {
    var name = resolveName($('impactTable').value);
    var out = $('impactOut');
    if (!name || !S.g.model.tables[name]) { out.innerHTML = '<p class="hint">Pick a table from the list.</p>'; return; }
    var im = SchemaModel.deleteImpact(S.g, name);
    var uniq = function (list) { var s = {}; return list.filter(function (x) { if (s[x.table]) return false; s[x.table] = true; return true; }); };
    var cascade = uniq(im.cascade), setNull = uniq(im.setNull), restrict = uniq(im.restrict);
    var rows = function (t) { var r = S.g.model.tables[t] && S.g.model.tables[t].rows; return r != null ? ' <small class="hint">' + fmt(r) + ' rows</small>' : ''; };
    var html = '<div class="stat-grid" style="margin-top:12px">' +
      '<div class="stat"><b style="color:var(--danger)">' + cascade.length + '</b><span>tables lose rows too</span></div>' +
      '<div class="stat"><b style="color:var(--warn)">' + setNull.length + '</b><span>tables get a column emptied</span></div>' +
      '<div class="stat"><b style="color:var(--purple)">' + restrict.length + '</b><span>tables can block the delete</span></div></div>';
    html += '<p class="hint">Deleting one row from <b class="mono">' + esc(name) + '</b>:</p>';
    var tree = function (node) {
      if (!node.children.length) return '';
      var s = '<ul class="steps" style="list-style:none;padding-left:14px">';
      node.children.forEach(function (c) {
        var rule = c.via ? (c.via.onDelete || 'RESTRICT') : '';
        s += '<li>' + ruleTag(rule) + ' ' + tableLink(c.table) + rows(c.table) + ' <small class="mono hint">via ' + esc(c.via.cols.join(',')) + '</small>' + (c.repeat ? ' <small class="hint">(already listed)</small>' : '') + tree(c) + '</li>';
      });
      return s + '</ul>';
    };
    html += tree(im.tree) || '<p class="hint">Nothing else depends on this table through foreign keys.</p>';
    html += '<p class="hint"><span class="tag cascade">cascade</span> rows deleted too &nbsp; <span class="tag setnull">set null</span> link cleared &nbsp; <span class="tag restrict">restrict</span> delete refused while such rows exist</p>';
    var guessed = S.g.relations.filter(function (r) { return r.kind === 'inferred' && r.to === name; });
    if (guessed.length) html += '<p class="hint">Not covered: ' + guessed.length + ' guessed link' + (guessed.length > 1 ? 's' : '') + ' (' + guessed.map(function (r) { return esc(r.from + '.' + r.cols[0]); }).join(', ') + ') ' + (guessed.length > 1 ? 'have' : 'has') + ' no foreign key, so the database will leave those rows pointing at nothing.</p>';
    out.innerHTML = html;

    var names = [name];
    var ov = { nodes: {}, edges: {} };
    ov.nodes[name] = 'ov-root ov-cascade';
    [[im.cascade, 'ov-cascade'], [im.setNull, 'ov-null'], [im.restrict, 'ov-restrict']].forEach(function (pair) {
      pair[0].forEach(function (x) {
        if (names.indexOf(x.table) < 0) names.push(x.table);
        if (!ov.nodes[x.table] || pair[1] === 'ov-cascade') ov.nodes[x.table] = pair[1];
        ov.edges[x.rel.id] = pair[1];
      });
    });
    setCustomFocus('impact', name, names, 'Delete impact: ' + name);
    setOverlay(ov);
  }

  // ---------- insights ----------

  function issueSummaryChips(e) {
    return ['high', 'medium', 'low'].filter(function (k) { return e[k]; }).map(function (k) {
      return '<span class="sev sev-' + k + '">' + e[k] + ' ' + k + '</span>';
    }).join(' ');
  }

  var KIND_LABEL = {
    'cascade-people': 'People records erased when a lookup entry is deleted', 'missing-table': 'Foreign keys to missing tables', 'type-mismatch': 'Linked columns with different types', 'cascade-money': 'Financial records deleted by cascade',
    'cascade-academic': 'History records deleted by cascade', 'missing-fk': 'Links without a foreign key', 'no-index': 'Link columns without an index',
    'no-pk': 'Tables without a primary key', 'dup-index': 'Redundant indexes', 'wide': 'Very wide tables', 'orphan-id': '*_id columns with no matching table',
    'cascade-wide': 'Deletes that reach many tables', 'isolated': 'Tables with no links', 'dead-table': 'Empty tables the code no longer uses',
    'out-of-scope': 'Outside what this project does', 'dormant': 'Tables the app reads but never fills',
    'accepted': 'Reviewed and kept on purpose'
  };

  function issueHtml(i, withTable) {
    var h = '<div class="issue sev-border-' + i.severity + '"><div class="issue-head"><span class="sev sev-' + i.severity + '">' + i.severity + '</span> <b>' + esc(i.title) + '</b>' +
      (withTable && i.table ? ' <a class="lnk mono" data-goto="' + esc(i.table) + '">' + esc(i.table) + (i.column ? '.' + esc(i.column) : '') + '</a>' : '') + '</div>' +
      '<div class="issue-detail">' + esc(i.detail) + '</div>';
    if (i.check) h += '<div class="issue-label">1. Check for broken rows first (must return 0)</div><pre class="code">' + esc(i.check) + '</pre>';
    if (i.sql) h += '<div class="issue-label">' + (i.check ? '2. ' : '') + 'Fix (SQL)</div><pre class="code">' + esc(i.sql) + '</pre>';
    if (i.laravel) h += '<div class="issue-label">Same fix in a Laravel migration</div><pre class="code">' + esc(i.laravel) + '</pre>';
    if (i.sql) h += '<button class="small" data-copy-issue="' + i.id + '">Copy fix</button>';
    return h + '</div>';
  }

  function renderProblems() {
    var list = S.issues.list.filter(function (i) { return !i.hidden; });
    var count = { high: 0, medium: 0, low: 0 };
    list.forEach(function (i) { count[i.severity]++; });
    var h = '<h3>Problems found</h3><div class="stat-grid">' +
      '<div class="stat"><b style="color:var(--danger)">' + count.high + '</b><span>high</span></div>' +
      '<div class="stat"><b style="color:var(--warn)">' + count.medium + '</b><span>medium</span></div>' +
      '<div class="stat"><b style="color:var(--muted)">' + count.low + '</b><span>low</span></div></div>';
    h += '<div style="display:flex;gap:6px;flex-wrap:wrap;margin:8px 0"><button class="small" id="markProblems">' + (S.opts.problems ? 'Hide' : 'Mark') + ' problems on the map</button>' +
      '<button class="small" id="dlFixes">Download fix script (.sql)</button></div>';
    var kinds = [];
    var byKind = {};
    list.forEach(function (i) { if (!byKind[i.kind]) { byKind[i.kind] = []; kinds.push(i.kind); } byKind[i.kind].push(i); });
    kinds.forEach(function (k) {
      var items = byKind[k];
      h += '<details class="box"><summary><span class="sev sev-' + items[0].severity + '">' + items[0].severity + '</span> ' + esc(KIND_LABEL[k] || k) + ' <small>(' + items.length + ')</small></summary>' +
        items.map(function (i) { return issueHtml(i, true); }).join('') + '</details>';
    });
    if (!list.length) h += '<p class="hint">No problems found.</p>';
    return h;
  }

  function bindProblemButtons(root) {
    root.querySelectorAll('[data-copy-issue]').forEach(function (b) {
      b.onclick = function () {
        var i = S.issues.list.find(function (x) { return x.id === b.dataset.copyIssue; });
        if (i) copy((i.check ? '-- check first, must return 0\n' + i.check + '\n\n' : '') + i.sql, 'Fix copied');
      };
    });
    if (root.querySelector('#markProblems')) root.querySelector('#markProblems').onclick = function () { toggleProblems(); };
    if (root.querySelector('#dlFixes')) root.querySelector('#dlFixes').onclick = function () { exportAs('fixes'); };
  }

  function toggleProblems(on) {
    S.opts.problems = on == null ? !S.opts.problems : on;
    $('optProblems').checked = S.opts.problems;
    store.set('opts', S.opts);
    render(false);
    renderInsights();
  }

  function renderIssueBadge() {
    var b = $('issuesBtn');
    // the "reviewed and kept on purpose" summary is not a problem
    var list = S.issues.list.filter(function (i) { return !i.hidden && i.kind !== 'accepted'; });
    var worst = list.some(function (i) { return i.severity === 'high'; }) ? 'high' : list.some(function (i) { return i.severity === 'medium'; }) ? 'medium' : 'low';
    b.style.display = list.length ? '' : 'none';
    b.className = 'issues-btn sev-btn-' + worst;
    b.textContent = list.length + ' problem' + (list.length === 1 ? '' : 's');
  }

  // What Joinscope worked out by itself, and what a profile changed
  function detectedHtml(box, list, li) {
    var det = S.g.detected || SchemaModel.detect(S.g);
    var eff = SchemaModel.effectiveProfile(S.g);
    var h = '<h3>Detected</h3><div class="rel">';
    h += det.frameworks.length
      ? 'Looks like ' + det.frameworks.map(function (f) { return '<b>' + esc(f.name) + '</b> <small class="hint">(' + esc(f.evidence) + ')</small>'; }).join(', ') + '.'
      : 'No known framework found from the table names.';
    var fwCount = Object.keys(det.frameworkTables).length;
    if (fwCount) h += '<br><small class="hint">' + fwCount + ' framework table' + (fwCount > 1 ? 's are' : ' is') + ' grouped as "framework" and not reported as having no links or no primary key.</small>';
    h += '<br>People tables: ' + (eff.peopleTables.length ? eff.peopleTables.map(function (t) { return '<a class="lnk mono" data-goto="' + esc(t) + '">' + esc(t) + '</a>'; }).join(', ') : '<small class="hint">none found</small>') +
      '<br><small class="hint">A delete elsewhere that would erase rows in these by cascade is reported as high.</small>';
    if (eff.fromProfile) h += '<br><small class="hint">A project profile' + (eff.name ? ' (' + esc(eff.name) + ')' : '') + ' is loaded and overrides what it sets.</small>';
    h += '</div>';
    var areas = Object.keys(det.areas).sort(function (a, b) { return det.areas[b].length - det.areas[a].length; });
    if (areas.length) {
      h += box('Areas found from table names', areas.length, '<p class="hint">Colour by Domain uses these when tables do not share a prefix.</p>' +
        list(areas, function (a) { return '<li><span>' + esc(a) + '</span><small>' + det.areas[a].map(esc).join(', ') + '</small></li>'; }));
    }
    return h;
  }

  function renderInsights() {
    var ins = SchemaModel.insights(S.g);
    var box = function (title, count, body, open) {
      return '<details class="box"' + (open ? ' open' : '') + '><summary>' + title + ' <small>(' + count + ')</small></summary>' + body + '</details>';
    };
    var list = function (items, fn) { return '<ul class="list">' + items.map(fn).join('') + '</ul>'; };
    var li = function (t, right) { return '<li data-goto="' + esc(t) + '"><span class="mono">' + esc(t) + '</span><small>' + (right == null ? '' : right) + '</small></li>'; };
    var src = S.current;
    var h = renderProblems();
    h += '<h3>' + esc(src.name) + '</h3><div class="stat-grid">' +
      '<div class="stat"><b>' + ins.tables + '</b><span>tables</span></div>' +
      '<div class="stat"><b>' + fmt(ins.columns) + '</b><span>columns</span></div>' +
      '<div class="stat"><b>' + ins.fks + '</b><span>foreign keys</span></div>' +
      '<div class="stat"><b>' + ins.inferred + '</b><span>guessed links</span></div>' +
      '<div class="stat"><b>' + ins.views + '</b><span>views</span></div>' +
      '<div class="stat"><b>' + (ins.rows == null ? '-' : fmt(ins.rows)) + '</b><span>rows</span></div></div>';
    h += detectedHtml(box, list, li);
    h += '<h3>Structure</h3>';
    h += box('Most referenced tables', ins.mostReferenced.length, list(ins.mostReferenced, function (x) { return li(x.table, x.count + ' tables point here'); }), true);
    h += box('Tables that depend on the most others', ins.mostDependent.length, list(ins.mostDependent, function (x) { return li(x.table, 'points to ' + x.count); }));
    h += box('Deletes that spread furthest', ins.cascadeHeavy.length, '<p class="hint">Deleting one row here also deletes rows in this many tables.</p>' + list(ins.cascadeHeavy, function (x) { return li(x.table, x.count + ' cascades'); }));
    if (ins.biggest.length) h += box('Largest tables', ins.biggest.length, list(ins.biggest, function (x) { return li(x.table, fmt(x.count) + ' rows'); }));
    h += '<h3>Worth checking</h3>';
    h += box('Columns that look like links but have no foreign key', ins.inferred_list.length,
      '<p class="hint">The database does not protect these. A deleted parent leaves rows pointing at nothing.</p>' +
      list(ins.inferred_list, function (r) { return li(r.from, esc(r.cols[0]) + ' &rarr; ' + esc(r.to)); }));
    h += box('<code>*_id</code> columns with no matching table', ins.orphanIds.length,
      '<p class="hint">Named like a link, but no table by that name exists in this schema.</p>' +
      '<ul class="list">' + ins.orphanIds.map(function (o) { return '<li title="' + esc(o.tables.join(', ')) + '"><span class="mono">' + esc(o.column) + '</span><small>in ' + o.tables.length + ' table' + (o.tables.length > 1 ? 's' : '') + '</small></li>'; }).join('') + '</ul>');
    if (ins.unindexed.length) h += box('Guessed links without an index', ins.unindexed.length, '<p class="hint">Joins on these columns scan the whole table.</p>' + list(ins.unindexed, function (r) { return li(r.from, esc(r.cols[0])); }));
    if (ins.typeMismatch.length) h += box('Foreign keys whose types differ', ins.typeMismatch.length, list(ins.typeMismatch, function (x) { return li(x.rel.from, esc(x.col + ': ' + x.childType + ' vs ' + x.parentType)); }));
    if (ins.missingTargets.length) h += box('Foreign keys to tables not in this export', ins.missingTargets.length, list(ins.missingTargets, function (r) { return li(r.from, '&rarr; ' + esc(r.to)); }));
    h += box('Tables without a primary key', ins.noPrimaryKey.length, list(ins.noPrimaryKey, function (t) { return li(t); }));
    h += box('Tables with no links at all', ins.isolated.length, list(ins.isolated, function (t) { return li(t); }));
    if (ins.morphs.length) h += box('Polymorphic links', ins.morphs.length, list(ins.morphs, function (x) { return li(x.table, esc(x.name + '_type / ' + x.idCol)); }));
    if (ins.emptyTables.length) h += box('Empty tables', ins.emptyTables.length, list(ins.emptyTables, function (t) { return li(t); }));
    if (src.model.warnings.length) h += box('Parser warnings', src.model.warnings.length, '<ul class="list">' + src.model.warnings.map(function (w) { return '<li><small>' + esc(w) + '</small></li>'; }).join('') + '</ul>');
    $('insightsOut').innerHTML = h;
    bindProblemButtons($('insightsOut'));
  }

  // ---------- compare ----------

  function runCompare() {
    var a = S.schemas.find(function (s) { return s.id === $('cmpA').value; });
    var b = S.schemas.find(function (s) { return s.id === $('cmpB').value; });
    var out = $('cmpOut');
    if (!a || !b || a === b) { out.innerHTML = '<p class="hint">Choose two different schemas. Import another schema to have something to compare.</p>'; return; }
    var d = SchemaModel.diff(a.model, b.model);
    var h = '<div class="stat-grid" style="margin-top:12px">' +
      '<div class="stat"><b style="color:var(--ok)">' + d.addedTables.length + '</b><span>tables only in "' + esc(b.name) + '"</span></div>' +
      '<div class="stat"><b style="color:var(--danger)">' + d.removedTables.length + '</b><span>tables only in "' + esc(a.name) + '"</span></div>' +
      '<div class="stat"><b style="color:var(--warn)">' + d.changed.length + '</b><span>tables that differ</span></div></div>';
    if (!d.addedTables.length && !d.removedTables.length && !d.changed.length) h += '<p class="hint">The two structures are the same.</p>';
    if (d.addedTables.length) h += '<h3>Only in ' + esc(b.name) + '</h3><ul class="list">' + d.addedTables.map(function (t) { return '<li data-goto="' + esc(t) + '"><span class="mono">' + esc(t) + '</span><span class="tag added">new</span></li>'; }).join('') + '</ul>';
    if (d.removedTables.length) h += '<h3>Only in ' + esc(a.name) + '</h3><ul class="list">' + d.removedTables.map(function (t) { return '<li data-goto="' + esc(t) + '"><span class="mono">' + esc(t) + '</span><span class="tag removed">missing</span></li>'; }).join('') + '</ul>';
    if (d.changed.length) {
      h += '<h3>Changed tables</h3>';
      d.changed.forEach(function (c) {
        var lines = [];
        c.addedCols.forEach(function (x) { lines.push('<span class="tag added">+ col</span> ' + esc(x)); });
        c.removedCols.forEach(function (x) { lines.push('<span class="tag removed">- col</span> ' + esc(x)); });
        c.typeChanged.forEach(function (x) { lines.push('<span class="tag changed">type</span> ' + esc(x)); });
        c.addedFks.forEach(function (x) { lines.push('<span class="tag added">+ fk</span> ' + esc(x)); });
        c.removedFks.forEach(function (x) { lines.push('<span class="tag removed">- fk</span> ' + esc(x)); });
        h += '<details class="box"><summary class="mono">' + esc(c.table) + ' <small>(' + lines.length + ')</small></summary><div class="mono" style="font-size:12px;line-height:1.9">' + lines.join('<br>') + '</div></details>';
      });
    }
    if (d.addedTables.length || d.removedTables.length || d.changed.length) {
      h = '<button class="primary" id="cmpMap" style="margin-top:10px">Show the differences on the map</button>' + h;
    }
    out.innerHTML = h;
    if ($('cmpMap')) $('cmpMap').onclick = function () { showDiffMap(a, b, d); };
  }

  // Both schemas merged into one map: new tables green, missing ones red, changed ones amber.
  function showDiffMap(a, b, d) {
    var merged = { tables: {}, views: JSON.parse(JSON.stringify(b.model.views)), triggers: b.model.triggers, warnings: [] };
    Object.keys(b.model.tables).forEach(function (n) { merged.tables[n] = JSON.parse(JSON.stringify(b.model.tables[n])); });
    d.removedTables.forEach(function (n) { merged.tables[n] = JSON.parse(JSON.stringify(a.model.tables[n])); });
    var status = {};
    var changes = {};
    d.addedTables.forEach(function (n) { status[n] = 'added'; });
    d.removedTables.forEach(function (n) { status[n] = 'removed'; });
    d.changed.forEach(function (c) { status[c.table] = 'changed'; changes[c.table] = c; });
    var entry = { id: 'diff', name: 'Differences: ' + a.name + ' to ' + b.name, model: merged, transient: true, baseId: a.id,
      diff: { status: status, changes: changes, a: a.name, b: b.name, counts: { added: d.addedTables.length, removed: d.removedTables.length, changed: d.changed.length } } };
    addSchema(entry, false);
    loadSchema('diff');
    render(true);
  }

  function diffDetailsHtml(name) {
    var df = S.current.diff;
    var st = df.status[name];
    if (st === 'added') return '<div class="issue sev-border-low"><span class="tag added">new</span> Only in ' + esc(df.b) + '.</div>';
    if (st === 'removed') return '<div class="issue sev-border-high"><span class="tag removed">missing</span> Only in ' + esc(df.a) + '; not in ' + esc(df.b) + '.</div>';
    var c = df.changes[name];
    var lines = [];
    c.addedCols.forEach(function (x) { lines.push('<span class="tag added">+ col</span> ' + esc(x)); });
    c.removedCols.forEach(function (x) { lines.push('<span class="tag removed">- col</span> ' + esc(x)); });
    c.typeChanged.forEach(function (x) { lines.push('<span class="tag changed">type</span> ' + esc(x)); });
    c.addedFks.forEach(function (x) { lines.push('<span class="tag added">+ fk</span> ' + esc(x)); });
    c.removedFks.forEach(function (x) { lines.push('<span class="tag removed">- fk</span> ' + esc(x)); });
    return '<div class="issue sev-border-medium"><b>Differs between ' + esc(df.a) + ' and ' + esc(df.b) + '</b><div class="mono" style="font-size:12px;line-height:1.9">' + lines.join('<br>') + '</div></div>';
  }

  // ---------- search ----------

  var searchHits = [];
  var searchIdx = 0;
  function runSearch() {
    var q = $('search').value.trim().toLowerCase();
    var box = $('searchResults');
    if (!q || !S.g) { box.style.display = 'none'; return; }
    var names = S.g.names.concat(Object.keys(S.g.model.views));
    var tables = names.filter(function (n) { return n.toLowerCase().indexOf(q) >= 0; })
      .sort(function (a, b) { return (a.toLowerCase().indexOf(q) === 0 ? 0 : 1) - (b.toLowerCase().indexOf(q) === 0 ? 0 : 1) || a.length - b.length; })
      .map(function (n) { return { table: n, label: n, note: S.d.groups[n] || 'view' }; });
    var cols = [];
    S.g.names.forEach(function (n) {
      S.g.model.tables[n].columns.forEach(function (c) {
        if (c.name.toLowerCase().indexOf(q) >= 0 && cols.length < 60) cols.push({ table: n, label: n + '.' + c.name, note: c.type });
      });
    });
    searchHits = tables.slice(0, 25).concat(cols.slice(0, 40));
    searchIdx = 0;
    if (!searchHits.length) { box.innerHTML = '<div><small>No table or column matches</small></div>'; box.style.display = 'block'; return; }
    box.innerHTML = searchHits.map(function (h, i) {
      return '<div data-i="' + i + '" class="' + (i === 0 ? 'active' : '') + '"><span class="mono">' + esc(h.label) + '</span><small>' + esc(h.note) + '</small></div>';
    }).join('');
    box.style.display = 'block';
    box.querySelectorAll('[data-i]').forEach(function (el) { el.onmousedown = function (e) { e.preventDefault(); pickSearch(+el.dataset.i); }; });
  }

  function pickSearch(i) {
    var h = searchHits[i];
    if (!h) return;
    $('searchResults').style.display = 'none';
    $('search').blur();
    goTo(h.table);
  }

  function goTo(name) {
    // inside the spotlight, a table link steps the spotlight to that table
    if (window.Spotlight && window.Spotlight.isOpen()) { window.Spotlight.open(name); return; }
    if (!cy.getElementById(name).length) {
      if (S.focus || S.hiddenGroups[S.d.groups[name]]) setFocus(name, 1);
      else { S.selected = name; render(true); select(name, { center: true }); }
      return;
    }
    select(name, { center: true });
  }

  // ---------- import ----------

  function failImport(message) {
    busy(false);
    $('importMsg').textContent = message;
    toast(message);
  }

  // Any file: a SQL dump (plain or .gz), a Joinscope JSON file or catalogue result, or a
  // SQLite database. Told apart by their first bytes, whatever the file is called.
  function readFile(file) {
    busy('Reading ' + file.name + ' ...');
    var name = $('importName').value.trim() || file.name.replace(/\.(sql|gz|txt|json|sqlite3?|db3?)+$/i, '');
    var fail = function (e) { failImport('Could not read the file: ' + e.message); };
    // the first bytes say what it is; a large text dump is then read once, as text
    file.slice(0, 16).arrayBuffer().then(function (buf) {
      var head = new Uint8Array(buf);
      if (head[0] === 0x1f && head[1] === 0x8b) {
        if (typeof DecompressionStream === 'undefined') return failImport('This browser cannot open .gz files. Unzip it first.');
        return new Response(file.stream().pipeThrough(new DecompressionStream('gzip'))).text()
          .then(function (text) { importText(text, name); }, function (e) { failImport('Could not unzip: ' + e.message); });
      }
      if (window.SqliteFile && SqliteFile.isSqlite(head)) {
        busy('Opening the SQLite database in this browser ...');
        return file.arrayBuffer().then(function (all) {
          return SqliteFile.read(new Uint8Array(all)).then(function (model) { importModel(model, name); }, function (e) { failImport('Could not read this SQLite file: ' + e.message); });
        }, fail);
      }
      file.text().then(function (text) { importText(text, name); }, fail);
    }, fail);
  }

  // Text: JSON (a Joinscope schema or a catalogue query's result) or SQL.
  function importText(text, name) {
    busy('Reading the structure ...');
    setTimeout(function () {
      var model;
      var json = window.SchemaJson && SchemaJson.looksLikeJson(text);
      try {
        model = json ? SchemaJson.parseText(text) : SchemaParser.parse(text);
      } catch (e) {
        return failImport((json ? 'Could not read this JSON: ' : 'Could not read this SQL: ') + e.message);
      }
      importModel(model, name);
    }, 30);
  }

  var DIALECT_NAMES = { mysql: 'MySQL / MariaDB', postgres: 'PostgreSQL', sqlite: 'SQLite', sqlserver: 'SQL Server', other: 'Schema' };

  function importModel(model, name) {
    busy(false);
    var count = Object.keys(model.tables).length;
    if (!count) {
      $('importMsg').textContent = model.dialect === 'sqlserver' ? model.warnings[0] : 'No tables found. Export the structure (CREATE TABLE statements), or use a catalogue query.';
      return;
    }
    // it must load before it is remembered, so a broken file can never break the page next time
    try { SchemaModel.issues(SchemaModel.build(model)); } catch (e) { return failImport('Could not make sense of this schema: ' + e.message); }
    var entry = { id: 'imp-' + Date.now(), name: name || 'imported', when: new Date().toISOString().slice(0, 16).replace('T', ' '), model: model };
    addSchema(entry, true);
    $('importDlg').close();
    $('pasteSql').value = '';
    $('importName').value = '';
    $('importMsg').textContent = '';
    loadSchema(entry.id);
    toast('Loaded ' + count + ' tables from ' + (DIALECT_NAMES[model.dialect] || 'the file') + (model.hasData ? ', and counted ' + fmt(model.insertRows) + ' rows' : '') + (model.warnings.length ? ', with ' + model.warnings.length + ' warnings (see the bottom of Health)' : ''));
  }

  function bindImport() {
    var dlg = $('importDlg');
    $('importBtn').onclick = function () { dlg.showModal(); };
    dlg.querySelectorAll('[data-close]').forEach(function (b) { b.onclick = function () { dlg.close(); }; });
    var zone = $('dropZone');
    zone.onclick = function () { $('fileInput').click(); };
    $('fileInput').onchange = function () { if (this.files[0]) readFile(this.files[0]); this.value = ''; };
    ['dragover', 'dragenter'].forEach(function (ev) { zone.addEventListener(ev, function (e) { e.preventDefault(); e.stopPropagation(); zone.classList.add('over'); }); });
    ['dragleave', 'drop'].forEach(function (ev) { zone.addEventListener(ev, function () { zone.classList.remove('over'); }); });
    zone.addEventListener('drop', function (e) { e.preventDefault(); e.stopPropagation(); if (e.dataTransfer.files[0]) readFile(e.dataTransfer.files[0]); });
    $('importGo').onclick = function () {
      var t = $('pasteSql').value;
      if (!t.trim()) { $('importMsg').textContent = 'Paste some SQL or a query result, or drop a file.'; return; }
      importText(t, $('importName').value.trim() || (window.SchemaJson && SchemaJson.looksLikeJson(t) ? 'from a query' : 'pasted SQL'));
    };
    // "From a query": show the catalogue query for the chosen database, ready to copy
    var showQuery = function () {
      var key = $('queryDb').value;
      var text = (window.JOINSCOPE_QUERIES || {})[key] || '';
      $('queryText').textContent = text;
    };
    if ($('queryDb')) {
      $('queryDb').onchange = showQuery;
      showQuery();
      $('copyQuery').onclick = function () { copy($('queryText').textContent, 'Query copied. Run it, then paste its one cell below.'); };
    }
    // drop anywhere on the page
    var overlay = $('dropOverlay');
    var depth = 0;
    window.addEventListener('dragenter', function (e) { if (dlg.open || !e.dataTransfer || Array.prototype.indexOf.call(e.dataTransfer.types, 'Files') < 0) return; depth++; overlay.style.display = 'flex'; });
    window.addEventListener('dragleave', function () { if (--depth <= 0) { depth = 0; overlay.style.display = 'none'; } });
    window.addEventListener('dragover', function (e) { e.preventDefault(); });
    window.addEventListener('drop', function (e) {
      e.preventDefault();
      depth = 0;
      overlay.style.display = 'none';
      if (!dlg.open && e.dataTransfer.files[0]) readFile(e.dataTransfer.files[0]);
    });
  }

  // ---------- exports ----------

  function download(name, content, mime) {
    var blob = content instanceof Blob ? content : new Blob([content], { type: mime || 'text/plain' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }

  function copy(text, msg) {
    var fallback = function () {
      var ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand('copy'); toast(msg); } catch (e) { toast('Copy failed'); }
      ta.remove();
    };
    if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(text).then(function () { toast(msg); }, fallback);
    else fallback();
  }

  function slug() { return (S.current ? S.current.name : 'schema').replace(/[^\w.-]+/g, '_'); }

  function exportAs(kind) {
    var g = S.g;
    if (kind === 'png') {
      download(slug() + '-graph.png', cy.png({ full: true, scale: 2, bg: css('--bg'), output: 'blob', maxWidth: 12000, maxHeight: 12000 }));
    } else if (kind === 'mermaid') {
      var names = cy.nodes('.tbl').map(function (n) { return n.id(); });
      var ids = {};
      cy.edges().forEach(function (e) { ids[e.id()] = true; });
      var rels = g.relations.filter(function (r) { return ids[r.id]; });
      var text = SchemaModel.mermaid(g, names, rels);
      download(slug() + '-erd.md', '# ' + (S.focus ? S.focus.label : S.current.name) + '\n\n```mermaid\n' + text + '\n```\n', 'text/markdown');
    } else if (kind === 'dict-csv') {
      var rows = SchemaModel.dictionaryRows(g);
      var cols = ['table', 'column', 'type', 'nullable', 'default', 'key', 'references', 'comment'];
      var q = function (v) { v = String(v == null ? '' : v); return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };
      // the leading byte-order mark makes Excel read the file as UTF-8
      download(slug() + '-data-dictionary.csv', '﻿' + [cols.join(',')].concat(rows.map(function (r) { return cols.map(function (c) { return q(r[c]); }).join(','); })).join('\r\n'), 'text/csv');
    } else if (kind === 'dict-md') {
      var all = SchemaModel.dictionaryRows(g);
      var md = ['# Data dictionary: ' + S.current.name, ''];
      g.names.forEach(function (n) {
        var t = g.model.tables[n];
        md.push('## ' + n, '');
        if (t.comment) md.push(t.comment, '');
        md.push(t.columns.length + ' columns' + (t.rows != null ? ', ' + fmt(t.rows) + ' rows' : '') + '.', '');
        md.push('| Column | Type | Null | Default | Key | References | Comment |', '|---|---|---|---|---|---|---|');
        all.filter(function (r) { return r.table === n; }).forEach(function (r) {
          md.push('| `' + r.column + '` | ' + r.type.replace(/\|/g, '\\|') + ' | ' + r.nullable + ' | ' + String(r.default).replace(/\|/g, '\\|') + ' | ' + r.key + ' | ' + r.references + ' | ' + String(r.comment || '').replace(/\|/g, '\\|').replace(/\s*\n\s*/g, ' ') + ' |');
        });
        md.push('');
      });
      download(slug() + '-data-dictionary.md', md.join('\n'), 'text/markdown');
    } else if (kind === 'fixes') {
      download(slug() + '-suggested-fixes.sql', SchemaModel.fixScript(S.issues.list, S.current.name, S.g.model.dialect), 'text/plain');
    } else if (kind === 'json') {
      // Joinscope's schema format (docs/schema-format.md): it can be imported again, anywhere
      download(slug() + '-schema.json', JSON.stringify(SchemaJson.fromModel(g.model, S.current.name), null, 2), 'application/json');
    }
  }

  // ---------- misc UI ----------

  var toastTimer;
  function toast(msg) {
    var t = $('toast');
    t.textContent = msg;
    t.style.display = 'block';
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.style.display = 'none'; }, 3200);
  }

  function busy(msg) {
    $('busy').style.display = msg ? 'flex' : 'none';
    if (msg) $('busyMsg').textContent = msg;
  }

  function openTab(name) {
    document.querySelectorAll('.tabs button').forEach(function (b) { b.classList.toggle('on', b.dataset.tab === name); });
    document.querySelectorAll('.tab').forEach(function (t) { t.classList.toggle('on', t.id === 'tab-' + name); });
    if (window.innerWidth <= 900) $('side').classList.add('open');
  }

  function applyTheme(t) {
    if (t) document.documentElement.setAttribute('data-theme', t); else document.documentElement.removeAttribute('data-theme');
    if (cy) { cy.style(style()); if (S.opts.er) render(false); else applyHighlights(); }
    if (window.Spotlight) window.Spotlight.refresh();
  }

  // ---------- presentation mode ----------

  // the browser takes a moment to switch to full screen, so fit after the size settles
  function afterResize() {
    [60, 250, 600].forEach(function (ms) {
      setTimeout(function () { fitGraph(); if (window.Spotlight) window.Spotlight.refresh(); }, ms);
    });
  }

  function togglePresent() {
    var on = !document.body.classList.contains('present');
    document.body.classList.toggle('present', on);
    $('fsBtn').textContent = on ? 'Exit full screen' : 'Full screen';
    var req = null;
    try {
      if (on && document.documentElement.requestFullscreen && !document.fullscreenElement) req = document.documentElement.requestFullscreen();
      else if (!on && document.fullscreenElement) req = document.exitFullscreen();
    } catch (e) { req = null; }
    // the browser may refuse (inside a frame, or without a click); the panels stay hidden either way
    if (req && req.catch) req.catch(function () { if (on) toast('The browser kept its window size. Panels are hidden; press P or Esc to bring them back.'); });
    afterResize();
  }

  // ---------- effects: moving links and a pulse on the selected table ----------

  var flowOffset = 0;
  var lastFlow = 0;
  function flowTick(ts) {
    if (cy && S.opts.effects && ts - lastFlow > 40 && !document.hidden) {
      lastFlow = ts;
      var fl = cy.edges('.flow');
      if (fl.length) { flowOffset -= 1.2; fl.style('line-dash-offset', flowOffset); }
      var sel = cy.nodes('.sel');
      if (sel.length) sel.style('underlay-opacity', 0.22 + 0.18 * (1 + Math.sin(ts / 260)) / 2);
    }
    requestAnimationFrame(flowTick);
  }
  requestAnimationFrame(flowTick);

  function setEffects(on) {
    S.opts.effects = on;
    store.set('opts', S.opts);
    document.documentElement.classList.toggle('fx', on);
    $('optEffects').checked = on;
    $('fxBtn').classList.toggle('on', on);
    $('fxBtn').setAttribute('aria-pressed', on ? 'true' : 'false');
    if (cy) {
      if (!on) { cy.edges().removeStyle('line-dash-offset'); cy.nodes().removeStyle('underlay-opacity'); }
      cy.style(style());
      applyHighlights();
    }
    if (window.Spotlight) window.Spotlight.refresh();
  }

  // ---------- command bar ----------

  function openSpotlight(name) {
    if (window.Spotlight) window.Spotlight.open(name);
  }

  function tableMatches(q, n) {
    q = (q || '').trim().toLowerCase().replace(/\s+/g, '_');
    if (!q) return [];
    var names = S.g.names.concat(Object.keys(S.g.model.views));
    var exact = names.filter(function (x) { return x.toLowerCase() === q; });
    var starts = names.filter(function (x) { return x.toLowerCase().indexOf(q) === 0 && exact.indexOf(x) < 0; });
    var sing = q.replace(/s$/, '');
    var inside = names.filter(function (x) { return x.toLowerCase().indexOf(sing) > 0 && starts.indexOf(x) < 0 && exact.indexOf(x) < 0; });
    return exact.concat(starts.sort(function (a, b) { return a.length - b.length; }), inside.sort(function (a, b) { return a.length - b.length; })).slice(0, n || 5);
  }

  function commandsFor(text) {
    var t = text.trim();
    var low = t.toLowerCase();
    var out = [];
    var add = function (label, run, hint) { out.push({ label: label, run: run, hint: hint || '' }); };
    var m;
    if ((m = low.match(/^(?:path|route|join|how (?:is|are|do(?:es)?)?)?\s*(?:from\s+)?([\w ]+?)\s+(?:to|and|with|->)\s+([\w ]+?)(?:\s+connected)?\??$/))) {
      var a = tableMatches(m[1], 1)[0], b = tableMatches(m[2], 1)[0];
      if (a && b && a !== b) add('Path from ' + a + ' to ' + b, function () { $('pathFrom').value = a; $('pathTo').value = b; openTab('path'); runPath(); }, 'with the JOIN');
    }
    if ((m = low.match(/^(?:impact|delete|what happens (?:if|when) (?:i )?delete(?: a| an| one)?)\s+([\w ]+?)\??$/))) {
      tableMatches(m[1], 3).forEach(function (n) { add('Delete impact of ' + n, function () { $('impactTable').value = n; openTab('impact'); runImpact(); }); });
    }
    if ((m = low.match(/^(?:focus|neighbou?rs(?: of)?|around)\s+([\w ]+)$/))) {
      tableMatches(m[1], 3).forEach(function (n) { add('Neighbours of ' + n, function () { setFocus(n, 1); }); });
    }
    if ((m = low.match(/^(?:column|find column|where is)\s+([\w]+)$/))) {
      var q = m[1];
      S.g.names.forEach(function (n) { S.g.model.tables[n].columns.forEach(function (c) { if (c.name.toLowerCase().indexOf(q) >= 0 && out.length < 12) add(n + '.' + c.name, function () { openSpotlight(n); }, c.type); }); });
    }
    var actions = [
      [/^(problems?|issues?|health|check)/, 'Show problems and fixes', function () { openTab('insights'); toggleProblems(true); }],
      [/^(fix|fixes|fix script)/, 'Download the fix script', function () { exportAs('fixes'); }],
      [/^(full|present|big|screen)/, 'Full-screen presentation', togglePresent],
      [/^(map|group)/, 'Group map on or off', function () { $('optBoxes').click(); }],
      [/^(er|columns|diagram)/, 'ER diagram mode on or off', function () { $('optEr').click(); }],
      [/^(jarvis|stark)/, 'Jarvis: effects on with the HUD look', function () { setEffects(true); store.set('theme', 'hud'); applyTheme('hud'); }],
      [/^(effects|motion|animat)/, 'Effects ' + (S.opts.effects ? 'off' : 'on'), function () { setEffects(!S.opts.effects); }],
      [/^(hud)/, 'HUD theme', function () { store.set('theme', 'hud'); applyTheme('hud'); }],
      [/^(dark)/, 'Dark theme', function () { store.set('theme', 'dark'); applyTheme('dark'); }],
      [/^(light)/, 'Light theme', function () { store.set('theme', 'light'); applyTheme('light'); }],
      [/^(all|everything|reset|home)/, 'Show everything', function () { if (window.Spotlight) window.Spotlight.close(); clearFocus(); }],
      [/^(spread|space|wider)/, 'Spread the graph out more', function () { S.opts.spacing = Math.min(3, (S.opts.spacing || 1) + 0.4); $('optSpacing').value = S.opts.spacing; $('optSpacing').onchange(); }],
      [/^(import|load)/, 'Import a database', function () { $('importDlg').showModal(); }],
      [/^(png|picture|export)/, 'Save a picture of the graph', function () { exportAs('png'); }]
    ];
    // a table whose name starts with the text comes before actions, so "errors" is not taken by "er"
    if (low && !/^(spotlight|show|open|table)\s/.test(low)) {
      var lead = low.replace(/\s+/g, '_');
      tableMatches(low, 3).filter(function (n) { return n.toLowerCase().indexOf(lead) === 0; }).forEach(function (n) {
        add('Spotlight ' + n, function () { openSpotlight(n); }, (S.g.model.tables[n] ? S.g.model.tables[n].columns.length + ' columns' : 'view'));
      });
    }
    var before = out.length;
    actions.forEach(function (a) { if (low && a[0].test(low)) add(a[1], a[2]); });
    if (out.length === before || /^(spotlight|show|open|table)\s/.test(low)) {
      var q2 = low.replace(/^(spotlight|show|open|table)\s+/, '');
      tableMatches(q2, 6).forEach(function (n) {
        if (out.some(function (o) { return o.label === 'Spotlight ' + n; })) return;
        add('Spotlight ' + n, function () { openSpotlight(n); }, (S.g.model.tables[n] ? S.g.model.tables[n].columns.length + ' columns' : 'view'));
      });
      var first = tableMatches(q2, 1)[0];
      if (first) {
        add('Delete impact of ' + first, function () { $('impactTable').value = first; openTab('impact'); runImpact(); });
        add('Neighbours of ' + first, function () { setFocus(first, 1); });
      }
    }
    if (!low) {
      add('Show problems and fixes', function () { openTab('insights'); toggleProblems(true); }, 'try: problems');
      add('Full-screen presentation', togglePresent, 'try: present');
      add('HUD theme', function () { store.set('theme', 'hud'); applyTheme('hud'); }, 'try: jarvis');
      var deg = function (n) { var x = S.d.degree[n]; return x ? x.inn + x.out : 0; };
      var star = S.g.names.slice().sort(function (a, b) { return deg(b) - deg(a); })[0];
      if (star) add('Spotlight ' + star, function () { openSpotlight(star); }, 'try: ' + star);
    }
    return out.slice(0, 12);
  }

  var cmdItems = [];
  var cmdIdx = 0;
  function openCommand() {
    var dlg = $('cmdDlg');
    if (!dlg.open) dlg.showModal();
    $('cmdInput').value = '';
    updateCommand();
    $('cmdInput').focus();
  }
  function updateCommand() {
    cmdItems = commandsFor($('cmdInput').value);
    cmdIdx = 0;
    $('cmdList').innerHTML = cmdItems.map(function (c, i) {
      return '<div class="cmd-item' + (i === 0 ? ' active' : '') + '" data-i="' + i + '"><span>' + esc(c.label) + '</span><small>' + esc(c.hint) + '</small></div>';
    }).join('') || '<div class="cmd-item"><small>Nothing matches. Try a table name, "A to B", "delete A", "problems".</small></div>';
    $('cmdList').querySelectorAll('[data-i]').forEach(function (el) { el.onclick = function () { runCommand(+el.dataset.i); }; });
  }
  function runCommand(i) {
    var c = cmdItems[i];
    if (!c) return;
    $('cmdDlg').close();
    c.run();
  }
  function bindCommand() {
    $('cmdInput').addEventListener('input', updateCommand);
    $('cmdInput').addEventListener('keydown', function (e) {
      var items = $('cmdList').querySelectorAll('[data-i]');
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        cmdIdx = (cmdIdx + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % Math.max(items.length, 1);
        items.forEach(function (el, k) { el.classList.toggle('active', k === cmdIdx); });
      } else if (e.key === 'Enter') { e.preventDefault(); runCommand(cmdIdx); }
    });
    $('cmdDlg').addEventListener('click', function (e) { if (e.target === $('cmdDlg')) $('cmdDlg').close(); });
  }

  function bindUi() {
    document.querySelectorAll('.tabs button').forEach(function (b) { b.onclick = function () { openTab(b.dataset.tab); }; });
    // On a narrow screen the panel slides over the map; on a wide one it is
    // hidden or shown, the map takes the room, and the choice is remembered.
    var narrow = window.matchMedia('(max-width: 900px)');
    var setSideHidden = function (hidden) {
      document.body.classList.toggle('side-hidden', hidden);
      $('sideToggle').setAttribute('aria-expanded', String(!hidden));
      store.set('sideHidden', hidden);
      if (cy) setTimeout(function () { cy.resize(); }, 0);
    };
    setSideHidden(!!store.get('sideHidden', false));
    $('sideToggle').onclick = function () {
      if (narrow.matches) $('side').classList.toggle('open');
      else setSideHidden(!document.body.classList.contains('side-hidden'));
    };
    $('schemaSelect').onchange = function () {
      if (this.value === '__forget') {
        var preloaded = S.current && (S.current.id === 'default' || S.current.id.indexOf('extra:') === 0);
        if (S.current && !preloaded && confirm('Forget "' + S.current.name + '"? You can import it again later.')) forgetSchema(S.current.id);
        else { this.value = S.current ? S.current.id : ''; if (preloaded) toast('Preloaded samples cannot be forgotten.'); }
        return;
      }
      loadSchema(this.value);
    };
    $('pathGo').onclick = runPath;
    $('pathClear').onclick = function () { $('pathOut').innerHTML = ''; clearFocus(); };
    $('impactGo').onclick = runImpact;
    $('impactClear').onclick = function () { $('impactOut').innerHTML = ''; clearFocus(); };
    $('cmpGo').onclick = runCompare;
    ['pathFrom', 'pathTo'].forEach(function (id) { $(id).addEventListener('keydown', function (e) { if (e.key === 'Enter') runPath(); }); });
    $('impactTable').addEventListener('keydown', function (e) { if (e.key === 'Enter') runImpact(); });
    $('zIn').onclick = function () { cy.zoom({ level: cy.zoom() * 1.3, renderedPosition: { x: cy.width() / 2, y: cy.height() / 2 } }); };
    $('zOut').onclick = function () { cy.zoom({ level: cy.zoom() / 1.3, renderedPosition: { x: cy.width() / 2, y: cy.height() / 2 } }); };
    $('zFit').onclick = fitGraph;
    $('zRelayout').onclick = function () { render(true); };
    $('exportBtn').onclick = function (e) { e.stopPropagation(); $('exportMenu').classList.toggle('on'); };
    document.addEventListener('click', function () { $('exportMenu').classList.remove('on'); });
    $('exportMenu').querySelectorAll('[data-export]').forEach(function (b) { b.onclick = function () { exportAs(b.dataset.export); }; });
    $('themeBtn').onclick = function () {
      var cur = document.documentElement.getAttribute('data-theme') ||
        (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
      var next = cur === 'light' ? 'dark' : cur === 'dark' ? 'hud' : 'light';
      store.set('theme', next);
      applyTheme(next);
      toast(next === 'hud' ? 'HUD theme' : next === 'dark' ? 'Dark theme' : 'Light theme');
    };
    $('issuesBtn').onclick = function () { openTab('insights'); if (!S.opts.problems) toggleProblems(true); };
    $('fsBtn').onclick = togglePresent;
    $('zFull').onclick = togglePresent;
    $('cmdBtn').onclick = openCommand;
    $('fxBtn').onclick = function () { setEffects(!S.opts.effects); toast('Effects ' + (S.opts.effects ? 'on' : 'off')); };
    $('optEffects').onchange = function () { setEffects(this.checked); };
    $('pCmd').onclick = openCommand;
    $('pExit').onclick = togglePresent;
    document.addEventListener('fullscreenchange', function () {
      // leaving full screen with Esc or F11 also leaves presentation mode
      if (!document.fullscreenElement && document.body.classList.contains('present')) { document.body.classList.remove('present'); $('fsBtn').textContent = 'Full screen'; }
      afterResize();
    });

    var search = $('search');
    search.addEventListener('input', runSearch);
    search.addEventListener('focus', runSearch);
    search.addEventListener('blur', function () { setTimeout(function () { $('searchResults').style.display = 'none'; }, 150); });
    search.addEventListener('keydown', function (e) {
      var items = $('searchResults').querySelectorAll('[data-i]');
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        searchIdx = (searchIdx + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % Math.max(items.length, 1);
        items.forEach(function (el, i) { el.classList.toggle('active', i === searchIdx); });
        if (items[searchIdx]) items[searchIdx].scrollIntoView({ block: 'nearest' });
      } else if (e.key === 'Enter') { pickSearch(searchIdx); }
      else if (e.key === 'Escape') { search.blur(); }
    });

    // links to tables anywhere in the side panels
    document.addEventListener('click', function (e) {
      var el = e.target.closest('[data-goto]');
      if (!el || !S.g) return;
      var name = el.dataset.goto;
      if (!S.g.model.tables[name] && !S.g.model.views[name]) { toast(name + ' is not in the schema shown now.'); return; }
      if (window.innerWidth <= 900) $('side').classList.remove('open');
      goTo(name);
    });

    document.addEventListener('keydown', function (e) {
      var typing = /INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName);
      if ((e.key === 'k' || e.key === 'K') && (e.ctrlKey || e.metaKey)) { e.preventDefault(); openCommand(); return; }
      if (window.Spotlight && window.Spotlight.isOpen()) return;
      if (e.key === '/' && !typing) { e.preventDefault(); search.focus(); }
      else if ((e.key === 'p' || e.key === 'P') && !typing && !e.ctrlKey && !e.metaKey) togglePresent();
      else if (e.key === 'Escape' && !typing && !$('importDlg').open) {
        if (S.selected) clearSelection(); else if (S.focus) clearFocus(); else if (document.body.classList.contains('present')) togglePresent();
      } else if ((e.key === 'f' || e.key === 'F') && !typing && !e.ctrlKey && !e.metaKey && cy) fitGraph();
    });
  }

  // ---------- start ----------

  function start() {
    applyTheme(store.get('theme', null));
    setEffects(S.opts.effects);
    bindOptions();
    bindUi();
    bindImport();
    bindCommand();
    if (window.DEFAULT_SCHEMA) {
      var D = window.DEFAULT_SCHEMA;
      var preloaded = SchemaParser.parse(D.sql, { rowCounts: D.rowCounts });
      preloaded.usage = D.usage || null;
      addSchema({ id: 'default', name: D.label || (D.name + ' (preloaded ' + D.generatedAt + ')'), when: D.generatedAt, model: preloaded }, false);
    }
    // Further preloaded schemas, so Compare works without importing.
    Object.keys(window.EXTRA_SCHEMAS || {}).forEach(function (id) {
      var X = window.EXTRA_SCHEMAS[id];
      var model = SchemaParser.parse(X.sql, { rowCounts: X.rowCounts });
      model.usage = X.usage || null;
      addSchema({ id: 'extra:' + id, name: X.label || (X.name + ' (preloaded ' + X.generatedAt + ')'), when: X.generatedAt, model: model }, false);
    });
    store.get('schemas', []).forEach(function (s) { addSchema({ id: s.id, name: s.name, when: s.when, model: s.model }, false); });
    var hp = hashParams();
    var last = hp.schema || store.get('lastSchema', 'default');
    loadSchema(S.schemas.some(function (s) { return s.id === last; }) ? last : (S.schemas[0] && S.schemas[0].id));
    if (hp.table && S.g && (S.g.model.tables[hp.table] || S.g.model.views[hp.table])) setTimeout(function () { goTo(hp.table); }, 50);
    if (S.g) setTimeout(function () { openFromHash(hp); }, 80);
    if (!S.schemas.length) $('importDlg').showModal();
  }

  // Links that open a view: #view=health, #view=impact&table=users, #view=path&from=a&to=b,
  // #view=compare&a=default&b=extra:id, plus #schema=<id> and #table=<name>. Spotlight reads #spot=<name>.
  function hashParams() {
    var out = {};
    location.hash.replace(/^#/, '').split('&').forEach(function (kv) {
      var i = kv.indexOf('=');
      if (i > 0) out[kv.slice(0, i)] = decodeURIComponent(kv.slice(i + 1));
    });
    return out;
  }

  function openFromHash(hp) {
    if (hp.view === 'health') { openTab('insights'); toggleProblems(true); }
    else if (hp.view === 'impact' && hp.table) { $('impactTable').value = hp.table; openTab('impact'); runImpact(); }
    else if (hp.view === 'path' && hp.from && hp.to) { $('pathFrom').value = hp.from; $('pathTo').value = hp.to; openTab('path'); runPath(); }
    else if (hp.view === 'compare') {
      if (hp.a) $('cmpA').value = hp.a;
      if (hp.b) $('cmpB').value = hp.b;
      openTab('compare'); runCompare();
      if (hp.map && $('cmpMap')) $('cmpMap').click();
    }
  }

  // shared with spotlight.js, and handy from the browser console
  window.SchemaExplorer = {
    S: S, esc: esc, fmt: fmt, toast: toast, copy: copy, goTo: goTo, setFocus: setFocus, openTab: openTab,
    impactOf: function (t) { $('impactTable').value = t; openTab('impact'); runImpact(); },
    pathBetween: function (a, b) { $('pathFrom').value = a; $('pathTo').value = b; openTab('path'); runPath(); },
    issueHtml: issueHtml, bindProblemButtons: bindProblemButtons, issueSummaryChips: issueSummaryChips, kindLabel: KIND_LABEL,
    colorOf: function (n) { return S.d.colors[S.d.groups[n]] || NEUTRAL; }, groupOf: function (n) { return S.d.groups[n]; },
    spotlight: openSpotlight, command: openCommand, present: togglePresent, effectsOn: function () { return !!S.opts.effects; }
  };
  start();
  Object.assign(window.SchemaExplorer, { state: S, select: goTo, focus: setFocus, path: function (a, b) { $('pathFrom').value = a; $('pathTo').value = b; openTab('path'); runPath(); }, impact: function (t) { $('impactTable').value = t; openTab('impact'); runImpact(); }, importSql: importText, importText: importText, compare: function () { openTab('compare'); runCompare(); }, tab: openTab, render: render, cy: function () { return cy; } });
})();
