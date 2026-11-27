/* ==========================================================================
   M87 & Sgr A* Accretion Ring + Biconical Galactic Outflow Animation
   ========================================================================== */

(function () {
  var stage = document.querySelector('.home__avatar-stage');
  var canvas = document.getElementById('bh-outflow-canvas');
  var avatar = stage ? stage.querySelector('.home__avatar') : null;
  var avatarImg = avatar ? avatar.querySelector('img') : null;

  if (!stage || !canvas || !avatar || !avatarImg) return;

  var ctx = canvas.getContext('2d');
  if (!ctx) return;

  var prefersReducedMotion =
    window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  var width = 0;
  var height = 0;
  var cx = 0;
  var cy = 0;
  var avatarRadius = 92;

  var introActive = false;
  var hoverActive = false;
  var touchActive = false;
  var touchTimer = null;
  var intensity = 0;
  var rafId = null;
  var lastTime = 0;
  var elapsed = 0;

  // Accretion filaments orbiting around the photo rim (M87* / Sgr A* style)
  var accretionFilaments = [];
  var NUM_FILAMENTS = 52;

  // Outflow gas particles & wisps streaming left and right (blue/purple)
  var outflowParticles = [];
  var NUM_OUTFLOW = 84;

  function isLightTheme() {
    return document.documentElement.getAttribute('data-theme') === 'light';
  }

  function rand(min, max) {
    return min + Math.random() * (max - min);
  }

  function initParticles() {
    accretionFilaments = [];
    for (var i = 0; i < NUM_FILAMENTS; i++) {
      var radialFrac = Math.random();
      accretionFilaments.push({
        angle: rand(0, Math.PI * 2),
        // Inner orbits move faster (Keplerian-inspired)
        speed: rand(1.15, 2.35) * (1.25 - radialFrac * 0.5),
        radiusOffset: 1 + radialFrac * 24,
        arcLen: rand(0.18, 0.72),
        thickness: rand(1.2, 4.2),
        alpha: rand(0.35, 0.9),
        // Color temperature: hotter gold/orange near inner rim, deeper amber/red further out
        temp: 1 - radialFrac * 0.85
      });
    }

    outflowParticles = [];
    for (var j = 0; j < NUM_OUTFLOW; j++) {
      var dir = j % 2 === 0 ? 1 : -1;
      outflowParticles.push(createOutflowParticle(dir, Math.random()));
    }
  }

  function createOutflowParticle(dir, initialProgress) {
    // Biconical spread around horizontal axis (left: PI, right: 0)
    var coneAngle = rand(-0.44, 0.44);
    var isWisp = Math.random() < 0.35;
    // Hue between cyan-blue (195), electric blue (225), and violet-purple (278)
    var hue = rand(198, 282);
    return {
      dir: dir,
      coneAngle: coneAngle,
      progress: typeof initialProgress === 'number' ? initialProgress : 0,
      speed: rand(0.42, 0.95),
      size: isWisp ? rand(7, 18) : rand(1.8, 5.0),
      isWisp: isWisp,
      hue: hue,
      sat: rand(78, 96),
      light: rand(56, 74),
      alpha: isWisp ? rand(0.12, 0.28) : rand(0.45, 0.88),
      wobblePhase: rand(0, Math.PI * 2),
      wobbleAmp: rand(2, 9)
    };
  }

  function resize() {
    var rect = stage.getBoundingClientRect();
    var imgRect = avatarImg.getBoundingClientRect();
    var dpr = Math.min(window.devicePixelRatio || 1, 2);

    width = Math.max(rect.width, 1);
    height = Math.max(rect.height, 1);
    cx = width / 2;
    cy = height / 2;
    avatarRadius = imgRect.width > 0 ? imgRect.width / 2 : 92;

    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function drawOutflows(dt, alphaScale, lightMode) {
    var maxReach = Math.min(width * 0.48 - avatarRadius, 210);
    if (maxReach < 30) maxReach = 30;

    ctx.save();
    ctx.globalCompositeOperation = lightMode ? 'source-over' : 'lighter';

    // Soft biconical nebula glow on left and right
    for (var s = -1; s <= 1; s += 2) {
      var gradStartX = cx + s * (avatarRadius * 0.82);
      var gradEndX = cx + s * (avatarRadius + maxReach);
      var coneGrad = ctx.createLinearGradient(gradStartX, cy, gradEndX, cy);
      var baseOp = (lightMode ? 0.22 : 0.28) * alphaScale;
      coneGrad.addColorStop(0, 'rgba(96, 165, 250, ' + baseOp.toFixed(3) + ')');
      coneGrad.addColorStop(0.45, 'rgba(139, 92, 246, ' + (baseOp * 0.65).toFixed(3) + ')');
      coneGrad.addColorStop(1, 'rgba(168, 85, 247, 0)');

      ctx.fillStyle = coneGrad;
      ctx.beginPath();
      ctx.moveTo(cx + s * (avatarRadius * 0.7), cy - avatarRadius * 0.28);
      ctx.lineTo(gradEndX, cy - avatarRadius * 0.95);
      ctx.lineTo(gradEndX, cy + avatarRadius * 0.95);
      ctx.lineTo(cx + s * (avatarRadius * 0.7), cy + avatarRadius * 0.28);
      ctx.closePath();
      ctx.fill();
    }

    // Individual streaming gas wisps & ionized knots
    for (var i = 0; i < outflowParticles.length; i++) {
      var p = outflowParticles[i];
      p.progress += p.speed * dt;
      if (p.progress >= 1) {
        outflowParticles[i] = createOutflowParticle(p.dir, 0);
        p = outflowParticles[i];
      }

      // Smooth fade-in near launch, smooth fade-out at edge
      var lifeAlpha = Math.sin(p.progress * Math.PI);
      var dist = avatarRadius * 0.88 + p.progress * maxReach;
      var spreadAngle = p.coneAngle * (0.55 + p.progress * 0.85);
      var wobble = Math.sin(elapsed * 3.2 + p.wobblePhase + p.progress * 4) * p.wobbleAmp * p.progress;

      var x = cx + p.dir * Math.cos(spreadAngle) * dist;
      var y = cy + Math.sin(spreadAngle) * dist + wobble;

      var lightness = lightMode ? Math.max(38, p.light - 14) : p.light;
      var finalAlpha = p.alpha * lifeAlpha * alphaScale * (lightMode ? 0.85 : 1);

      if (p.isWisp) {
        var r = p.size * (0.65 + p.progress * 0.9);
        var wGrad = ctx.createRadialGradient(x, y, 0, x, y, r);
        wGrad.addColorStop(0, 'hsla(' + p.hue + ', ' + p.sat + '%, ' + lightness + '%, ' + finalAlpha.toFixed(3) + ')');
        wGrad.addColorStop(1, 'hsla(' + p.hue + ', ' + p.sat + '%, ' + lightness + '%, 0)');
        ctx.fillStyle = wGrad;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
      } else {
        // Elongated velocity streak along outflow direction
        var streakLen = 6 + p.progress * 14;
        var dx = p.dir * Math.cos(spreadAngle) * streakLen;
        var dy = Math.sin(spreadAngle) * streakLen;

        ctx.strokeStyle = 'hsla(' + p.hue + ', ' + p.sat + '%, ' + lightness + '%, ' + finalAlpha.toFixed(3) + ')';
        ctx.lineWidth = p.size * (1 - p.progress * 0.35);
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(x - dx * 0.5, y - dy * 0.5);
        ctx.lineTo(x + dx * 0.5, y + dy * 0.5);
        ctx.stroke();
      }
    }

    ctx.restore();
  }

  function drawAccretionRing(dt, alphaScale, lightMode) {
    ctx.save();
    ctx.globalCompositeOperation = lightMode ? 'source-over' : 'lighter';

    var innerR = avatarRadius - 2;
    var outerR = avatarRadius + 30;

    // 1. Base luminous M87*/Sgr A* photon-ring halo
    var halo = ctx.createRadialGradient(cx, cy, innerR * 0.94, cx, cy, outerR);
    var haloStrength = (lightMode ? 0.65 : 0.78) * alphaScale;
    halo.addColorStop(0, 'rgba(255, 224, 140, 0)');
    halo.addColorStop(0.16, 'rgba(255, 210, 115, ' + haloStrength.toFixed(3) + ')');
    halo.addColorStop(0.42, 'rgba(255, 122, 24, ' + (haloStrength * 0.72).toFixed(3) + ')');
    halo.addColorStop(0.75, 'rgba(205, 52, 8, ' + (haloStrength * 0.28).toFixed(3) + ')');
    halo.addColorStop(1, 'rgba(180, 35, 0, 0)');

    ctx.fillStyle = halo;
    ctx.beginPath();
    ctx.arc(cx, cy, outerR, 0, Math.PI * 2);
    ctx.fill();

    // 2. Relativistic Doppler beaming bright crescent (slowly precessing)
    var beamAngle = elapsed * 0.55 + Math.PI * 0.62;
    var bx = cx + Math.cos(beamAngle) * (avatarRadius + 7);
    var by = cy + Math.sin(beamAngle) * (avatarRadius + 7);
    var beamGrad = ctx.createRadialGradient(bx, by, 2, bx, by, avatarRadius * 0.72);
    beamGrad.addColorStop(0, 'rgba(255, 244, 200, ' + (0.62 * alphaScale).toFixed(3) + ')');
    beamGrad.addColorStop(0.4, 'rgba(255, 145, 30, ' + (0.32 * alphaScale).toFixed(3) + ')');
    beamGrad.addColorStop(1, 'rgba(255, 90, 0, 0)');

    ctx.fillStyle = beamGrad;
    ctx.beginPath();
    ctx.arc(cx, cy, outerR, 0, Math.PI * 2);
    ctx.fill();

    // 3. Swirling plasma filaments orbiting the rim
    for (var i = 0; i < accretionFilaments.length; i++) {
      var f = accretionFilaments[i];
      f.angle += f.speed * dt;

      // Boost brightness on the Doppler-beamed side
      var angleDiff = Math.cos(f.angle - beamAngle);
      var beaming = 0.58 + 0.42 * (angleDiff * 0.5 + 0.5);

      var r = avatarRadius + f.radiusOffset;
      var hue = 18 + f.temp * 26; // deep orange-red (18) to golden yellow (44)
      var light = lightMode ? 48 + f.temp * 18 : 54 + f.temp * 26;
      var op = f.alpha * beaming * alphaScale * (lightMode ? 0.85 : 0.95);

      ctx.strokeStyle = 'hsla(' + hue.toFixed(0) + ', 100%, ' + light.toFixed(0) + '%, ' + op.toFixed(3) + ')';
      ctx.lineWidth = f.thickness;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.arc(cx, cy, r, f.angle, f.angle + f.arcLen);
      ctx.stroke();
    }

    ctx.restore();
  }

  function frame(now) {
    if (!lastTime) lastTime = now;
    var dt = Math.min((now - lastTime) / 1000, 0.05);
    lastTime = now;
    elapsed += dt;

    var target = introActive || hoverActive || touchActive ? 1 : 0;
    // Smooth ramp-in, quick stop when hover ends
    var rate = target > intensity ? 6.0 : 9.5;
    intensity += (target - intensity) * Math.min(1, rate * dt);

    ctx.clearRect(0, 0, width, height);

    if (intensity > 0.004) {
      var lightMode = isLightTheme();
      drawOutflows(dt, intensity, lightMode);
      drawAccretionRing(dt, intensity, lightMode);
    }

    if (intensity > 0.004 || target > 0) {
      rafId = window.requestAnimationFrame(frame);
    } else {
      intensity = 0;
      ctx.clearRect(0, 0, width, height);
      rafId = null;
      lastTime = 0;
    }
  }

  function updateStageClass() {
    if (introActive || hoverActive || touchActive) {
      stage.classList.add('is-active');
    } else {
      stage.classList.remove('is-active');
    }

    if (hoverActive || touchActive) {
      stage.classList.add('is-hovered');
    } else {
      stage.classList.remove('is-hovered');
    }
  }

  function ensureRunning() {
    updateStageClass();
    if (!rafId) {
      lastTime = 0;
      rafId = window.requestAnimationFrame(frame);
    }
  }

  function triggerTouchBurst() {
    touchActive = true;
    hoverActive = false;
    ensureRunning();
    if (touchTimer) {
      window.clearTimeout(touchTimer);
    }
    touchTimer = window.setTimeout(function () {
      touchActive = false;
      touchTimer = null;
      updateStageClass();
    }, 2000);
  }

  // Hover (mouse) & tap-for-2s (touch/mobile) interactions
  if (window.PointerEvent) {
    avatar.addEventListener('pointerenter', function (e) {
      if (e.pointerType === 'mouse') {
        hoverActive = true;
        ensureRunning();
      }
    });

    avatar.addEventListener('pointerleave', function (e) {
      if (e.pointerType === 'mouse') {
        hoverActive = false;
        updateStageClass();
      }
    });

    avatar.addEventListener('pointerdown', function (e) {
      if (e.pointerType !== 'mouse') {
        triggerTouchBurst();
      }
    });
  } else {
    avatar.addEventListener('mouseenter', function () {
      hoverActive = true;
      ensureRunning();
    });

    avatar.addEventListener('mouseleave', function () {
      hoverActive = false;
      updateStageClass();
    });

    avatar.addEventListener('touchstart', triggerTouchBurst, { passive: true });
  }

  // Initial setup
  resize();
  initParticles();

  window.addEventListener('resize', resize);
  if (avatarImg.complete) {
    resize();
  } else {
    avatarImg.addEventListener('load', resize);
  }

  // Auto-play ~2 seconds after page visit, lasting ~2 seconds
  if (!prefersReducedMotion) {
    window.setTimeout(function () {
      introActive = true;
      ensureRunning();
      window.setTimeout(function () {
        introActive = false;
        updateStageClass();
      }, 2200);
    }, 1800);
  }
})();
