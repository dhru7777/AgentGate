import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import type { Summary } from "../types";

type Place = Summary["places"][number];

function placeVector(lat: number, lon: number, radius: number) {
  const phi = THREE.MathUtils.degToRad(90 - lat);
  const theta = THREE.MathUtils.degToRad(lon + 180);
  return new THREE.Vector3(
    -radius * Math.sin(phi) * Math.cos(theta),
    radius * Math.cos(phi),
    radius * Math.sin(phi) * Math.sin(theta),
  );
}

function placeLabel(place: Place) {
  const where = place.city ? `${place.city}, ${place.country}` : place.country;
  return `${where} · ${place.count.toLocaleString()}`;
}

export function RequestMap({ places, total }: { places: Summary["places"]; total: number }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const placesRef = useRef(places);
  const syncRef = useRef<(() => void) | null>(null);
  placesRef.current = places;
  const [tip, setTip] = useState<{ x: number; y: number; text: string } | null>(null);
  const located = places.reduce((sum, place) => sum + place.count, 0);
  const byCountry = new Map<string, { country: string; count: number; cities: Set<string> }>();
  for (const place of places) {
    const current = byCountry.get(place.country) ?? { country: place.country, count: 0, cities: new Set<string>() };
    current.count += place.count;
    if (place.city) current.cities.add(place.city);
    byCountry.set(place.country, current);
  }
  const rows = [...byCountry.values()].sort((a, b) => b.count - a.count);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const stage = host;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    stage.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 40);
    camera.position.set(0, 0.42, 3.35);

    const stars = new Float32Array(900 * 3);
    for (let i = 0; i < 900; i += 1) {
      const radius = 7 + Math.random() * 5;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      stars[i * 3] = radius * Math.sin(phi) * Math.cos(theta);
      stars[i * 3 + 1] = radius * Math.sin(phi) * Math.sin(theta);
      stars[i * 3 + 2] = radius * Math.cos(phi);
    }
    const starGeo = new THREE.BufferGeometry();
    starGeo.setAttribute("position", new THREE.BufferAttribute(stars, 3));
    const starMat = new THREE.PointsMaterial({ color: 0xd7e4ff, size: 0.018, transparent: true, opacity: 0.75 });
    scene.add(new THREE.Points(starGeo, starMat));

    scene.add(new THREE.AmbientLight(0xb7c9df, 0.55));
    const sun = new THREE.DirectionalLight(0xfff6ea, 2.2);
    sun.position.set(2.2, 0.8, 5);
    scene.add(sun);

    const earth = new THREE.Group();
    earth.rotation.y = 1.15;
    earth.rotation.x = 0.42;
    scene.add(earth);

    const loader = new THREE.TextureLoader();
    const colorMap = loader.load("/globe/earth.jpg");
    const bumpMap = loader.load("/globe/earth-bump.jpg");
    colorMap.colorSpace = THREE.SRGBColorSpace;
    bumpMap.colorSpace = THREE.NoColorSpace;
    colorMap.anisotropy = 8;

    const globe = new THREE.Mesh(
      new THREE.SphereGeometry(1, 96, 96),
      new THREE.MeshStandardMaterial({
        map: colorMap,
        emissiveMap: colorMap,
        emissive: new THREE.Color(0xffffff),
        emissiveIntensity: 0.42,
        bumpMap,
        bumpScale: 0.04,
        roughness: 0.82,
        metalness: 0.02,
      }),
    );
    earth.add(globe);

    const atmosphere = new THREE.Mesh(
      new THREE.SphereGeometry(1.12, 64, 64),
      new THREE.ShaderMaterial({
        transparent: true,
        side: THREE.BackSide,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        uniforms: {},
        vertexShader: `
          varying vec3 vNormal;
          void main() {
            vNormal = normalize(normalMatrix * normal);
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }
        `,
        fragmentShader: `
          varying vec3 vNormal;
          void main() {
            float rim = pow(0.62 - dot(vNormal, vec3(0.0, 0.0, 1.0)), 2.4);
            gl_FragColor = vec4(0.45, 0.72, 1.0, 1.0) * rim;
          }
        `,
      }),
    );
    scene.add(atmosphere);

    const markers = new THREE.Group();
    earth.add(markers);

    const syncMarkers = () => {
      for (const child of [...markers.children]) {
        markers.remove(child);
        if (child instanceof THREE.Mesh) {
          child.geometry.dispose();
          (child.material as THREE.Material).dispose();
        }
      }
      const list = placesRef.current;
      const max = Math.max(...list.map((place) => place.count), 1);
      for (const place of list) {
        const scale = 0.012 + (Math.sqrt(place.count) / Math.sqrt(max)) * 0.02;
        const dot = new THREE.Mesh(
          new THREE.SphereGeometry(1, 18, 18),
          new THREE.MeshStandardMaterial({
            color: 0xfff1e8,
            emissive: 0xff5a1f,
            emissiveIntensity: 1.4,
            roughness: 0.35,
          }),
        );
        dot.scale.setScalar(scale);
        dot.position.copy(placeVector(place.lat, place.lon, 1.015));
        dot.userData.label = placeLabel(place);
        markers.add(dot);
      }
    };
    syncRef.current = syncMarkers;
    syncMarkers();

    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    let frame = 0;
    let dragging = false;
    let moved = false;
    let auto = true;
    let lastX = 0;
    let lastY = 0;
    let hover = "";

    function resize() {
      const width = stage.clientWidth || 1;
      const height = stage.clientHeight || 1;
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height, false);
    }

    function onDown(event: PointerEvent) {
      dragging = true;
      moved = false;
      auto = false;
      lastX = event.clientX;
      lastY = event.clientY;
      stage.setPointerCapture(event.pointerId);
    }

    function onUp() {
      dragging = false;
      auto = true;
    }

    function onMove(event: PointerEvent) {
      const rect = stage.getBoundingClientRect();
      if (dragging) {
        const dx = event.clientX - lastX;
        const dy = event.clientY - lastY;
        if (Math.abs(dx) + Math.abs(dy) > 2) moved = true;
        earth.rotation.y += dx * 0.005;
        earth.rotation.x = THREE.MathUtils.clamp(earth.rotation.x + dy * 0.004, -0.65, 0.65);
        lastX = event.clientX;
        lastY = event.clientY;
        return;
      }
      if (moved) return;
      pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(pointer, camera);
      const hit = raycaster.intersectObjects(markers.children, false)[0];
      const text = typeof hit?.object.userData.label === "string" ? hit.object.userData.label : "";
      if (text !== hover) {
        hover = text;
        setTip(text ? { x: event.clientX - rect.left, y: event.clientY - rect.top, text } : null);
      } else if (text) {
        setTip({ x: event.clientX - rect.left, y: event.clientY - rect.top, text });
      }
    }

    function onLeave() {
      hover = "";
      setTip(null);
    }

    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(host);
    stage.addEventListener("pointerdown", onDown);
    stage.addEventListener("pointerup", onUp);
    stage.addEventListener("pointercancel", onUp);
    stage.addEventListener("pointermove", onMove);
    stage.addEventListener("pointerleave", onLeave);
    resize();

    const tick = () => {
      if (auto && !dragging) earth.rotation.y += 0.0018;
      renderer.render(scene, camera);
      frame = requestAnimationFrame(tick);
    };
    tick();

    return () => {
      cancelAnimationFrame(frame);
      resizeObserver.disconnect();
      stage.removeEventListener("pointerdown", onDown);
      stage.removeEventListener("pointerup", onUp);
      stage.removeEventListener("pointercancel", onUp);
      stage.removeEventListener("pointermove", onMove);
      stage.removeEventListener("pointerleave", onLeave);
      syncRef.current = null;
      starGeo.dispose();
      starMat.dispose();
      globe.geometry.dispose();
      (globe.material as THREE.Material).dispose();
      atmosphere.geometry.dispose();
      (atmosphere.material as THREE.Material).dispose();
      colorMap.dispose();
      bumpMap.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, []);

  useEffect(() => {
    syncRef.current?.();
  }, [places]);

  return (
    <section className="obs-map">
      <h2>Where requests come from</h2>
      <p className="obs-lead">
        {located
          ? `${located.toLocaleString()} of ${total.toLocaleString()} requests in this range have a rough location. Drag the globe. Hover a light for the city.`
          : "No located requests in this range yet."}
      </p>
      <div className="obs-globe" ref={hostRef}>
        {tip && (
          <div className="obs-globe-tip" style={{ left: tip.x, top: tip.y }}>
            {tip.text}
          </div>
        )}
      </div>
      <div className="table-wrap obs-map-list">
        <table>
          <thead>
            <tr>
              <th>Place</th>
              <th>Requests</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.country}>
                <td>
                  {row.country}
                  {row.cities.size > 0 && <span className="obs-map-cities"> {[...row.cities].slice(0, 4).join(", ")}</span>}
                </td>
                <td>{row.count.toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
