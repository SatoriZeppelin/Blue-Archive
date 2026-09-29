import { TextureAtlas, AtlasAttachmentLoader, SkeletonBinary, Skeleton, AnimationState, AnimationStateData, Physics } from './resources/tablet/node_modules/@esotericsoftware/spine-core/dist/index.js';
import { GLTexture, SceneRenderer } from './resources/tablet/node_modules/@esotericsoftware/spine-webgl/dist/index.js';

const source = new URL('./arona_spr', import.meta.url).href;
let resourcePromise;

function loadResources() {
  resourcePromise ||= Promise.all([
    fetch(`${source}.atlas`).then(response => { if (!response.ok) throw new Error('阿罗娜图集加载失败'); return response.text(); }),
    fetch(`${source}.skel`).then(response => { if (!response.ok) throw new Error('阿罗娜动作加载失败'); return response.arrayBuffer(); }),
    new Promise((resolve, reject) => { const image = new Image(); image.onload = () => resolve(image); image.onerror = () => reject(new Error('阿罗娜立绘加载失败')); image.src = `${source}.png`; })
  ]).catch(error => { resourcePromise = null; throw error; });
  return resourcePromise;
}

export const aronaAnimationNames = Object.freeze([
  ...Array.from({ length: 33 }, (_, index) => String(index).padStart(2, '0')),
  '99', 'Eye_Close_01', 'Idle_01',
  'LookEnd_01_A', 'LookEnd_01_M', 'Look_01_A', 'Look_01_M',
  'PatEnd_01_A', 'PatEnd_01_M', 'Pat_01_A', 'Pat_01_M'
]);

export function mountArona(canvas) {
  let disposed = false;
  let frame = 0;
  let last = 0;
  let observer;
  let resume = () => {};
  let renderer;
  let texture;
  let state;
  let idleName;
  let availableNames = [];
  let pendingAnimation = null;
  const play = (name, { loop = false, returnToIdle = true } = {}) => {
    if (disposed || !aronaAnimationNames.includes(name)) return false;
    if (!state) { pendingAnimation = { name, loop, returnToIdle }; return true; }
    if (!availableNames.includes(name)) return false;
    state.clearTracks();
    state.setAnimation(0, idleName, true);
    if (name !== idleName) {
      const expression = state.setAnimation(1, name, loop);
      expression.mixDuration = 0.18;
      if (!loop && returnToIdle) state.addEmptyAnimation(1, 0.2, 0);
    }
    return true;
  };
  const dispose = () => {
    disposed = true;
    cancelAnimationFrame(frame);
    observer?.disconnect();
    document.removeEventListener('visibilitychange', resume);
    texture?.dispose();
    renderer?.dispose();
  };
  loadResources().then(([atlasText, binary, image]) => {
    if (disposed || !canvas.isConnected) return;
    const gl = canvas.getContext('webgl2', { alpha: true, premultipliedAlpha: true }) || canvas.getContext('webgl', { alpha: true, premultipliedAlpha: true });
    if (!gl) throw new Error('无法打开阿罗娜动态立绘画布');
    renderer = new SceneRenderer(canvas, gl);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    texture = new GLTexture(gl, image);
    const atlas = new TextureAtlas(atlasText);
    for (const page of atlas.pages) page.texture = texture;
    for (const region of atlas.regions) region.texture = texture;
    const data = new SkeletonBinary(new AtlasAttachmentLoader(atlas)).readSkeletonData(binary);
    const skeleton = new Skeleton(data);
    state = new AnimationState(new AnimationStateData(data));
    availableNames = data.animations.map(animation => animation.name);
    idleName = availableNames.find(name => name === 'Idle_01') || availableNames.find(name => /idle/i.test(name)) || availableNames[0];
    if (pendingAnimation && availableNames.includes(pendingAnimation.name)) play(pendingAnimation.name, pendingAnimation);
    else if (idleName) play(idleName, { loop: true });
    pendingAnimation = null;
    state.apply(skeleton);
    skeleton.updateWorldTransform(Physics.update);
    const bounds = skeleton.getBoundsRect();
    if (!bounds.width || !bounds.height) throw new Error('阿罗娜立绘未找到可显示的骨骼');
    const paint = now => {
      if (disposed || !canvas.isConnected) return;
      const rect = canvas.getBoundingClientRect();
      if (rect.width && rect.height) {
        const pixelRatio = Math.min(devicePixelRatio || 1, 2);
        const width = Math.round(rect.width * pixelRatio);
        const height = Math.round(rect.height * pixelRatio);
        if (canvas.width !== width || canvas.height !== height) {
          canvas.width = width;
          canvas.height = height;
          gl.viewport(0, 0, width, height);
          renderer.camera.setViewport(width, height);
        }
        state.update(last ? Math.min((now - last) / 1000, 0.05) : 0);
        skeleton.setToSetupPose();
        state.apply(skeleton);
        skeleton.updateWorldTransform(Physics.update);
        const scale = Math.min(width * 0.92 / Math.max(bounds.width, 1), height * 1.65 / Math.max(bounds.height, 1));
        renderer.camera.zoom = 1 / scale;
        renderer.camera.position.x = bounds.x + bounds.width * 0.5;
        renderer.camera.position.y = bounds.y + bounds.height * 0.72;
        gl.clearColor(0, 0, 0, 0);
        gl.clear(gl.COLOR_BUFFER_BIT);
        renderer.begin();
        renderer.drawSkeleton(skeleton, false);
        renderer.end();
      }
      last = now;
      frame = document.hidden ? 0 : requestAnimationFrame(paint);
    };
    observer = new IntersectionObserver(entries => { if (entries[0]?.isIntersecting && !disposed && !frame) { last = 0; frame = requestAnimationFrame(paint); } else if (!entries[0]?.isIntersecting) { cancelAnimationFrame(frame); frame = 0; } });
    observer.observe(canvas);
    resume = () => { if (!document.hidden && !disposed && canvas.isConnected && !frame) { last = 0; frame = requestAnimationFrame(paint); } };
    document.addEventListener('visibilitychange', resume);
  }).catch(error => { if (!disposed) console.error('[Blue Archive][阿罗娜动态立绘]', error); });
  return Object.assign(dispose, { play, getAnimations: () => [...availableNames] });
}
