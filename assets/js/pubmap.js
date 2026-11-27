/* ==========================================================================
   Interactive Theme-Aware Publication Citation Web (D3 Force Graph)
   ========================================================================== */

(function () {
  var svgEl = document.getElementById('pubmap-svg');
  var dataEl = document.getElementById('pubmap-data');
  if (!svgEl || !dataEl || typeof d3 === 'undefined') return;

  var graphData = null;
  try {
    graphData = JSON.parse(dataEl.textContent || '{}');
  } catch (err) {
    console.error('Failed to parse pubmap data:', err);
    return;
  }

  var rawNodes = graphData.nodes || [];
  var rawLinks = graphData.links || [];
  if (rawNodes.length === 0) return;

  var ROLE_CONFIG = [
    { key: 'first_author', label: 'First Author', cssVar: '--pubmap-first' },
    { key: 'coauthor', label: 'Co-author', cssVar: '--pubmap-coauthor' },
    { key: 'citing', label: 'Citing Papers', cssVar: '--pubmap-citing' }
  ];

  var roleMeta = {};
  ROLE_CONFIG.forEach(function (r) { roleMeta[r.key] = r; });

  function escapeHtml(str) {
    return String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function formatPaperLabel(d) {
    var authors = String(d.authors || '').trim();
    var year = String(d.year || '').trim();
    if (!authors) return d.short_label || d.title || '';
    var firstAuthor = authors.split(',')[0].trim();
    var commaCount = (authors.match(/,/g) || []).length;
    var hasMultiple = /et al\./i.test(authors) || commaCount >= 2 || /\sand\s/i.test(authors);
    var plus = hasMultiple ? '+' : '';
    return year ? (firstAuthor + plus + '(' + year + ')') : (firstAuthor + plus);
  }

  // Deep-clone nodes and links for D3 mutation
  var nodes = rawNodes.map(function (n) {
    var copy = Object.assign({}, n);
    copy.display_label = formatPaperLabel(copy);
    return copy;
  });
  var links = rawLinks.map(function (l) { return Object.assign({}, l); });

  var nodeById = {};
  nodes.forEach(function (n) { nodeById[n.id] = n; });

  // Build adjacency map for highlighting & info card
  var adjacency = {};
  var referencesOf = {};
  var citedByOf = {};
  nodes.forEach(function (n) {
    adjacency[n.id] = new Set([n.id]);
    referencesOf[n.id] = [];
    citedByOf[n.id] = [];
  });
  links.forEach(function (l) {
    var s = typeof l.source === 'object' ? l.source.id : l.source;
    var t = typeof l.target === 'object' ? l.target.id : l.target;
    if (adjacency[s]) adjacency[s].add(t);
    if (adjacency[t]) adjacency[t].add(s);
    if (referencesOf[s] && nodeById[t]) referencesOf[s].push(nodeById[t]);
    if (citedByOf[t] && nodeById[s]) citedByOf[t].push(nodeById[s]);
  });

  function nodeRadius(d) {
    if (d.role === 'first_author' || d.role === 'coauthor') {
      var cites = (citedByOf[d.id] || []).length;
      return Math.min(20, 11 + Math.sqrt(cites) * 1.6);
    }
    var refs = (referencesOf[d.id] || []).length;
    return refs > 1 ? 7.5 : 5.5;
  }

  var width = svgEl.clientWidth || 760;
  var height = svgEl.clientHeight || 540;

  // Spread user's own papers initially in a wide ring so clusters start well-separated
  var ownNodes = nodes.filter(function (n) { return n.role !== 'citing'; });
  ownNodes.forEach(function (n, idx) {
    var angle = (2 * Math.PI * idx) / Math.max(1, ownNodes.length) - Math.PI / 2;
    var spread = Math.min(width, height) * 0.42;
    n.x = width / 2 + Math.cos(angle) * spread;
    n.y = height / 2 + Math.sin(angle) * spread;
  });

  var svg = d3.select(svgEl)
    .attr('viewBox', [0, 0, width, height]);

  // Arrowhead marker
  var defs = svg.append('defs');
  defs.append('marker')
    .attr('id', 'pubmap-arrow')
    .attr('viewBox', '0 -4 8 8')
    .attr('refX', 8)
    .attr('refY', 0)
    .attr('markerWidth', 5.5)
    .attr('markerHeight', 5.5)
    .attr('orient', 'auto')
    .append('path')
    .attr('d', 'M0,-3.5L8,0L0,3.5')
    .attr('fill', 'var(--pubmap-edge)');

  var rootGroup = svg.append('g');
  var linkGroup = rootGroup.append('g');
  var nodeGroup = rootGroup.append('g');

  var zoom = d3.zoom()
    .scaleExtent([0.25, 3.5])
    .on('zoom', function (event) {
      rootGroup.attr('transform', event.transform);
    });

  svg.call(zoom);

  // Balanced force simulation: separated clusters without drifting too far apart
  var simulation = d3.forceSimulation(nodes)
    .force('link', d3.forceLink(links)
      .id(function (d) { return d.id; })
      .distance(function (l) {
        var tCites = (citedByOf[l.target.id] || []).length;
        return 75 + Math.min(55, Math.sqrt(tCites) * 10);
      })
      .strength(0.5))
    .force('charge', d3.forceManyBody()
      .strength(function (d) {
        return d.role === 'citing' ? -135 : -520;
      }))
    .force('center', d3.forceCenter(width / 2, height / 2))
    .force('collision', d3.forceCollide().radius(function (d) {
      return nodeRadius(d) + (d.role === 'citing' ? 14 : 36);
    }))
    .force('x', d3.forceX(width / 2).strength(0.065))
    .force('y', d3.forceY(height / 2).strength(0.075));

  var linkSel = linkGroup.selectAll('line')
    .data(links)
    .join('line')
    .attr('class', 'pubmap-link')
    .attr('marker-end', 'url(#pubmap-arrow)');

  var nodeSel = nodeGroup.selectAll('g')
    .data(nodes)
    .join('g')
    .attr('class', 'pubmap-node')
    .call(d3.drag()
      .on('start', function (event, d) {
        if (!event.active) simulation.alphaTarget(0.25).restart();
        d.fx = d.x;
        d.fy = d.y;
      })
      .on('drag', function (event, d) {
        d.fx = event.x;
        d.fy = event.y;
      })
      .on('end', function (event, d) {
        if (!event.active) simulation.alphaTarget(0);
        d.fx = null;
        d.fy = null;
      }));

  // Outer halo ring for user's own papers (starting points of the web)
  nodeSel.filter(function (d) { return d.role !== 'citing'; })
    .append('circle')
    .attr('class', 'pubmap-node-ring')
    .attr('r', function (d) { return nodeRadius(d) + 5; })
    .attr('stroke', function (d) { return 'var(' + roleMeta[d.role].cssVar + ')'; });

  nodeSel.append('circle')
    .attr('class', 'pubmap-node-circle')
    .attr('r', nodeRadius)
    .attr('fill', function (d) { return 'var(' + roleMeta[d.role].cssVar + ')'; });

  nodeSel.append('text')
    .attr('class', function (d) {
      return 'pubmap-node-label' + (d.role === 'citing' ? ' pubmap-node-label--citing' : '');
    })
    .attr('dy', function (d) { return nodeRadius(d) + 15; })
    .text(function (d) { return d.display_label || d.short_label || d.title; });

  var selectedNodeId = null;
  var infoCardEl = document.getElementById('pubmap-info-card');

  function applyHighlight(focusId) {
    if (!focusId) {
      nodeSel.classed('is-dimmed', false).classed('is-active', false);
      linkSel.classed('is-dimmed', false).classed('is-highlighted', false);
      return;
    }
    var neighbors = adjacency[focusId] || new Set([focusId]);
    nodeSel
      .classed('is-dimmed', function (d) { return !neighbors.has(d.id); })
      .classed('is-active', function (d) { return neighbors.has(d.id); });
    linkSel
      .classed('is-highlighted', function (l) {
        return l.source.id === focusId || l.target.id === focusId;
      })
      .classed('is-dimmed', function (l) {
        return l.source.id !== focusId && l.target.id !== focusId;
      });
  }

  function showInfoCard(d) {
    if (!infoCardEl) return;
    var meta = roleMeta[d.role] || ROLE_CONFIG[2];
    var titleHtml = d.url
      ? '<a href="' + escapeHtml(d.url) + '" target="_blank" rel="noopener">' + escapeHtml(d.title) + '</a>'
      : escapeHtml(d.title);

    var parts = [];
    parts.push(
      '<div class="pubmap-info-header">' +
        '<span class="pubmap-info-badge" style="background-color: var(' + meta.cssVar + ');">' + escapeHtml(meta.label) + '</span>' +
        '<button type="button" class="pubmap-info-close" id="pubmap-info-close" aria-label="Close">&times;</button>' +
      '</div>'
    );
    parts.push('<h4 class="pubmap-info-title">' + titleHtml + '</h4>');

    if (d.authors) {
      var auth = d.authors.length > 130 ? d.authors.slice(0, 127) + '…' : d.authors;
      parts.push('<p class="pubmap-info-meta">' + escapeHtml(auth) + '</p>');
    }

    var venueYear = [d.venue, d.year].filter(Boolean).join(', ');
    if (venueYear) {
      parts.push('<p class="pubmap-info-meta"><em>' + escapeHtml(venueYear) + '</em></p>');
    }

    var citedBy = citedByOf[d.id] || [];
    var refs = referencesOf[d.id] || [];
    if (d.role !== 'citing') {
      parts.push('<p class="pubmap-info-meta"><strong>Referenced by:</strong> ' + citedBy.length + (citedBy.length === 1 ? ' paper' : ' papers') + '</p>');
    } else if (refs.length > 0) {
      var refNames = refs.map(function (r) { return escapeHtml(r.display_label || r.short_label || r.title); }).join(', ');
      parts.push('<p class="pubmap-info-meta"><strong>References:</strong> ' + refNames + '</p>');
    }

    if (d.url) {
      parts.push('<a class="pubmap-info-link" href="' + escapeHtml(d.url) + '" target="_blank" rel="noopener">Open paper &rarr;</a>');
    }

    infoCardEl.innerHTML = parts.join('');
    infoCardEl.classList.add('is-visible');

    var closeBtn = document.getElementById('pubmap-info-close');
    if (closeBtn) {
      closeBtn.addEventListener('click', function () {
        selectedNodeId = null;
        infoCardEl.classList.remove('is-visible');
        applyHighlight(null);
      });
    }
  }

  nodeSel
    .on('mouseenter', function (event, d) {
      if (!selectedNodeId) applyHighlight(d.id);
    })
    .on('mouseleave', function () {
      if (!selectedNodeId) applyHighlight(null);
    })
    .on('click', function (event, d) {
      event.stopPropagation();
      selectedNodeId = d.id;
      applyHighlight(d.id);
      showInfoCard(d);
    });

  svg.on('click', function () {
    if (selectedNodeId) {
      selectedNodeId = null;
      if (infoCardEl) infoCardEl.classList.remove('is-visible');
      applyHighlight(null);
    }
  });

  function renderPositions() {
    linkSel
      .attr('x1', function (d) { return d.source.x; })
      .attr('y1', function (d) { return d.source.y; })
      .attr('x2', function (d) {
        var dx = d.target.x - d.source.x;
        var dy = d.target.y - d.source.y;
        var dist = Math.sqrt(dx * dx + dy * dy) || 1;
        var pad = nodeRadius(d.target) + 4;
        return d.target.x - (dx / dist) * pad;
      })
      .attr('y2', function (d) {
        var dx = d.target.x - d.source.x;
        var dy = d.target.y - d.source.y;
        var dist = Math.sqrt(dx * dx + dy * dy) || 1;
        var pad = nodeRadius(d.target) + 4;
        return d.target.y - (dy / dist) * pad;
      });

    nodeSel.attr('transform', function (d) {
      return 'translate(' + d.x + ',' + d.y + ')';
    });
  }

  simulation.on('tick', renderPositions);

  // Interactive legend filter state (declared before fitToView)
  var activeRoles = { first_author: true, coauthor: true, citing: true };
  var counts = { first_author: 0, coauthor: 0, citing: 0 };
  nodes.forEach(function (n) {
    if (counts[n.role] !== undefined) counts[n.role] += 1;
  });

  function fitToView(duration) {
    var visibleNodes = nodes.filter(function (n) { return activeRoles[n.role]; });
    if (visibleNodes.length === 0) return;

    var xs = visibleNodes.map(function (n) { return n.x || width / 2; });
    var ys = visibleNodes.map(function (n) { return n.y || height / 2; });
    var minX = Math.min.apply(null, xs) - 55;
    var maxX = Math.max.apply(null, xs) + 55;
    var minY = Math.min.apply(null, ys) - 45;
    var maxY = Math.max.apply(null, ys) + 55;

    var bw = Math.max(120, maxX - minX);
    var bh = Math.max(120, maxY - minY);
    var scale = Math.min(1.4, 0.90 / Math.max(bw / width, bh / height));
    var tx = width / 2 - scale * ((minX + maxX) / 2);
    var ty = height / 2 - scale * ((minY + maxY) / 2);
    var transform = d3.zoomIdentity.translate(tx, ty).scale(scale);

    if (duration === 0) {
      svg.call(zoom.transform, transform);
    } else {
      svg.transition().duration(duration || 400).call(zoom.transform, transform);
    }
  }

  // Pre-settle layout so the web opens cleanly framed and centered
  simulation.stop();
  for (var i = 0; i < 200; i++) {
    simulation.tick();
  }
  renderPositions();
  fitToView(0);
  simulation.alpha(0.05).restart();

  function updateVisibility() {
    nodeSel.style('display', function (d) {
      return activeRoles[d.role] ? null : 'none';
    });
    linkSel.style('display', function (l) {
      return (activeRoles[l.source.role] && activeRoles[l.target.role]) ? null : 'none';
    });
  }

  var legendEl = document.getElementById('pubmap-legend');
  if (legendEl) {
    ROLE_CONFIG.forEach(function (r) {
      if (counts[r.key] === 0) return;
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'pubmap-filter-btn';
      btn.setAttribute('aria-pressed', 'true');
      btn.innerHTML =
        '<span class="pubmap-filter-dot" style="background-color: var(' + r.cssVar + ');"></span>' +
        '<span>' + escapeHtml(r.label) + '</span>' +
        '<span class="pubmap-filter-count">(' + counts[r.key] + ')</span>';

      btn.addEventListener('click', function () {
        activeRoles[r.key] = !activeRoles[r.key];
        btn.classList.toggle('is-inactive', !activeRoles[r.key]);
        btn.setAttribute('aria-pressed', String(activeRoles[r.key]));
        updateVisibility();
      });

      legendEl.appendChild(btn);
    });
  }

  var zoomInBtn = document.getElementById('pubmap-zoom-in');
  var zoomOutBtn = document.getElementById('pubmap-zoom-out');
  var resetBtn = document.getElementById('pubmap-reset');

  if (zoomInBtn) {
    zoomInBtn.addEventListener('click', function () {
      svg.transition().duration(250).call(zoom.scaleBy, 1.3);
    });
  }
  if (zoomOutBtn) {
    zoomOutBtn.addEventListener('click', function () {
      svg.transition().duration(250).call(zoom.scaleBy, 0.77);
    });
  }
  if (resetBtn) {
    resetBtn.addEventListener('click', function () {
      ROLE_CONFIG.forEach(function (r) { activeRoles[r.key] = true; });
      if (legendEl) {
        legendEl.querySelectorAll('.pubmap-filter-btn').forEach(function (b) {
          b.classList.remove('is-inactive');
          b.setAttribute('aria-pressed', 'true');
        });
      }
      selectedNodeId = null;
      if (infoCardEl) infoCardEl.classList.remove('is-visible');
      applyHighlight(null);
      updateVisibility();
      fitToView(400);
    });
  }
})();
