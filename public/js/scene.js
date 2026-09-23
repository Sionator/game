// 3D-Welt: Renderer, Licht, Post-Processing und alle Bausteine zusammen
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { Q, QUALITY_NAME } from './gfx/quality.js';
import { buildCourt, buildBall } from './gfx/court.js';
import { buildHoop } from './gfx/hoop.js';
import { buildSurroundings, buildSky, skyTexture, FLOODLIGHTS, LAMP_Y } from './gfx/city.js';
import { PlayerView, loadHumanAssets } from './gfx/human.js';
import { Effects } from './gfx/fx.js';

// Vignette + leichtes Color-Grading (nach dem Tone-Mapping)
const GradeShader = {
  uniforms: { tDiffuse: { value: null }, amount: { value: 0.9 } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
  fragmentShader: `
    uniform sampler2D tDiffuse; uniform float amount; varying vec2 vUv;
    void main(){
      vec4 c = texture2D(tDiffuse, vUv);
      float l = dot(c.rgb, vec3(0.299,0.587,0.114));
      c.rgb = mix(vec3(l), c.rgb, 1.12);                       // Sättigung
      c.rgb = (c.rgb - 0.5) * 1.06 + 0.5;                       // Kontrast
      c.rgb += vec3(0.012, 0.0, 0.03) * (1.0 - l);              // kühle Schatten
      vec2 d = vUv - 0.5;
      c.rgb *= 1.0 - dot(d, d) * amount;                        // Vignette
      gl_FragColor = c;
    }`,
};

export function createWorld(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: !Q.post, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, Q.pixelRatio));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;

  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x1a1530, 0.0105);
  const skyTex = skyTexture();
  scene.background = new THREE.Color(0x05060e);
  buildSky(scene, skyTex);

  const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 400);
  camera.position.set(0, 7, 20);
  camera.lookAt(0, 1.5, 6);

  // Umgebungs-Map für Reflexionen (Himmel + helle Flutlicht-Paneele)
  scene.environment = buildEnvMap(renderer, skyTex);
  scene.environmentIntensity = 0.4;

  // Licht
  scene.add(new THREE.HemisphereLight(0x6f85ff, 0x241a12, 0.3));
  const moon = new THREE.DirectionalLight(0x9fb4ff, Q.spotShadows ? 0.35 : 1.6);
  moon.position.set(8, 20, 16);
  moon.target.position.set(0, 0, 6);
  if (!Q.spotShadows) {
    moon.castShadow = true;
    moon.shadow.mapSize.set(Q.shadowSize, Q.shadowSize);
    const sc = moon.shadow.camera;
    sc.left = -13; sc.right = 13; sc.top = 13; sc.bottom = -13; sc.near = 1; sc.far = 50;
    moon.shadow.bias = -0.0005;
    moon.shadow.normalBias = 0.02;
  }
  scene.add(moon, moon.target);
  FLOODLIGHTS.forEach((fl, i) => {
    const spot = new THREE.SpotLight(0xfff1dc, Q.spotShadows ? 1.35 : 0.8, 0, 0.8, 0.7, 0);
    spot.position.set(fl.pole[0] - Math.sign(fl.pole[0]) * 0.5, LAMP_Y, fl.pole[1]);
    spot.target.position.set(...fl.target);
    // Die vorderen Masten werfen die sichtbarsten Schatten
    if (i >= 2 && i - 2 < Q.spotShadows) {
      spot.castShadow = true;
      spot.shadow.mapSize.set(Q.shadowSize, Q.shadowSize);
      spot.shadow.camera.near = 2;
      spot.shadow.camera.far = 40;
      spot.shadow.bias = -0.0004;
      spot.shadow.normalBias = 0.03;
    }
    scene.add(spot, spot.target);
  });

  loadHumanAssets();                       // Figuren-Daten schon im Menü laden
  const court = buildCourt(scene, Q);
  const ball = buildBall();
  scene.add(ball);
  const hoop = buildHoop(scene, ball);
  const env = buildSurroundings(scene, Q);
  const fx = new Effects(scene);

  // Post-Processing
  let composer = null, bloom = null;
  if (Q.post) {
    const rt = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: Q.msaa });
    composer = new EffectComposer(renderer, rt);
    composer.addPass(new RenderPass(scene, camera));
    if (Q.bloom) {
      bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.5, 0.5, 1.5);
      composer.addPass(bloom);
    }
    composer.addPass(new OutputPass());
    composer.addPass(new ShaderPass(GradeShader));
  }

  function resize() {
    const w = window.innerWidth, h = window.innerHeight;
    const pr = Math.min(window.devicePixelRatio, Q.pixelRatio);
    renderer.setPixelRatio(pr);
    renderer.setSize(w, h, false);
    if (composer) { composer.setPixelRatio(pr); composer.setSize(w, h); }
    camera.aspect = w / h;
    camera.fov = w / h < 0.8 ? 72 : w / h < 1.3 ? 60 : 50;
    camera.updateProjectionMatrix();
  }
  resize();
  window.addEventListener('resize', resize);

  return {
    THREE, renderer, scene, camera, ball, hoop, fx, clearLine: court.clearLine, quality: QUALITY_NAME,
    addPlayer: (info, isMe, isMate) => new PlayerView(scene, info, { isMe, isMate, fx, lookTarget: ball.position }),
    cheer: (level) => env.cheer(level),
    update(dt, time) {
      hoop.update(dt, time);
      fx.update(dt);
      env.update(dt, time, ball.position);
    },
    render() {
      if (composer) composer.render();
      else renderer.render(scene, camera);
    },
  };
}

function buildEnvMap(renderer, skyTex) {
  const envScene = new THREE.Scene();
  const sky = new THREE.Mesh(new THREE.SphereGeometry(50, 32, 16), new THREE.MeshBasicMaterial({ map: skyTex, side: THREE.BackSide }));
  envScene.add(sky);
  // Helle Flutlicht-Flächen → Reflexionen auf Pfützen, Ring und Glas
  const panel = new THREE.MeshBasicMaterial({ color: new THREE.Color(9, 8.5, 7.5) });
  for (const fl of FLOODLIGHTS) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 1.4), panel);
    m.position.set(fl.pole[0] * 1.2, LAMP_Y + 2, fl.pole[1] * 1.2 - 3);
    m.lookAt(0, 0, 0);
    envScene.add(m);
  }
  // Stadtlicht am Horizont
  const glow = new THREE.Mesh(new THREE.CylinderGeometry(45, 45, 6, 32, 1, true), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.9, 0.45, 0.3), side: THREE.BackSide }));
  glow.position.y = 2;
  envScene.add(glow);
  const pmrem = new THREE.PMREMGenerator(renderer);
  const tex = pmrem.fromScene(envScene, 0.02).texture;
  pmrem.dispose();
  return tex;
}
