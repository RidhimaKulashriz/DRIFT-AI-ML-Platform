import { useEffect, useRef, useState } from "react";
import { Box, Boxes, CloudFog, Crosshair, Download, Expand, Footprints, Grid3X3, LoaderCircle, MapPin, RotateCcw, Sun, Triangle, X } from "lucide-react";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

type ViewerState = "idle" | "loading" | "ready" | "failed";

type Props = { artifactUrl?: string | null; artifacts?: Array<{ type?: string; format?: string; url?: string; sizeBytes?: number; sha256?: string; status?: string }>; quality?: { accuracyStatus?: string; processingTimeSeconds?: number; processingTargetMet?: boolean; completenessRatio?: number | null; horizontalRmseMeters?: number | null; verticalRmseMeters?: number | null } | null };

function resolveArtifactUrl(artifactUrl?: string | null) {
  if (!artifactUrl) return null;
  if (/^https?:\/\//i.test(artifactUrl)) return artifactUrl;
  const backendOrigin = (import.meta.env.VITE_BACKEND_URL || "https://drift-node-api.onrender.com").replace(/\/$/, "");
  return `${backendOrigin}${artifactUrl.startsWith("/") ? artifactUrl : `/${artifactUrl}`}`;
}

export default function ReconstructionViewer({ artifactUrl, artifacts = [], quality }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<ViewerState>("idle");
  const [progress, setProgress] = useState(0);
  const [wireframe, setWireframe] = useState(false);
  const [grid, setGrid] = useState(true);
  const [autoRotate, setAutoRotate] = useState(false);
  const [sunHour, setSunHour] = useState(16);
  const [confidenceOverlay, setConfidenceOverlay] = useState(true);
  const [explorerMode, setExplorerMode] = useState(false);
  const [waypointCount, setWaypointCount] = useState(0);
  const [measureMode, setMeasureMode] = useState(false);
  const [stats, setStats] = useState<{ triangles: number; meshes: number; materials: number } | null>(null);
  const [errorMessage, setErrorMessage] = useState("");
  const modelRef = useRef<THREE.Object3D | null>(null);
  const gridRef = useRef<THREE.GridHelper | null>(null);
  const autoRotateRef = useRef(false);
  const resetViewRef = useRef<(() => void) | null>(null);
  const resolvedArtifactUrl = resolveArtifactUrl(artifactUrl);

  useEffect(() => { autoRotateRef.current = autoRotate; }, [autoRotate]);
  useEffect(() => {
    gridRef.current && (gridRef.current.visible = grid);
  }, [grid]);
  useEffect(() => {
    modelRef.current?.traverse(child => {
      const mesh = child as THREE.Mesh;
      if (!mesh.isMesh) return;
      const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      materials.forEach(material => { const meshMaterial = material as THREE.Material & { wireframe?: boolean }; if ("wireframe" in meshMaterial) meshMaterial.wireframe = wireframe; meshMaterial.needsUpdate = true; });
    });
  }, [wireframe]);
  useEffect(() => {
    const model = modelRef.current;
    if (!model) return;
    model.children.filter(child => child.name.startsWith("drift-waypoint-")).forEach(child => model.remove(child));
    for (let index = 0; index < waypointCount; index += 1) {
      const marker = new THREE.Mesh(new THREE.ConeGeometry(.12, .55, 8), new THREE.MeshBasicMaterial({ color: 0xf59e0b }));
      marker.name = `drift-waypoint-${index}`;
      marker.position.set(-5 + (index * 2.2) % 10, .35, -3 + ((index * 1.7) % 6));
      model.add(marker);
    }
  }, [waypointCount]);

  useEffect(() => {
    if (!host.current) return;
    let disposed = false;
    let frame = 0;
    let renderer: THREE.WebGLRenderer | null = null;
    let controls: OrbitControls | null = null;
    let model: THREE.Object3D | null = null;
    let gridHelper: THREE.GridHelper | null = null;
    const container = host.current;
    setState("loading");
    setProgress(0);
    setErrorMessage("");
    container.replaceChildren();

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x07111f);
    scene.add(new THREE.HemisphereLight(0xb9e7ff, 0x111827, 2.2));
    const keyLight = new THREE.DirectionalLight(sunHour < 8 || sunHour > 18 ? 0xffb36b : 0xffffff, 3.2);
    const sunAngle = ((sunHour - 6) / 12) * Math.PI;
    keyLight.position.set(Math.cos(sunAngle) * 10, Math.max(3, Math.sin(sunAngle) * 12), 8);
    scene.add(keyLight);
    const rimLight = new THREE.DirectionalLight(0x38bdf8, 1.4);
    rimLight.position.set(-8, 4, -6);
    scene.add(rimLight);
    gridHelper = new THREE.GridHelper(20, 20, 0x164e63, 0x0f293d);
    gridRef.current = gridHelper;
    gridHelper.visible = grid;
    scene.add(gridHelper);
    scene.add(new THREE.AxesHelper(2));

    const camera = new THREE.PerspectiveCamera(42, 1, 0.01, 100000);
    camera.position.set(4, 3, 6);
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, preserveDrawingBuffer: false });
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.15;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(container.clientWidth || 640, container.clientHeight || 440, false);
    renderer.domElement.className = "h-full w-full cursor-grab active:cursor-grabbing";
    renderer.domElement.setAttribute("aria-label", "Interactive 3D reconstruction viewer");
    container.appendChild(renderer.domElement);

    controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.minDistance = 0.01;
    controls.maxDistance = 100000;
    controls.target.set(0, 0, 0);
    controls.enabled = !explorerMode;
    const pressedKeys = new Set<string>();
    const onKeyDown = (event: KeyboardEvent) => { if (explorerMode && ["KeyW", "KeyA", "KeyS", "KeyD"].includes(event.code)) { event.preventDefault(); pressedKeys.add(event.code); } };
    const onKeyUp = (event: KeyboardEvent) => { pressedKeys.delete(event.code); };
    const requestPointerLock = () => { if (explorerMode) renderer?.domElement.requestPointerLock?.(); };
    const onMouseMove = (event: MouseEvent) => { if (explorerMode && document.pointerLockElement === renderer?.domElement) { camera.rotation.y -= event.movementX * .0022; camera.rotation.x = Math.max(-.9, Math.min(.9, camera.rotation.x - event.movementY * .0018)); } };
    window.addEventListener("keydown", onKeyDown); window.addEventListener("keyup", onKeyUp); renderer.domElement.addEventListener("click", requestPointerLock); window.addEventListener("mousemove", onMouseMove);

    const resize = () => {
      if (!renderer || !container.clientWidth || !container.clientHeight) return;
      camera.aspect = container.clientWidth / container.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(container.clientWidth, container.clientHeight, false);
    };
    const observer = new ResizeObserver(resize);
    observer.observe(container);

    const fitModel = (object: THREE.Object3D) => {
      const box = new THREE.Box3().setFromObject(object);
      const size = box.getSize(new THREE.Vector3());
      const center = box.getCenter(new THREE.Vector3());
      const maxSize = Math.max(size.x, size.y, size.z, 0.01);
      const distance = (maxSize / (2 * Math.tan((camera.fov * Math.PI) / 360))) * 1.45;
      camera.near = Math.max(maxSize / 10000, 0.001);
      camera.far = Math.max(maxSize * 100, 1000);
      camera.position.copy(center).add(new THREE.Vector3(distance * 0.85, distance * 0.55, distance));
      camera.lookAt(center);
      controls?.target.copy(center);
      controls?.update();
      if (gridHelper) {
        gridHelper.scale.setScalar(Math.max(maxSize / 10, 1));
        gridHelper.position.set(center.x, box.min.y, center.z);
      }
      resetViewRef.current = () => {
        camera.position.copy(center).add(new THREE.Vector3(distance * 0.85, distance * 0.55, distance));
        controls?.target.copy(center);
        controls?.update();
      };
    };

    const loader = new GLTFLoader();
    if (!resolvedArtifactUrl) {
      const preview = new THREE.Group();
      const terrain = new THREE.Mesh(new THREE.PlaneGeometry(32, 24, 32, 24), new THREE.MeshStandardMaterial({ color: 0x465d4e, roughness: 1 }));
      terrain.rotation.x = -Math.PI / 2; terrain.position.y = -0.18; preview.add(terrain);
      const ruinMaterial = new THREE.MeshStandardMaterial({ color: 0xb59b72, roughness: .92 });
      [[-4, 1.2, -2, 4, 2.4, 1], [-1, .8, -2, 1.6, 1.6, 3], [2, 1.6, -1, 3, 3.2, 1], [5, .55, 2, 5, 1.1, 2]].forEach(([x, y, z, w, h, d]) => { const block = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), ruinMaterial); block.position.set(x, y / 2, z); preview.add(block); });
      for (let i = 0; i < 15; i += 1) { const stone = new THREE.Mesh(new THREE.DodecahedronGeometry(.18 + (i % 3) * .08, 0), new THREE.MeshStandardMaterial({ color: 0x7e776c, roughness: 1 })); stone.position.set(-6 + (i * 1.17) % 12, .2, -6 + ((i * 2.31) % 10)); preview.add(stone); }
      if (confidenceOverlay) { const uncertain = new THREE.Mesh(new THREE.PlaneGeometry(5, 4), new THREE.MeshBasicMaterial({ color: 0x5eead4, transparent: true, opacity: .18, wireframe: true })); uncertain.rotation.x = -Math.PI / 2; uncertain.position.set(4, .02, 3); preview.add(uncertain); }
      scene.add(preview); model = preview; modelRef.current = preview; fitModel(preview); setStats({ triangles: 0, meshes: preview.children.length, materials: 3 }); setProgress(100); setState("ready");
    } else loader.load(resolvedArtifactUrl, gltf => {
      if (disposed) return;
      model = gltf.scene;
      modelRef.current = model;
      model.traverse(child => {
        const mesh = child as THREE.Mesh;
        if (!mesh.isMesh) return;
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        mesh.frustumCulled = true;
      });
      scene.add(model);
      fitModel(model);
      let triangles = 0;
      let meshes = 0;
      const materials = new Set<THREE.Material>();
      model.traverse(child => {
        const mesh = child as THREE.Mesh;
        if (!mesh.isMesh) return;
        meshes += 1;
        const geometry = mesh.geometry as THREE.BufferGeometry;
        triangles += geometry.index ? geometry.index.count / 3 : (geometry.attributes.position?.count ?? 0) / 3;
        const values = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        values.forEach(material => materials.add(material));
      });
      setStats({ triangles: Math.round(triangles), meshes, materials: materials.size });
      setProgress(100);
      setState("ready");
    }, event => {
      if (event.total > 0) setProgress(Math.round((event.loaded / event.total) * 100));
    }, error => {
      if (disposed) return;
      setErrorMessage(error instanceof Error ? error.message : "The GLB artifact could not be decoded.");
      setState("failed");
    });

    const tick = () => {
      if (disposed) return;
      frame = requestAnimationFrame(tick);
      if (explorerMode && model) { const speed = .075; const forward = Number(pressedKeys.has("KeyW")) - Number(pressedKeys.has("KeyS")); const strafe = Number(pressedKeys.has("KeyD")) - Number(pressedKeys.has("KeyA")); const direction = new THREE.Vector3(strafe, 0, forward).normalize().applyEuler(new THREE.Euler(0, camera.rotation.y, 0)); camera.position.addScaledVector(direction, speed); camera.position.y = Math.max(1.65, camera.position.y); }
      if (autoRotateRef.current && model) model.rotation.y += 0.0025;
      controls?.update();
      renderer?.render(scene, camera);
    };
    tick();

    return () => {
      disposed = true;
      cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener("keydown", onKeyDown); window.removeEventListener("keyup", onKeyUp); window.removeEventListener("mousemove", onMouseMove); renderer?.domElement.removeEventListener("click", requestPointerLock);
      controls?.dispose();
      scene.traverse(object => {
        const mesh = object as THREE.Mesh;
        if (mesh.geometry) mesh.geometry.dispose();
        const material = mesh.material;
        const values = Array.isArray(material) ? material : material ? [material] : [];
        values.forEach(item => {
          Object.values(item).forEach(value => { if (value instanceof THREE.Texture) value.dispose(); });
          item.dispose();
        });
      });
      renderer?.dispose();
      container.replaceChildren();
      modelRef.current = null;
      gridRef.current = null;
      resetViewRef.current = null;
    };
  }, [resolvedArtifactUrl, confidenceOverlay, explorerMode]);

  const reset = () => {
    resetViewRef.current?.();
    if (modelRef.current) modelRef.current.rotation.set(0, 0, 0);
    setAutoRotate(false);
  };

  return <article className="panel overflow-hidden">
    <div className="flex flex-wrap items-center justify-between gap-3 border-b p-4">
      <div><span className="eyebrow">WEBGL MESH INSPECTOR</span><h3>Textured 3D reconstruction</h3></div>
      <div className="flex flex-wrap items-center gap-2 text-cyan-600">{state === "loading" && <LoaderCircle className="animate-spin" />}<Box />{quality && <span className="rounded border border-amber-300 bg-amber-50 px-2 py-1 text-[10px] uppercase tracking-wide text-amber-900">{quality.accuracyStatus ?? "not validated"}</span>}</div>
    </div>
    {(artifacts.length > 0 || quality) && <div className="flex flex-wrap items-center gap-2 border-b bg-slate-50 px-4 py-3 text-xs text-slate-600"><span className="font-semibold uppercase tracking-wide">Artifacts</span>{artifacts.filter(item => item.url && item.status === "ready").map(item => <a key={`${item.type}-${item.format}-${item.url}`} href={resolveArtifactUrl(item.url) ?? undefined} download className="inline-flex items-center gap-1 rounded border bg-white px-2 py-1 hover:border-cyan-500 hover:text-cyan-700"><Download className="h-3 w-3" />{item.format?.toUpperCase()} {item.sizeBytes ? `· ${(item.sizeBytes / 1024 / 1024).toFixed(1)} MB` : ""}</a>)}{quality && <span className="ml-auto">{quality.processingTimeSeconds ? `${quality.processingTimeSeconds}s processing` : "processing time pending"} · {quality.processingTargetMet === true ? "target met" : "target not validated"} · RMSE {quality.horizontalRmseMeters ?? "—"}/{quality.verticalRmseMeters ?? "—"} m</span>}</div>}
    <>
      <div className="flex flex-wrap items-center gap-2 border-b bg-slate-950 px-3 py-2 text-xs text-slate-200">
        <button type="button" onClick={() => setGrid(value => !value)} className={`rounded border px-2 py-1 ${grid ? "border-cyan-400 text-cyan-200" : "border-slate-700 text-slate-400"}`}><Grid3X3 className="mr-1 inline h-3 w-3" />GRID</button>
        <button type="button" onClick={() => setWireframe(value => !value)} className={`rounded border px-2 py-1 ${wireframe ? "border-cyan-400 text-cyan-200" : "border-slate-700 text-slate-400"}`}><Triangle className="mr-1 inline h-3 w-3" />WIREFRAME</button>
        <button type="button" onClick={() => setAutoRotate(value => !value)} className={`rounded border px-2 py-1 ${autoRotate ? "border-cyan-400 text-cyan-200" : "border-slate-700 text-slate-400"}`}><RotateCcw className="mr-1 inline h-3 w-3" />AUTO ROTATE</button>
        <button type="button" onClick={reset} className="rounded border border-slate-700 px-2 py-1 text-slate-300"><Sun className="mr-1 inline h-3 w-3" />RESET</button>
        <button type="button" onClick={() => host.current?.requestFullscreen?.()} className="rounded border border-slate-700 px-2 py-1 text-slate-300"><Expand className="mr-1 inline h-3 w-3" />FULLSCREEN</button>
        <button type="button" onClick={() => setExplorerMode(value => !value)} className={`rounded border px-2 py-1 ${explorerMode ? "border-emerald-400 text-emerald-200" : "border-slate-700 text-slate-400"}`}><Footprints className="mr-1 inline h-3 w-3" />{explorerMode ? "EXPLORER" : "ORBIT"}</button>
        <button type="button" onClick={() => setConfidenceOverlay(value => !value)} className={`rounded border px-2 py-1 ${confidenceOverlay ? "border-cyan-400 text-cyan-200" : "border-slate-700 text-slate-400"}`}><CloudFog className="mr-1 inline h-3 w-3" />CONFIDENCE FIELD</button>
        <button type="button" onClick={() => setMeasureMode(value => !value)} className={`rounded border px-2 py-1 ${measureMode ? "border-amber-400 text-amber-200" : "border-slate-700 text-slate-400"}`}><Crosshair className="mr-1 inline h-3 w-3" />MEASURE RAY</button>
        <button type="button" onClick={() => setWaypointCount(value => value + 1)} className="rounded border border-slate-700 px-2 py-1 text-slate-300"><MapPin className="mr-1 inline h-3 w-3" />DROP WAYPOINT {waypointCount ? `(${waypointCount})` : ""}</button>
        <label className="flex items-center gap-2 border border-slate-700 px-2 py-1 text-slate-300"><Sun className="h-3 w-3" />{sunHour}:00<input aria-label="Sun time" type="range" min="5" max="21" value={sunHour} onChange={event => setSunHour(Number(event.target.value))} className="w-20" /></label>
        {stats && <span className="ml-auto text-[10px] uppercase tracking-wide text-slate-400">{stats.meshes} meshes · {stats.triangles.toLocaleString()} triangles · {stats.materials} materials</span>}
      </div>
      <div ref={host} className="h-[520px] w-full bg-slate-950" />
      {state === "loading" && <div className="border-t bg-slate-50 p-3 text-xs text-slate-600">Loading reconstruction artifact · {progress}%</div>}
      {state === "ready" && <p className="border-t bg-slate-50 p-3 text-xs text-slate-600"><Boxes className="mr-1 inline h-3 w-3" />{resolvedArtifactUrl ? "Published GLB loaded." : "Exploration preview active — synthetic terrain is clearly separated from worker-generated geometry."} {explorerMode ? "Explorer mode: use drag controls to navigate the scene." : "Orbit, pan, and zoom."} {measureMode ? "Measurement ray armed." : ""} {waypointCount ? `${waypointCount} waypoint${waypointCount === 1 ? "" : "s"} staged.` : ""}</p>}
      {state === "failed" && <div className="border-t bg-amber-50 p-4 text-sm text-amber-900"><X className="mr-1 inline h-4 w-4" />GLB artifact could not be loaded. {errorMessage || "Check the artifact volume, URL, and CORS configuration."}</div>}
    </>
  </article>;
}
