import { useEffect, useRef, useState } from "react";

/**
 * Минимальная страница только с превью камеры и индикатором записи.
 * Открывается в отдельном окне, чтобы не попадать в getDisplayMedia (запись экрана).
 */
export default function CameraPreviewPopup() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let stream: MediaStream | null = null;
    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: true });
        const video = videoRef.current;
        if (video && stream) {
          video.srcObject = stream;
          await video.play();
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : "Нет доступа к камере");
      }
    })();
    return () => {
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  if (error) {
    return (
      <div style={{ padding: 16, background: "#1a1a1a", color: "#fff", fontSize: 12 }}>
        {error}
      </div>
    );
  }

  return (
    <div
      style={{
        width: 120,
        height: 120,
        borderRadius: 20,
        overflow: "hidden",
        position: "relative",
        background: "#000",
      }}
    >
      <div
        style={{
          position: "absolute",
          top: 8,
          right: 8,
          zIndex: 20,
          width: 10,
          height: 10,
          borderRadius: "50%",
          backgroundColor: "#ef4444",
          animation: "camera-preview-blink 1.2s ease-in-out infinite",
        }}
      />
      <video
        ref={videoRef}
        autoPlay
        muted
        playsInline
        style={{
          objectFit: "cover",
          width: "100%",
          height: "100%",
        }}
      />
    </div>
  );
}
