/*
 * Analysis over a parsed schema: relations (declared, guessed, view), groups,
 * hubs, join paths, delete impact, insights, schema diff and exports.
 * No DOM access here, so it can be tested in Node.
 */
(function (root) {
  'use strict';

  // ---------- detection ----------
  // What made this schema, read from table and column names only (never from code).
  // `has` finds a table ignoring case; `tables` are the framework's own bookkeeping tables.
  var FRAMEWORKS = [
    { name: 'Laravel', key: 'laravel', evidence: 'a migrations table with a batch column',
      test: function (has, cols) { return has('migrations') && cols('migrations').indexOf('batch') >= 0; },
      tables: /^(migrations|failed_jobs|jobs|job_batches|password_resets|password_reset_tokens|personal_access_tokens|cache|cache_locks|sessions|telescope_\w+|websockets_\w+|pulse_\w+|oauth_\w+)$/i },
    { name: 'Django', key: 'django', evidence: 'a django_migrations table',
      test: function (has) { return has('django_migrations'); },
      tables: /^(django_\w+|auth_group|auth_permission|auth_group_permissions|auth_user_groups|auth_user_user_permissions|authtoken_token)$/i, people: ['auth_user'] },
    { name: 'Ruby on Rails', key: 'rails', evidence: 'schema_migrations and ar_internal_metadata tables',
      test: function (has) { return has('schema_migrations') && has('ar_internal_metadata'); },
      tables: /^(schema_migrations|ar_internal_metadata|active_storage_\w+|action_text_\w+|action_mailbox_\w+|solid_\w+)$/i },
    { name: 'Prisma', key: 'prisma', evidence: 'a _prisma_migrations table',
      test: function (has) { return has('_prisma_migrations'); }, tables: /^_prisma_migrations$/i },
    { name: 'Sequelize', key: 'sequelize', evidence: 'a SequelizeMeta table',
      test: function (has) { return has('SequelizeMeta'); }, tables: /^Sequelize(Meta|Data)$/i },
    { name: 'Knex', key: 'knex', evidence: 'a knex_migrations table',
      test: function (has) { return has('knex_migrations'); }, tables: /^knex_migrations(_lock)?$/i },
    { name: 'TypeORM', key: 'typeorm', evidence: 'a typeorm_metadata table',
      test: function (has) { return has('typeorm_metadata'); }, tables: /^typeorm_metadata$/i },
    { name: 'Doctrine (Symfony)', key: 'doctrine', evidence: 'a doctrine_migration_versions table',
      test: function (has) { return has('doctrine_migration_versions'); }, tables: /^(doctrine_migration_versions|messenger_messages)$/i },
    { name: 'Alembic (SQLAlchemy)', key: 'alembic', evidence: 'an alembic_version table',
      test: function (has) { return has('alembic_version'); }, tables: /^alembic_version$/i },
    { name: 'Flyway', key: 'flyway', evidence: 'a flyway_schema_history table',
      test: function (has) { return has('flyway_schema_history'); }, tables: /^flyway_schema_history$/i },
    { name: 'Liquibase', key: 'liquibase', evidence: 'a databasechangelog table',
      test: function (has) { return has('databasechangelog'); }, tables: /^databasechangelog(lock)?$/i },
    { name: 'WordPress', key: 'wordpress', evidence: 'options and posts tables shaped like WordPress',
      test: function (has, cols, names) {
        return names.some(function (n) { return /options$/i.test(n) && cols(n).indexOf('option_name') >= 0; }) &&
          names.some(function (n) { return /posts$/i.test(n) && cols(n).indexOf('post_type') >= 0; });
      }, people: ['wp_users'] },
    { name: 'Strapi', key: 'strapi', evidence: 'strapi_ system tables',
      test: function (has) { return has('strapi_migrations') || has('strapi_database_schema'); }, tables: /^strapi_\w+$/i },
    { name: 'Directus', key: 'directus', evidence: 'directus_ system tables',
      test: function (has) { return has('directus_collections'); }, tables: /^directus_\w+$/i },
    { name: 'Magento', key: 'magento', evidence: 'a core_config_data table',
      test: function (has) { return has('core_config_data'); } },
    { name: 'Drupal', key: 'drupal', evidence: 'config and key_value tables',
      test: function (has) { return has('config') && has('key_value'); } },
    { name: 'Moodle', key: 'moodle', evidence: 'mdl_ tables',
      test: function (has) { return has('mdl_config'); } },
    { name: 'Odoo', key: 'odoo', evidence: 'ir_model and res_partner tables',
      test: function (has) { return has('ir_model') && has('res_partner'); } }
  ];

  // Common areas of an application, matched on the words of a table name.
  var AREAS = [
    ['people', /^(user|customer|client|member|account|profile|person|people|employee|staff|contact|address|patient|student|teacher|parent|guardian|subscriber|author|owner|team|organization|organisation|company)$/],
    ['access', /^(role|permission|session|token|login|password|oauth|auth|otp|device|api|invitation)$/],
    ['sales', /^(order|cart|basket|checkout|invoice|payment|refund|coupon|discount|transaction|receipt|subscription|plan|price|billing|charge|quote|sale|shipment|shipping|tax|wallet)$/],
    ['catalogue', /^(product|category|brand|variant|sku|inventory|stock|warehouse|supplier|item|collection|attribute|album|artist|track|genre|playlist|film|movie|book)$/],
    ['content', /^(post|page|article|comment|media|image|photo|file|upload|attachment|tag|blog|review|rating|video|document|menu|banner|slider|faq|news)$/],
    ['messaging', /^(message|notification|email|mail|sms|chat|conversation|thread|inbox|newsletter)$/],
    ['lookups', /^(country|currency|language|locale|timezone|region|city|state|setting|config|option|status|type|unit|lookup)$/],
    ['activity', /^(log|audit|activity|event|history|visit|metric|analytic|job|queue|report)$/]
  ];

  // users_roles -> [user, role]; InvoiceLine -> [invoice, line]
  function words(name) {
    return name.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toLowerCase().split(/[_\W]+/).filter(Boolean).map(singular);
  }

  function areaOf(name) {
    var w = words(name);
    // media_types, order_statuses: lists of choices, whatever they describe
    if (w.length > 1 && /^(type|status|kind)$/.test(w[w.length - 1])) return 'lookups';
    for (var i = 0; i < w.length; i++) {
      for (var a = 0; a < AREAS.length; a++) if (AREAS[a][1].test(w[i])) return AREAS[a][0];
    }
    return null;
  }

  var PEOPLE_WORDS = /^(user|customer|client|employee|staff|member|student|patient|person|people|contact|subscriber|account)$/;

  // Everything Joinscope can tell about a schema without being told. A profile,
  // when present, overrides any part of it (see effectiveProfile).
  function detect(g) {
    var m = g.model;
    var lower = {};
    g.names.forEach(function (n) { lower[n.toLowerCase()] = n; });
    var has = function (n) { return !!lower[n.toLowerCase()]; };
    var cols = function (n) { var t = m.tables[lower[n.toLowerCase()] || n]; return t ? t.columns.map(function (c) { return c.name.toLowerCase(); }) : []; };
    var frameworks = [];
    var frameworkTables = {};
    FRAMEWORKS.forEach(function (f) {
      if (!f.test(has, cols, g.names)) return;
      var own = f.tables ? g.names.filter(function (n) { return f.tables.test(n); }) : [];
      own.forEach(function (n) { frameworkTables[n] = f.name; });
      frameworks.push({ name: f.name, key: f.key, evidence: f.evidence, tables: own });
    });
    var hinted = {};
    FRAMEWORKS.forEach(function (f) {
      if (frameworks.some(function (x) { return x.key === f.key; })) (f.people || []).forEach(function (p) { if (has(p)) hinted[lower[p.toLowerCase()]] = true; });
    });
    var people = g.names.filter(function (n) {
      if (frameworkTables[n]) return false;
      if (hinted[n]) return true;
      var w = words(n);
      return w.length === 1 && PEOPLE_WORDS.test(w[0]);
    });
    var areas = {};
    g.names.forEach(function (n) { if (!frameworkTables[n]) { var a = areaOf(n); if (a) (areas[a] = areas[a] || []).push(n); } });
    return { frameworks: frameworks, frameworkTables: frameworkTables, peopleTables: people, areas: areas };
  }

  // The rules in force: a profile's fields win, detection fills the rest.
  function effectiveProfile(g) {
    var prof = (typeof window !== 'undefined' && window.PROJECT_PROFILE) || {};
    var det = g.detected || (g.detected = detect(g));
    var fw = prof.framework ? [prof.framework] : det.frameworks.map(function (f) { return f.key; });
    return {
      fromProfile: !!(typeof window !== 'undefined' && window.PROJECT_PROFILE),
      name: prof.name || null,
      frameworks: fw,
      peopleTables: prof.peopleTables || det.peopleTables,
      frameworkTables: det.frameworkTables,
      keep: (prof.keep || []).concat(Object.keys(det.frameworkTables)),
      accepted: prof.accepted || [],
      raw: prof
    };
  }

  function singular(w) {
    if (w.length <= 3 || /^(news|status|series|species|address|access|analytics|statistics)$/.test(w)) return w;
    if (/ies$/.test(w)) return w.slice(0, -3) + 'y';
    if (/(sses|xes|ches|shes)$/.test(w)) return w.slice(0, -2);
    if (/s$/.test(w) && !/ss$/.test(w)) return w.slice(0, -1);
    return w;
  }

  function plurals(base) {
    var out = [base + 's', base + 'es', base];
    if (/y$/.test(base)) out.unshift(base.slice(0, -1) + 'ies');
    // staff_member_id -> staff_members, order_line_item_id -> order_line_items
    return out;
  }

  function baseType(t) {
    return (t || '').toLowerCase().replace(/\(\d+\)/, '').replace(/\s+/g, ' ').trim();
  }

  // ---------- relations ----------

  function build(model) {
    var names = Object.keys(model.tables).sort();
    var tableSet = {};
    names.forEach(function (n) { tableSet[n] = true; });
    var relations = [];
    var morphs = [];
    var orphanIds = [];
    var seq = 0;

    names.forEach(function (name) {
      var t = model.tables[name];
      var colMap = {};
      t.columns.forEach(function (c) { colMap[c.name] = c; });
      var uniqueSets = t.indexes.filter(function (i) { return i.type === 'UNIQUE'; }).map(function (i) { return i.columns.join(','); });
      if (t.primaryKey.length) uniqueSets.push(t.primaryKey.join(','));
      var declaredCols = {};

      t.fks.forEach(function (fk) {
        fk.columns.forEach(function (c) { declaredCols[c] = true; });
        relations.push({
          id: 'r' + (seq++),
          from: name,
          to: fk.refTable,
          cols: fk.columns,
          refCols: fk.refColumns,
          kind: 'fk',
          name: fk.name,
          onDelete: fk.onDelete,
          onUpdate: fk.onUpdate,
          nullable: fk.columns.some(function (c) { return colMap[c] && colMap[c].nullable; }),
          unique: uniqueSets.indexOf(fk.columns.join(',')) >= 0,
          missingTarget: !tableSet[fk.refTable]
        });
      });

      t.columns.forEach(function (c) {
        if (declaredCols[c.name] || t.primaryKey.indexOf(c.name) >= 0) return;
        var m = c.name.match(/^(.+)_id$/);
        if (!m) return;
        var base = m[1];
        if (colMap[base + '_type']) {
          morphs.push({ table: name, name: base, idCol: c.name, typeCol: base + '_type' });
          return;
        }
        var target = null;
        var cands = plurals(base);
        // also try the last word: "father_id" will not match, "price_list_id" -> price_lists
        for (var i = 0; i < cands.length; i++) {
          if (tableSet[cands[i]] && cands[i] !== name) { target = cands[i]; break; }
        }
        if (!target && base === 'parent') target = name;
        if (!target) {
          var parts = base.split('_');
          if (parts.length > 1) {
            var tail = plurals(parts.slice(1).join('_'));
            for (var j = 0; j < tail.length; j++) {
              if (tableSet[tail[j]] && tail[j] !== name) { target = tail[j]; break; }
            }
          }
        }
        if (!target) {
          orphanIds.push({ table: name, column: c.name });
          return;
        }
        var refTable = model.tables[target];
        relations.push({
          id: 'r' + (seq++),
          from: name,
          to: target,
          cols: [c.name],
          refCols: refTable.primaryKey.length ? refTable.primaryKey.slice(0, 1) : ['id'],
          kind: 'inferred',
          onDelete: null,
          onUpdate: null,
          nullable: c.nullable,
          unique: uniqueSets.indexOf(c.name) >= 0
        });
      });
    });

    Object.keys(model.views).forEach(function (v) {
      model.views[v].refs.forEach(function (r) {
        if (tableSet[r] || model.views[r]) {
          relations.push({ id: 'r' + (seq++), from: v, to: r, cols: [], refCols: [], kind: 'view' });
        }
      });
    });

    return { model: model, names: names, relations: relations, morphs: morphs, orphanIds: orphanIds };
  }

  function activeRelations(g, opts) {
    return g.relations.filter(function (r) {
      if (r.missingTarget) return false;
      if (r.kind === 'inferred' && !opts.inferred) return false;
      if (r.kind === 'view' && !opts.views) return false;
      return true;
    });
  }

  function degrees(names, rels) {
    var d = {};
    names.forEach(function (n) { d[n] = { inn: 0, out: 0 }; });
    rels.forEach(function (r) {
      if (d[r.from]) d[r.from].out++;
      if (d[r.to]) d[r.to].inn++;
    });
    return d;
  }

  function hubs(names, rels, threshold) {
    if (!threshold) return {};
    var d = degrees(names, rels);
    var out = {};
    names.forEach(function (n) { if (d[n].inn >= threshold) out[n] = d[n].inn; });
    return out;
  }

  // ---------- groups ----------

  // Groups by meaning: framework tables first, then a shared name prefix of 3 or more
  // tables (a project's own vocabulary, such as student_*), then common areas (people,
  // sales, catalogue...), then smaller prefixes; whatever is left joins the group it links to most.
  function domainGroups(g, rels) {
    var det = g.detected || (g.detected = detect(g));
    var raw = {};
    var count = {};
    g.names.forEach(function (n) {
      var key = det.frameworkTables[n] ? 'framework' : words(n)[0] || n;
      raw[n] = key;
      count[key] = (count[key] || 0) + 1;
    });
    var out = {};
    var people = {};
    det.peopleTables.forEach(function (n) { people[n] = true; });
    g.names.forEach(function (n) {
      var key = raw[n];
      if (key === 'framework' || count[key] >= 3) { out[n] = key; return; }
      var area = people[n] ? 'people' : areaOf(n);
      if (area) { out[n] = area; return; }
      if (count[key] > 1) out[n] = key;
    });
    // a prefix left with one table (its partners went to an area) is no group
    var size = {};
    g.names.forEach(function (n) { if (out[n]) size[out[n]] = (size[out[n]] || 0) + 1; });
    g.names.forEach(function (n) { if (out[n] === raw[n] && size[out[n]] === 1) delete out[n]; });
    var adj = {};
    rels.forEach(function (r) {
      (adj[r.from] = adj[r.from] || []).push(r.to);
      (adj[r.to] = adj[r.to] || []).push(r.from);
    });
    g.names.forEach(function (n) {
      if (out[n]) return;
      var votes = {};
      (adj[n] || []).forEach(function (m) {
        var k = out[m];
        if (k && k !== 'framework') votes[k] = (votes[k] || 0) + 1;
      });
      var best = Object.keys(votes).sort(function (a, b) { return votes[b] - votes[a] || (a < b ? -1 : 1); })[0];
      out[n] = best || 'other';
    });
    return out;
  }

  function clusterGroups(g, rels, hubSet) {
    var adj = {};
    g.names.forEach(function (n) { adj[n] = []; });
    rels.forEach(function (r) {
      if (hubSet[r.to] || hubSet[r.from] || !adj[r.from] || !adj[r.to] || r.from === r.to) return;
      adj[r.from].push(r.to);
      adj[r.to].push(r.from);
    });
    var label = {};
    g.names.forEach(function (n) { label[n] = n; });
    for (var it = 0; it < 25; it++) {
      var changed = false;
      g.names.forEach(function (n) {
        if (!adj[n].length) return;
        var votes = {};
        adj[n].forEach(function (m) { votes[label[m]] = (votes[label[m]] || 0) + 1; });
        var max = Math.max.apply(null, Object.keys(votes).map(function (k) { return votes[k]; }));
        var top = Object.keys(votes).filter(function (k) { return votes[k] === max; }).sort();
        var pick = top.indexOf(label[n]) >= 0 ? label[n] : top[0];
        if (pick !== label[n]) { label[n] = pick; changed = true; }
      });
      if (!changed) break;
    }
    // name each cluster after its best-connected member
    var members = {};
    g.names.forEach(function (n) { (members[label[n]] = members[label[n]] || []).push(n); });
    var out = {};
    Object.keys(members).forEach(function (l) {
      var list = members[l];
      if (list.length === 1 && !adj[list[0]].length) { out[list[0]] = 'no links'; return; }
      var best = list.slice().sort(function (a, b) { return adj[b].length - adj[a].length || (a < b ? -1 : 1); })[0];
      list.forEach(function (n) { out[n] = best + ' cluster'; });
    });
    return out;
  }

  // ---------- traversal ----------

  function undirectedAdj(rels, avoid) {
    var adj = {};
    rels.forEach(function (r) {
      if (r.kind === 'view' || r.from === r.to) return;
      (adj[r.from] = adj[r.from] || []).push({ to: r.to, rel: r, forward: true });
      (adj[r.to] = adj[r.to] || []).push({ to: r.from, rel: r, forward: false });
    });
    return function (n, from, to) {
      return (adj[n] || []).filter(function (e) { return !avoid || !avoid[e.to] || e.to === to || e.to === from; });
    };
  }

  function bfsPath(neighbours, from, to, banned) {
    var prev = {};
    prev[from] = null;
    var queue = [from];
    while (queue.length) {
      var n = queue.shift();
      if (n === to) break;
      var list = neighbours(n, from, to);
      for (var i = 0; i < list.length; i++) {
        var e = list[i];
        if (banned && banned[e.rel.id]) continue;
        if (!(e.to in prev)) { prev[e.to] = { node: n, edge: e }; queue.push(e.to); }
      }
    }
    if (!(to in prev)) return null;
    var steps = [];
    var cur = to;
    while (prev[cur]) { steps.unshift({ from: prev[cur].node, to: cur, rel: prev[cur].edge.rel, forward: prev[cur].edge.forward }); cur = prev[cur].node; }
    return steps;
  }

  // shortest path plus a few alternatives (remove one edge of the best path at a time)
  function findPaths(rels, from, to, avoid, max) {
    var nb = undirectedAdj(rels, avoid);
    var best = bfsPath(nb, from, to);
    if (!best) return [];
    var found = [best];
    var seen = {};
    seen[best.map(function (s) { return s.rel.id; }).join('|')] = true;
    best.forEach(function (s) {
      var banned = {};
      banned[s.rel.id] = true;
      var alt = bfsPath(nb, from, to, banned);
      if (!alt) return;
      var key = alt.map(function (x) { return x.rel.id; }).join('|');
      if (!seen[key]) { seen[key] = true; found.push(alt); }
    });
    found.sort(function (a, b) { return a.length - b.length; });
    return found.slice(0, max || 4);
  }

  function aliasFor(name, used) {
    var a = name.split('_').map(function (p) { return p[0]; }).join('');
    var base = a;
    var i = 2;
    while (used[a]) a = base + (i++);
    used[a] = true;
    return a;
  }

  function joinSql(steps, from) {
    var used = {};
    var alias = {};
    alias[from] = aliasFor(from, used);
    var lines = ['SELECT ' + alias[from] + '.*', 'FROM `' + from + '` ' + alias[from]];
    steps.forEach(function (s) {
      var a = alias[s.to] || (alias[s.to] = aliasFor(s.to, used));
      var r = s.rel;
      var child = r.from;
      var parent = r.to;
      var conds = r.cols.map(function (c, i) {
        return alias[child] + '.`' + c + '` = ' + alias[parent] + '.`' + (r.refCols[i] || 'id') + '`';
      });
      lines.push('JOIN `' + s.to + '` ' + a + ' ON ' + conds.join(' AND '));
    });
    return lines.join('\n') + ';';
  }

  // all tables within `depth` hops, ignoring links through hubs (except the root's own links)
  function neighbourhood(rels, root, depth, hubSet) {
    var dist = {};
    dist[root] = 0;
    var frontier = [root];
    for (var d = 1; d <= depth; d++) {
      var next = [];
      frontier.forEach(function (n) {
        rels.forEach(function (r) {
          var other = r.from === n ? r.to : r.to === n ? r.from : null;
          if (other == null || other in dist) return;
          if (hubSet[other] && n !== root) return;
          if (hubSet[n] && n !== root) return;
          dist[other] = d;
          next.push(other);
        });
      });
      frontier = next;
    }
    return dist;
  }

  function deleteImpact(g, root) {
    var fks = g.relations.filter(function (r) { return r.kind === 'fk' && !r.missingTarget; });
    var result = { cascade: [], setNull: [], restrict: [], tree: null };
    var visited = {};
    visited[root] = true;
    function walk(table, depth, via) {
      var node = { table: table, depth: depth, via: via, children: [] };
      fks.forEach(function (r) {
        if (r.to !== table) return;
        var rule = r.onDelete || 'RESTRICT';
        var item = { table: r.from, rel: r, depth: depth + 1, parent: table };
        if (rule === 'CASCADE') {
          result.cascade.push(item);
          if (!visited[r.from]) {
            visited[r.from] = true;
            node.children.push(walk(r.from, depth + 1, r));
          } else {
            node.children.push({ table: r.from, depth: depth + 1, via: r, children: [], repeat: true });
          }
        } else if (rule === 'SET NULL' || rule === 'SET DEFAULT') {
          result.setNull.push(item);
          node.children.push({ table: r.from, depth: depth + 1, via: r, children: [], rule: rule });
        } else {
          result.restrict.push(item);
          node.children.push({ table: r.from, depth: depth + 1, via: r, children: [], rule: rule });
        }
      });
      return node;
    }
    result.tree = walk(root, 0, null);
    return result;
  }

  // ---------- insights ----------

  function insights(g) {
    var m = g.model;
    var fks = g.relations.filter(function (r) { return r.kind === 'fk'; });
    var all = g.relations.filter(function (r) { return r.kind !== 'view' && !r.missingTarget; });
    var d = degrees(g.names, all);
    var cols = 0;
    var rows = 0;
    var hasRows = false;
    g.names.forEach(function (n) {
      cols += m.tables[n].columns.length;
      if (m.tables[n].rows != null) { rows += m.tables[n].rows; hasRows = true; }
    });

    var typeMismatch = [];
    fks.forEach(function (r) {
      var ct = m.tables[r.from];
      var pt = m.tables[r.to];
      if (!ct || !pt) return;
      r.cols.forEach(function (c, i) {
        var a = ct.columns.find(function (x) { return x.name === c; });
        var b = pt.columns.find(function (x) { return x.name === (r.refCols[i] || 'id'); });
        if (a && b && baseType(a.type) !== baseType(b.type)) typeMismatch.push({ rel: r, col: c, childType: a.type, parentType: b.type });
      });
    });

    var unindexed = [];
    g.relations.filter(function (r) { return r.kind === 'inferred'; }).forEach(function (r) {
      var t = m.tables[r.from];
      var indexed = t.indexes.some(function (i) { return i.columns[0] === r.cols[0]; }) || t.primaryKey[0] === r.cols[0];
      if (!indexed) unindexed.push(r);
    });

    var orphanCounts = {};
    g.orphanIds.forEach(function (o) { orphanCounts[o.column] = (orphanCounts[o.column] || []).concat(o.table); });

    return {
      tables: g.names.length,
      views: Object.keys(m.views).length,
      triggers: m.triggers.length,
      columns: cols,
      fks: fks.length,
      inferred: g.relations.filter(function (r) { return r.kind === 'inferred'; }).length,
      rows: hasRows ? rows : null,
      mostReferenced: g.names.slice().sort(function (a, b) { return d[b].inn - d[a].inn; }).filter(function (n) { return d[n].inn > 0; }).slice(0, 12).map(function (n) { return { table: n, count: d[n].inn }; }),
      mostDependent: g.names.slice().sort(function (a, b) { return d[b].out - d[a].out; }).filter(function (n) { return d[n].out > 0; }).slice(0, 12).map(function (n) { return { table: n, count: d[n].out }; }),
      isolated: g.names.filter(function (n) { return d[n].inn + d[n].out === 0; }),
      noPrimaryKey: g.names.filter(function (n) { return !m.tables[n].primaryKey.length; }),
      inferred_list: g.relations.filter(function (r) { return r.kind === 'inferred'; }),
      unindexed: unindexed,
      orphanIds: Object.keys(orphanCounts).sort(function (a, b) { return orphanCounts[b].length - orphanCounts[a].length; }).map(function (c) { return { column: c, tables: orphanCounts[c] }; }),
      missingTargets: fks.filter(function (r) { return r.missingTarget; }),
      typeMismatch: typeMismatch,
      morphs: g.morphs,
      cascadeHeavy: g.names.map(function (n) { return { table: n, count: deleteImpact(g, n).cascade.length }; }).filter(function (x) { return x.count > 0; }).sort(function (a, b) { return b.count - a.count; }).slice(0, 10),
      emptyTables: hasRows ? g.names.filter(function (n) { return m.tables[n].rows === 0; }) : [],
      biggest: hasRows ? g.names.filter(function (n) { return m.tables[n].rows; }).sort(function (a, b) { return m.tables[b].rows - m.tables[a].rows; }).slice(0, 10).map(function (n) { return { table: n, count: m.tables[n].rows }; }) : []
    };
  }

  // ---------- diff ----------

  // MariaDB writes bigint(20), MySQL 8 writes bigint: integer display widths mean nothing
  function sameType(x, y) {
    // and MariaDB stores json as longtext
    var norm = function (t) { return (t || '').toLowerCase().replace(/\b(tinyint|smallint|mediumint|int|integer|bigint)\(\d+\)/g, '$1').replace(/^json\b/, 'longtext').replace(/\s+/g, ' ').trim(); };
    return norm(x) === norm(y);
  }

  function diff(a, b) {
    var out = { addedTables: [], removedTables: [], changed: [] };
    var an = Object.keys(a.tables);
    var bn = Object.keys(b.tables);
    bn.forEach(function (n) { if (!a.tables[n]) out.addedTables.push(n); });
    an.forEach(function (n) { if (!b.tables[n]) out.removedTables.push(n); });
    an.filter(function (n) { return b.tables[n]; }).sort().forEach(function (n) {
      var ta = a.tables[n];
      var tb = b.tables[n];
      var ch = { table: n, addedCols: [], removedCols: [], typeChanged: [], addedFks: [], removedFks: [] };
      var ca = {};
      ta.columns.forEach(function (c) { ca[c.name] = c; });
      var cb = {};
      tb.columns.forEach(function (c) { cb[c.name] = c; });
      tb.columns.forEach(function (c) { if (!ca[c.name]) ch.addedCols.push(c.name + ' ' + c.type); });
      ta.columns.forEach(function (c) {
        if (!cb[c.name]) ch.removedCols.push(c.name);
        else if (!sameType(c.type, cb[c.name].type) || c.nullable !== cb[c.name].nullable) {
          ch.typeChanged.push(c.name + ': ' + c.type + (c.nullable ? ' null' : ' not null') + ' -> ' + cb[c.name].type + (cb[c.name].nullable ? ' null' : ' not null'));
        }
      });
      var fkKey = function (f) { return f.columns.join(',') + '->' + f.refTable + '(' + f.refColumns.join(',') + ') ' + f.onDelete; };
      var fa = ta.fks.map(fkKey);
      var fb = tb.fks.map(fkKey);
      fb.forEach(function (k) { if (fa.indexOf(k) < 0) ch.addedFks.push(k); });
      fa.forEach(function (k) { if (fb.indexOf(k) < 0) ch.removedFks.push(k); });
      if (ch.addedCols.length + ch.removedCols.length + ch.typeChanged.length + ch.addedFks.length + ch.removedFks.length) out.changed.push(ch);
    });
    out.addedTables.sort();
    out.removedTables.sort();
    return out;
  }

  // ---------- exports ----------

  function mermaid(g, names, rels) {
    var set = {};
    names.forEach(function (n) { set[n] = true; });
    var m = g.model;
    var lines = ['erDiagram'];
    var keyCols = {};
    rels.forEach(function (r) { if (set[r.from] && set[r.to]) r.cols.forEach(function (c) { (keyCols[r.from] = keyCols[r.from] || {})[c] = true; }); });
    names.forEach(function (n) {
      var t = m.tables[n];
      if (!t) return;
      var ent = n.replace(/[^\w]/g, '_');
      lines.push('    ' + ent + ' {');
      t.columns.forEach(function (c) {
        var isPk = t.primaryKey.indexOf(c.name) >= 0;
        var isFk = keyCols[n] && keyCols[n][c.name];
        if (!isPk && !isFk) return;
        var type = baseType(c.type).split(' ')[0].replace(/[^\w]/g, '_');
        lines.push('        ' + type + ' ' + c.name.replace(/[^\w]/g, '_') + (isPk ? ' PK' : '') + (isFk ? (isPk ? ', FK' : ' FK') : ''));
      });
      lines.push('    }');
    });
    rels.forEach(function (r) {
      if (!set[r.from] || !set[r.to] || r.kind === 'view') return;
      var left = r.nullable ? '|o' : '||';
      var right = r.unique ? 'o|' : 'o{';
      lines.push('    ' + r.to.replace(/[^\w]/g, '_') + ' ' + left + '--' + right + ' ' + r.from.replace(/[^\w]/g, '_') + ' : "' + r.cols.join(', ') + (r.kind === 'inferred' ? ' (guessed)' : '') + '"');
    });
    return lines.join('\n');
  }

  function dictionaryRows(g) {
    var rows = [];
    var refs = {};
    g.relations.forEach(function (r) {
      if (r.kind === 'view') return;
      r.cols.forEach(function (c, i) {
        refs[r.from + '.' + c] = r.to + '.' + (r.refCols[i] || 'id') + (r.kind === 'inferred' ? ' (guessed)' : r.onDelete ? ' on delete ' + r.onDelete.toLowerCase() : '');
      });
    });
    g.names.forEach(function (n) {
      var t = g.model.tables[n];
      t.columns.forEach(function (c) {
        var key = [];
        if (t.primaryKey.indexOf(c.name) >= 0) key.push('PK');
        if (refs[n + '.' + c.name]) key.push('FK');
        if (t.indexes.some(function (i) { return i.type === 'UNIQUE' && i.columns.length === 1 && i.columns[0] === c.name; })) key.push('UNIQUE');
        rows.push({ table: n, column: c.name, type: c.type, nullable: c.nullable ? 'yes' : 'no', default: c.default == null ? '' : c.default, key: key.join(' '), references: refs[n + '.' + c.name] || '', comment: c.comment || '' });
      });
    });
    return rows;
  }

  // ---------- problems ----------

  // tables that hold records people expect to keep (not setup tables)
  var MONEY = /(collect|payment|receipt|transaction|income|expense|invoice|refund|ledger|payroll|salar|order|charge|billing)/i;
  // records people expect to keep: marks, results, attendance, history, audit trails
  var ACADEMIC = /(mark|result|grade|assessment|attendance|report_card|transcript|summary_report|history|audit)/i;
  var SETUP = /(type|categor|group|setting|template|master|translate|gender|religion|blood|upload)s?$/i;

  function q(id) { return '`' + id + '`'; }

  // a column as MODIFY needs it: MODIFY replaces the whole definition, so keep the default and comment
  function colDef(c, type, nullable) {
    var d = c && c.default;
    var def = d == null ? '' : ' DEFAULT ' + (/^(NULL|CURRENT_TIMESTAMP(\(\d*\))?|-?\d+(\.\d+)?)$/i.test(d) ? d : "'" + String(d).replace(/'/g, "''") + "'");
    return type.toUpperCase() + (nullable ? ' NULL' : ' NOT NULL') + def + (c && c.comment ? " COMMENT '" + c.comment.replace(/'/g, "''") + "'" : '');
  }

  function plural(n, word) { return n + ' ' + word + (n === 1 ? '' : 's'); }

  function issues(g) {
    var m = g.model;
    var out = [];
    var seq = 0;
    var add = function (o) { o.id = 'i' + (seq++); out.push(o); };
    var colOf = function (t, c) { return m.tables[t] && m.tables[t].columns.find(function (x) { return x.name === c; }); };
    var ins = insights(g);

    ins.missingTargets.forEach(function (r) {
      add({ severity: 'high', kind: 'missing-table', table: r.from, column: r.cols.join(', '), tables: [r.from],
        title: 'Foreign key points to a table that is not here',
        detail: r.from + '.' + r.cols.join(', ') + ' references ' + r.to + ', which is not in this export. Either the export is partial or the table was dropped.' });
    });

    ins.typeMismatch.forEach(function (x) {
      var c = colOf(x.rel.from, x.col);
      add({ severity: 'high', kind: 'type-mismatch', table: x.rel.from, column: x.col, tables: [x.rel.from, x.rel.to],
        title: 'Linked columns have different types',
        detail: x.rel.from + '.' + x.col + ' is ' + x.childType + ' but ' + x.rel.to + ' uses ' + x.parentType + '. Joins get slower and some values may not fit.',
        sql: 'ALTER TABLE ' + q(x.rel.from) + ' MODIFY ' + q(x.col) + ' ' + colDef(c, x.parentType, c && c.nullable) + ';' });
    });

    // deleting a lookup entry (gender, religion, upload...) must never delete people
    // detected rules, overridden by a profile where it says otherwise
    var eff = effectiveProfile(g);
    var prof = eff.raw;
    var people = eff.peopleTables;
    // Laravel fixes are offered only when the schema looks like a Laravel app, or a profile says it is one
    var isLaravel = eff.frameworks.indexOf('laravel') >= 0;
    g.relations.forEach(function (r) {
      if (r.kind !== 'fk' || r.onDelete !== 'CASCADE' || r.missingTarget) return;
      if (people.indexOf(r.from) < 0 || people.indexOf(r.to) >= 0) return;
      var c = colOf(r.from, r.cols[0]);
      var nullable = c && c.nullable;
      var rows = m.tables[r.from].rows;
      add({ severity: 'high', kind: 'cascade-people', table: r.from, column: r.cols.join(', '), tables: [r.from, r.to],
        title: 'Deleting a row in ' + r.to + ' deletes rows in ' + r.from,
        detail: 'Every row in ' + r.from + ' linked to a deleted row in ' + r.to + ' is erased by the database (on delete cascade), with no check in your app, and everything that cascades from ' + r.from + ' goes with it.' +
          (rows != null ? ' ' + r.from + ' holds ' + rows.toLocaleString() + ' rows here.' : '') + ' Clearing the link (set null) keeps the person.',
        sql: (r.name ? 'ALTER TABLE ' + q(r.from) + ' DROP FOREIGN KEY ' + q(r.name) + ';\n' : '') +
          (nullable ? '' : 'ALTER TABLE ' + q(r.from) + ' MODIFY ' + q(r.cols[0]) + ' ' + colDef(c, c.type, true) + ';\n') +
          'ALTER TABLE ' + q(r.from) + ' ADD CONSTRAINT ' + q(r.name || (r.from + '_' + r.cols[0] + '_foreign')) + ' FOREIGN KEY (' + r.cols.map(q).join(', ') + ') REFERENCES ' + q(r.to) + ' (' + r.refCols.map(q).join(', ') + ') ON DELETE SET NULL;',
        laravel: "$table->dropForeign(['" + r.cols[0] + "']);\n$table->foreign('" + r.cols[0] + "')->references('" + (r.refCols[0] || 'id') + "')->on('" + r.to + "')->nullOnDelete();" });
    });

    g.relations.forEach(function (r) {
      if (r.kind !== 'fk' || r.onDelete !== 'CASCADE' || r.missingTarget) return;
      var money = MONEY.test(r.from) && !MONEY.test(r.to);
      var academic = !money && ACADEMIC.test(r.from) && !ACADEMIC.test(r.to);
      if (!money && !academic) return;
      if (SETUP.test(r.from)) return;
      add({ severity: money ? 'high' : 'medium', kind: money ? 'cascade-money' : 'cascade-academic', table: r.from, column: r.cols.join(', '), tables: [r.from, r.to],
        title: (money ? 'Financial' : 'History') + ' records are deleted with their ' + r.to + ' row',
        detail: 'Deleting a row in ' + r.to + ' silently deletes the matching rows in ' + r.from + ' (on delete cascade). ' +
          (money ? 'Payment history is usually kept for audit, so RESTRICT or soft deletes are safer.' : 'History like this is usually kept, so RESTRICT or soft deletes are safer.'),
        sql: (r.name ? 'ALTER TABLE ' + q(r.from) + ' DROP FOREIGN KEY ' + q(r.name) + ';\n' : '') +
          'ALTER TABLE ' + q(r.from) + ' ADD CONSTRAINT ' + q(r.name || (r.from + '_' + r.cols[0] + '_foreign')) + ' FOREIGN KEY (' + r.cols.map(q).join(', ') + ') REFERENCES ' + q(r.to) + ' (' + r.refCols.map(q).join(', ') + ') ON DELETE RESTRICT;',
        laravel: "$table->dropForeign(['" + r.cols[0] + "']);\n$table->foreign('" + r.cols[0] + "')->references('" + (r.refCols[0] || 'id') + "')->on('" + r.to + "')->restrictOnDelete();" });
    });

    ins.inferred_list.forEach(function (r) {
      var c = colOf(r.from, r.cols[0]);
      var nullable = c && c.nullable;
      var name = r.from + '_' + r.cols[0] + '_foreign';
      var ref = r.refCols[0] || 'id';
      // MySQL refuses a foreign key between columns of different types, so the column changes first
      var p = colOf(r.to, ref);
      var retype = c && p && !sameType(c.type, p.type);
      add({ severity: 'medium', kind: 'missing-fk', table: r.from, column: r.cols[0], tables: [r.from, r.to],
        title: 'Link without a foreign key',
        detail: r.from + '.' + r.cols[0] + ' looks like it points to ' + r.to + ', but the database does not enforce it. Deleting a ' + r.to + ' row leaves rows here pointing at nothing.' +
          (retype ? ' The types differ (' + c.type + ' here, ' + p.type + ' in ' + r.to + '.' + ref + '), and a foreign key needs them to match, so the fix changes the column first.' : ''),
        check: 'SELECT COUNT(*) AS broken_rows FROM ' + q(r.from) + ' c LEFT JOIN ' + q(r.to) + ' p ON p.' + q(ref) + ' = c.' + q(r.cols[0]) + '\nWHERE c.' + q(r.cols[0]) + ' IS NOT NULL AND p.' + q(ref) + ' IS NULL;',
        sql: (retype ? 'ALTER TABLE ' + q(r.from) + ' MODIFY ' + q(r.cols[0]) + ' ' + colDef(c, p.type, nullable) + ';\n' : '') +
          'ALTER TABLE ' + q(r.from) + ' ADD CONSTRAINT ' + q(name) + ' FOREIGN KEY (' + q(r.cols[0]) + ') REFERENCES ' + q(r.to) + ' (' + q(ref) + ') ON DELETE ' + (nullable ? 'SET NULL' : 'RESTRICT') + ';',
        laravel: "$table->foreign('" + r.cols[0] + "')->references('" + ref + "')->on('" + r.to + "')->" + (nullable ? 'nullOnDelete' : 'restrictOnDelete') + '();' });
    });

    ins.unindexed.forEach(function (r) {
      add({ severity: 'medium', kind: 'no-index', table: r.from, column: r.cols[0], tables: [r.from],
        title: 'Link column without an index',
        detail: 'Every lookup of ' + r.from + ' by ' + r.cols[0] + ' reads the whole table. Adding the foreign key above also creates the index.',
        sql: 'ALTER TABLE ' + q(r.from) + ' ADD INDEX ' + q(r.from + '_' + r.cols[0] + '_index') + ' (' + q(r.cols[0]) + ');' });
    });

    ins.noPrimaryKey.forEach(function (t) {
      var fwOwn = eff.frameworkTables[t];
      add({ severity: fwOwn ? 'low' : 'high', kind: 'no-pk', table: t, tables: [t],
        title: 'Table without a primary key',
        detail: fwOwn ? t + ' is a ' + fwOwn + ' framework table that ships without a primary key. Usually safe to leave.' : 'Rows in ' + t + ' cannot be told apart reliably, which breaks updates, replication and most admin tools.',
        sql: fwOwn ? null : 'ALTER TABLE ' + q(t) + ' ADD COLUMN `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY FIRST;' });
    });

    g.names.forEach(function (n) {
      var t = m.tables[n];
      var idx = t.indexes.filter(function (i) { return i.type === 'INDEX'; });
      var all = t.indexes.concat(t.primaryKey.length ? [{ type: 'PRIMARY', name: 'PRIMARY', columns: t.primaryKey }] : []);
      idx.forEach(function (a) {
        var cover = all.find(function (b) {
          return b !== a && b.type !== 'FULLTEXT' && b.columns.length >= a.columns.length &&
            a.columns.every(function (c, i) { return b.columns[i] === c; }) && (b.columns.length > a.columns.length || a.name > b.name);
        });
        if (!cover || !a.name) return;
        add({ severity: 'low', kind: 'dup-index', table: n, column: a.columns.join(', '), tables: [n],
          title: 'Index already covered by another',
          detail: 'Index ' + a.name + ' (' + a.columns.join(', ') + ') is a leading part of ' + cover.name + ' (' + cover.columns.join(', ') + '). It costs space and slows writes. If a foreign key relies on it, MySQL will use the wider index instead.',
          sql: 'ALTER TABLE ' + q(n) + ' DROP INDEX ' + q(a.name) + ';' });
      });
      if (t.columns.length > 45) {
        add({ severity: 'low', kind: 'wide', table: n, tables: [n], title: 'Very wide table',
          detail: n + ' has ' + t.columns.length + ' columns. Splitting rarely used groups of columns into their own table keeps reads light.' });
      }
    });

    ins.orphanIds.forEach(function (o) {
      add({ severity: 'low', kind: 'orphan-id', table: o.tables.length === 1 ? o.tables[0] : null, column: o.column, tables: o.tables,
        title: o.column + ' has no matching table',
        detail: o.column + ' appears in ' + o.tables.length + ' table' + (o.tables.length > 1 ? 's' : '') + ' (' + o.tables.slice(0, 6).join(', ') + (o.tables.length > 6 ? ', ...' : '') + ') but no table by that name exists. It may be a tenant marker, an external id, or a leftover.' });
    });

    ins.cascadeHeavy.filter(function (x) { return x.count >= 10; }).forEach(function (x) {
      add({ severity: 'low', kind: 'cascade-wide', table: x.table, tables: [x.table], title: 'One delete reaches ' + x.count + ' tables',
        detail: 'Deleting a single ' + x.table + ' row cascades through ' + x.count + ' foreign keys. Soft deletes (a deleted_at column) avoid accidental loss.' });
    });

    // Optional usage data a project add-on can attach to a model (m.usage). Joinscope never reads code itself.
    if (m.usage) {
      var profile = prof;
      g.names.forEach(function (n) {
        var u = m.usage[n];
        var t = m.tables[n];
        if (!u || t.rows !== 0) return;
        var children = g.relations.filter(function (r) { return r.kind === 'fk' && r.to === n && r.from !== n; }).map(function (r) { return r.from; });
        var keep = eff.keep.indexOf(n) >= 0;
        if (keep) return;
        var dropSql = children.length ? null : 'DROP TABLE IF EXISTS ' + q(n) + ';';
        var ignore = (profile && profile.ignoreUsagePaths) || [];
        var live = u.paths ? u.paths.filter(function (path) { return !ignore.some(function (x) { return path.indexOf(x) >= 0; }); }) : null;
        var unused = live ? live.length === 0 : (!u.model && !u.controllers && !u.routes && !u.views);
        if (unused) {
          add({ severity: 'medium', kind: 'dead-table', table: n, tables: [n],
            title: 'Empty, and no code uses it',
            detail: n + ' has no rows and no working code uses it' + (u.files ? ' (the ' + u.files + ' mention' + (u.files > 1 ? 's' : '') + ' left are unused request classes, old seeders or orphaned views)' : '') + '. It is most likely left over from a removed feature.' +
              (children.length ? ' Tables that still point to it: ' + children.join(', ') + '; remove those first.' : ''),
            sql: dropSql, laravel: children.length ? null : "Schema::dropIfExists('" + n + "');" });
        }
      });
    }

    // profile rules that need only the schema
    if (prof.dormant) {
      prof.dormant.forEach(function (d) {
        if (!m.tables[d.table]) return;
        add({ severity: 'low', kind: 'dormant', table: d.table, tables: [d.table], title: 'Read by the app, but nothing writes to it', detail: d.note });
      });
    }
    if (prof.outOfScope) {
      prof.outOfScope.forEach(function (rule) {
        var re = new RegExp(rule.pattern);
        var hits = g.names.filter(function (n) { return re.test(n); });
        if (!hits.length) return;
        var withRows = hits.filter(function (n) { return m.tables[n].rows; });
        add({ severity: 'medium', kind: 'out-of-scope', table: null, tables: hits,
          title: rule.label + ' (' + plural(hits.length, 'table') + ')',
          detail: rule.reason + ' Tables: ' + hits.join(', ') + '.' + (withRows.length ? ' These still hold rows here: ' + withRows.join(', ') + '.' : ' All are empty here.') });
        hits.forEach(function (n) {
          add({ severity: 'low', kind: 'out-of-scope', table: n, tables: [n], title: rule.label, detail: rule.reason, hidden: true });
        });
      });
    }

    // framework tables, tables kept on purpose and tables accepted one by one are meant to stand alone
    var lonelyOk = {};
    eff.keep.forEach(function (n) { lonelyOk[n] = 'kept on purpose'; });
    eff.accepted.forEach(function (a) { if (a.kind === 'isolated' && a.table) lonelyOk[a.table] = a.reason; });
    var lonely = ins.isolated.filter(function (n) { return !eff.frameworkTables[n] && !lonelyOk[n]; });
    if (lonely.length) {
      add({ severity: 'low', kind: 'isolated', table: null, tables: lonely, title: plural(lonely.length, 'table') + (lonely.length === 1 ? ' has' : ' have') + ' no links at all',
        detail: 'Not linked to anything by a foreign key or a recognisable *_id column: ' + lonely.join(', ') + '. Settings and log tables are normally like this; others may be missing their foreign keys.' });
    }

    // Findings the project has reviewed and keeps on purpose (PROJECT_PROFILE.accepted).
    // They leave the list and the table rings, and one summary names them with the reason,
    // so an accepted finding is never silently lost. A finding matches on kind, then on
    // table and column when the rule gives them.
    var accepted = eff.accepted;
    if (accepted.length) {
      var matched = [];
      out.forEach(function (i) {
        if (i.hidden) return;
        var rule = accepted.find(function (a) {
          if (a.kind !== i.kind) return false;
          if (a.table && a.table !== i.table) return false;
          if (a.column && a.column !== i.column) return false;
          return true;
        });
        if (!rule) return;
        i.hidden = true;
        matched.push((i.table ? i.table + (i.column ? '.' + i.column : '') : i.column || i.kind) + ': ' + rule.reason);
      });
      if (matched.length) {
        add({ severity: 'low', kind: 'accepted', table: null, tables: [],
          title: matched.length + ' findings reviewed and kept on purpose',
          detail: 'These were checked and are intended, so they are not listed as problems:\n- ' + matched.join('\n- ') });
      }
    }

    if (!isLaravel) out.forEach(function (i) { delete i.laravel; });

    var rank = { high: 0, medium: 1, low: 2 };
    out.sort(function (a, b) { return rank[a.severity] - rank[b.severity]; });
    var byTable = {};
    out.forEach(function (i) {
      if (i.hidden) return;
      (i.table ? [i.table] : []).forEach(function (t) {
        var e = byTable[t] || (byTable[t] = { high: 0, medium: 0, low: 0, list: [] });
        e[i.severity]++;
        e.list.push(i);
      });
    });
    return { list: out, byTable: byTable };
  }

  function fixScript(list, schemaName) {
    var lines = ['-- Suggested fixes for ' + schemaName, '-- Generated by Joinscope. Review every statement before running it, and take a backup first.', ''];
    // adding a foreign key creates its index, so the separate index fix would make a duplicate
    var fkFixed = {};
    list.forEach(function (i) { if (i.kind === 'missing-fk' && i.sql && !i.hidden) fkFixed[i.table + '.' + i.column] = true; });
    list.forEach(function (i) {
      if (!i.sql || i.hidden) return;
      if (i.kind === 'no-index' && fkFixed[i.table + '.' + i.column]) return;
      lines.push('-- [' + i.severity + '] ' + i.title + (i.table ? ': ' + i.table + (i.column ? '.' + i.column : '') : ''));
      if (i.check) lines.push('-- Run this first; it must return 0:', i.check.split('\n').map(function (l) { return '--   ' + l; }).join('\n'));
      lines.push(i.sql, '');
    });
    return lines.join('\n');
  }

  // ---------- plain-language descriptions ----------

  function humanize(s) {
    return s.replace(/_/g, ' ').replace(/\bid\b/g, 'ID').replace(/^\w/, function (c) { return c.toUpperCase(); });
  }

  function describeColumn(g, table, col) {
    if (col.comment) return { text: col.comment, auto: false };
    var t = g.model.tables[table];
    var n = col.name;
    var type = (col.type || '').toLowerCase();
    var rel = g.relations.find(function (r) { return r.from === table && r.kind !== 'view' && r.cols.indexOf(n) >= 0; });
    var say = function (text) { return { text: text, auto: true }; };
    if (t.primaryKey.length === 1 && t.primaryKey[0] === n) return say('Unique number that identifies each row.');
    if (rel && rel.kind === 'fk') {
      var rule = rel.onDelete === 'CASCADE' ? ' Deleting that row deletes this one too.' : /SET NULL/.test(rel.onDelete) ? ' Deleting that row empties this field.' : ' That row cannot be deleted while this one points to it.';
      return say('Links to a row in ' + rel.to + (rel.nullable ? ' (optional).' : '.') + rule);
    }
    if (rel && rel.kind === 'inferred') return say('Probably links to ' + rel.to + ', but the database does not enforce it.');
    var morph = g.morphs.find(function (x) { return x.table === table && (x.idCol === n || x.typeCol === n); });
    if (morph) return say(morph.typeCol === n ? 'Which kind of record the ' + morph.name + ' link points to (a model class name).' : 'ID of the record named by ' + morph.typeCol + '.');
    if (n === 'created_at') return say('When the row was created.');
    if (n === 'updated_at') return say('When the row was last changed.');
    if (n === 'deleted_at') return say('When the row was soft-deleted. Empty means it is active.');
    if (n === 'remember_token') return say('Laravel "remember me" login token.');
    if (n === 'email_verified_at') return say('When the email address was confirmed.');
    if (/password/.test(n)) return say('Password, stored hashed.');
    if (n === 'branch_id') return say('Branch or tenant this row belongs to.');
    if (n === 'locale' || n === 'lang' || n === 'language') return say('Language code, for example en or fr.');
    if (/_id$/.test(n)) return say('ID of a ' + humanize(n.replace(/_id$/, '')).toLowerCase() + ' (no matching table in this schema).');
    if (/^enum/.test(type)) {
      var vals = (type.match(/'([^']*)'/g) || []).map(function (v) { return v.replace(/'/g, ''); });
      return say('One of: ' + vals.join(', ') + '.');
    }
    if (/^(is|has|can|should|allow)_/.test(n) || type === 'tinyint(1)' || type === 'boolean' || type === 'bool') return say('Yes or no: ' + humanize(n.replace(/^(is|has|can|should|allow)_/, '')).toLowerCase() + '.');
    if (n === 'status') return say('Status of the row' + (col.default != null && col.default !== 'NULL' ? ' (defaults to ' + col.default + ').' : '.'));
    if (/(_at|_date|_time|^date|^dob)$/.test(n) || /^(date|datetime|timestamp|time)/.test(type)) return say(humanize(n.replace(/_at$/, '')) + ' (' + type.replace(/\(.*\)/, '') + ').');
    if (/(email)/.test(n)) return say('Email address.');
    if (/(phone|mobile|tel)/.test(n)) return say('Phone number.');
    if (/(amount|fee|price|cost|total|balance|discount|salary|paid|due|fine)/.test(n) && /(decimal|double|float|int)/.test(type)) return say('Amount: ' + humanize(n).toLowerCase() + '.');
    if (/(_no|_number|code|reference|ref)$/.test(n)) return say('Reference number: ' + humanize(n).toLowerCase() + '.');
    if (/(serial|position|order|sort)$/.test(n)) return say('Display order.');
    if (/(image|photo|avatar|logo|file|path|upload)/.test(n)) return say('File or image reference.');
    if (/^json/.test(type)) return say('Structured JSON data: ' + humanize(n).toLowerCase() + '.');
    if (/text$/.test(type)) return say('Free text: ' + humanize(n).toLowerCase() + '.');
    return say(humanize(n) + '.');
  }

  function describeTable(g, name) {
    var t = g.model.tables[name];
    if (!t) return '';
    var out = g.relations.filter(function (r) { return r.from === name && r.kind !== 'view' && r.from !== r.to; });
    var inn = g.relations.filter(function (r) { return r.to === name && r.kind !== 'view' && r.from !== r.to; });
    var uniq = function (l) { return l.filter(function (x, i) { return l.indexOf(x) === i; }); };
    var parents = uniq(out.map(function (r) { return r.to; }));
    var children = uniq(inn.map(function (r) { return r.from; }));
    var impact = deleteImpact(g, name);
    var cascaded = uniq(impact.cascade.map(function (x) { return x.table; }));
    var s = name + (t.rows != null ? ' holds ' + t.rows.toLocaleString() + ' row' + (t.rows === 1 ? '' : 's') + ' in ' : ' has ') + t.columns.length + ' columns. ';
    s += parents.length ? 'Each row points to ' + parents.length + ' table' + (parents.length > 1 ? 's' : '') + ' (' + parents.slice(0, 5).join(', ') + (parents.length > 5 ? ', ...' : '') + '). ' : 'It points to no other table. ';
    s += children.length ? children.length + ' table' + (children.length > 1 ? 's point' : ' points') + ' to it. ' : 'Nothing points to it. ';
    if (cascaded.length) s += 'Deleting one row also deletes rows in ' + cascaded.length + ' table' + (cascaded.length > 1 ? 's' : '') + '.';
    return s.trim();
  }

  var api = {
    issues: issues,
    fixScript: fixScript,
    describeColumn: describeColumn,
    describeTable: describeTable,
    build: build,
    activeRelations: activeRelations,
    degrees: degrees,
    hubs: hubs,
    detect: detect,
    effectiveProfile: effectiveProfile,
    areaOf: areaOf,
    domainGroups: domainGroups,
    clusterGroups: clusterGroups,
    findPaths: findPaths,
    joinSql: joinSql,
    neighbourhood: neighbourhood,
    deleteImpact: deleteImpact,
    insights: insights,
    diff: diff,
    mermaid: mermaid,
    dictionaryRows: dictionaryRows
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.SchemaModel = api;
})(this);
