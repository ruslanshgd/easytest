import { useEffect, useRef } from "react";

interface HeatmapRendererProps {
  data: Array<{ x: number; y: number; count: number }>;
  width: number;
  height: number;
  imageUrl?: string;
  max?: number;
}

// Простая реализация тепловой карты без использования проблемной библиотеки
function renderHeatmap(
  canvas: HTMLCanvasElement,
  data: Array<{ x: number; y: number; count: number }>,
  width: number,
  height: number,
  maxValue: number
) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  // Очищаем canvas
  ctx.clearRect(0, 0, width, height);

  // Создаем изображение для наложения
  const heatmapImage = ctx.createImageData(width, height);
  const heatmapData = heatmapImage.data;

  // Радиус размытия
  const radius = 50;
  const blur = 0.75;

  // Обрабатываем каждую точку данных
  data.forEach((point) => {
    const intensity = point.count / maxValue;
    const alpha = Math.min(0.8, 0.1 + intensity * 0.7);

    // Рисуем радиальный градиент вокруг точки
    for (let dy = -radius; dy <= radius; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        const distance = Math.sqrt(dx * dx + dy * dy);
        if (distance > radius) continue;

        const x = Math.round(point.x + dx);
        const y = Math.round(point.y + dy);

        if (x < 0 || x >= width || y < 0 || y >= height) continue;

        // Вычисляем интенсивность с учетом расстояния и размытия
        const falloff = Math.exp(-(distance * distance) / (2 * radius * radius * blur * blur));
        const finalAlpha = alpha * falloff;

        const idx = (y * width + x) * 4;
        
        // Цветовая схема: синий -> голубой -> зеленый -> желтый -> красный
        let r = 0, g = 0, b = 0;
        if (intensity < 0.4) {
          // Синий
          b = 255;
        } else if (intensity < 0.6) {
          // Голубой
          g = Math.round(255 * (intensity - 0.4) / 0.2);
          b = 255;
        } else if (intensity < 0.7) {
          // Зеленый
          g = 255;
          b = Math.round(255 * (1 - (intensity - 0.6) / 0.1));
        } else if (intensity < 0.8) {
          // Желтый
          r = 255;
          g = 255;
        } else {
          // Красный
          r = 255;
          g = Math.round(255 * (1 - (intensity - 0.8) / 0.2));
        }

        // Накладываем цвет с учетом прозрачности
        const currentAlpha = heatmapData[idx + 3] / 255;
        const newAlpha = Math.min(1, currentAlpha + finalAlpha);
        
        heatmapData[idx] = Math.round((heatmapData[idx] * currentAlpha + r * finalAlpha) / newAlpha);
        heatmapData[idx + 1] = Math.round((heatmapData[idx + 1] * currentAlpha + g * finalAlpha) / newAlpha);
        heatmapData[idx + 2] = Math.round((heatmapData[idx + 2] * currentAlpha + b * finalAlpha) / newAlpha);
        heatmapData[idx + 3] = Math.round(newAlpha * 255);
      }
    }
  });

  // Применяем изображение к canvas
  ctx.putImageData(heatmapImage, 0, 0);
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

      // Вычисляем максимальное значение для нормализации
      const maxValue = max || Math.max(...data.map((d) => d.count), 1);

      // Рендерим тепловую карту
      if (canvasRef.current) {
        renderHeatmap(canvasRef.current, scaledData, containerWidth, containerHeight, maxValue);
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
    <div ref={wrapperRef} className="relative w-full" style={{ position: 'relative' }}>
      {imageUrl && (
        <img
          ref={imageRef}
          src={imageUrl}
          alt=""
          className="w-full h-auto"
          style={{ display: 'block' }}
        />
      )}
      <div
        ref={containerRef}
        className="absolute top-0 left-0"
        style={{ 
          pointerEvents: 'none'
        }}
      />
    </div>
  );
}
