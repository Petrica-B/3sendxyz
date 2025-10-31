"use client";

import { useEffect, useRef } from "react";

type Props = {
  src: string;
  width?: number; // CSS pixels when not filling parent
  height?: number; // CSS pixels when not filling parent
  pixelSize?: number; // logical pixel size for sampling/drawing
  fill?: boolean; // fill parent size
  className?: string;
  enableBursts?: boolean; // periodic pulse effect
  impactRadius?: number; // pointer repulsion radius
};

// Pixel-particle logo animation that samples an image and animates
// orange squares into position, forming the 3send logo, with extra dynamics.
export default function LogoPixelAnimation({
  src,
  width = 300,
  height = 80,
  pixelSize = 3,
  fill = false,
  className,
  enableBursts = false,
  impactRadius = 40,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const parent = canvas.parentElement;
    const dpr = Math.max(1, Math.floor(window.devicePixelRatio || 1));
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let cssWidth = width;
    let cssHeight = height;

    const resizeToParent = () => {
      if (fill && parent) {
        const rect = parent.getBoundingClientRect();
        cssWidth = Math.max(1, Math.floor(rect.width));
        cssHeight = Math.max(1, Math.floor(rect.height));
      }
      canvas.style.width = `${cssWidth}px`;
      canvas.style.height = `${cssHeight}px`;
      canvas.width = cssWidth * dpr;
      canvas.height = cssHeight * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    resizeToParent();

    // Observe parent size changes when in fill mode
    let ro: ResizeObserver | null = null;
    if (fill && parent && "ResizeObserver" in window) {
      ro = new ResizeObserver(() => {
        resizeToParent();
        // mark for re-sampling on next image load tick
        initParticles();
      });
      ro.observe(parent);
    }

    let raf = 0;
    let destroyed = false;
    let startAt = performance.now();
    let burstAmp = 0; // burst amplitude decays over time
    let lastBurst = 0;
    const mouse = { x: cssWidth / 2, y: cssHeight / 2, active: false };

    const onPointerMove = (e: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      mouse.x = e.clientX - rect.left;
      mouse.y = e.clientY - rect.top;
      mouse.active = true;
    };
    const onPointerLeave = () => {
      mouse.active = false;
    };
    canvas.addEventListener("pointermove", onPointerMove);
    canvas.addEventListener("pointerleave", onPointerLeave);

    // Resolve accent color from CSS var
    const rootStyles = getComputedStyle(document.documentElement);
    const accent = (rootStyles.getPropertyValue("--accent") || "#f7931a").trim();

    type Particle = {
      x: number;
      y: number;
      tx: number;
      ty: number;
      vx: number;
      vy: number;
      s: number;
      life: number;
    };

    let particles: Particle[] = [];

    const initParticles = () => {
      // Load logo image and sample alpha mask
      const img = new Image();
      img.src = src;
      img.onload = () => {
        if (destroyed) return;
        // Draw into offscreen to sample alpha mask
        const off = document.createElement("canvas");
        off.width = cssWidth;
        off.height = cssHeight;
        const octx = off.getContext("2d");
        if (!octx) return;
        octx.clearRect(0, 0, cssWidth, cssHeight);
        // Center-fit the image into the canvas
        const scale = Math.min(cssWidth / img.width, cssHeight / img.height);
        const dw = img.width * scale;
        const dh = img.height * scale;
        const dx = (cssWidth - dw) / 2;
        const dy = (cssHeight - dh) / 2;
        octx.drawImage(img, dx, dy, dw, dh);

        const data = octx.getImageData(0, 0, cssWidth, cssHeight).data;
        const targets: { x: number; y: number }[] = [];
        // adaptive sampling step to keep particles bounded
        const maxParticles = 3500;
        const baseStep = Math.max(2, Math.ceil(Math.sqrt((cssWidth * cssHeight) / maxParticles)));
        const step = baseStep;
        for (let y = 0; y < cssHeight; y += step) {
          for (let x = 0; x < cssWidth; x += step) {
            const idx = (y * cssWidth + x) * 4 + 3; // alpha channel
            const alpha = data[idx] || 0;
            if (alpha > 100) {
              targets.push({ x, y });
            }
          }
        }

        // Shuffle to avoid scanline artifacts
        for (let i = targets.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [targets[i], targets[j]] = [targets[j], targets[i]];
        }

        const sBase = Math.max(2, Math.min(4, pixelSize));
        particles = targets.map((t) => ({
          x: Math.random() * cssWidth,
          y: Math.random() * cssHeight,
          tx: t.x + (Math.random() * 2 - 1) * 1.2,
          ty: t.y + (Math.random() * 2 - 1) * 1.2,
          vx: (Math.random() * 2 - 1) * 0.5,
          vy: (Math.random() * 2 - 1) * 0.5,
          s: sBase + Math.random() * 1.2,
          life: Math.random() * 200,
        }));

        // reset background on re-init
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, cssWidth, cssHeight);
      };
      img.onerror = () => {
        // graceful fallback: draw simple text block in accent
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, cssWidth, cssHeight);
        ctx.fillStyle = accent;
        ctx.font = "800 24px Source Code Pro, monospace";
        ctx.textBaseline = "middle";
        ctx.fillText("3send", 16, Math.floor(cssHeight / 2));
      };
    };

    initParticles();

    const tick = (now: number) => {
      if (destroyed) return;
      raf = requestAnimationFrame(tick);

      const t = (now - startAt) / 1000;
      if (enableBursts) {
        // trigger a burst every ~4 seconds
        if (t - lastBurst > 4) {
          burstAmp = 0.18;
          lastBurst = t;
        }
        burstAmp *= 0.96; // decay
      } else {
        burstAmp = 0;
      }

      // soft fade background to create trailing effect
      ctx.fillStyle = "rgba(255,255,255,0.10)";
      ctx.fillRect(0, 0, cssWidth, cssHeight);

      ctx.fillStyle = accent;
      const centerX = cssWidth / 2;
      const centerY = cssHeight / 2;
      for (let i = 0; i < particles.length; i++) {
        const p = particles[i];
        // spring towards (slightly pulsing) target
        const pulse = 1 + burstAmp + Math.sin((t + i * 0.002) * 2.0) * 0.02;
        const targetX = (p.tx - centerX) * pulse + centerX;
        const targetY = (p.ty - centerY) * pulse + centerY;

        let ax = (targetX - p.x) * 0.08;
        let ay = (targetY - p.y) * 0.08;

        // pointer repulsion
        if (mouse.active) {
          const dx = p.x - mouse.x;
          const dy = p.y - mouse.y;
          const rr = dx * dx + dy * dy;
          const rad = impactRadius;
          if (rr < rad * rad) {
            const inv = 1 - rr / (rad * rad);
            ax += (dx / (Math.sqrt(rr) + 0.001)) * inv * 0.6;
            ay += (dy / (Math.sqrt(rr) + 0.001)) * inv * 0.6;
          }
        }

        // integrate velocity with damping
        p.vx = (p.vx + ax) * 0.92;
        p.vy = (p.vy + ay) * 0.92;
        p.x += p.vx;
        p.y += p.vy;

        // subtle breathing + size jitter
        p.life += 0.05;
        const jitter = Math.sin(p.life + i) * 0.3;
        const size = Math.max(1.5, p.s + jitter);
        // slight alpha variance for depth
        const alpha = 0.85 + Math.sin(i * 12.9898 + p.life) * 0.1;
        ctx.globalAlpha = Math.max(0.2, Math.min(1, alpha));
        ctx.fillRect(p.x, p.y, size, size);
      }
      ctx.globalAlpha = 1;
    };

    raf = requestAnimationFrame(tick);

    return () => {
      destroyed = true;
      if (raf) cancelAnimationFrame(raf);
      if (ro) ro.disconnect();
      canvas.removeEventListener("pointermove", onPointerMove);
      canvas.removeEventListener("pointerleave", onPointerLeave);
    };
  }, [src, width, height, pixelSize, fill, className, enableBursts, impactRadius]);

  return (
    <canvas
      ref={canvasRef}
      aria-label="3send logo pixel animation"
      role="img"
      className={className}
      style={{
        display: "block",
        width: fill ? "100%" : undefined,
        height: fill ? "100%" : undefined,
        position: fill ? "absolute" : undefined,
        inset: fill ? 0 : undefined,
        borderRadius: fill ? undefined : 8,
        border: fill ? undefined : "1px solid var(--border)",
        background: "#fff",
      }}
    />
  );
}
