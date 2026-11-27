/* ==========================================================================
   Interactive Theme-Aware Talk & Event Map
   ========================================================================== */

(function () {
  var mapEl = document.getElementById('talkmap');
  var dataEl = document.getElementById('talkmap-data');
  if (!mapEl || !dataEl || typeof L === 'undefined') return;

  var entries = [];
  try {
    entries = JSON.parse(dataEl.textContent || '[]');
  } catch (err) {
    console.error('Failed to parse talkmap data:', err);
    return;
  }

  var CATEGORY_CONFIG = [
    { key: 'talk', label: 'Academic Talk', cssVar: '--talkmap-cat-talk', aliases: ['academic talk', 'talk'] },
    { key: 'workshop', label: 'Workshop', cssVar: '--talkmap-cat-workshop', aliases: ['workshop lead', 'workshop'] },
    { key: 'poster', label: 'Poster', cssVar: '--talkmap-cat-poster', aliases: ['conference poster', 'poster'] },
    { key: 'outreach', label: 'Outreach', cssVar: '--talkmap-cat-outreach', aliases: ['outreach talk', 'outreach'] },
    { key: 'event', label: 'Event', cssVar: '--talkmap-cat-event', aliases: ['event', 'internship', 'visit'] }
  ];

  function resolveCategory(raw) {
    var norm = String(raw || '').trim().toLowerCase();
    for (var i = 0; i < CATEGORY_CONFIG.length; i++) {
      if (CATEGORY_CONFIG[i].aliases.indexOf(norm) !== -1) {
        return CATEGORY_CONFIG[i];
      }
    }
    return CATEGORY_CONFIG[CATEGORY_CONFIG.length - 1];
  }

  function escapeHtml(str) {
    return String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  var map = L.map(mapEl, {
    center: [0, 0],
    zoom: 2,
    minZoom: 1,
    maxZoom: 18,
    maxBounds: [[-85, -180], [85, 180]],
    maxBoundsViscosity: 0.85,
    worldCopyJump: false,
    scrollWheelZoom: true
  });

  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 18,
    minZoom: 1,
    noWrap: true,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors'
  }).addTo(map);

  var clusterGroup = L.markerClusterGroup({
    showCoverageOnHover: false,
    maxClusterRadius: 35,
    spiderfyOnMaxZoom: true,
    spiderfyDistanceMultiplier: 1.5,
    iconCreateFunction: function (cluster) {
      var count = cluster.getChildCount();
      return L.divIcon({
        html: '<span>' + count + '</span>',
        className: 'talkmap-cluster',
        iconSize: [34, 34]
      });
    }
  });
  map.addLayer(clusterGroup);

  function buildPopupHtml(item, cat) {
    var badgeStyle = 'background-color: var(' + cat.cssVar + ');';
    var titleText = escapeHtml(item.title);
    var titleHtml = item.url
      ? '<a href="' + escapeHtml(item.url) + '"' + (item.external ? ' target="_blank" rel="noopener"' : '') + '>' + titleText + '</a>'
      : titleText;

    var parts = [];
    parts.push('<span class="talkmap-popup-badge" style="' + badgeStyle + '">' + escapeHtml(cat.label) + '</span>');
    parts.push('<h4 class="talkmap-popup-title">' + titleHtml + '</h4>');

    if (item.venue && item.location) {
      parts.push('<p class="talkmap-popup-meta"><strong>Venue:</strong> ' + escapeHtml(item.venue) + '</p>');
      parts.push('<p class="talkmap-popup-meta"><strong>Location:</strong> ' + escapeHtml(item.location) + '</p>');
    } else if (item.location) {
      parts.push('<p class="talkmap-popup-meta"><strong>Location:</strong> ' + escapeHtml(item.location) + '</p>');
    } else if (item.venue) {
      parts.push('<p class="talkmap-popup-meta"><strong>Venue:</strong> ' + escapeHtml(item.venue) + '</p>');
    }

    if (item.date) {
      parts.push('<p class="talkmap-popup-meta"><strong>Date:</strong> ' + escapeHtml(item.date) + '</p>');
    }

    if (item.length) {
      parts.push('<p class="talkmap-popup-meta"><strong>Length:</strong> ' + escapeHtml(item.length) + '</p>');
    }

    if (item.description) {
      parts.push('<p class="talkmap-popup-desc">' + escapeHtml(item.description) + '</p>');
    }

    if (item.url) {
      var linkLabel = cat.key === 'event' ? 'More info &rarr;' : 'View details &rarr;';
      parts.push(
        '<a class="talkmap-popup-link" href="' + escapeHtml(item.url) + '"' +
        (item.external ? ' target="_blank" rel="noopener"' : '') +
        '>' + linkLabel + '</a>'
      );
    }

    return parts.join('');
  }

  var markersByCategory = {};
  var activeCategories = {};
  var countsByCategory = {};

  CATEGORY_CONFIG.forEach(function (cat) {
    markersByCategory[cat.key] = [];
    activeCategories[cat.key] = true;
    countsByCategory[cat.key] = 0;
  });

  entries.forEach(function (item) {
    var lat = Number(item.lat);
    var lng = Number(item.lng);
    if (!isFinite(lat) || !isFinite(lng)) return;

    var cat = resolveCategory(item.category);
    countsByCategory[cat.key] += 1;

    var icon = L.divIcon({
      className: 'talkmap-pin-icon',
      html: '<div class="talkmap-pin" style="background-color: var(' + cat.cssVar + ');"></div>',
      iconSize: [16, 16],
      iconAnchor: [8, 8],
      popupAnchor: [0, -10]
    });

    var marker = L.marker([lat, lng], {
      icon: icon,
      title: item.title || item.location || ''
    });
    marker.bindPopup(buildPopupHtml(item, cat));
    markersByCategory[cat.key].push(marker);
  });

  function getVisibleMarkers() {
    var visible = [];
    CATEGORY_CONFIG.forEach(function (cat) {
      if (activeCategories[cat.key]) {
        visible = visible.concat(markersByCategory[cat.key]);
      }
    });
    return visible;
  }

  function renderMarkers(shouldFit) {
    clusterGroup.clearLayers();
    var visible = getVisibleMarkers();
    if (visible.length > 0) {
      clusterGroup.addLayers(visible);
      if (shouldFit) {
        var bounds = L.latLngBounds(visible.map(function (m) { return m.getLatLng(); }));
        map.fitBounds(bounds, { padding: [36, 36], maxZoom: 6 });
      }
    }
  }

  // Build interactive legend / category filter buttons
  var legendEl = document.getElementById('talkmap-legend');
  if (legendEl) {
    CATEGORY_CONFIG.forEach(function (cat) {
      if (countsByCategory[cat.key] === 0) return;

      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'talkmap-filter-btn';
      btn.setAttribute('aria-pressed', 'true');
      btn.innerHTML =
        '<span class="talkmap-filter-dot" style="background-color: var(' + cat.cssVar + ');"></span>' +
        '<span>' + escapeHtml(cat.label) + '</span>' +
        '<span class="talkmap-filter-count">(' + countsByCategory[cat.key] + ')</span>';

      btn.addEventListener('click', function () {
        activeCategories[cat.key] = !activeCategories[cat.key];
        btn.classList.toggle('is-inactive', !activeCategories[cat.key]);
        btn.setAttribute('aria-pressed', String(activeCategories[cat.key]));
        renderMarkers(false);
      });

      legendEl.appendChild(btn);
    });
  }

  var resetBtn = document.getElementById('talkmap-reset');
  if (resetBtn) {
    resetBtn.addEventListener('click', function () {
      CATEGORY_CONFIG.forEach(function (cat) {
        activeCategories[cat.key] = true;
      });
      if (legendEl) {
        var btns = legendEl.querySelectorAll('.talkmap-filter-btn');
        btns.forEach(function (b) {
          b.classList.remove('is-inactive');
          b.setAttribute('aria-pressed', 'true');
        });
      }
      renderMarkers(true);
    });
  }

  renderMarkers(true);
})();
