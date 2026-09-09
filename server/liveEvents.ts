export type LiveDetectionEvent = {
  type: "frame.received" | "detection.completed" | "detection.failed";
  missionId: number;
  evidenceId?: number;
  frameId?: string;
  imageUrl?: string;
  fileName?: string;
  latitude?: number;
  longitude?: number;
  detections?: Array<{
    defectId?: number;
    label?: string;
    confidence?: number;
    severity?: string;
    boundingBox?: unknown;
  }>;
  error?: string;
  occurredAt: string;
};

type Subscriber = (event: LiveDetectionEvent) => void;
const subscribers = new Map<number, Set<Subscriber>>();

export function subscribeLiveMission(missionId: number, subscriber: Subscriber) {
  const current = subscribers.get(missionId) ?? new Set<Subscriber>();
  current.add(subscriber);
  subscribers.set(missionId, current);
  return () => {
    current.delete(subscriber);
    if (!current.size) subscribers.delete(missionId);
  };
}

export function publishLiveMissionEvent(event: LiveDetectionEvent) {
  const missionSubscribers = subscribers.get(event.missionId);
  if (!missionSubscribers) return;
  missionSubscribers.forEach(subscriber => {
    try {
      subscriber(event);
    } catch {
      // A disconnected browser must not affect ingestion.
    }
  });
}
