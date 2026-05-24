"use client";

import { useEffect, useRef, useState } from "react";

const VERT_SRC = `
attribute vec2 p;
void main() {
  gl_Position = vec4(p, 0.0, 1.0);
}
`;

// Ported verbatim from the reference aurora-background.html.
// Domain-warped simplex noise field painted with a lavender / violet / blue palette,
// mixed toward white by a coverage term so white stays dominant.
const FRAG_SRC = `
precision highp float;

uniform vec2 u_res;
uniform float u_time;
uniform float u_intensity;
uniform vec3 u_c1; // lavender
uniform vec3 u_c2; // dark purple
uniform vec3 u_c3; // blue

vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec2 mod289_2(vec2 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec3 permute(vec3 x) { return mod289(((x * 34.0) + 1.0) * x); }

float snoise(vec2 v) {
  const vec4 C = vec4(0.211324865405187, 0.366025403784439,
                     -0.577350269189626, 0.024390243902439);
  vec2 i  = floor(v + dot(v, C.yy));
  vec2 x0 = v - i + dot(i, C.xx);
  vec2 i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
  vec4 x12 = x0.xyxy + C.xxzz;
  x12.xy -= i1;
  i = mod289_2(i);
  vec3 perm = permute(permute(i.y + vec3(0.0, i1.y, 1.0))
                    + i.x + vec3(0.0, i1.x, 1.0));
  vec3 m = max(0.5 - vec3(dot(x0, x0),
                          dot(x12.xy, x12.xy),
                          dot(x12.zw, x12.zw)), 0.0);
  m = m * m;
  m = m * m;
  vec3 x = 2.0 * fract(perm * C.www) - 1.0;
  vec3 h = abs(x) - 0.5;
  vec3 ox = floor(x + 0.5);
  vec3 a0 = x - ox;
  m *= 1.79284291400159 - 0.85373472095314 * (a0 * a0 + h * h);
  vec3 g;
  g.x  = a0.x  * x0.x  + h.x  * x0.y;
  g.yz = a0.yz * x12.xz + h.yz * x12.yw;
  return 130.0 * dot(m, g);
}

void main() {
  vec2 uv = gl_FragCoord.xy / u_res;
  vec2 p = uv;
  p.x *= u_res.x / u_res.y;

  float t = u_time * 0.05;

  float w1 = snoise(p * 1.1 + vec2(t, t * 0.6));
  float w2 = snoise(p * 1.4 + vec2(-t * 0.7, t * 0.9) + w1 * 0.6);
  vec2 q = p + 0.38 * vec2(w1, w2);

  float n  = snoise(q * 0.95 + t * 0.35);
  float n2 = snoise(q * 1.7 - t * 0.28 + 7.0);
  float m  = n * 0.5 + 0.5;
  float m2 = n2 * 0.5 + 0.5;

  vec3 col = mix(u_c3, u_c1, smoothstep(0.20, 0.80, m2));
  col = mix(col, u_c2, smoothstep(0.55, 1.0, (m + m2) * 0.5));

  float cov = smoothstep(0.34, 0.92, m) * u_intensity;

  vec3 finalCol = mix(vec3(1.0), col, cov);
  gl_FragColor = vec4(finalCol, 1.0);
}
`;

function compileShader(
  gl: WebGLRenderingContext,
  type: number,
  src: string,
): WebGLShader | null {
  const sh = gl.createShader(type);
  if (!sh) return null;
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    console.error("Aurora shader compile error:", gl.getShaderInfoLog(sh));
    gl.deleteShader(sh);
    return null;
  }
  return sh;
}

type AuroraProps = {
  intensity?: number;
  speed?: number;
  halftone?: boolean;
};

export function AuroraBackground({
  intensity = 0.3,
  speed = 0.7,
  halftone = false,
}: AuroraProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [failed, setFailed] = useState(false);

  const intensityRef = useRef(intensity);
  const speedRef = useRef(speed);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = (canvas.getContext("webgl", {
      antialias: false,
      premultipliedAlpha: false,
      preserveDrawingBuffer: false,
    }) ||
      canvas.getContext("experimental-webgl")) as WebGLRenderingContext | null;

    if (!ctx) {
      setFailed(true);
      return;
    }

    const gl: WebGLRenderingContext = ctx;
    const vs = compileShader(gl, gl.VERTEX_SHADER, VERT_SRC);
    const fs = compileShader(gl, gl.FRAGMENT_SHADER, FRAG_SRC);
    if (!vs || !fs) {
      setFailed(true);
      return;
    }

    const program = gl.createProgram();
    if (!program) {
      setFailed(true);
      return;
    }
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      console.error("Aurora program link error:", gl.getProgramInfoLog(program));
      setFailed(true);
      return;
    }
    gl.useProgram(program);

    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]),
      gl.STATIC_DRAW,
    );
    const posLoc = gl.getAttribLocation(program, "p");
    gl.enableVertexAttribArray(posLoc);
    gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0);

    const u_res = gl.getUniformLocation(program, "u_res");
    const u_time = gl.getUniformLocation(program, "u_time");
    const u_intensity = gl.getUniformLocation(program, "u_intensity");
    const u_c1 = gl.getUniformLocation(program, "u_c1");
    const u_c2 = gl.getUniformLocation(program, "u_c2");
    const u_c3 = gl.getUniformLocation(program, "u_c3");

    // Pastel Mix palette
    gl.uniform3f(u_c1, 1.0, 0.851, 0.925); // #ffd9ec pink — light/spread
    gl.uniform3f(u_c2, 0.667, 0.769, 1.0); // #aac4ff sky blue — deep/pools
    gl.uniform3f(u_c3, 0.741, 0.91, 0.839); // #bde8d6 mint — mid/spread

    function resize() {
      if (!canvas) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 1.75);
      const w = window.innerWidth;
      const h = window.innerHeight;
      const pw = Math.floor(w * dpr);
      const ph = Math.floor(h * dpr);
      if (canvas.width !== pw || canvas.height !== ph) {
        canvas.width = pw;
        canvas.height = ph;
      }
      canvas.style.width = w + "px";
      canvas.style.height = h + "px";
      gl.viewport(0, 0, pw, ph);
      gl.uniform2f(u_res, pw, ph);
    }

    const start = performance.now();
    let running = !document.hidden;
    let raf: number | null = null;
    const localSpeed = speedRef.current;
    const localIntensity = intensityRef.current;

    function loop() {
      if (!running) {
        raf = null;
        return;
      }
      const elapsed = ((performance.now() - start) / 1000) * localSpeed;
      gl.uniform1f(u_time, elapsed);
      gl.uniform1f(u_intensity, localIntensity);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      raf = requestAnimationFrame(loop);
    }

    function handleVis() {
      running = !document.hidden;
      if (running && raf === null) {
        raf = requestAnimationFrame(loop);
      }
    }

    window.addEventListener("resize", resize);
    document.addEventListener("visibilitychange", handleVis);
    resize();
    if (running) {
      raf = requestAnimationFrame(loop);
    }

    return () => {
      running = false;
      if (raf !== null) {
        cancelAnimationFrame(raf);
        raf = null;
      }
      window.removeEventListener("resize", resize);
      document.removeEventListener("visibilitychange", handleVis);
      gl.deleteBuffer(buf);
      gl.deleteProgram(program);
      gl.deleteShader(vs);
      gl.deleteShader(fs);
      const lose = gl.getExtension("WEBGL_lose_context");
      if (lose) lose.loseContext();
    };
  }, []);

  return (
    <>
      {failed ? (
        <div
          className="aurora-fallback fixed inset-0 pointer-events-none"
          style={{ zIndex: 0 }}
          aria-hidden
        />
      ) : (
        <canvas
          ref={canvasRef}
          className="fixed inset-0 pointer-events-none block"
          style={{ zIndex: 0 }}
          aria-hidden
        />
      )}
      {halftone && (
        <div
          className="aurora-halftone fixed inset-0 pointer-events-none"
          style={{ zIndex: 1 }}
          aria-hidden
        />
      )}
    </>
  );
}
