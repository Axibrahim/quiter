/**
 * BloomScene — the check-in reward effect.
 *
 * Earlier builds tried to render the Glass Flower video itself inside
 * WebGL as a textured plane. That path turned out fragile in practice
 * (aspect-ratio math, autoplay policies, texture format deprecations) for
 * something the hero section's plain <video> element already does better
 * and more reliably. So this scene now does ONE thing: a GPU particle
 * "bloom" — a burst of light that expands and fades — fired when a habit
 * check-in succeeds. It sits on a transparent, pointer-events-none canvas
 * layered above the whole page, invisible until triggered.
 *
 * MEMORY DISCIPLINE: every geometry/material/texture created here is
 * tracked and explicitly `.dispose()`d in `destroy()`. WebGL buffers live
 * in GPU memory, which the JS garbage collector cannot see or reclaim.
 */
import * as THREE from 'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.module.min.js';

export class BloomScene {
  constructor(canvas) {
    this.canvas = canvas;
    this.disposables = [];
    this.clock = new THREE.Clock();
    this.strength = 0;
    this.target = 0;
    this._rafId = null;

    this._initRenderer();
    this._initParticles();
    this._bindResize();
  }

  _initRenderer() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: true,
      alpha: true,
      powerPreference: 'high-performance',
    });
    this.renderer.setPixelRatio(dpr);
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setClearColor(0x000000, 0);

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 100);
    this.camera.position.set(0, 0, 6);
  }

  _initParticles() {
    const COUNT = 900;
    const positions = new Float32Array(COUNT * 3);
    const colorChoices = [
      new THREE.Color(0x8d7cff),
      new THREE.Color(0x3fe8c9),
      new THREE.Color(0xffffff),
    ];
    const colors = new Float32Array(COUNT * 3);

    for (let i = 0; i < COUNT; i++) {
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos((Math.random() * 2) - 1);
      const r = 1.6 + Math.random() * 0.6;
      positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      positions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta) * 0.6;
      positions[i * 3 + 2] = r * Math.cos(phi) * 0.4;

      const c = colorChoices[Math.floor(Math.random() * colorChoices.length)];
      colors[i * 3] = c.r; colors[i * 3 + 1] = c.g; colors[i * 3 + 2] = c.b;
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    this.disposables.push(geo);

    const mat = new THREE.PointsMaterial({
      size: 0.045,
      vertexColors: true,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.disposables.push(mat);

    this.particles = new THREE.Points(geo, mat);
    this.particles.scale.setScalar(0.001);
    this.scene.add(this.particles);
  }

  _bindResize() {
    this._onResize = () => {
      const w = window.innerWidth, h = window.innerHeight;
      this.camera.aspect = w / h;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(w, h);
    };
    window.addEventListener('resize', this._onResize);
  }

  /** Called on a successful "completed" habit check-in. */
  trigger(tier = 1) {
    this.target = Math.min(1, 0.4 * tier);
    clearTimeout(this._decayHandle);
    this._decayHandle = setTimeout(() => { this.target = 0; }, 2200);
  }

  start() {
    const animate = () => {
      this._rafId = requestAnimationFrame(animate);
      const dt = this.clock.getDelta();

      this.strength += (this.target - this.strength) * Math.min(1, dt * 2.8);
      const scale = 0.001 + this.strength * 1.4;
      this.particles.scale.setScalar(scale);
      this.particles.material.opacity = this.strength;
      this.particles.rotation.y += dt * (0.05 + this.strength * 0.35);

      this.renderer.render(this.scene, this.camera);
    };
    animate();
  }

  destroy() {
    if (this._rafId) cancelAnimationFrame(this._rafId);
    window.removeEventListener('resize', this._onResize);
    clearTimeout(this._decayHandle);
    this.disposables.forEach((r) => r.dispose && r.dispose());
    this.renderer.dispose();
  }
}