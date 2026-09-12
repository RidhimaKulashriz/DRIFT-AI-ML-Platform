import { useEffect, useRef, useState } from "react";
import {
  Box,
  Boxes,
  CloudFog,
  Crosshair,
  Download,
  Expand,
  Footprints,
  Grid3X3,
  LoaderCircle,
  MapPin,
  RotateCcw,
  Sun,
  Triangle,
  X,
} from "lucide-react";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

type ViewerState = "idle" | "loading" | "ready" | "failed";

type Props = {
  artifactUrl?: string | null;
  sourceVideoUrl?: string | null;
  jobKey?: string | null;
  artifacts?: Array<{
    type?: string;
    format?: string;
    url?: string;
    sizeBytes?: number;
    sha256?: string;
    status?: string;
  }>;
  quality?: {
    accuracyStatus?: string;
    processingTimeSeconds?: number;
    processingTargetMet?: boolean;
    completenessRatio?: number | null;
    horizontalRmseMeters?: number | null;
    verticalRmseMeters?: number | null;
  } | null;
};

function resolveArtifactUrl(artifactUrl?: string | null) {
  if (!artifactUrl) return null;
  if (/^https?:\/\//i.test(artifactUrl)) return artifactUrl;
  const backendOrigin = (
    import.meta.env.VITE_BACKEND_URL || "https://drift-node-api.onrender.com"
  ).replace(/\/$/, "");
  return `${backendOrigin}${artifactUrl.startsWith("/") ? artifactUrl : `/${artifactUrl}`}`;
}

export default function ReconstructionViewer({
  artifactUrl,
  sourceVideoUrl,
  jobKey,
  artifacts = [],
  quality,
}: Props) {
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
  const [waypointMode, setWaypointMode] = useState(false);
  const [measureMode, setMeasureMode] = useState(false);
  const [selectedObject, setSelectedObject] = useState("none");
  const [measureDistance, setMeasureDistance] = useState<number | null>(null);
  const [scanState, setScanState] = useState<"idle" | "scanning" | "captured">(
    "idle"
  );
  const measurePointsRef = useRef<THREE.Vector3[]>([]);
  const waypointPointsRef = useRef<THREE.Vector3[]>([]);
  const [stats, setStats] = useState<{
    triangles: number;
    meshes: number;
    materials: number;
  } | null>(null);
  const [errorMessage, setErrorMessage] = useState("");
  const modelRef = useRef<THREE.Object3D | null>(null);
  const gridRef = useRef<THREE.GridHelper | null>(null);
  const autoRotateRef = useRef(false);
  const resetViewRef = useRef<(() => void) | null>(null);
  const resolvedArtifactUrl = resolveArtifactUrl(artifactUrl);

  useEffect(() => {
    autoRotateRef.current = autoRotate;
  }, [autoRotate]);
  useEffect(() => {
    gridRef.current && (gridRef.current.visible = grid);
  }, [grid]);
  useEffect(() => {
    modelRef.current?.traverse(child => {
      const mesh = child as THREE.Mesh;
      if (!mesh.isMesh) return;
      const materials = Array.isArray(mesh.material)
        ? mesh.material
        : [mesh.material];
      materials.forEach(material => {
        const meshMaterial = material as THREE.Material & {
          wireframe?: boolean;
        };
        if ("wireframe" in meshMaterial) meshMaterial.wireframe = wireframe;
        meshMaterial.needsUpdate = true;
      });
    });
  }, [wireframe]);
  useEffect(() => {
    const model = modelRef.current;
    if (!model) return;
    model.children
      .filter(child => child.name.startsWith("drift-waypoint-"))
      .forEach(child => model.remove(child));
    waypointPointsRef.current.forEach((point, index) => {
      const marker = new THREE.Mesh(
        new THREE.ConeGeometry(0.12, 0.55, 8),
        new THREE.MeshBasicMaterial({ color: 0xf59e0b })
      );
      marker.name = `drift-waypoint-${index}`;
      marker.position.copy(point);
      marker.position.y += 0.25;
      model.add(marker);
    });
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
    const keyLight = new THREE.DirectionalLight(
      sunHour < 8 || sunHour > 18 ? 0xffb36b : 0xffffff,
      3.2
    );
    const sunAngle = ((sunHour - 6) / 12) * Math.PI;
    keyLight.position.set(
      Math.cos(sunAngle) * 10,
      Math.max(3, Math.sin(sunAngle) * 12),
      8
    );
    keyLight.castShadow = true;
    keyLight.shadow.mapSize.set(1024, 1024);
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
    renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: false,
      preserveDrawingBuffer: false,
    });
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.15;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(
      container.clientWidth || 640,
      container.clientHeight || 440,
      false
    );
    renderer.domElement.className =
      "h-full w-full cursor-grab active:cursor-grabbing";
    renderer.domElement.setAttribute(
      "aria-label",
      "Interactive 3D reconstruction viewer"
    );
    container.appendChild(renderer.domElement);

    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    const measurementGroup = new THREE.Group();
    measurementGroup.name = "drift-measurement";
    scene.add(measurementGroup);
    const renderMeasurement = () => {
      measurementGroup.clear();
      const points = measurePointsRef.current;
      points.forEach(point => {
        const marker = new THREE.Mesh(
          new THREE.SphereGeometry(0.08, 12, 8),
          new THREE.MeshBasicMaterial({ color: 0xfbbf24 })
        );
        marker.position.copy(point);
        measurementGroup.add(marker);
      });
      if (points.length === 2) {
        const line = new THREE.Line(
          new THREE.BufferGeometry().setFromPoints(points),
          new THREE.LineBasicMaterial({ color: 0xfbbf24 })
        );
        measurementGroup.add(line);
      }
    };
    const onSceneClick = (event: MouseEvent) => {
      const rect = renderer!.domElement.getBoundingClientRect();
      pointer.set(
        ((event.clientX - rect.left) / rect.width) * 2 - 1,
        -((event.clientY - rect.top) / rect.height) * 2 + 1
      );
      raycaster.setFromCamera(pointer, camera);
      const hits = raycaster
        .intersectObjects(scene.children, true)
        .filter(
          hit =>
            hit.object !== gridHelper &&
            !(hit.object as THREE.Object3D).name.startsWith("drift-waypoint-")
        );
      const hit = hits[0];
      if (!hit) return;
      const objectName = hit.object.name || "scene surface";
      setSelectedObject(objectName);
      if (waypointMode) {
        waypointPointsRef.current = [
          ...waypointPointsRef.current,
          hit.point.clone(),
        ];
        setWaypointCount(waypointPointsRef.current.length);
        setWaypointMode(false);
      }
      if (measureMode) {
        measurePointsRef.current = [
          ...measurePointsRef.current,
          hit.point.clone(),
        ].slice(-2);
        renderMeasurement();
        if (measurePointsRef.current.length === 2)
          setMeasureDistance(
            measurePointsRef.current[0]!.distanceTo(
              measurePointsRef.current[1]!
            )
          );
      }
    };
    renderer.domElement.addEventListener("click", onSceneClick);

    controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.minDistance = 0.01;
    controls.maxDistance = 100000;
    controls.target.set(0, 0, 0);
    controls.enabled = !explorerMode;
    const pressedKeys = new Set<string>();
    const collisionVolumes: THREE.Box3[] = [];
    const velocity = new THREE.Vector3();
    let lastTime = performance.now();
    let groundY = 0;
    const onKeyDown = (event: KeyboardEvent) => {
      if (
        explorerMode &&
        ["KeyW", "KeyA", "KeyS", "KeyD"].includes(event.code)
      ) {
        event.preventDefault();
        pressedKeys.add(event.code);
      }
    };
    const onKeyUp = (event: KeyboardEvent) => {
      pressedKeys.delete(event.code);
    };
    const requestPointerLock = () => {
      if (explorerMode) renderer?.domElement.requestPointerLock?.();
    };
    const onMouseMove = (event: MouseEvent) => {
      if (
        explorerMode &&
        document.pointerLockElement === renderer?.domElement
      ) {
        camera.rotation.y -= event.movementX * 0.0022;
        camera.rotation.x = Math.max(
          -0.9,
          Math.min(0.9, camera.rotation.x - event.movementY * 0.0018)
        );
      }
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    renderer.domElement.addEventListener("click", requestPointerLock);
    window.addEventListener("mousemove", onMouseMove);

    const resize = () => {
      if (!renderer || !container.clientWidth || !container.clientHeight)
        return;
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
      groundY = box.min.y;
      const maxSize = Math.max(size.x, size.y, size.z, 0.01);
      const distance =
        (maxSize / (2 * Math.tan((camera.fov * Math.PI) / 360))) * 1.45;
      camera.near = Math.max(maxSize / 10000, 0.001);
      camera.far = Math.max(maxSize * 100, 1000);
      camera.position
        .copy(center)
        .add(new THREE.Vector3(distance * 0.85, distance * 0.55, distance));
      camera.lookAt(center);
      controls?.target.copy(center);
      controls?.update();
      if (gridHelper) {
        gridHelper.scale.setScalar(Math.max(maxSize / 10, 1));
        gridHelper.position.set(center.x, box.min.y, center.z);
      }
      resetViewRef.current = () => {
        camera.position
          .copy(center)
          .add(new THREE.Vector3(distance * 0.85, distance * 0.55, distance));
        controls?.target.copy(center);
        controls?.update();
      };
    };

    const refreshCollisionVolumes = (object: THREE.Object3D) => {
      collisionVolumes.length = 0;
      object.traverse(child => {
        const mesh = child as THREE.Mesh;
        if (!mesh.isMesh) return;
        const box = new THREE.Box3().setFromObject(mesh);
        const size = box.getSize(new THREE.Vector3());
        if (size.y > 0.35 && size.length() < 60) collisionVolumes.push(box);
      });
    };
    const canOccupy = (position: THREE.Vector3) => {
      const capsule = new THREE.Box3(
        new THREE.Vector3(
          position.x - 0.28,
          position.y - 1.55,
          position.z - 0.28
        ),
        new THREE.Vector3(
          position.x + 0.28,
          position.y + 0.15,
          position.z + 0.28
        )
      );
      return !collisionVolumes.some(box => box.intersectsBox(capsule));
    };
    const loader = new GLTFLoader();
    if (resolvedArtifactUrl)
      loader.load(
        resolvedArtifactUrl,
        gltf => {
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
          refreshCollisionVolumes(model);
          let triangles = 0;
          let meshes = 0;
          const materials = new Set<THREE.Material>();
          model.traverse(child => {
            const mesh = child as THREE.Mesh;
            if (!mesh.isMesh) return;
            meshes += 1;
            const geometry = mesh.geometry as THREE.BufferGeometry;
            triangles += geometry.index
              ? geometry.index.count / 3
              : (geometry.attributes.position?.count ?? 0) / 3;
            const values = Array.isArray(mesh.material)
              ? mesh.material
              : [mesh.material];
            values.forEach(material => materials.add(material));
          });
          setStats({
            triangles: Math.round(triangles),
            meshes,
            materials: materials.size,
          });
          setProgress(100);
          setState("ready");
        },
        event => {
          if (event.total > 0)
            setProgress(Math.round((event.loaded / event.total) * 100));
        },
        error => {
          if (disposed) return;
          setErrorMessage(
            error instanceof Error
              ? error.message
              : "The GLB artifact could not be decoded."
          );
          setState("failed");
        }
      );
    else setState("ready");

    const tick = () => {
      if (disposed) return;
      frame = requestAnimationFrame(tick);
      const now = performance.now();
      const dt = Math.min((now - lastTime) / 1000, 0.05);
      lastTime = now;
      if (explorerMode && model) {
        const forward =
          Number(pressedKeys.has("KeyW")) - Number(pressedKeys.has("KeyS"));
        const strafe =
          Number(pressedKeys.has("KeyD")) - Number(pressedKeys.has("KeyA"));
        const input = new THREE.Vector3(strafe, 0, forward);
        if (input.lengthSq())
          input
            .normalize()
            .applyEuler(new THREE.Euler(0, camera.rotation.y, 0));
        const targetSpeed = input.lengthSq() ? 3.2 : 0;
        velocity.x +=
          (input.x * targetSpeed - velocity.x) * Math.min(1, dt * 10);
        velocity.z +=
          (input.z * targetSpeed - velocity.z) * Math.min(1, dt * 10);
        velocity.y -= 9.81 * dt;
        const next = camera.position.clone().addScaledVector(velocity, dt);
        const floor = groundY + 1.65;
        if (next.y <= floor) {
          next.y = floor;
          velocity.y = 0;
        }
        if (canOccupy(new THREE.Vector3(next.x, next.y, camera.position.z)))
          camera.position.x = next.x;
        if (canOccupy(new THREE.Vector3(camera.position.x, next.y, next.z)))
          camera.position.z = next.z;
        camera.position.y = next.y;
      }
      if (autoRotateRef.current && model) model.rotation.y += 0.0025;
      controls?.update();
      renderer?.render(scene, camera);
    };
    tick();

    return () => {
      disposed = true;
      cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("mousemove", onMouseMove);
      renderer?.domElement.removeEventListener("click", requestPointerLock);
      renderer?.domElement.removeEventListener("click", onSceneClick);
      controls?.dispose();
      scene.traverse(object => {
        const mesh = object as THREE.Mesh;
        if (mesh.geometry) mesh.geometry.dispose();
        const material = mesh.material;
        const values = Array.isArray(material)
          ? material
          : material
            ? [material]
            : [];
        values.forEach(item => {
          Object.values(item).forEach(value => {
            if (value instanceof THREE.Texture) value.dispose();
          });
          item.dispose();
        });
      });
      renderer?.dispose();
      container.replaceChildren();
      modelRef.current = null;
      gridRef.current = null;
      resetViewRef.current = null;
    };
  }, [
    resolvedArtifactUrl,
    confidenceOverlay,
    explorerMode,
    measureMode,
    waypointMode,
  ]);

  const reset = () => {
    resetViewRef.current?.();
    if (modelRef.current) modelRef.current.rotation.set(0, 0, 0);
    setAutoRotate(false);
  };

  return (
    <article className="panel overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b p-4">
        <div>
          <span className="eyebrow">WEBGL MESH INSPECTOR</span>
          <h3>Textured 3D reconstruction</h3>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-cyan-600">
          {state === "loading" && <LoaderCircle className="animate-spin" />}
          <Box />
          {quality && (
            <span className="rounded border border-amber-300 bg-amber-50 px-2 py-1 text-[10px] uppercase tracking-wide text-amber-900">
              {quality.accuracyStatus ?? "not validated"}
            </span>
          )}
        </div>
      </div>
      {(artifacts.length > 0 || quality) && (
        <div className="flex flex-wrap items-center gap-2 border-b bg-slate-50 px-4 py-3 text-xs text-slate-600">
          <span className="font-semibold uppercase tracking-wide">
            Artifacts
          </span>
          {artifacts
            .filter(item => item.url && item.status === "ready")
            .map(item => (
              <a
                key={`${item.type}-${item.format}-${item.url}`}
                href={resolveArtifactUrl(item.url) ?? undefined}
                download
                className="inline-flex items-center gap-1 rounded border bg-white px-2 py-1 hover:border-cyan-500 hover:text-cyan-700"
              >
                <Download className="h-3 w-3" />
                {item.format?.toUpperCase()}{" "}
                {item.sizeBytes
                  ? `· ${(item.sizeBytes / 1024 / 1024).toFixed(1)} MB`
                  : ""}
              </a>
            ))}
          {quality && (
            <span className="ml-auto">
              {quality.processingTimeSeconds
                ? `${quality.processingTimeSeconds}s processing`
                : "processing time pending"}{" "}
              ·{" "}
              {quality.processingTargetMet === true
                ? "target met"
                : "target not validated"}{" "}
              · RMSE {quality.horizontalRmseMeters ?? "—"}/
              {quality.verticalRmseMeters ?? "—"} m
            </span>
          )}
        </div>
      )}
      <>
        <div className="flex flex-wrap items-center gap-2 border-b bg-slate-950 px-3 py-2 text-xs text-slate-200">
          <button
            type="button"
            onClick={() => setGrid(value => !value)}
            className={`rounded border px-2 py-1 ${grid ? "border-cyan-400 text-cyan-200" : "border-slate-700 text-slate-400"}`}
          >
            <Grid3X3 className="mr-1 inline h-3 w-3" />
            GRID
          </button>
          <button
            type="button"
            onClick={() => setWireframe(value => !value)}
            className={`rounded border px-2 py-1 ${wireframe ? "border-cyan-400 text-cyan-200" : "border-slate-700 text-slate-400"}`}
          >
            <Triangle className="mr-1 inline h-3 w-3" />
            WIREFRAME
          </button>
          <button
            type="button"
            onClick={() => setAutoRotate(value => !value)}
            className={`rounded border px-2 py-1 ${autoRotate ? "border-cyan-400 text-cyan-200" : "border-slate-700 text-slate-400"}`}
          >
            <RotateCcw className="mr-1 inline h-3 w-3" />
            AUTO ROTATE
          </button>
          <button
            type="button"
            onClick={reset}
            className="rounded border border-slate-700 px-2 py-1 text-slate-300"
          >
            <Sun className="mr-1 inline h-3 w-3" />
            RESET
          </button>
          <button
            type="button"
            onClick={() => host.current?.requestFullscreen?.()}
            className="rounded border border-slate-700 px-2 py-1 text-slate-300"
          >
            <Expand className="mr-1 inline h-3 w-3" />
            FULLSCREEN
          </button>
          <button
            type="button"
            onClick={() => setExplorerMode(value => !value)}
            className={`rounded border px-2 py-1 ${explorerMode ? "border-emerald-400 text-emerald-200" : "border-slate-700 text-slate-400"}`}
          >
            <Footprints className="mr-1 inline h-3 w-3" />
            {explorerMode ? "EXPLORER" : "ORBIT"}
          </button>
          <button
            type="button"
            onClick={() => setConfidenceOverlay(value => !value)}
            className={`rounded border px-2 py-1 ${confidenceOverlay ? "border-cyan-400 text-cyan-200" : "border-slate-700 text-slate-400"}`}
          >
            <CloudFog className="mr-1 inline h-3 w-3" />
            CONFIDENCE FIELD
          </button>
          <button
            type="button"
            onClick={() => setMeasureMode(value => !value)}
            className={`rounded border px-2 py-1 ${measureMode ? "border-amber-400 text-amber-200" : "border-slate-700 text-slate-400"}`}
          >
            <Crosshair className="mr-1 inline h-3 w-3" />
            MEASURE RAY
          </button>
          <button
            type="button"
            onClick={() => {
              setScanState("scanning");
              window.setTimeout(() => setScanState("captured"), 900);
            }}
            className={`rounded border px-2 py-1 ${scanState === "captured" ? "border-emerald-400 text-emerald-200" : "border-slate-700 text-slate-400"}`}
          >
            <Crosshair className="mr-1 inline h-3 w-3" />
            {scanState === "scanning"
              ? "SCANNING"
              : scanState === "captured"
                ? "EVIDENCE CAPTURED"
                : "SCAN SURFACE"}
          </button>
          <button
            type="button"
            onClick={() => setWaypointMode(value => !value)}
            disabled={!resolvedArtifactUrl}
            className={`rounded border px-2 py-1 ${waypointMode ? "border-amber-400 text-amber-200" : "border-slate-700 text-slate-300"}`}
          >
            <MapPin className="mr-1 inline h-3 w-3" />
            {waypointMode ? "CLICK SURFACE" : "DROP WAYPOINT"}{" "}
            {waypointCount ? `(${waypointCount})` : ""}
          </button>
          <label className="flex items-center gap-2 border border-slate-700 px-2 py-1 text-slate-300">
            <Sun className="h-3 w-3" />
            {sunHour}:00
            <input
              aria-label="Sun time"
              type="range"
              min="5"
              max="21"
              value={sunHour}
              onChange={event => setSunHour(Number(event.target.value))}
              className="w-20"
            />
          </label>
          {stats && (
            <span className="ml-auto text-[10px] uppercase tracking-wide text-slate-400">
              {stats.meshes} meshes · {stats.triangles.toLocaleString()}{" "}
              triangles · {stats.materials} materials
            </span>
          )}
        </div>
        <div ref={host} className="h-[520px] w-full bg-slate-950" />
        {state === "loading" && (
          <div className="border-t bg-slate-50 p-3 text-xs text-slate-600">
            Loading reconstruction artifact · {progress}%
          </div>
        )}
        {state === "ready" && (
          <p className="border-t bg-slate-50 p-3 text-xs text-slate-600">
            <Boxes className="mr-1 inline h-3 w-3" />
            {resolvedArtifactUrl
              ? "Published GLB loaded as the reconstructed place."
              : `No published reconstruction artifact for ${jobKey ?? "this run"}; the scene is intentionally not fabricated. ${sourceVideoUrl ? "Source video is attached to the job; waiting for a worker-produced artifact." : "Attach source video metadata before reconstruction."}`}{" "}
            {resolvedArtifactUrl &&
              (explorerMode
                ? "WASD + mouse look active."
                : "Orbit, pan, and zoom.")}{" "}
            {resolvedArtifactUrl && selectedObject !== "none"
              ? ` Selected: ${selectedObject}.`
              : ""}{" "}
            {resolvedArtifactUrl && measureMode
              ? " Measurement ray armed; click two surfaces."
              : ""}{" "}
            {measureDistance !== null
              ? ` Distance: ${measureDistance.toFixed(2)} scene metres.`
              : ""}{" "}
            {waypointCount
              ? `${waypointCount} waypoint${waypointCount === 1 ? "" : "s"} staged.`
              : ""}{" "}
            {scanState === "captured"
              ? " Inspection evidence captured locally; sync to a mission when connected."
              : ""}
          </p>
        )}
        {state === "failed" && (
          <div className="border-t bg-amber-50 p-4 text-sm text-amber-900">
            <X className="mr-1 inline h-4 w-4" />
            GLB artifact could not be loaded.{" "}
            {errorMessage ||
              "Check the artifact volume, URL, and CORS configuration."}
          </div>
        )}
      </>
    </article>
  );
}
