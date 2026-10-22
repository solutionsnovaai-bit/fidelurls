// Globo de rede cromado em canvas: grade de meridianos/paralelos, anel orbital
// e arcos disparados quando um link é gerado.

const RAD = Math.PI / 180;
export const HOME = [-23.55, -46.63]; // São Paulo


function toVec(lat, lon) {
  const p = lat * RAD, l = lon * RAD;
  return [Math.cos(p) * Math.cos(l), Math.cos(p) * Math.sin(l), Math.sin(p)];
}

function slerp(a, b, t) {
  const dot = Math.min(1, Math.max(-1, a[0] * b[0] + a[1] * b[1] + a[2] * b[2]));
  const om = Math.acos(dot);
  if (om < 1e-4) return a;
  const s = Math.sin(om);
  const k1 = Math.sin((1 - t) * om) / s, k2 = Math.sin(t * om) / s;
  return [a[0] * k1 + b[0] * k2, a[1] * k1 + b[1] * k2, a[2] * k1 + b[2] * k2];
}

const easeOut = (t) => 1 - Math.pow(1 - t, 3);

export class Globe {
  constructor(canvas) {
    this.c = canvas;
    this.ctx = canvas.getContext('2d');
    this.reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.lon0 = -40; // começa com o Brasil de frente
    this.lat0 = -12;
    this.arcs = [];
    this.t0 = performance.now();
    this.last = this.t0;
    this.visible = true;
    this.running = false;
    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(canvas);
    this.io = new IntersectionObserver((es) => {
      this.visible = es[0].isIntersecting;
      if (this.visible) this.start();
    });
    this.io.observe(canvas);
    this.onVis = () => (document.hidden ? this.stop() : this.start());
    document.addEventListener('visibilitychange', this.onVis);
    this.resize();
    this.start();
  }

  destroy() {
    this.stop();
    this.ro.disconnect();
    this.io.disconnect();
    document.removeEventListener('visibilitychange', this.onVis);
  }

  resize() {
    const r = this.c.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.w = Math.max(1, r.width);
    this.h = Math.max(1, r.height);
    this.c.width = Math.round(this.w * dpr);
    this.c.height = Math.round(this.h * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.cx = this.w / 2;
    this.cy = this.h / 2;
    this.R = Math.min(this.w, this.h) * 0.34;
    const { ctx, cx, cy, R } = this;
    const g = ctx.createLinearGradient(cx - R * 0.3, cy - R, cx + R * 0.3, cy + R);
    g.addColorStop(0, '#ffffff');
    g.addColorStop(0.2, '#d4d6db');
    g.addColorStop(0.42, '#5d6066');
    g.addColorStop(0.52, '#2f3135');
    g.addColorStop(0.6, '#a4a7ae');
    g.addColorStop(0.78, '#eef0f3');
    g.addColorStop(1, '#73767c');
    this.chrome = g;
    if (!this.running) this.draw(performance.now());
  }

  fire(count = 3) {
    if (this.reduced) return;
    const now = performance.now();
    for (let i = 0; i < count; i++) {
      const to = [Math.random() * 110 - 50, this.lon0 + Math.random() * 160 - 80];
      this.arcs.push({ a: toVec(...HOME), b: toVec(...to), t: now + i * 180, dur: 1500 + Math.random() * 500 });
    }
    this.burst = now;
    this.start();
  }

  start() {
    if (this.running || !this.visible || document.hidden) return;
    this.running = true;
    this.last = performance.now();
    const loop = (t) => {
      if (!this.running) return;
      this.draw(t);
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }

  stop() {
    this.running = false;
    cancelAnimationFrame(this.raf);
  }

  project(lat, lon, alt = 1) {
    const p = lat * RAD, dl = (lon - this.lon0) * RAD, p0 = this.lat0 * RAD;
    const x = Math.cos(p) * Math.sin(dl);
    const y = Math.cos(p0) * Math.sin(p) - Math.sin(p0) * Math.cos(p) * Math.cos(dl);
    const z = Math.sin(p0) * Math.sin(p) + Math.cos(p0) * Math.cos(p) * Math.cos(dl);
    return { x: this.cx + x * this.R * alt, y: this.cy - y * this.R * alt, z, rx: x * alt, ry: y * alt };
  }

  line(front, back, pts, reveal) {
    const n = Math.floor((pts.length - 1) * reveal);
    for (let i = 0; i < n; i++) {
      const a = this.project(pts[i][0], pts[i][1]);
      const b = this.project(pts[i + 1][0], pts[i + 1][1]);
      const path = a.z + b.z > 0 ? front : back;
      path.moveTo(a.x, a.y);
      path.lineTo(b.x, b.y);
    }
  }

  draw(t) {
    const { ctx, cx, cy, R } = this;
    const dt = Math.min(64, t - this.last);
    this.last = t;
    if (!this.reduced) this.lon0 -= dt * 0.006;
    const intro = this.reduced ? 1 : easeOut(Math.min(1, (t - this.t0) / 1600));

    ctx.clearRect(0, 0, this.w, this.h);

    // Halo
    const halo = ctx.createRadialGradient(cx, cy, R * 0.9, cx, cy, Math.min(R * 1.7, Math.min(this.w, this.h) * 0.5));
    halo.addColorStop(0, `rgba(235,238,245,${0.09 * intro})`);
    halo.addColorStop(1, 'rgba(235,238,245,0)');
    ctx.fillStyle = halo;
    ctx.fillRect(0, 0, this.w, this.h);

    // Anel orbital (metade de trás)
    const ringRx = R * 1.42, ringRy = R * 0.36, ringRot = -0.32;
    ctx.lineWidth = 1;
    ctx.strokeStyle = `rgba(160,164,172,${0.28 * intro})`;
    ctx.beginPath();
    ctx.ellipse(cx, cy, ringRx, ringRy, ringRot, Math.PI, Math.PI * 2);
    ctx.stroke();

    // Corpo da esfera
    const body = ctx.createRadialGradient(cx - R * 0.3, cy - R * 0.35, R * 0.05, cx, cy, R * 1.05);
    body.addColorStop(0, '#202125');
    body.addColorStop(0.55, '#08080a');
    body.addColorStop(1, '#000000');
    ctx.fillStyle = body;
    ctx.beginPath();
    ctx.arc(cx, cy, R * (0.92 + 0.08 * intro), 0, Math.PI * 2);
    ctx.fill();

    // Grade
    const front = new Path2D(), back = new Path2D();
    for (let lon = 0; lon < 360; lon += 20) {
      const pts = [];
      for (let lat = -90; lat <= 90; lat += 4) pts.push([lat, lon]);
      this.line(front, back, pts, intro);
    }
    for (let lat = -60; lat <= 60; lat += 20) {
      const pts = [];
      for (let lon = 0; lon <= 360; lon += 4) pts.push([lat, lon]);
      this.line(front, back, pts, intro);
    }
    ctx.lineWidth = 0.8;
    ctx.strokeStyle = 'rgba(150,154,162,0.16)';
    ctx.stroke(back);
    ctx.lineWidth = 1.1;
    ctx.strokeStyle = this.chrome;
    ctx.globalAlpha = 0.85 * intro;
    ctx.stroke(front);
    ctx.globalAlpha = 1;

    // Contorno cromado
    ctx.lineWidth = 1.4;
    ctx.strokeStyle = this.chrome;
    ctx.beginPath();
    ctx.arc(cx, cy, R, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * intro);
    ctx.stroke();

    // Casa (São Paulo)
    const home = this.project(...HOME);
    if (home.z > 0) {
      const since = this.burst ? (t - this.burst) / 900 : 2;
      if (since < 1) {
        ctx.strokeStyle = `rgba(255,255,255,${1 - since})`;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(home.x, home.y, 4 + since * 30, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.fillStyle = `rgba(255,255,255,${home.z * intro})`;
      ctx.beginPath();
      ctx.arc(home.x, home.y, 2.6, 0, Math.PI * 2);
      ctx.fill();
    }

    // Arcos
    this.arcs = this.arcs.filter((a) => t < a.t + a.dur * 1.6);
    for (const a of this.arcs) {
      const prog = (t - a.t) / a.dur;
      if (prog <= 0) continue;
      const head = Math.min(1, prog);
      const tail = Math.max(0, Math.min(1, (prog - 0.35) * 1.4));
      const fade = prog > 1 ? Math.max(0, 1 - (prog - 1) / 0.6) : 1;
      let prev = null;
      const steps = 48;
      for (let i = 0; i <= steps; i++) {
        const s = tail + (head - tail) * (i / steps);
        const v = slerp(a.a, a.b, s);
        const lat = Math.asin(v[2]) / RAD, lon = Math.atan2(v[1], v[0]) / RAD;
        const q = this.project(lat, lon, 1 + 0.22 * Math.sin(Math.PI * s));
        const vis = q.z >= 0 || q.rx * q.rx + q.ry * q.ry > 1;
        if (prev && vis && prev.vis) {
          ctx.strokeStyle = `rgba(255,255,255,${(0.15 + 0.85 * (i / steps)) * fade})`;
          ctx.lineWidth = 0.6 + 1.6 * (i / steps);
          ctx.beginPath();
          ctx.moveTo(prev.x, prev.y);
          ctx.lineTo(q.x, q.y);
          ctx.stroke();
        }
        prev = { ...q, vis };
      }
      if (prev && prev.vis && prog < 1) {
        const g = ctx.createRadialGradient(prev.x, prev.y, 0, prev.x, prev.y, 10);
        g.addColorStop(0, 'rgba(255,255,255,0.95)');
        g.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(prev.x, prev.y, 10, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // Brilho especular
    const spec = ctx.createRadialGradient(cx - R * 0.42, cy - R * 0.5, 0, cx - R * 0.42, cy - R * 0.5, R * 0.75);
    spec.addColorStop(0, `rgba(255,255,255,${0.13 * intro})`);
    spec.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = spec;
    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, Math.PI * 2);
    ctx.fill();

    // Anel orbital (metade da frente) + satélite
    ctx.lineWidth = 1.2;
    ctx.strokeStyle = this.chrome;
    ctx.globalAlpha = 0.75 * intro;
    ctx.beginPath();
    ctx.ellipse(cx, cy, ringRx, ringRy, ringRot, 0, Math.PI);
    ctx.stroke();
    ctx.globalAlpha = 1;
    const ang = this.reduced ? 0.9 : t / 2600;
    const ex = ringRx * Math.cos(ang), ey = ringRy * Math.sin(ang);
    const sx = cx + ex * Math.cos(ringRot) - ey * Math.sin(ringRot);
    const sy = cy + ex * Math.sin(ringRot) + ey * Math.cos(ringRot);
    const inFront = Math.sin(ang) > 0;
    const behind = !inFront && Math.hypot(sx - cx, sy - cy) < R;
    if (!behind) {
      const sg = ctx.createRadialGradient(sx, sy, 0, sx, sy, 9);
      sg.addColorStop(0, `rgba(255,255,255,${0.9 * intro})`);
      sg.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = sg;
      ctx.beginPath();
      ctx.arc(sx, sy, 9, 0, Math.PI * 2);
      ctx.fill();
    }

    if (this.reduced && this.running && !this.arcs.length) this.stop();
  }
}
