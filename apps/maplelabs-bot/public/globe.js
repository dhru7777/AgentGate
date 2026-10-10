// Traffic visualization on the front of the gate card; everything else lives on the back.
// Real data only: window.globeSyncRows(rows) is called with the actual "What the gate
// logged" rows (each one a real request, already geo-tagged by the blog). One dot per
// distinct visitor (by vid, falling back to its lat/lon). A dot starts red on a 402 and
// turns green if that same visitor later gets served (paid). Only the newest request's
// dot glows/pulses - older dots sit still so the newest one reads clearly at a glance.
(function () {
  const stage3d = document.getElementById("globeStage");
  const stage2d = document.getElementById("globeStage2d");
  const flipBtn = document.getElementById("globeFlip");
  const flipCard = document.getElementById("globeFlip3d2d");
  if (!stage3d || !stage2d) return;

  const dots = new Map(); // key -> { lat, lon, status, ts, el2d, mesh3d }
  let latestKey = null;

  function keyFor(r) {
    if (r.vid) return "v:" + r.vid;
    if (typeof r.lat === "number" && typeof r.lon === "number") return "g:" + r.lat.toFixed(2) + "," + r.lon.toFixed(2);
    return null;
  }
  function colorFor(status) { return status === 402 ? "s402" : "s200"; }

  // ---------- 2D map ----------
  let layer2d = null;
  function initMap2d() {
    stage2d.innerHTML = "";
    const img = document.createElement("img");
    img.src = "/globe/earth.jpg";
    img.alt = "";
    img.className = "map2d-img";
    stage2d.appendChild(img);
    layer2d = document.createElement("div");
    layer2d.className = "map2d-dots";
    stage2d.appendChild(layer2d);
  }
  initMap2d();
  const toXY = (lat, lon) => ({ x: ((lon + 180) / 360) * 100, y: ((90 - lat) / 180) * 100 });

  function upsert2d(key, d, isNewLatest, converted) {
    if (!d.el2d) {
      const el = document.createElement("div");
      el.className = "map2d-dot " + colorFor(d.status);
      const xy = toXY(d.lat, d.lon);
      el.style.left = xy.x + "%";
      el.style.top = xy.y + "%";
      el.title = d.city || "";
      layer2d.appendChild(el);
      d.el2d = el;
    } else {
      d.el2d.className = "map2d-dot " + colorFor(d.status);
    }
    document.querySelectorAll(".map2d-dot.latest").forEach((e) => e.classList.remove("latest"));
    if (isNewLatest) d.el2d.classList.add("latest");
    if (converted) {
      const ring = document.createElement("div");
      ring.className = "map2d-pulse s200";
      ring.style.left = d.el2d.style.left;
      ring.style.top = d.el2d.style.top;
      layer2d.appendChild(ring);
      ring.addEventListener("animationend", () => ring.remove());
    }
  }

  // ---------- 3D globe ----------
  let three = null;
  function initGlobe3d() {
    if (!window.THREE || three) return three;
    const T = THREE;
    const renderer = new T.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    stage3d.appendChild(renderer.domElement);
    const scene = new T.Scene();
    const camera = new T.PerspectiveCamera(35, 1, 0.1, 40);
    camera.position.set(0, 0.3, 3.3);
    scene.add(new T.AmbientLight(0xb7c9df, 0.8));
    const sun = new T.DirectionalLight(0xfff6ea, 2.0);
    sun.position.set(2.2, 0.8, 5);
    scene.add(sun);

    const earth = new T.Group();
    earth.rotation.x = 0.35;
    scene.add(earth);
    const loader = new T.TextureLoader();
    const map = loader.load("/globe/earth.jpg");
    const bump = loader.load("/globe/earth-bump.jpg");
    map.encoding = T.sRGBEncoding;
    earth.add(new T.Mesh(
      new T.SphereGeometry(1, 64, 64),
      new T.MeshStandardMaterial({ map, emissiveMap: map, emissive: new T.Color(0xffffff), emissiveIntensity: 0.42, bumpMap: bump, bumpScale: 0.04, roughness: 0.82, metalness: 0.02 }),
    ));

    function vec(lat, lon, r) {
      const phi = T.MathUtils.degToRad(90 - lat), theta = T.MathUtils.degToRad(lon + 180);
      return new T.Vector3(-r * Math.sin(phi) * Math.cos(theta), r * Math.cos(phi), r * Math.sin(phi) * Math.sin(theta));
    }

    const glowTex = (() => {
      const c = document.createElement("canvas");
      c.width = c.height = 128;
      const ctx = c.getContext("2d");
      const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
      g.addColorStop(0, "rgba(255,255,255,0.9)");
      g.addColorStop(0.35, "rgba(255,255,255,0.35)");
      g.addColorStop(1, "rgba(255,255,255,0)");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, 128, 128);
      return new T.CanvasTexture(c);
    })();

    const colorHex = (status) => (status === 402 ? 0xc0392b : 0x3f8f5f);
    let latestGlow = null; // persistent breathing glow sprite on the current latest dot
    const rings = [];

    function ring(pos, status) {
      const color = colorHex(status);
      const r = new T.Mesh(new T.RingGeometry(0.018, 0.03, 32), new T.MeshBasicMaterial({ color, transparent: true, side: T.DoubleSide, blending: T.AdditiveBlending, depthWrite: false }));
      r.position.copy(pos);
      r.lookAt(pos.clone().multiplyScalar(2));
      r.userData.t = 0;
      earth.add(r);
      rings.push(r);
    }

    three = {
      vec,
      earth,
      upsertDot(key, d, isNewLatest, converted) {
        const pos = vec(d.lat, d.lon, 1.015);
        if (!d.mesh3d) {
          const mesh = new T.Mesh(new T.SphereGeometry(0.016, 14, 14), new T.MeshBasicMaterial({ color: colorHex(d.status) }));
          mesh.position.copy(pos);
          earth.add(mesh);
          d.mesh3d = mesh;
        } else {
          d.mesh3d.material.color.setHex(colorHex(d.status));
        }
        if (converted) ring(pos, 200);
        if (isNewLatest) {
          if (latestGlow) { earth.remove(latestGlow); latestGlow.material.dispose(); }
          latestGlow = new T.Sprite(new T.SpriteMaterial({ map: glowTex, color: colorHex(d.status), transparent: true, opacity: 0.9, blending: T.AdditiveBlending, depthWrite: false }));
          latestGlow.position.copy(pos);
          latestGlow.userData.base = 0.11;
          latestGlow.scale.setScalar(latestGlow.userData.base);
          earth.add(latestGlow);
          ring(pos, d.status);
        } else if (latestGlow && latestGlow.userData.key === key) {
          earth.remove(latestGlow); latestGlow.material.dispose(); latestGlow = null;
        }
        if (isNewLatest) latestGlow.userData.key = key;
      },
    };

    let dragging = false, lastX = 0, lastY = 0;
    stage3d.addEventListener("pointerdown", (e) => { dragging = true; lastX = e.clientX; lastY = e.clientY; stage3d.setPointerCapture(e.pointerId); stage3d.style.cursor = "grabbing"; });
    const up = () => { dragging = false; stage3d.style.cursor = ""; };
    stage3d.addEventListener("pointerup", up);
    stage3d.addEventListener("pointercancel", up);
    stage3d.addEventListener("pointermove", (e) => {
      if (!dragging) return;
      earth.rotation.y += (e.clientX - lastX) * 0.005;
      earth.rotation.x = T.MathUtils.clamp(earth.rotation.x + (e.clientY - lastY) * 0.004, -0.65, 0.65);
      lastX = e.clientX; lastY = e.clientY;
    });

    function resize() {
      const w = stage3d.clientWidth || 1, h = stage3d.clientHeight || 1;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h, false);
    }
    new ResizeObserver(resize).observe(stage3d);
    resize();

    let tClock = 0;
    (function tick() {
      tClock += 0.05;
      if (!dragging) earth.rotation.y += 0.0014;
      if (latestGlow) latestGlow.scale.setScalar(latestGlow.userData.base * (1 + 0.25 * Math.sin(tClock * 2)));
      for (let i = rings.length - 1; i >= 0; i--) {
        const r = rings[i];
        r.userData.t += 0.02;
        r.scale.setScalar(1 + r.userData.t * 8);
        r.material.opacity = Math.max(0, 1 - r.userData.t);
        if (r.userData.t >= 1) { earth.remove(r); r.geometry.dispose(); r.material.dispose(); rings.splice(i, 1); }
      }
      renderer.render(scene, camera);
      requestAnimationFrame(tick);
    })();
    return three;
  }

  // ---------- real-data sync, called from app.js's pollLog() ----------
  window.globeSyncRows = function (rows) {
    if (!rows || !rows.length) return;
    // rows are newest-first, same order the log table renders.
    let newLatestKey = null;
    for (let i = rows.length - 1; i >= 0; i--) {
      const r = rows[i];
      const key = keyFor(r);
      if (!key) continue;
      const isLatestRow = i === 0;
      let d = dots.get(key);
      let converted = false;
      if (!d) {
        d = { lat: r.lat, lon: r.lon, status: r.status, ts: r.ts, city: r.city };
        dots.set(key, d);
      } else {
        converted = d.status === 402 && r.status === 200;
        d.status = r.status;
        d.ts = r.ts;
      }
      if (isLatestRow) newLatestKey = key;
      const isNewLatest = isLatestRow && key !== latestKey;
      upsert2d(key, d, isNewLatest, converted);
      if (three) three.upsertDot(key, d, isNewLatest, converted);
    }
    if (newLatestKey) latestKey = newLatestKey;
  };

  // ---------- flip between the 3D globe and the 2D map ----------
  function setView(view) {
    const is3d = view === "3d";
    if (flipCard) flipCard.dataset.side = view;
    if (flipBtn) {
      flipBtn.textContent = (is3d ? "2D" : "3D") + " ↽";
      flipBtn.setAttribute("aria-label", is3d ? "Flip to 2D map" : "Flip to 3D globe");
    }
    if (is3d) initGlobe3d();
  }
  if (flipBtn) {
    flipBtn.addEventListener("click", () => {
      setView(flipCard && flipCard.dataset.side === "3d" ? "2d" : "3d");
    });
  }
  setView("3d");
})();
