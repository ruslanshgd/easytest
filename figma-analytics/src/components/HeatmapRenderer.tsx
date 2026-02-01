import { useEffect, useRef } from "react";

interface HeatmapRendererProps {
  data: Array<{ x: number; y: number; count: number }>;
  width: number;
  height: number;
  imageUrl?: string;
  max?: number;
}

// Остановки градиента: синий -> голубой -> зеленый -> желтый -> оранжевый -> красный (как на референсе)
const HEAT_STOPS: Array<{ t: number; r: number; g: number; b: number }> = [
  { t: 0,    r: 0,   g: 0,   b: 255 }, // синий
  { t: 0.15, r: 0,   g: 255, b: 255 }, // голубой
  { t: 0.35, r: 0,   g: 255, b: 100 }, // зеленый
  { t: 0.55, r: 255, g: 255, b: 0 },   // желтый
  { t: 0.75, r: 255, g: 165, b: 0 },   // оранжевый
  { t: 1,    r: 255, g: 0,   b: 0 },   // красный
];

function heatToRgba(t: number): { r: number; g: number; b: number; a: number } {
  const clamped = Math.max(0, Math.min(1, t));
  let i = 0;
  for (; i < HEAT_STOPS.length - 1 && HEAT_STOPS[i + 1].t <= clamped; i++) {}
  const a = HEAT_STOPS[i];
  const b = HEAT_STOPS[Math.min(i + 1, HEAT_STOPS.length - 1)];
  const local = b.t > a.t ? (clamped - a.t) / (b.t - a.t) : 1;
  const r = Math.round(a.r + (b.r - a.r) * local);
  const g = Math.round(a.g + (b.g - a.g) * local);
  const bl = Math.round(a.b + (b.b - a.b) * local);
  const alpha = 0.25 + 0.7 * clamped; // холодные — полупрозрачные, горячие — ярче
  return { r, g, b: bl, a: alpha };
}

// Тепловая карта: сначала накапливаем «тепло» по экрану, затем красим по градиенту
function renderHeatmap(
  canvas: HTMLCanvasElement,
  data: Array<{ x: number; y: number; count: number }>,
  width: number,
  height: number
) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  ctx.clearRect(0, 0, width, height);
  if (data.length === 0) return;

  const radius = 48;
  const sigma = radius / 2.5;
  const heat = new Float32Array(width * height);

  // Накопление: каждая точка добавляет гауссово пятно с весом count
  for (const point of data) {
    const cx = Math.round(point.x);
    const cy = Math.round(point.y);
    const count = point.count;
    for (let dy = -radius; dy <= radius; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        const distSq = dx * dx + dy * dy;
        if (distSq > radius * radius) continue;
        const x = cx + dx;
        const y = cy + dy;
        if (x < 0 || x >= width || y < 0 || y >= height) continue;
        const w = count * Math.exp(-distSq / (2 * sigma * sigma));
        heat[y * width + x] += w;
      }
    }
  }

  let maxHeat = 0;
  for (let i = 0; i < heat.length; i++) {
    if (heat[i] > maxHeat) maxHeat = heat[i];
  }
  if (maxHeat <= 0) return;

  const imageData = ctx.createImageData(width, height);
  const out = imageData.data;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const t = heat[y * width + x] / maxHeat;
      const { r, g, b, a } = heatToRgba(t);
      const idx = (y * width + x) * 4;
      out[idx] = r;
      out[idx + 1] = g;
      out[idx + 2] = b;
      out[idx + 3] = Math.round(a * 255);
    }
  }

  ctx.putImageData(imageData, 0, 0);
}

export function HeatmapRenderer({
  data,
  width,
  height,
  imageUrl,
  max,
}: HeatmapRendererProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const imageRef = useRef<HTMLImageElement>(null);

  useEffect(() => {
    if (!containerRef.current || !wrapperRef.current) return;

    // Ждем загрузки изображения для получения реальных размеров
    const updateHeatmap = () => {
      if (!containerRef.current || !wrapperRef.current) return;

      const container = containerRef.current;
      const wrapper = wrapperRef.current;
      
      // Получаем реальные размеры контейнера (после масштабирования изображения)
      const containerWidth = wrapper.offsetWidth;
      const containerHeight = imageRef.current 
        ? (imageRef.current.offsetHeight || containerWidth * (height / width))
        : containerWidth * (height / width);

      // Создаем canvas элемент вручную, если его еще нет
      if (!canvasRef.current) {
        canvasRef.current = document.createElement('canvas');
        canvasRef.current.width = containerWidth;
        canvasRef.current.height = containerHeight;
        canvasRef.current.style.width = `${containerWidth}px`;
        canvasRef.current.style.height = `${containerHeight}px`;
        canvasRef.current.style.position = 'absolute';
        canvasRef.current.style.top = '0';
        canvasRef.current.style.left = '0';
        canvasRef.current.style.pointerEvents = 'none';
        container.appendChild(canvasRef.current);
      } else {
        // Обновляем размеры существующего canvas
        canvasRef.current.width = containerWidth;
        canvasRef.current.height = containerHeight;
        canvasRef.current.style.width = `${containerWidth}px`;
        canvasRef.current.style.height = `${containerHeight}px`;
      }

      // Вычисляем масштаб для преобразования координат
      const scaleX = containerWidth / width;
      const scaleY = containerHeight / height;

      // Преобразуем данные с учетом масштаба
      const scaledData = data.map((point) => ({
        x: Math.round(point.x * scaleX),
        y: Math.round(point.y * scaleY),
        count: point.count,
      }));

      // Рендерим тепловую карту (нормализация по накопленному теплу внутри)
      if (canvasRef.current) {
        renderHeatmap(canvasRef.current, scaledData, containerWidth, containerHeight);
      }
    };

    // Обновляем при загрузке изображения
    if (imageRef.current) {
      if (imageRef.current.complete) {
        updateHeatmap();
      } else {
        imageRef.current.onload = updateHeatmap;
      }
    } else {
      updateHeatmap();
    }

    // Обновляем при изменении размеров окна
    const handleResize = () => {
      setTimeout(updateHeatmap, 100);
    };
    window.addEventListener('resize', handleResize);

    // Cleanup при размонтировании
    return () => {
      window.removeEventListener('resize', handleResize);
      if (canvasRef.current && canvasRef.current.parentNode) {
        canvasRef.current.parentNode.removeChild(canvasRef.current);
        canvasRef.current = null;
      }
    };
  }, [data, width, height, max, imageUrl]);

  return (
    <div ref={wrapperRef} className="relative w-full h-full min-h-0" style={{ position: 'relative' }}>
      {imageUrl && (
        <img
          ref={imageRef}
          src={imageUrl}
          alt=""
          className="w-full h-full object-contain block"
          style={{ display: 'block' }}
        />
      )}
      <div
        ref={containerRef}
        className="absolute top-0 left-0 w-full h-full"
        style={{ 
          pointerEvents: 'none'
        }}
      />
    </div>
  );
}
