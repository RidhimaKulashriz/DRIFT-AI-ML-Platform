import { useEffect, useMemo, useRef, useState } from "react";
import {
  Boxes,
  CheckCircle2,
  FileVideo,
  Gauge,
  MapPinned,
  Play,
  Ruler,
  Satellite,
  UploadCloud,
} from "lucide-react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import ReconstructionViewer from "@/components/ReconstructionViewer";

type SensorKey = "hasImu" | "hasRtk" | "hasBarometer" | "hasIntrinsics";
const stageNames = [
  "ingest",
  "metadata_validation",
  "frame_sampling",
  "visual_odometry",
  "sparse_cloud",
  "dense_cloud",
  "mesh_texturing",
  "semantic_layers",
  "georeference",
  "quality_gate",
  "publish_artifacts",
];
const coverage = [
  ["Visible surfaces", "Only geometry supported by the supplied frames"],
  ["Camera path", "Recovered from visual odometry when available"],
  ["Surface texture", "Derived from source frames, not a decorative scene"],
  ["Spatial entities", "Published only when tied to frame/depth evidence"],
  ["Measurements", "Ray intersections against the published mesh"],
  ["Uncertainty", "Occlusion, coverage, and accuracy remain explicit"],
];

export default function ReconstructionWorkspace() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState("");
  const [filePreviewUrl, setFilePreviewUrl] = useState("");
  const [name, setName] = useState("Video-derived place reconstruction");
  const [lat, setLat] = useState("28.6139");
  const [lng, setLng] = useState("77.2090");
  const [altitude, setAltitude] = useState("80");
  const [duration, setDuration] = useState("27.5");
  const [sourceUrl, setSourceUrl] = useState("");
  const [cameraModel, setCameraModel] = useState("");
  const [flightMetadata, setFlightMetadata] = useState("");
  const [resolution, setResolution] = useState<"1080p" | "4k">("1080p");
  const [sensors, setSensors] = useState<Record<SensorKey, boolean>>({
    hasImu: false,
    hasRtk: false,
    hasBarometer: false,
    hasIntrinsics: false,
  });
  const [lastJob, setLastJob] = useState<any>(null);
  const [selectedJob, setSelectedJob] = useState<any>(null);
  const jobs = trpc.drift.reconstruction.list.useQuery(undefined, {
    refetchInterval: 10000,
    retry: false,
  });
  const uploadSource = trpc.drift.reconstruction.uploadSource.useMutation();
  const create = trpc.drift.reconstruction.create.useMutation({
    onSuccess: data => {
      setLastJob(data);
      jobs.refetch();
      toast.success("Source video accepted; reconstruction queued");
    },
    onError: error => toast.error(error.message),
  });
  const input = useMemo(
    () => ({
      fileName: file?.name ?? "source-video.mp4",
      mimeType: file?.type || "video/mp4",
      sizeBytes: file?.size || 1,
      sourceUrl: sourceUrl.trim(),
      latitude: Number(lat),
      longitude: Number(lng),
      altitudeMeters: Number(altitude),
      cameraModel: cameraModel.trim() || undefined,
      flightMetadata: flightMetadata.trim() || undefined,
      durationSeconds: Number(duration),
      resolution,
      ...sensors,
    }),
    [
      file,
      sourceUrl,
      lat,
      lng,
      altitude,
      duration,
      resolution,
      sensors,
      cameraModel,
      flightMetadata,
    ]
  );
  const quality = useMemo(() => {
    const completeness = Object.values(sensors).filter(Boolean).length / 4;
    const score = Math.round(
      (completeness * 0.4 +
        (resolution === "4k" ? 1 : 0.72) * 0.35 +
        (Number(duration) >= 30 ? 1 : 0.65) * 0.25) *
        100
    );
    return {
      score,
      grade: score >= 85 ? "A" : score >= 70 ? "B" : score >= 55 ? "C" : "D",
    };
  }, [sensors, resolution, duration]);
  const isRealSourceUrl = (() => {
    try {
      const url = new URL(sourceUrl.trim());
      return (
        url.protocol === "https:" &&
        !["example.com", "www.example.com", "storage.example.com"].includes(
          url.hostname
        )
      );
    } catch {
      return false;
    }
  })();
  const submit = async () => {
    if (!file && !isRealSourceUrl) {
      toast.error(
        "Choose the original video or provide its real HTTPS source URL."
      );
      return;
    }
    try {
      let uploaded = {
        fileName: input.fileName,
        mimeType: input.mimeType,
        sizeBytes: input.sizeBytes,
        sourceUrl: sourceUrl.trim(),
      };
      if (file) {
        const bytes = new Uint8Array(await file.arrayBuffer());
        let binary = "";
        for (let i = 0; i < bytes.length; i += 0x8000)
          binary += String.fromCharCode(
            ...Array.from(bytes.subarray(i, Math.min(i + 0x8000, bytes.length)))
          );
        uploaded = await uploadSource.mutateAsync({
          fileName: file.name,
          mimeType: file.type || "video/mp4",
          base64: btoa(binary),
        });
      }
      create.mutate({
        name,
        ...input,
        fileName: uploaded.fileName,
        mimeType: uploaded.mimeType,
        sizeBytes: uploaded.sizeBytes,
        sourceUrl: uploaded.sourceUrl,
      });
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Video upload failed"
      );
    }
  };
  const stages =
    lastJob?.stages ??
    stageNames.map((stage, i) => ({
      stage,
      order: i + 1,
      status: i === 0 ? "queued" : "pending",
    }));
  const selectedArtifact =
    selectedJob?.artifactManifest?.artifacts?.find(
      (artifact: any) =>
        artifact.format === "glb" && artifact.status === "ready"
    )?.url ?? null;
  useEffect(() => {
    if (!file) {
      setFilePreviewUrl("");
      return;
    }
    const url = URL.createObjectURL(file);
    setFilePreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);
  const selectVideo = (candidate: File | undefined) => {
    if (!candidate) return;
    if (!candidate.type.startsWith("video/")) {
      setFile(null);
      setFileError("Please choose a video file (MP4, MOV, AVI, or WebM).");
      return;
    }
    if (candidate.size > 250 * 1024 * 1024) {
      setFile(null);
      setFileError(
        "This browser upload is larger than 250 MB. Use a secure HTTPS source URL for larger captures."
      );
      return;
    }
    setFileError("");
    setFile(candidate);
    setSourceUrl("");
    setResolution(candidate.name.toLowerCase().includes("4k") ? "4k" : "1080p");
  };

  return (
    <section className="workspace-page reconstruction-live-workspace">
      <div className="workspace-header reconstruction-hero-header">
        <div>
          <span className="eyebrow">VIDEO → DIGITAL PLACE</span>
          <h2>Reconstruct the place that was actually filmed</h2>
          <p className="workspace-lede">
            The uploaded video is the source of the world. DRIFT will publish
            only worker-produced reconstruction artifacts; no generic terrain,
            buildings, detections, or locations are inserted when evidence is
            missing.
          </p>
        </div>
        <div className="reconstruction-quality-card">
          <span className="eyebrow">INPUT QUALITY SIGNAL</span>
          <div>
            {quality.score}
            <span> / 100 · {quality.grade}</span>
          </div>
          <p>
            {Object.values(sensors).filter(Boolean).length
              ? "Metadata supplied"
              : "Video-only; uncertainty will remain visible"}
          </p>
        </div>
      </div>
      <article className="live-model-hero">
        <div className="live-model-heading">
          <div>
            <span className="eyebrow">SOURCE-DRIVEN RECONSTRUCTION</span>
            <h2>{file ? file.name : "REAL VIDEO → 3D WORLD"}</h2>
            <p>
              {lastJob
                ? `Job ${lastJob.jobKey} is queued for the persistent reconstruction worker.`
                : "The video is input data only. DRIFT will use it to produce a published reconstruction; the player enters the 3D world after the GLB passes the quality gate."}
            </p>
          </div>
          <div className="live-model-actions">
            <span>
              {selectedJob?.status?.toUpperCase() ?? "SOURCE WAITING"}
            </span>
            <button type="button" onClick={() => inputRef.current?.click()}>
              SELECT VIDEO
            </button>
          </div>
        </div>
        <div className="live-model-grid">
          <div className="live-source-preview">
            <div className="live-source-empty">
              <FileVideo />
              <b>{file ? "SOURCE VIDEO READY" : "SOURCE VIDEO REQUIRED"}</b>
              <span>
                {file
                  ? `${file.name} · attached as reconstruction provenance`
                  : "Choose the real capture that should drive frame extraction and 3D reconstruction."}
              </span>
              <small>
                Video is processed as input; it is not the final experience.
              </small>
            </div>
            <div className="preview-stats">
              <span>
                INPUT
                <strong>
                  {file ? `${(file.size / 1024 / 1024).toFixed(1)} MB` : "—"}
                </strong>
              </span>
              <span>
                RESOLUTION<strong>{resolution.toUpperCase()}</strong>
              </span>
              <span>
                DURATION<strong>{duration}s</strong>
              </span>
              <span>
                WORLD
                <strong>{selectedArtifact ? "PUBLISHED" : "WAITING"}</strong>
              </span>
            </div>
          </div>
          <div className="live-model-output">
            <div className="output-topline">
              ● WORLD OUTPUT{" "}
              <b>
                {selectedArtifact ? "PUBLISHED GLB" : "NO SUBSTITUTE WORLD"}
              </b>
            </div>
            <div className="model-canvas">
              <span>
                {selectedArtifact
                  ? "THE PUBLISHED RECONSTRUCTION IS THE WORLD"
                  : "SOURCE AVAILABLE · RECONSTRUCTION NOT YET PUBLISHED"}
              </span>
              <strong>
                {selectedArtifact
                  ? "Enter Explorer below"
                  : "Waiting for worker artifact"}
              </strong>
              <div className="model-map model-map-honest">
                <div className="map-grid" />
                <div className="map-compass">N</div>
              </div>
              <div>
                {selectedArtifact
                  ? "REAL ARTIFACT · READY FOR EXPLORATION"
                  : "NO FAKE BUILDINGS, DETECTIONS, OR TERRAIN ARE SHOWN"}
              </div>
            </div>
          </div>
        </div>
      </article>
      <div className="grid gap-5 xl:grid-cols-[1.1fr_.9fr]">
        <article className="panel p-5">
          <div className="panel-heading">
            <div>
              <span className="eyebrow">01 · AUTHORITATIVE SOURCE</span>
              <h3>Give DRIFT the real video</h3>
            </div>
            <FileVideo className="text-cyan-600" />
          </div>
          <p className="mb-4 text-sm text-slate-600">
            Local uploads are stored as the immutable source capture. For larger
            files, provide a secure HTTPS object URL. The source remains
            attached to every published artifact and detection.
          </p>
          <div className="space-y-4">
            <label>
              Mission name
              <input id="reconstructionworkspace-field-1" name="reconstructionworkspace-field-1" value={name} onChange={e => setName(e.target.value)} />
            </label>
            <button
              type="button"
              className={`video-upload-dropzone ${file ? "selected" : ""}`}
              onClick={() => inputRef.current?.click()}
            >
              <UploadCloud />
              {file ? (
                <span>
                  <b>SOURCE SELECTED</b>
                  {file.name} · {(file.size / 1024 / 1024).toFixed(1)} MB
                </span>
              ) : (
                <span>
                  <b>SELECT ORIGINAL VIDEO</b>MP4 / MOV / AVI / WebM · up to 250
                  MB
                </span>
              )}
            </button>
            <input id="reconstructionworkspace-field-2" name="reconstructionworkspace-field-2"
              ref={inputRef}
              hidden
              type="file"
              accept="video/*,.mp4,.mov,.avi,.webm"
              onChange={e => selectVideo(e.target.files?.[0])}
            />
            {fileError && <p className="upload-error">{fileError}</p>}
            {filePreviewUrl && (
              <div className="selected-video-preview">
                <video
                  src={filePreviewUrl}
                  controls
                  muted
                  playsInline
                  preload="metadata"
                />
                <div>
                  <b>Source preview</b>
                  <span>{file?.name}</span>
                  <small>
                    This exact capture will drive frame sampling,
                    reconstruction, and evidence provenance.
                  </small>
                </div>
              </div>
            )}
            <label>
              Secure HTTPS source URL (alternative to local upload)
              <input id="reconstructionworkspace-field-3" name="reconstructionworkspace-field-3"
                value={sourceUrl}
                onChange={e => setSourceUrl(e.target.value)}
                placeholder="https://storage.example.org/capture.mp4"
              />
            </label>
            <div className="grid grid-cols-2 gap-3">
              <label>
                Latitude
                <input id="reconstructionworkspace-field-4" name="reconstructionworkspace-field-4" value={lat} onChange={e => setLat(e.target.value)} />
              </label>
              <label>
                Longitude
                <input id="reconstructionworkspace-field-5" name="reconstructionworkspace-field-5" value={lng} onChange={e => setLng(e.target.value)} />
              </label>
              <label>
                Altitude (m)
                <input id="reconstructionworkspace-field-6" name="reconstructionworkspace-field-6"
                  value={altitude}
                  onChange={e => setAltitude(e.target.value)}
                />
              </label>
              <label>
                Duration (sec)
                <input id="reconstructionworkspace-field-7" name="reconstructionworkspace-field-7"
                  value={duration}
                  onChange={e => setDuration(e.target.value)}
                />
              </label>
            </div>
            <label>
              Capture metadata
              <textarea id="reconstructionworkspace-field-8" name="reconstructionworkspace-field-8"
                value={flightMetadata}
                onChange={e => setFlightMetadata(e.target.value)}
                rows={2}
                placeholder="Optional: camera path, GPS/IMU export, or capture notes"
              />
            </label>
            <div className="grid grid-cols-2 gap-3">
              <label>
                Camera model
                <input id="reconstructionworkspace-field-9" name="reconstructionworkspace-field-9"
                  value={cameraModel}
                  onChange={e => setCameraModel(e.target.value)}
                  placeholder="Optional"
                />
              </label>
              <label>
                Resolution
                <select id="reconstructionworkspace-field-10" name="reconstructionworkspace-field-10"
                  value={resolution}
                  onChange={e =>
                    setResolution(e.target.value as "1080p" | "4k")
                  }
                >
                  <option value="1080p">1080p</option>
                  <option value="4k">4K</option>
                </select>
              </label>
            </div>
            <div className="grid grid-cols-2 gap-2 text-sm">
              {(
                [
                  ["hasImu", "IMU / trajectory"],
                  ["hasRtk", "RTK / PPK"],
                  ["hasBarometer", "Barometric altitude"],
                  ["hasIntrinsics", "Camera intrinsics"],
                ] as const
              ).map(([key, label]) => (
                <label
                  key={key}
                  className="flex flex-row items-center gap-2 rounded-lg border bg-slate-50 p-3"
                >
                  <input id={`reconstructionworkspace-sensor-${key}`} name={`sensor-${key}`}
                    type="checkbox"
                    checked={sensors[key]}
                    onChange={e =>
                      setSensors(s => ({ ...s, [key]: e.target.checked }))
                    }
                  />
                  {label}
                </label>
              ))}
            </div>
            <button
              type="button"
              className="primary-action w-full"
              disabled={
                create.isPending ||
                uploadSource.isPending ||
                (!file && !isRealSourceUrl)
              }
              onClick={submit}
            >
              <Play />
              {uploadSource.isPending
                ? "UPLOADING SOURCE"
                : create.isPending
                  ? "QUEUING RECONSTRUCTION"
                  : "START RECONSTRUCTION"}
            </button>
          </div>
        </article>
        <article className="panel p-5">
          <div className="panel-heading">
            <div>
              <span className="eyebrow">02 · EVIDENCE BOUNDARIES</span>
              <h3>What can be claimed</h3>
            </div>
            <Satellite className="text-emerald-600" />
          </div>
          <div className="grid grid-cols-2 gap-2">
            {coverage.map(([title, detail]) => (
              <div
                key={title}
                className="rounded-lg border bg-emerald-50/60 p-3"
              >
                <b className="text-sm text-emerald-950">{title}</b>
                <p className="mt-1 text-xs text-slate-600">{detail}</p>
              </div>
            ))}
          </div>
          <div className="mt-5 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
            <b>Honest reconstruction policy</b>
            <p className="mt-2 text-xs leading-5">
              Occluded and unseen surfaces stay incomplete. Dynamic objects are
              not silently baked into permanent geometry. A 2D detection is not
              promoted to a 3D world entity unless frame, pose, depth, and mesh
              association are available; otherwise it is labelled approximate or
              withheld.
            </p>
          </div>
          <div className="mt-5 grid grid-cols-3 gap-2 text-center text-xs">
            <div className="rounded-lg bg-slate-100 p-3">
              <Ruler className="mx-auto mb-1 h-4 w-4" />
              <b>Measure</b>
              <p>Mesh intersections</p>
            </div>
            <div className="rounded-lg bg-slate-100 p-3">
              <Gauge className="mx-auto mb-1 h-4 w-4" />
              <b>Validate</b>
              <p>RMSE / checkpoints</p>
            </div>
            <div className="rounded-lg bg-slate-100 p-3">
              <MapPinned className="mx-auto mb-1 h-4 w-4" />
              <b>Provenance</b>
              <p>Frame evidence</p>
            </div>
          </div>
        </article>
      </div>
      <article className="panel mt-5 p-5">
        <div className="panel-heading">
          <div>
            <span className="eyebrow">03 · RECONSTRUCTION GRAPH</span>
            <h3>Source frames to published world</h3>
          </div>
          <Boxes className="text-violet-600" />
        </div>
        <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
          {stages.map((stage: any, i: number) => (
            <div
              key={stage.stage ?? stage}
              className="flex items-center gap-3 rounded-lg border bg-white p-3"
            >
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-slate-900 text-xs text-white">
                {i + 1}
              </span>
              <span className="font-medium text-sm">
                {stage.stage ?? stage}
              </span>
              <span className="ml-auto text-xs uppercase text-slate-400">
                {stage.status ?? "pending"}
              </span>
            </div>
          ))}
        </div>
        <p className="mt-4 text-xs text-slate-500">
          Only a checksummed worker artifact becomes the digital world. Before
          that point, the viewer intentionally shows no substitute scene.
        </p>
      </article>
      <article className="panel mt-5 p-5">
        <div className="panel-heading">
          <div>
            <span className="eyebrow">04 · JOB LEDGER</span>
            <h3>Traceable source-to-world runs</h3>
          </div>
          <MapPinned className="text-slate-500" />
        </div>
        {lastJob && (
          <div className="mb-4 rounded-lg border border-cyan-200 bg-cyan-50 p-4">
            <CheckCircle2 className="mr-2 inline text-cyan-700" />
            Queued <b>{lastJob.name}</b> · {lastJob.jobKey} · waiting for the
            persistent reconstruction worker.
          </div>
        )}
        <div className="space-y-2">
          {jobs.data?.length ? (
            jobs.data.map((job: any) => (
              <button
                type="button"
                key={job.jobKey}
                onClick={() => setSelectedJob(job)}
                className={`grid w-full grid-cols-[1fr_auto_auto] items-center gap-3 rounded-lg border p-3 text-left ${selectedJob?.jobKey === job.jobKey ? "border-cyan-500 bg-cyan-50" : "bg-white"}`}
              >
                <div>
                  <b>{job.name}</b>
                  <p className="text-xs text-slate-500">
                    {job.inputFileName} · {job.latitude}, {job.longitude}
                  </p>
                </div>
                <span className="text-sm font-semibold">
                  {job.qualityReport?.score ?? "—"}/100
                </span>
                <span className="rounded-full bg-slate-100 px-3 py-1 text-xs uppercase">
                  {job.status}
                </span>
              </button>
            ))
          ) : (
            <p className="text-sm text-slate-500">
              No reconstruction runs yet. Submit the original capture to create
              the first traceable job.
            </p>
          )}
        </div>
      </article>
      <div className="mt-5">
        <ReconstructionViewer
          artifactUrl={selectedArtifact}
          sourceVideoUrl={selectedJob?.inputMetadata?.sourceUrl ?? null}
          jobKey={selectedJob?.jobKey ?? null}
          artifacts={selectedJob?.artifactManifest?.artifacts ?? []}
          quality={
            selectedJob?.artifactManifest?.quality ??
            selectedJob?.qualityReport ??
            null
          }
        />
      </div>
    </section>
  );
}
