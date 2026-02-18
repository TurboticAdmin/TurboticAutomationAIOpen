"use client";
import React, { useState, useRef, useEffect } from 'react';
import { Modal, Button, Slider } from 'antd';
import { ZoomInOutlined, ZoomOutOutlined } from '@ant-design/icons';

interface AvatarCropModalProps {
  visible: boolean;
  imageSrc: string;
  onCancel: () => void;
  onSave: (croppedDataUrl: string) => void;
}

export const AvatarCropModal: React.FC<AvatarCropModalProps> = ({
  visible,
  imageSrc,
  onCancel,
  onSave,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const [containerSize, setContainerSize] = useState({ width: 400, height: 400 });
  const previewCanvasRef = useRef<HTMLCanvasElement>(null);

  const CROP_SIZE = 200; // Final avatar size

  useEffect(() => {
    if (imageSrc) {
      const img = new Image();
      
      // Security: For data URLs, crossOrigin is not needed (they're same-origin)
      // For external URLs, this would prevent CORS issues, but we only use data URLs here
      
      img.onload = () => {
        // Security: Check image dimensions to prevent memory exhaustion
        const maxDimension = 10000; // 10k pixels max
        if (img.width > maxDimension || img.height > maxDimension) {
          console.error('Image dimensions too large');
          return;
        }
        
        // Security: Check memory usage (rough estimate: width * height * 4 bytes)
        const estimatedMemory = img.width * img.height * 4;
        const maxMemory = 100 * 1024 * 1024; // 100MB limit
        if (estimatedMemory > maxMemory) {
          console.error('Image too large, would consume too much memory');
          return;
        }
        
        setImage(img);
        // Center the image initially
        const initialScale = Math.min(containerSize.width / img.width, containerSize.height / img.height) * 0.8;
        setScale(initialScale);
        setPosition({
          x: (containerSize.width - img.width * initialScale) / 2,
          y: (containerSize.height - img.height * initialScale) / 2,
        });
      };
      
      img.onerror = () => {
        console.error('Failed to load image - may be invalid or corrupted');
      };
      
      img.src = imageSrc;
    }
  }, [imageSrc, containerSize]);

  useEffect(() => {
    if (containerRef.current) {
      const updateSize = () => {
        const rect = containerRef.current?.getBoundingClientRect();
        if (rect) {
          setContainerSize({ width: rect.width, height: rect.height });
        }
      };
      updateSize();
      window.addEventListener('resize', updateSize);
      return () => window.removeEventListener('resize', updateSize);
    }
  }, []);

  useEffect(() => {
    drawCanvas();
    drawPreview();
  }, [image, scale, position, containerSize]);

  const drawPreview = () => {
    const canvas = previewCanvasRef.current;
    if (!canvas || !image) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const previewSize = 120; // Preview size
    canvas.width = previewSize;
    canvas.height = previewSize;

    // Calculate the source rectangle from the circular crop area
    const centerX = containerSize.width / 2;
    const centerY = containerSize.height / 2;
    const radius = CROP_SIZE / 2;
    const cropX = centerX - radius;
    const cropY = centerY - radius;
    
    const sourceX = (cropX - position.x) / scale;
    const sourceY = (cropY - position.y) / scale;
    const sourceWidth = CROP_SIZE / scale;
    const sourceHeight = CROP_SIZE / scale;

    // Draw white background
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, previewSize, previewSize);

    // Draw the image
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(
      image,
      sourceX, sourceY, sourceWidth, sourceHeight,
      0, 0, previewSize, previewSize
    );

    // Create circular mask
    ctx.globalCompositeOperation = 'destination-in';
    ctx.beginPath();
    ctx.arc(previewSize / 2, previewSize / 2, previewSize / 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalCompositeOperation = 'source-over';

    // Draw border
    ctx.strokeStyle = '#d9d9d9';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(previewSize / 2, previewSize / 2, previewSize / 2 - 1, 0, Math.PI * 2);
    ctx.stroke();
  };

  const drawCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas || !image) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    canvas.width = containerSize.width;
    canvas.height = containerSize.height;

    // Draw checkerboard background
    const checkerSize = 20;
    ctx.fillStyle = '#f0f0f0';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#e0e0e0';
    for (let y = 0; y < canvas.height; y += checkerSize) {
      for (let x = 0; x < canvas.width; x += checkerSize) {
        if ((x / checkerSize + y / checkerSize) % 2 === 0) {
          ctx.fillRect(x, y, checkerSize, checkerSize);
        }
      }
    }

    // Draw dark overlay first
    ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    // Clear the circle area to show the image
    const centerX = canvas.width / 2;
    const centerY = canvas.height / 2;
    const radius = CROP_SIZE / 2;
    
    ctx.globalCompositeOperation = 'destination-out';
    ctx.beginPath();
    ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalCompositeOperation = 'source-over';

    // Draw the image inside the visible circle
    ctx.save();
    ctx.beginPath();
    ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
    ctx.clip();
    ctx.translate(position.x, position.y);
    ctx.scale(scale, scale);
    ctx.drawImage(image, 0, 0);
    ctx.restore();

    // Draw circular crop border
    ctx.strokeStyle = '#1890ff';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
    ctx.stroke();

    // Draw handle points on the circle (top, right, bottom, left)
    const handleSize = 10;
    ctx.fillStyle = '#1890ff';
    const handles = [
      [centerX, centerY - radius], // Top
      [centerX + radius, centerY], // Right
      [centerX, centerY + radius], // Bottom
      [centerX - radius, centerY], // Left
    ];
    handles.forEach(([x, y]) => {
      ctx.beginPath();
      ctx.arc(x, y, handleSize / 2, 0, Math.PI * 2);
      ctx.fill();
    });
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    if (!image) return;
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;

    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    // Check if clicking inside the circular crop area
    const centerX = containerSize.width / 2;
    const centerY = containerSize.height / 2;
    const radius = CROP_SIZE / 2;
    const distance = Math.sqrt((x - centerX) ** 2 + (y - centerY) ** 2);
    
    if (distance <= radius) {
      setIsDragging(true);
      setDragStart({ x: x - position.x, y: y - position.y });
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging || !image) return;
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;

    const x = e.clientX - rect.left - dragStart.x;
    const y = e.clientY - rect.top - dragStart.y;

    // Constrain position so image stays within reasonable bounds
    const maxX = containerSize.width - (image.width * scale * 0.1);
    const maxY = containerSize.height - (image.height * scale * 0.1);
    const minX = -(image.width * scale * 0.9);
    const minY = -(image.height * scale * 0.9);

    setPosition({
      x: Math.max(minX, Math.min(maxX, x)),
      y: Math.max(minY, Math.min(maxY, y)),
    });
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    if (!image) return;

    const delta = e.deltaY > 0 ? -0.1 : 0.1;
    const newScale = Math.max(0.1, Math.min(3, scale + delta));
    setScale(newScale);
  };

  const handleSave = () => {
    if (!image) return;

    try {
      const canvas = document.createElement('canvas');
      canvas.width = CROP_SIZE;
      canvas.height = CROP_SIZE;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        console.error('Failed to get canvas context');
        return;
      }

      // Calculate the source rectangle from the circular crop area
      const centerX = containerSize.width / 2;
      const centerY = containerSize.height / 2;
      const radius = CROP_SIZE / 2;
      const cropX = centerX - radius;
      const cropY = centerY - radius;
      
      // Calculate what part of the image is visible in the crop area
      let sourceX = (cropX - position.x) / scale;
      let sourceY = (cropY - position.y) / scale;
      let sourceWidth = CROP_SIZE / scale;
      let sourceHeight = CROP_SIZE / scale;

      // Security: Validate and clamp source coordinates to prevent out-of-bounds access
      if (
        isNaN(sourceX) || isNaN(sourceY) || isNaN(sourceWidth) || isNaN(sourceHeight) ||
        sourceWidth <= 0 || sourceHeight <= 0
      ) {
        console.error('Invalid crop coordinates: NaN or invalid dimensions');
        return;
      }

      // Clamp coordinates to image bounds (allow cropping from edges)
      sourceX = Math.max(0, Math.min(sourceX, image.width - 1));
      sourceY = Math.max(0, Math.min(sourceY, image.height - 1));
      
      // Adjust width/height if source extends beyond image bounds
      if (sourceX + sourceWidth > image.width) {
        sourceWidth = image.width - sourceX;
      }
      if (sourceY + sourceHeight > image.height) {
        sourceHeight = image.height - sourceY;
      }
      
      // Ensure we have valid dimensions
      if (sourceWidth <= 0 || sourceHeight <= 0) {
        console.error('Invalid crop dimensions after clamping');
        return;
      }

      // Draw the cropped image
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, CROP_SIZE, CROP_SIZE);
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      
      // Draw image first
      ctx.drawImage(
        image,
        sourceX, sourceY, sourceWidth, sourceHeight,
        0, 0, CROP_SIZE, CROP_SIZE
      );

      // Create circular mask
      ctx.globalCompositeOperation = 'destination-in';
      ctx.beginPath();
      ctx.arc(CROP_SIZE / 2, CROP_SIZE / 2, CROP_SIZE / 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalCompositeOperation = 'source-over';

      const dataUrl = canvas.toDataURL('image/png', 1.0); // Use PNG to preserve transparency
      
      // Security: Check final data URL size (base64 is ~33% larger)
      const estimatedSize = (dataUrl.length * 3) / 4;
      const maxSizeBytes = 5 * 1024 * 1024; // 5MB limit (matches API validation)
      if (estimatedSize > maxSizeBytes) {
        console.error('Cropped image exceeds size limit');
        return;
      }
      
      onSave(dataUrl);
    } catch (error) {
      console.error('Error creating cropped image:', error);
    }
  };

  return (
    <Modal
      title="Crop and Resize Avatar"
      open={visible}
      onCancel={onCancel}
      width={600}
      footer={[
        <Button key="cancel" onClick={onCancel}>
          Cancel
        </Button>,
        <Button key="save" type="primary" onClick={handleSave}>
          Save
        </Button>,
      ]}
    >
      <div style={{ padding: '20px 0' }}>
        <div
          ref={containerRef}
          style={{
            width: '100%',
            height: 400,
            position: 'relative',
            border: '1px solid #d9d9d9',
            borderRadius: 4,
            overflow: 'hidden',
            marginBottom: 20,
          }}
        >
          <canvas
            ref={canvasRef}
            style={{
              width: '100%',
              height: '100%',
              cursor: isDragging ? 'grabbing' : 'grab',
            }}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
            onWheel={handleWheel}
          />
        </div>

        <div style={{ padding: '0 20px' }}>
          <div style={{ display: 'flex', gap: 24, alignItems: 'flex-start' }}>
            <div style={{ flex: 1 }}>
              <div style={{ marginBottom: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
              <Button
                icon={<ZoomOutOutlined />}
                size="small"
                onClick={() => setScale(Math.max(0.1, scale - 0.1))}
                disabled={scale <= 0.1}
              />
              <Slider
                min={0.1}
                max={3}
                step={0.1}
                value={scale}
                onChange={setScale}
                style={{ flex: 1 }}
              />
              <Button
                icon={<ZoomInOutlined />}
                size="small"
                onClick={() => setScale(Math.min(3, scale + 0.1))}
                disabled={scale >= 3}
              />
            </div>
                <div style={{ textAlign: 'center', color: '#666', fontSize: 12 }}>
                  Drag to move • Use slider to zoom
                </div>
              </div>
            </div>
            
            <div style={{ 
              display: 'flex', 
              flexDirection: 'column', 
              alignItems: 'center',
              padding: '16px',
              border: '1px solid #d9d9d9',
              borderRadius: 8,
              backgroundColor: '#fafafa'
            }}>
              <div style={{ marginBottom: 8, color: '#666', fontSize: 12, fontWeight: 500 }}>
                Preview
              </div>
              <canvas
                ref={previewCanvasRef}
                style={{
                  width: 120,
                  height: 120,
                  borderRadius: '50%',
                  border: '2px solid #1890ff',
                  boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
                }}
              />
            </div>
          </div>
        </div>
      </div>
    </Modal>
  );
};

