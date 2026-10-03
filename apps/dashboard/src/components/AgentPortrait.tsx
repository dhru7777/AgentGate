import { useEffect, useRef } from "react";
import * as THREE from "three";

function backPlate(name: string, agentId: number | null) {
  const canvas = document.createElement("canvas");
  canvas.width = 800;
  canvas.height = 800;
  const ctx = canvas.getContext("2d");
  if (!ctx) return new THREE.CanvasTexture(canvas);
  ctx.fillStyle = "#1b1917";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.strokeStyle = "rgba(255,255,255,0.14)";
  ctx.lineWidth = 2;
  ctx.strokeRect(36, 36, canvas.width - 72, canvas.height - 72);
  ctx.fillStyle = "#f3efe8";
  ctx.font = "600 54px Georgia, serif";
  ctx.textAlign = "center";
  const words = name.split(" ");
  words.forEach((word, index) => {
    ctx.fillText(word, canvas.width / 2, 360 + index * 68);
  });
  ctx.fillStyle = "#c8b8a2";
  ctx.font = "28px ui-sans-serif, system-ui, sans-serif";
  ctx.fillText(agentId ? `ERC-8004  #${agentId}` : "Unregistered", canvas.width / 2, 540);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

export function AgentPortrait({ name, agentId }: { name: string; agentId: number | null }) {
  const hostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const stage = host;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.02;
    stage.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 20);
    camera.position.set(0, 0.05, 3.15);

    scene.add(new THREE.AmbientLight(0xfff6ee, 0.55));
    const key = new THREE.DirectionalLight(0xfff8f2, 2.1);
    key.position.set(-1.6, 2.2, 2.4);
    scene.add(key);
    const rim = new THREE.DirectionalLight(0xd7e2ff, 0.7);
    rim.position.set(2.2, 0.4, -1.2);
    scene.add(rim);

    const card = new THREE.Group();
    card.rotation.y = 0.35;
    scene.add(card);

    const photoGeo = new THREE.PlaneGeometry(1.5, 1.5, 40, 40);
    const positions = photoGeo.attributes.position;
    for (let i = 0; i < positions.count; i += 1) {
      const x = positions.getX(i) / 0.75;
      const y = positions.getY(i) / 0.75;
      const falloff = Math.max(0, 1 - (x * x + y * y));
      positions.setZ(i, falloff * 0.06);
    }
    photoGeo.computeVertexNormals();

    const loader = new THREE.TextureLoader();
    const portrait = loader.load("/invoice-agent.jpg");
    portrait.colorSpace = THREE.SRGBColorSpace;
    portrait.anisotropy = 8;
    const photo = new THREE.Mesh(
      photoGeo,
      new THREE.MeshStandardMaterial({ map: portrait, roughness: 0.58, metalness: 0.02 }),
    );
    photo.position.z = 0.06;
    card.add(photo);

    const plateMap = backPlate(name, agentId);
    const plate = new THREE.Mesh(
      new THREE.PlaneGeometry(1.5, 1.5),
      new THREE.MeshStandardMaterial({ map: plateMap, roughness: 0.85, metalness: 0.04 }),
    );
    plate.position.z = -0.05;
    plate.rotation.y = Math.PI;
    card.add(plate);

    const rimMat = new THREE.MeshStandardMaterial({ color: 0x2a2623, roughness: 0.72, metalness: 0.08 });
    const rimGeo = [
      new THREE.BoxGeometry(1.54, 0.04, 0.1),
      new THREE.BoxGeometry(1.54, 0.04, 0.1),
      new THREE.BoxGeometry(0.04, 1.5, 0.1),
      new THREE.BoxGeometry(0.04, 1.5, 0.1),
    ];
    const rims = rimGeo.map((geometry) => new THREE.Mesh(geometry, rimMat));
    rims[0].position.y = 0.75;
    rims[1].position.y = -0.75;
    rims[2].position.x = -0.75;
    rims[3].position.x = 0.75;
    for (const rimMesh of rims) card.add(rimMesh);

    const shadow = new THREE.Mesh(
      new THREE.CircleGeometry(0.72, 40),
      new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.22 }),
    );
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = -0.95;
    scene.add(shadow);

    let frame = 0;
    let dragging = false;
    let auto = true;
    let lastX = 0;

    function resize() {
      const width = stage.clientWidth || 1;
      const height = stage.clientHeight || 1;
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height, false);
    }

    function onDown(event: PointerEvent) {
      dragging = true;
      auto = false;
      lastX = event.clientX;
      stage.setPointerCapture(event.pointerId);
    }

    function onUp() {
      dragging = false;
      auto = true;
    }

    function onMove(event: PointerEvent) {
      if (!dragging) return;
      card.rotation.y += (event.clientX - lastX) * 0.01;
      lastX = event.clientX;
    }

    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(host);
    stage.addEventListener("pointerdown", onDown);
    stage.addEventListener("pointerup", onUp);
    stage.addEventListener("pointercancel", onUp);
    stage.addEventListener("pointermove", onMove);
    resize();

    const tick = () => {
      if (auto && !dragging) card.rotation.y += 0.0035;
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
      photoGeo.dispose();
      (photo.material as THREE.Material).dispose();
      portrait.dispose();
      plate.geometry.dispose();
      const plateMat = plate.material as THREE.MeshStandardMaterial;
      plateMat.map?.dispose();
      plateMat.dispose();
      for (const geometry of rimGeo) geometry.dispose();
      rimMat.dispose();
      shadow.geometry.dispose();
      (shadow.material as THREE.Material).dispose();
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, [agentId, name]);

  return (
    <div className="agent-stage" ref={hostRef} aria-label={`${name} portrait`}>
      <p className="agent-stage-caption">
        <strong>{name}</strong>
        <span>{agentId ? `ERC-8004 #${agentId}` : "Unregistered"}</span>
      </p>
    </div>
  );
}
