// Generate static vignette images using Canvas API for video compilation
// These are simplified versions of the React vignette components

import { useCallback, useRef } from 'react';
import { getEventLabelUpper } from '@/lib/eventLabels';

export interface VignetteConfig {
  width: number;
  height: number;
  format: '9:16' | '16:9' | '1:1' | '4:5';
}

export interface OpeningVignetteData {
  homeTeam: string;
  awayTeam: string;
  homeScore: number;
  awayScore: number;
  logoUrl?: string;
}

export interface ClipVignetteData {
  eventType: string;
  minute: number;
  title: string;
  thumbnailUrl?: string;
}

export interface TransitionVignetteData {
  nextMinute: number;
  nextEventType: string;
}

export interface ClosingVignetteData {
  clipCount: number;
  logoUrl?: string;
}

export function useVignetteGenerator() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const getCanvas = useCallback((width: number, height: number) => {
    if (!canvasRef.current) {
      canvasRef.current = document.createElement('canvas');
    }
    canvasRef.current.width = width;
    canvasRef.current.height = height;
    return canvasRef.current;
  }, []);

  // Draw gradient background
  const drawBackground = (ctx: CanvasRenderingContext2D, width: number, height: number) => {
    const gradient = ctx.createLinearGradient(0, 0, width, height);
    gradient.addColorStop(0, '#0f172a');
    gradient.addColorStop(0.5, '#10b981');
    gradient.addColorStop(1, '#0f172a');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);

    // Add subtle overlay
    ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
    ctx.fillRect(0, 0, width, height);

    // Add glow effect
    const glowGradient = ctx.createRadialGradient(width / 2, height / 2, 0, width / 2, height / 2, width / 2);
    glowGradient.addColorStop(0, 'rgba(16, 185, 129, 0.2)');
    glowGradient.addColorStop(1, 'transparent');
    ctx.fillStyle = glowGradient;
    ctx.fillRect(0, 0, width, height);
  };

  // Draw text with optional glow
  const drawText = (
    ctx: CanvasRenderingContext2D,
    text: string,
    x: number,
    y: number,
    options: {
      fontSize?: number;
      fontWeight?: string;
      color?: string;
      align?: CanvasTextAlign;
      glow?: boolean;
      maxWidth?: number;
    } = {}
  ) => {
    const {
      fontSize = 24,
      fontWeight = 'bold',
      color = '#ffffff',
      align = 'center',
      glow = false,
      maxWidth
    } = options;

    ctx.font = `${fontWeight} ${fontSize}px system-ui, -apple-system, sans-serif`;
    ctx.textAlign = align;
    ctx.textBaseline = 'middle';

    if (glow) {
      ctx.shadowColor = '#10b981';
      ctx.shadowBlur = 20;
    }

    ctx.fillStyle = color;
    if (maxWidth) {
      ctx.fillText(text, x, y, maxWidth);
    } else {
      ctx.fillText(text, x, y);
    }

    ctx.shadowBlur = 0;
  };

  // Generate opening vignette
  const generateOpeningVignette = useCallback(async (
    data: OpeningVignetteData,
    config: VignetteConfig
  ): Promise<Blob> => {
    const canvas = getCanvas(config.width, config.height);
    const ctx = canvas.getContext('2d')!;

    // Draw background
    drawBackground(ctx, config.width, config.height);

    const centerX = config.width / 2;
    const centerY = config.height / 2;
    const scale = config.width / 1080; // Base scale for responsive sizing

    // Draw "MELHORES MOMENTOS" badge
    const badgeY = centerY - 120 * scale;
    ctx.fillStyle = 'rgba(16, 185, 129, 0.3)';
    const badgeWidth = 300 * scale;
    const badgeHeight = 40 * scale;
    ctx.beginPath();
    ctx.roundRect(centerX - badgeWidth / 2, badgeY - badgeHeight / 2, badgeWidth, badgeHeight, 20);
    ctx.fill();
    
    ctx.strokeStyle = 'rgba(16, 185, 129, 0.8)';
    ctx.lineWidth = 2;
    ctx.stroke();

    drawText(ctx, 'MELHORES MOMENTOS', centerX, badgeY, {
      fontSize: 16 * scale,
      fontWeight: '600',
      color: '#10b981',
      glow: true
    });

    // Draw teams
    drawText(ctx, data.homeTeam, centerX, centerY - 30 * scale, {
      fontSize: 32 * scale,
      fontWeight: 'bold',
      maxWidth: config.width * 0.8
    });

    // Draw score with glow
    drawText(ctx, `${data.homeScore} - ${data.awayScore}`, centerX, centerY + 30 * scale, {
      fontSize: 64 * scale,
      fontWeight: 'bold',
      color: '#10b981',
      glow: true
    });

    drawText(ctx, data.awayTeam, centerX, centerY + 90 * scale, {
      fontSize: 32 * scale,
      fontWeight: 'bold',
      maxWidth: config.width * 0.8
    });

    // Draw decorative lines
    ctx.strokeStyle = '#10b981';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(centerX - 150 * scale, centerY + 150 * scale);
    ctx.lineTo(centerX + 150 * scale, centerY + 150 * scale);
    ctx.stroke();

    // Draw "Arena Play" text at bottom
    drawText(ctx, 'ARENA PLAY', centerX, config.height - 60 * scale, {
      fontSize: 20 * scale,
      fontWeight: 'bold',
      color: 'rgba(255, 255, 255, 0.6)'
    });

    return new Promise((resolve) => {
      canvas.toBlob((blob) => resolve(blob!), 'image/png', 1.0);
    });
  }, [getCanvas]);

  // Generate clip intro vignette
  const generateClipVignette = useCallback(async (
    data: ClipVignetteData,
    config: VignetteConfig
  ): Promise<Blob> => {
    const canvas = getCanvas(config.width, config.height);
    const ctx = canvas.getContext('2d')!;

    // If thumbnail, draw it first
    if (data.thumbnailUrl) {
      try {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        await new Promise<void>((resolve, reject) => {
          img.onload = () => {
            // Draw with Ken Burns style zoom
            const scale = 1.2;
            const drawWidth = config.width * scale;
            const drawHeight = config.height * scale;
            const offsetX = (config.width - drawWidth) / 2;
            const offsetY = (config.height - drawHeight) / 2;
            ctx.drawImage(img, offsetX, offsetY, drawWidth, drawHeight);
            resolve();
          };
          img.onerror = reject;
          img.src = data.thumbnailUrl!;
        });

        // Add overlay gradients
        const overlayGradient = ctx.createLinearGradient(0, 0, 0, config.height);
        overlayGradient.addColorStop(0, 'rgba(0, 0, 0, 0.3)');
        overlayGradient.addColorStop(0.5, 'rgba(0, 0, 0, 0.5)');
        overlayGradient.addColorStop(1, 'rgba(0, 0, 0, 0.8)');
        ctx.fillStyle = overlayGradient;
        ctx.fillRect(0, 0, config.width, config.height);
      } catch {
        drawBackground(ctx, config.width, config.height);
      }
    } else {
      drawBackground(ctx, config.width, config.height);
    }

    const centerX = config.width / 2;
    const centerY = config.height / 2;
    const scale = config.width / 1080;

    // Draw event type badge
    const eventLabel = getEventLabelUpper(data.eventType);
    ctx.fillStyle = 'rgba(16, 185, 129, 0.8)';
    const badgeWidth = Math.min(200 * scale, ctx.measureText(eventLabel).width + 40 * scale);
    const badgeHeight = 36 * scale;
    ctx.beginPath();
    ctx.roundRect(centerX - badgeWidth / 2, centerY - 100 * scale, badgeWidth, badgeHeight, 18);
    ctx.fill();

    drawText(ctx, eventLabel, centerX, centerY - 100 * scale + badgeHeight / 2, {
      fontSize: 14 * scale,
      fontWeight: '700',
      color: '#ffffff'
    });

    // Draw minute with glow
    drawText(ctx, `${data.minute}'`, centerX, centerY, {
      fontSize: 80 * scale,
      fontWeight: 'bold',
      color: '#10b981',
      glow: true
    });

    // Draw title
    drawText(ctx, data.title, centerX, centerY + 80 * scale, {
      fontSize: 18 * scale,
      fontWeight: '500',
      color: 'rgba(255, 255, 255, 0.8)',
      maxWidth: config.width * 0.85
    });

    // Draw corner decorations
    ctx.strokeStyle = '#10b981';
    ctx.lineWidth = 3;
    const cornerSize = 40 * scale;

    // Top left
    ctx.beginPath();
    ctx.moveTo(30 * scale, 80 * scale);
    ctx.lineTo(30 * scale, 30 * scale);
    ctx.lineTo(30 * scale + cornerSize, 30 * scale);
    ctx.stroke();

    // Top right
    ctx.beginPath();
    ctx.moveTo(config.width - 30 * scale, 80 * scale);
    ctx.lineTo(config.width - 30 * scale, 30 * scale);
    ctx.lineTo(config.width - 30 * scale - cornerSize, 30 * scale);
    ctx.stroke();

    // Bottom left
    ctx.beginPath();
    ctx.moveTo(30 * scale, config.height - 80 * scale);
    ctx.lineTo(30 * scale, config.height - 30 * scale);
    ctx.lineTo(30 * scale + cornerSize, config.height - 30 * scale);
    ctx.stroke();

    // Bottom right
    ctx.beginPath();
    ctx.moveTo(config.width - 30 * scale, config.height - 80 * scale);
    ctx.lineTo(config.width - 30 * scale, config.height - 30 * scale);
    ctx.lineTo(config.width - 30 * scale - cornerSize, config.height - 30 * scale);
    ctx.stroke();

    return new Promise((resolve) => {
      canvas.toBlob((blob) => resolve(blob!), 'image/png', 1.0);
    });
  }, [getCanvas]);

  // Generate transition vignette
  const generateTransitionVignette = useCallback(async (
    data: TransitionVignetteData,
    config: VignetteConfig
  ): Promise<Blob> => {
    const canvas = getCanvas(config.width, config.height);
    const ctx = canvas.getContext('2d')!;

    drawBackground(ctx, config.width, config.height);

    const centerX = config.width / 2;
    const centerY = config.height / 2;
    const scale = config.width / 1080;

    // Draw "PRÓXIMO" text
    drawText(ctx, 'PRÓXIMO', centerX, centerY - 40 * scale, {
      fontSize: 24 * scale,
      fontWeight: '600',
      color: 'rgba(255, 255, 255, 0.6)'
    });

    // Draw minute
    drawText(ctx, `${data.nextMinute}'`, centerX, centerY + 20 * scale, {
      fontSize: 48 * scale,
      fontWeight: 'bold',
      color: '#10b981',
      glow: true
    });

    // Draw event type
    const eventLabel = getEventLabelUpper(data.nextEventType);
    drawText(ctx, eventLabel, centerX, centerY + 70 * scale, {
      fontSize: 16 * scale,
      fontWeight: '500',
      color: 'rgba(255, 255, 255, 0.7)'
    });

    return new Promise((resolve) => {
      canvas.toBlob((blob) => resolve(blob!), 'image/png', 1.0);
    });
  }, [getCanvas]);

  // Generate closing vignette
  const generateClosingVignette = useCallback(async (
    data: ClosingVignetteData,
    config: VignetteConfig
  ): Promise<Blob> => {
    const canvas = getCanvas(config.width, config.height);
    const ctx = canvas.getContext('2d')!;

    drawBackground(ctx, config.width, config.height);

    const centerX = config.width / 2;
    const centerY = config.height / 2;
    const scale = config.width / 1080;

    // Draw "FIM" text
    drawText(ctx, 'FIM', centerX, centerY - 30 * scale, {
      fontSize: 64 * scale,
      fontWeight: 'bold',
      color: '#ffffff',
      glow: true
    });

    // Draw clip count
    drawText(ctx, `${data.clipCount} clips`, centerX, centerY + 40 * scale, {
      fontSize: 24 * scale,
      fontWeight: '500',
      color: 'rgba(255, 255, 255, 0.7)'
    });

    // Draw decorative line
    ctx.strokeStyle = '#10b981';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(centerX - 80 * scale, centerY + 80 * scale);
    ctx.lineTo(centerX + 80 * scale, centerY + 80 * scale);
    ctx.stroke();

    // Draw "Arena Play" at bottom
    drawText(ctx, 'ARENA PLAY', centerX, config.height - 60 * scale, {
      fontSize: 20 * scale,
      fontWeight: 'bold',
      color: 'rgba(255, 255, 255, 0.5)'
    });

    return new Promise((resolve) => {
      canvas.toBlob((blob) => resolve(blob!), 'image/png', 1.0);
    });
  }, [getCanvas]);

  return {
    generateOpeningVignette,
    generateClipVignette,
    generateTransitionVignette,
    generateClosingVignette
  };
}
