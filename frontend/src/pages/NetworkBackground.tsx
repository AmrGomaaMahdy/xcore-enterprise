import { useEffect, useRef } from 'react';

/**
 * Animated "enterprise network" background for the sign-in page: drifting nodes linked when close,
 * with gold/teal pulses travelling along the links. Pure canvas, no dependencies; pauses when hidden
 * and respects prefers-reduced-motion.
 */
export function NetworkBackground() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    let w = 0;
    let h = 0;
    let raf = 0;
    type P = { x: number; y: number; vx: number; vy: number; r: number; gold: boolean };
    let pts: P[] = [];
    const pulses: { a: number; b: number; t: number; speed: number }[] = [];

    const resize = () => {
      w = canvas.clientWidth;
      h = canvas.clientHeight;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const count = Math.round(Math.min(110, (w * h) / 14000));
      pts = Array.from({ length: count }, () => ({
        x: Math.random() * w,
        y: Math.random() * h,
        vx: (Math.random() - 0.5) * 0.35,
        vy: (Math.random() - 0.5) * 0.35,
        r: Math.random() * 1.8 + 0.8,
        gold: Math.random() < 0.22,
      }));
    };

    const LINK = 150;
    const frame = () => {
      ctx.clearRect(0, 0, w, h);
      for (const p of pts) {
        if (!reduce) {
          p.x += p.vx;
          p.y += p.vy;
        }
        if (p.x < 0 || p.x > w) p.vx *= -1;
        if (p.y < 0 || p.y > h) p.vy *= -1;
      }
      for (let i = 0; i < pts.length; i++) {
        for (let j = i + 1; j < pts.length; j++) {
          const a = pts[i];
          const b = pts[j];
          const d = Math.hypot(a.x - b.x, a.y - b.y);
          if (d < LINK) {
            ctx.strokeStyle = `rgba(120, 190, 220, ${(1 - d / LINK) * 0.22})`;
            ctx.lineWidth = 0.7;
            ctx.beginPath();
            ctx.moveTo(a.x, a.y);
            ctx.lineTo(b.x, b.y);
            ctx.stroke();
            if (!reduce && pulses.length < 14 && Math.random() < 0.0009)
              pulses.push({ a: i, b: j, t: 0, speed: 0.008 + Math.random() * 0.012 });
          }
        }
      }
      for (let k = pulses.length - 1; k >= 0; k--) {
        const s = pulses[k];
        s.t += s.speed;
        const a = pts[s.a];
        const b = pts[s.b];
        if (s.t >= 1 || !a || !b || Math.hypot(a.x - b.x, a.y - b.y) > LINK) {
          pulses.splice(k, 1);
          continue;
        }
        const x = a.x + (b.x - a.x) * s.t;
        const y = a.y + (b.y - a.y) * s.t;
        const g = ctx.createRadialGradient(x, y, 0, x, y, 8);
        g.addColorStop(0, 'rgba(243, 212, 138, 0.95)');
        g.addColorStop(1, 'rgba(243, 212, 138, 0)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(x, y, 8, 0, Math.PI * 2);
        ctx.fill();
      }
      for (const p of pts) {
        ctx.fillStyle = p.gold ? 'rgba(243, 212, 138, 0.9)' : 'rgba(150, 220, 245, 0.75)';
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fill();
      }
      raf = requestAnimationFrame(frame);
    };

    resize();
    frame();
    const onVis = () => {
      cancelAnimationFrame(raf);
      if (!document.hidden) frame();
    };
    window.addEventListener('resize', resize);
    document.addEventListener('visibilitychange', onVis);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, []);

  return <canvas ref={ref} aria-hidden="true" />;
}
