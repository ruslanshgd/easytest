export interface MediaRecordingController {
  start: () => void;
  stop: () => Promise<Blob | null>;
  isRecording: () => boolean;
}

interface CreateMediaRecordingOptions {
  streams: MediaStream[];
}

export function createMediaRecordingController(
  options: CreateMediaRecordingOptions
): MediaRecordingController {
  const combinedStream = new MediaStream();
  for (const stream of options.streams) {
    for (const track of stream.getTracks()) {
      combinedStream.addTrack(track);
    }
  }

  let recorder: MediaRecorder | null = null;
  let chunks: BlobPart[] = [];
  let recording = false;

  const start = () => {
    if (recording || combinedStream.getTracks().length === 0) return;
    // Не запускать запись, если все треки уже остановлены (например после завершения теста)
    const hasLiveTrack = combinedStream.getTracks().some((t) => t.readyState === "live");
    if (!hasLiveTrack) return;
    try {
      recorder = new MediaRecorder(combinedStream, {
        mimeType: "video/webm;codecs=vp9,opus",
      });
    } catch {
      recorder = new MediaRecorder(combinedStream);
    }

    chunks = [];
    recorder.ondataavailable = (event) => {
      if (event.data && event.data.size > 0) {
        chunks.push(event.data);
      }
    };
    try {
      // timeslice 1s — периодический сброс данных, чтобы длинные записи (60+ с) не терялись
      recorder.start(1000);
      recording = true;
    } catch (err) {
      console.warn("MediaRecorder.start() failed (stream may be ended):", err instanceof Error ? err.message : err);
    }
  };

  const stop = async (): Promise<Blob | null> => {
    if (!recorder || !recording) return null;

    return new Promise<Blob | null>((resolve) => {
      recorder!.onstop = () => {
        recording = false;
        const blob = chunks.length > 0 ? new Blob(chunks, { type: "video/webm" }) : null;
        chunks = [];
        resolve(blob);
      };
      recorder!.stop();
    });
  };

  const isRecording = () => recording;

  return { start, stop, isRecording };
}

