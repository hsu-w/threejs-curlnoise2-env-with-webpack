import Stats from 'stats.js';
import "./style.css";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls";
import * as dat from "lil-gui";
import gridImage from "./textures/grid2.jpg";


/**FPSを観測する */
const stats = new Stats();
stats.showPanel(0); // 0: fps, 1: ms, 2: memory
document.body.appendChild(stats.dom);


/**
 * Sizes
 */
const sizes = {
  width: window.innerWidth,
  height: window.innerHeight,
};

/**
 * マウスの座標
 */
const mouse = new THREE.Vector2();
const laseMouse = new THREE.Vector2();

/**
 * Canvas
 */
const canvas = document.querySelector(".webgl");

/**
 * Scene
 */
const scene = new THREE.Scene();

/**
 * Textures
 */
const textureLoader = new THREE.TextureLoader();
// const imageTexture = textureLoader.load(gridImage);
const gridTexture = textureLoader.load(gridImage,loadComplete);
let loadCompleteFlag = false;
function loadComplete () {
  loadCompleteFlag = true;
}
/**
 * Camera
 */
const camera = new THREE.PerspectiveCamera(
  75,
  sizes.width / sizes.height,
  0.1,
  100
);
camera.position.set(0, 0, 1);
scene.add(camera);

// Controls
// const controls = new OrbitControls(camera, canvas);
// controls.enableDamping = true;

const raycaster = new THREE.Raycaster();
// 原点を決める
const rayOrigin = new THREE.Vector3(0, 0, 0);
// 向きを決める
const rayDirection = new THREE.Vector3(0, 0, 0);
// 正規化する
rayDirection.normalize();
// セット
raycaster.set(rayOrigin, rayDirection);
//カーソルの位置を取得してみよう
const cursor = {};
const cursorPre = {};
cursor.x = 0;
cursor.y = 0;
cursorPre.x = 0;
cursorPre.y = 0;


/**
 * Renderer
 */
const renderer = new THREE.WebGLRenderer({
  canvas: canvas,
});
renderer.setSize(sizes.width, sizes.height);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
/**
 * resize
 */
window.addEventListener("resize", () => {
  sizes.width = window.innerWidth;
  sizes.height = window.innerHeight;

  camera.aspect = sizes.width / sizes.height;
  camera.updateProjectionMatrix();

  renderer.setSize(sizes.width, sizes.height);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
});

let baseSize = 5.0;



// シミュレーション用のテクスチャ解像度
const SIM_RESOLUTION = 256 * 6; 




function createRenderTarget(size) {
  return new THREE.WebGLRenderTarget(size, size, {
    minFilter: THREE.LinearFilter,
    magFilter: THREE.LinearFilter,
    format: THREE.RGBAFormat,
    type: THREE.FloatType, // ここを必ず設定
    depthBuffer: false,
    stencilBuffer: false,
  });
}
function createVelocityTexture(size) {
  const data = new Float32Array(size * size * 4); // RGBA（4チャンネル）
  for (let i = 0; i < size * size; i++) {
      data[i * 4 + 0] = 0.0; // X方向速度
      data[i * 4 + 1] = 0.0; // Y方向速度
      data[i * 4 + 2] = 0.0; // Z方向（使わない）
      data[i * 4 + 3] = 1.0; // α（使わない）
  }

  const texture = new THREE.DataTexture(
      data, size, size, THREE.RGBAFormat, THREE.FloatType
  );
  texture.needsUpdate = true;
  return texture;
}

// 初期の速度テクスチャ
const initialVelocityTexture = createVelocityTexture(SIM_RESOLUTION);






/**
 * 速度
 */

// 速度の FBO を作成
let velocityA = createRenderTarget(SIM_RESOLUTION);
let velocityB = createRenderTarget(SIM_RESOLUTION);
// 速度計算のシェーダー
const velocityFragmentShader = `
  precision highp float;

  uniform sampler2D velocityTexture;  // 既存の速度テクスチャ
  uniform vec2 resolution;            // 画面解像度
  uniform float dt;                   // 時間ステップ
  uniform vec2 mouse;                 // マウス座標
  uniform vec2 curVelocity;           // 瞬間速度
  uniform vec2 lastVelocity;           // 瞬間速度
  uniform float uForce;
  uniform float uDecade;
  uniform bool flag;
  uniform bool mousedown;
  void main() {
      vec2 uv = gl_FragCoord.xy / resolution;
      vec2 force = vec2(0.0, 0.0);
      // 現在の速度を取得
      vec2 velocity = texture2D(velocityTexture, uv).xy;
      float speed = length(curVelocity);
      if(flag){
        // マウスの動きの方向を curVelocity から取得
        // 速度が小さすぎる場合は影響を無視
        // vec2 normDir = speed > 1e-6 ? normalize(curVelocity) : vec2(0.0);
        vec2 smoothVelocity = mix(lastVelocity, curVelocity, 0.2); // 0.2は平滑化の強度
        vec2 normDir = normalize(smoothVelocity);
        // vec2 normDir = vec2(0.5,-0.5); // 0除算を防ぐ
        // マウスの動きの方向
        // vec2 mouse = vec2(0.52, 0.52);
        // vec2 normDir = normalize(direction);

        // uv から mouse へのベクトル
        vec2 toUV = uv - mouse;
        vec2 normToUV = normalize(toUV);


        // toUV が direction の正方向にあるか確認（dot積が正）
        bool inPositiveDirection = dot(toUV, normDir) > 0.0;

        // mouse からの距離
        float dist = length(toUV);

        // direction 方向にどれだけ揃っているか（cosθ）
        float alignment = dot(normToUV, normDir);

        // 閾値（例えば、5度以内ならOK → cos(5°) ≈ 0.996）
        float angleThreshold = 0.5;

        // 条件
        // if (inPositiveDirection && dist < 0.5) {
        if (alignment > angleThreshold && dist < 0.5) {
          force = uForce * normalize(uv - mouse) * exp(-dist * uDecade);
        } else {
          // ここに処理を書く
        }
        if(mousedown) {
          velocity += force * dt;
        }
      }
      gl_FragColor = vec4(velocity, 0.0, 1.0);
  }
`;
let curVelocity = new THREE.Vector2(0.0, 0.0);
let lastVelocity = new THREE.Vector2();
const velocityMaterial = new THREE.ShaderMaterial({
  fragmentShader: velocityFragmentShader,
  uniforms: {
      velocityTexture: { value: initialVelocityTexture },
      resolution: { value: new THREE.Vector2(SIM_RESOLUTION, SIM_RESOLUTION) },
      mouse: { value: new THREE.Vector2(0.5, 0.5) },
      mousedown: { value: false },
      curVelocity: {value: curVelocity},
      lastVelocity: {value: lastVelocity},
      dt: { value: 0.016 }, // 1/60秒
      uForce: { value: 20.0 },
      uDecade: { value: 40.0 },
      flag: { value: false },
  },
});
// 描画用のオブジェクト
const velocityPass = new THREE.Mesh(
  new THREE.PlaneGeometry(2, 2),
  velocityMaterial
);
const velocityScene = new THREE.Scene();
velocityScene.add(velocityPass);
const velocityCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
// 速度計算の実行（反復計算）
function computeVelocity(renderer) {
  renderer.setRenderTarget(velocityB);
  renderer.render(velocityScene, velocityCamera);
  renderer.setRenderTarget(null);

  // ダブルバッファの切り替え
  [velocityA, velocityB] = [velocityB, velocityA];
  velocityMaterial.uniforms.velocityTexture.value = velocityA.texture;
}










/**
 * 粘性
 */
　
// 発散テクスチャーの FBO を作成

let viscosity = createRenderTarget(SIM_RESOLUTION);
// 発散計算のシェーダー
const viscosityFragmentShader = `
precision highp float;

uniform sampler2D velocityTexture;  // 速度場テクスチャ
uniform vec2 resolution;            // 画面解像度
uniform float viscosity;            // 動粘性係数 μ
uniform float dt;            // 時間ステップ

void main() {
    vec2 uv = gl_FragCoord.xy / resolution;
    vec2 texelSize = 1.0 / resolution;

    // 周囲4ピクセルの速度を取得（ラプラシアン計算）
    vec2 velocity = texture2D(velocityTexture, uv).xy;
    vec2 velocityLeft  = texture2D(velocityTexture, uv - vec2(texelSize.x, 0.0)).xy;
    vec2 velocityRight = texture2D(velocityTexture, uv + vec2(texelSize.x, 0.0)).xy;
    vec2 velocityDown  = texture2D(velocityTexture, uv - vec2(0.0, texelSize.y)).xy;
    vec2 velocityUp    = texture2D(velocityTexture, uv + vec2(0.0, texelSize.y)).xy;

    // ラプラシアンを計算
    vec2 laplacian = (velocityLeft + velocityRight + velocityUp + velocityDown - 4.0 * velocity) / (texelSize.x * texelSize.x);

    // 拡散計算（Jacobi 法を適用）
    vec2 newVelocity = velocity + viscosity * laplacian * dt;

    gl_FragColor = vec4(newVelocity, 0.0, 1.0);
}`;
const viscosityMaterial = new THREE.ShaderMaterial({
  fragmentShader: viscosityFragmentShader,
  uniforms: {
      velocityTexture: { value: velocityA.texture },
      resolution: { value: new THREE.Vector2(SIM_RESOLUTION, SIM_RESOLUTION) },
      viscosity: { value: 0.000000001 }, // 動粘性係数（小さいと水、大きいと粘性の強い流体）
      dt: { value: 0.016 }, // 1/60秒
  },
});
// 発散用のオブジェクト
const viscosityPass = new THREE.Mesh(
  new THREE.PlaneGeometry(2, 2),
  viscosityMaterial
);
const viscosityScene = new THREE.Scene();
viscosityScene.add(viscosityPass);
const viscosityCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

// 発散計算の実行（反復計算）
function computeViscosity(renderer) {
  renderer.setRenderTarget(viscosity);
  renderer.render(viscosityScene, viscosityCamera);
  renderer.setRenderTarget(null);
  velocityA.texture = viscosity.texture;
}





































/**
 * 発散
 */


// 発散テクスチャーの FBO を作成

let divergence = createRenderTarget(SIM_RESOLUTION);
// 発散計算のシェーダー
const divergenceFragmentShader = `
  //version 300 es
  precision highp float;

  uniform sampler2D velocityTexture;
  uniform vec2 texelSize; // 1.0 / texture resolution (dx, dy)

  void main() {
      vec2 uv = gl_FragCoord.xy * texelSize;

      vec2 vL = texture(velocityTexture, uv - vec2(texelSize.x, 0.0)).xy; // 左
      vec2 vR = texture(velocityTexture, uv + vec2(texelSize.x, 0.0)).xy; // 右
      vec2 vB = texture(velocityTexture, uv - vec2(0.0, texelSize.y)).xy; // 下
      vec2 vT = texture(velocityTexture, uv + vec2(0.0, texelSize.y)).xy; // 上

      float divergence = (vR.x - vL.x) / (2.0 * texelSize.x) + (vT.y - vB.y) / (2.0 * texelSize.y);


      gl_FragColor = vec4(divergence, 0.0, 0.0, 1.0);
  }`;
const divergenceMaterial = new THREE.ShaderMaterial({
  fragmentShader: divergenceFragmentShader,
  uniforms: {
      velocityTexture: { value: velocityA.texture },
      resolution: { value: new THREE.Vector2(SIM_RESOLUTION, SIM_RESOLUTION) },
      texelSize: { value: new THREE.Vector2(1.0 / SIM_RESOLUTION, 1.0 / SIM_RESOLUTION) },
      dt: { value: 0.016 }, // 1/60秒
      flag: { value: false },
  },
});
// 発散用のオブジェクト
const divergencePass = new THREE.Mesh(
  new THREE.PlaneGeometry(2, 2),
  divergenceMaterial
);
const divergenceScene = new THREE.Scene();
divergenceScene.add(divergencePass);
const divergenceCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

// 発散計算の実行（反復計算）
function computeDivergence(renderer) {
  renderer.setRenderTarget(divergence);
  renderer.render(divergenceScene, divergenceCamera);
  renderer.setRenderTarget(null);
}
















/**
 * 圧力
 */

const PRESSURE_ITERATIONS = 20;
// 圧力の FBO を作成
let pressureA = createRenderTarget(SIM_RESOLUTION);
let pressureB = createRenderTarget(SIM_RESOLUTION);

// 圧力計算のシェーダー
const pressureFragmentShader = `
//version 300 es
precision highp float;

uniform sampler2D divergenceTexture;
uniform sampler2D pressureTexture;
uniform vec2 resolution;

void main() {
    vec2 uv = gl_FragCoord.xy / resolution;
    float divergence = texture(divergenceTexture, uv).r;

    // 周囲の圧力を取得（ガウス・ザイデル法）
    float left  = texture(pressureTexture, uv + vec2(-1.0,  0.0) / resolution).r;
    float right = texture(pressureTexture, uv + vec2( 1.0,  0.0) / resolution).r;
    float down  = texture(pressureTexture, uv + vec2( 0.0, -1.0) / resolution).r;
    float up    = texture(pressureTexture, uv + vec2( 0.0,  1.0) / resolution).r;

    // ポアソン方程式の解（圧力場の更新）
    float pressure = (left + right + up + down - divergence) * 0.25;

    gl_FragColor = vec4(pressure, 0.0, 0.0, 1.0);
}`;
const pressureMaterial = new THREE.ShaderMaterial({
    fragmentShader: pressureFragmentShader,
    uniforms: {
        divergenceTexture: { value: null },
        pressureTexture: { value: null },
        resolution: { value: new THREE.Vector2(SIM_RESOLUTION, SIM_RESOLUTION) },
    },
});

// 圧力用のオブジェクト
const pressurePass = new THREE.Mesh(
  new THREE.PlaneGeometry(2, 2),
  pressureMaterial
);
const pressureScene = new THREE.Scene();
pressureScene.add(pressurePass);
const pressureCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

// 圧力計算の実行（反復計算）
function computePressure(renderer) {
    for (let i = 0; i < PRESSURE_ITERATIONS; i++) {
        pressureMaterial.uniforms.divergenceTexture.value = divergence.texture;
        pressureMaterial.uniforms.pressureTexture.value = pressureA.texture;

        renderer.setRenderTarget(pressureB);
        renderer.render(pressureScene, pressureCamera);
        renderer.setRenderTarget(null);

        [pressureA, pressureB] = [pressureB, pressureA]; // ping-pong
    }
}












/**
 * 速度補正
 */

// 速度補正用の FBO
let correctedVelocity = createRenderTarget(SIM_RESOLUTION);
const gradPFragmentShader = `
  //version 300 es
  precision highp float;

  uniform sampler2D velocityTexture; // もともとの速度
  uniform sampler2D pressureTexture; // さっき計算した圧力
  uniform vec2 resolution;

  void main() {
      vec2 uv = gl_FragCoord.xy / resolution;

      vec2 velocity = texture(velocityTexture, uv).xy;

      // 圧力の勾配（gradP）を求める
      float left  = texture(pressureTexture, uv + vec2(-1.0,  0.0) / resolution).r;
      float right = texture(pressureTexture, uv + vec2( 1.0,  0.0) / resolution).r;
      float down  = texture(pressureTexture, uv + vec2( 0.0, -1.0) / resolution).r;
      float up    = texture(pressureTexture, uv + vec2( 0.0,  1.0) / resolution).r;

      vec2 gradP = vec2(right - left, up - down); // 圧力の勾配（中央差分）

      // 速度を補正（圧力の影響を引く）
      velocity -= 0.0005 * gradP;

      velocity *= 0.995;

      gl_FragColor = vec4(velocity, 0.0, 1.0);
  }`;

const velocityCorrectionMaterial = new THREE.ShaderMaterial({
  fragmentShader: gradPFragmentShader, // 上の `gradP.frag` を入れる
  uniforms: {
      velocityTexture: { value: null },
      pressureTexture: { value: null },
      resolution: { value: new THREE.Vector2(SIM_RESOLUTION, SIM_RESOLUTION) },
  },
});
// 速度補正用ののオブジェクト
const velocityCorrectionPass = new THREE.Mesh(
  new THREE.PlaneGeometry(2, 2),
  velocityCorrectionMaterial
);
const velocityCorrectionScene = new THREE.Scene();
velocityCorrectionScene.add(velocityCorrectionPass);
const velocityCorrectionCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);


function correctVelocity(renderer) {
  velocityCorrectionMaterial.uniforms.velocityTexture.value = velocityA.texture;
  velocityCorrectionMaterial.uniforms.pressureTexture.value = pressureA.texture;

  renderer.setRenderTarget(correctedVelocity);
  renderer.render(velocityCorrectionScene, velocityCorrectionCamera);
  renderer.setRenderTarget(null);

  [velocityA, correctedVelocity] = [correctedVelocity, velocityA]; 
}
















































/**
 * 逆移流
 */

// 最新画像テクスチャーの FBO を作成
let imageA = createRenderTarget(SIM_RESOLUTION);
let imageB = createRenderTarget(SIM_RESOLUTION);
// 画像計算のシェーダー
const imageVertexShader = `
  precision highp float;

  varying vec2 vUv;

  void main() {
      vUv = uv; // PlaneGeometry の UV をそのまま渡す
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;
const imageFragmentShader = `
  //version 300 es
  precision highp float;

  uniform sampler2D grid2Texture;     // 画像テクスチャ
  uniform sampler2D gridTexture;     // 画像テクスチャ
  uniform sampler2D velocityTexture;  // 速度テクスチャ
  uniform vec2 resolution;
  uniform float dt;
  uniform bool flag;
  varying vec2 vUv;

  void main() {
      vec2 uv = vUv;

      vec2 velocity = texture2D(velocityTexture, vUv).xy;

      // 逆移流：現在の位置から流体の速度に従って過去の位置を計算
      vec2 displacedUV = uv  - velocity * dt;

      // 既存の画像を取得
      vec4 color;
      if(flag){
        color =  texture(gridTexture, displacedUV);
        // color = vec4(vec2(1.0 , 1.0) * displacedUV,0.0,1.0);
      } else {
        color = texture(grid2Texture, displacedUV);
        // color = vec4(1.0,0.0,0.0,1.0);
      }
      gl_FragColor = vec4(color.rgb,1.0);
  }
`;
const imageMaterial = new THREE.ShaderMaterial({
  fragmentShader: imageFragmentShader,
  vertexShader: imageVertexShader,
  uniforms: {
      flag: { value: true },
      gridTexture: { value: gridTexture },
      grid2Texture: { value: imageA.texture },
      velocityTexture: { value: velocityA.texture },
      resolution: { value: new THREE.Vector2(SIM_RESOLUTION, SIM_RESOLUTION) },
      dt: { value: 0.016 }, // 1/60秒
  },
});


// 描画用のオブジェクト
const imagePass = new THREE.Mesh(
  new THREE.PlaneGeometry(2, 2),
  imageMaterial
);
const imageScene = new THREE.Scene();
imageScene.add(imagePass);
const imageCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
// 速度計算の実行（反復計算）
function computeImage(renderer) {
  renderer.setRenderTarget(imageB);
  renderer.clearColor();  // 画面をクリア
  renderer.clearDepth();  // 深度バッファをクリア（必要なら）
  renderer.clearStencil(); // ステンシルバッファをクリア（必要なら）
  renderer.render(imageScene, imageCamera);
  renderer.setRenderTarget(null);

  // ダブルバッファの切り替え
  [imageA, imageB] = [imageB, imageA];
  imageMaterial.uniforms.grid2Texture.value = imageA.texture;
  if (loadCompleteFlag) {
    imageMaterial.uniforms.flag.value = false;
  }
}

















































// **メインシーンのオブジェクト（FBOのテクスチャを適用）**
// const mainMaterial = new THREE.MeshBasicMaterial({ map: velocityA.texture });
// const mainMaterial = new THREE.MeshBasicMaterial({ color: "#ff0000" });
const renderVertexShader = `
  precision highp float;

  varying vec2 vUv;

  void main() {
      vUv = uv; // PlaneGeometry の UV をそのまま渡す
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;
const renderFragmentShader = `
  //version 300 es
  precision highp float;

  uniform sampler2D imageTexture;     // 画像テクスチャ
  uniform vec2 resolution;
  uniform float dt;
  varying vec2 vUv;

  void main() {
      vec2 uv = vUv;
      vec3 color = texture(imageTexture, uv).rgb;

      gl_FragColor = vec4( color, 1.0 );
  }
`;
const mainMaterial= new THREE.ShaderMaterial({
  fragmentShader: renderFragmentShader, 
  vertexShader: renderVertexShader,
  uniforms: {
      imageTexture: { value: null },
      resolution: { value: new THREE.Vector2(SIM_RESOLUTION, SIM_RESOLUTION) },
      dt: { value: 0.016 }, // 1/60秒
  },
});
const mainPlane = new THREE.Mesh(new THREE.PlaneGeometry(baseSize, baseSize), mainMaterial);
scene.add(mainPlane);

// **カメラの位置**
camera.position.z = 2;

let curX = 0;
let curY = 0;
let preX = -1;
let preY = -1;

let lastPos = null;
let lastTime = null;
let mouseout = true;
function mousedown(val){
  if (!mouseout) {
    if (val) {
      document.querySelector("body").classList.add("grabbing");
    } else {
      document.querySelector("body").classList.remove("grabbing");
    }
    velocityMaterial.uniforms.mousedown.value = val;
  }
}
window.addEventListener("mousedown", (event) => {
  console.log("mousedown");
  mousedown(true);
});
window.addEventListener("mouseup", (event) => {
  mousedown(false);
  console.log("mouseup");
});
window.addEventListener("mousemove", (event) => {
  // cursor.x = 2 * (event.clientX / sizes.width - 0.5);
  // cursor.y = 2 * (event.clientY / sizes.height - 0.5);

  const element = event.currentTarget;
  // canvas要素上のXY座標
  const x = event.clientX;
  const y = event.clientY;
  // canvas要素の幅・高さ
  const w = sizes.width;
  const h = sizes.height;

  // -1〜+1の範囲で現在のマウス座標を登録する
  mouse.x = ( x / w ) * 2 - 1;
  mouse.y = -( y / h ) * 2 + 1;
  // console.log(mouse);

  // レイキャスト = マウス位置からまっすぐに伸びる光線ベクトルを生成
  raycaster.setFromCamera(mouse, camera);
  // その光線とぶつかったオブジェクトを得る
  const intersects = raycaster.intersectObject(mainPlane);

  if(intersects.length > 0){
    // ぶつかったオブジェクトに対してなんかする
    // 交差した位置をログに出力
    // console.log("交差位置:", intersects[0].point);
        
    // 3D座標をmainPlaneのローカル座標系に変換
    let localPoint = mainPlane.worldToLocal(intersects[0].point.clone());

    localPoint.x =  (1/baseSize) * (localPoint.x + baseSize / 2);

    localPoint.y =  (1/baseSize) * (localPoint.y + baseSize / 2);
    // ローカル座標を使用して2D座標を計算
    const canvas_x = (localPoint.x * 10 + sizes.width * window.devicePixelRatio / 2);
    const canvas_y = -(localPoint.y * 10 - sizes.height * window.devicePixelRatio / 2);



    curX = localPoint.x;
    curY = localPoint.y;
    if (Math.abs(curX - preX) > 1) {
      preX = curX;
    }
    if (Math.abs(curY - preY) > 1) {
      preY = curY;
    }
    velocityMaterial.uniforms.flag.value = true;
    velocityMaterial.uniforms.mouse.value.set(curX, curY);



    const now = performance.now(); // 高精度な時間を取得
    const currentPos = new THREE.Vector2(curX, curY);
    if (lastPos !== null && lastTime !== null) {
        const deltaPos = currentPos.clone().sub(lastPos); // 差分を計算
        const dt = (now - lastTime) / 1000; // 秒に変換

        if (dt > 0) {
            const velocity = deltaPos.divideScalar(dt); // 速度 = 位置差分 / 時間
            curVelocity = new THREE.Vector2(velocity.x.toFixed(100),velocity.y.toFixed(100));
            // lastVelocity を更新（遅延をつけることでスムージング）
            lastVelocity.lerp(curVelocity, 0.2); // 0.2 はスムージングの強さ
            // console.log(`Velocity: ${velocity.x.toFixed(100) > 0.0}, ${velocity.y.toFixed(100) > 0.0}`);
        }
    }
    lastPos = currentPos;
    lastTime = now;
    mouseout = false;
  } else {
    mouseout = true;
    mousedown(false);
    console.log("mouseout");
  }

});
let countPre = 0;



const gui = new dat.GUI({
  width: 300
});
//デバッグ
gui
  .add(velocityMaterial.uniforms.uForce, "value")
  .min(1.0)
  .max(20.0)
  .step(0.001)
  .name("uForce");
gui
  .add(velocityMaterial.uniforms.uDecade, "value")
  .min(10.0)
  .max(50.0)
  .step(0.01)
  .name("uDecade");





/**
 * Animate
 */
const clock = new THREE.Clock();

const animate = () => {
  stats.begin();
  //時間取得
  const elapsedTime = clock.getElapsedTime();

  // controls.update();

  computeVelocity(renderer);
  computeViscosity(renderer);
  computeDivergence(renderer);
  computePressure(renderer);
  correctVelocity(renderer);
  computeImage(renderer);

  mainMaterial.uniforms.imageTexture.value = imageA.texture;

  // **メインシーンを描画**
  renderer.render(scene, camera);

  window.requestAnimationFrame(animate);
  stats.end();

};

animate();








