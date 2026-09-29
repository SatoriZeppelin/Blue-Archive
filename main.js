import { assets, bindAssets } from './resources/assets.js';
import { createStory } from './story.js';
import { createApiSettings } from './api-settings.js';
import { api } from './api.js';

bindAssets();

(() => {
  const overlay = document.getElementById('loading');
  const message = document.getElementById('loading-message');
  const error = document.getElementById('loading-error');
  const retry = document.getElementById('loading-retry');
  const loadingReady = document.getElementById('loading-ready');
  const video = document.querySelector('.background video');
  const essentialImages = [document.querySelector('.logo'), document.querySelector('.loading-now')];
  const bgm = document.getElementById('title-bgm');
  const titleCall = document.getElementById('title-call');
  const loginSound = document.getElementById('ui-login');
  const touchSound = document.getElementById('ui-touch');
  const loadingSound = document.getElementById('ui-loading');
  const startButtons = document.querySelectorAll('.start-menu button');
  const controls = document.querySelectorAll('.left-controls button');
  const apiSettings = createApiSettings();
  document.getElementById('api-settings-trigger').addEventListener('click', () => apiSettings.open());
  const soundToggle = document.getElementById('sound-toggle');
  const fullscreenToggle = document.getElementById('fullscreen-toggle');
  const sounds = [bgm, titleCall, loginSound, touchSound, loadingSound];
  const timeoutMs = 45000;
  const noticeOverlay = document.getElementById('notice-overlay');
  const noticePanel = noticeOverlay.querySelector('.notice-panel');
  const noticeTrigger = document.getElementById('notice-trigger');
  const noticeClose = document.getElementById('notice-close');
  const noticeSuppress = document.getElementById('notice-suppress');
  const noticeTabs = [...noticeOverlay.querySelectorAll('.notice-tab')];
  const noticeContent = document.getElementById('notice-content');
  const version = document.getElementById('version').textContent.trim();
  const suppressedVersionKey = `blue-archive:notice:suppressed:${version}`;
  console.info('[Blue Archive][诊断已启用]', { page: location.href, version, assets });
  let noticePending = false;
  let noticeReturnFocus = null;
  let attempt = 0;
  let timer;
  let readyTimer;
  let callAttempted = false;
  let callFinished = false;
  let bgmStarted = false;
  let bgmStarting = false;
  const soundPreferenceKey = 'blue-archive:sound:muted';
  let soundMuted = false;
  try { soundMuted = localStorage.getItem(soundPreferenceKey) === '1'; } catch (_) {}
  sounds.forEach(audio => { audio.muted = soundMuted; });
  soundToggle.setAttribute('aria-pressed', String(soundMuted));
  soundToggle.setAttribute('aria-label', soundMuted ? '开启声音' : '关闭声音');
  soundToggle.title = soundMuted ? '开启声音' : '关闭声音';
  let titleAudioEnabled = true;
  let storyActive = false;
  let screenReady = false;
  let isStarting = false;
  const assetStates = new Map();
  const logAsset = (status, key, url, detail = {}) => {
    const output = `[Blue Archive][资源] ${status}: ${key}`;
    assetStates.set(key, { status, url, ...detail });
    (status === '失败' ? console.error : console.info)(output, { url, ...detail });
  };

  async function checkAssetResponses() {
    await Promise.all(Object.entries(assets).filter(([key]) => !['creativeCommonsLicense', 'storyBackground', 'storyBackgroundInside', 'storyRinPortrait', 'storyShirokoPortrait', 'storyHoshinoPortrait', 'storySerikaPortrait', 'storyAyanePortrait', 'storyNonomiPortrait', 'prologueCGOpening', 'prologueCGNext', 'prologueAronaCG', 'prologueOpeningVideo'].includes(key)).map(async ([key, url]) => {
      try {
        const response = await fetch(url, { method: 'HEAD', cache: 'no-store' });
        (response.ok ? console.info : console.error)(`[Blue Archive][HTTP] ${key}`, { status: response.status, ok: response.ok, url, redirectedTo: response.url, contentType: response.headers.get('Content-Type') });
      } catch (reason) {
        console.error(`[Blue Archive][HTTP] ${key} 请求失败`, { url, reason });
      }
    }));
  }

  function monitorResources() {
    document.querySelectorAll('img[data-asset]').forEach(image => {
      const key = image.dataset.asset;
      const url = assets[key];
      const loaded = () => logAsset('完成', key, url, { type: 'image', width: image.naturalWidth, height: image.naturalHeight });
      const failed = () => logAsset('失败', key, url, { type: 'image', naturalWidth: image.naturalWidth });
      image.addEventListener('load', loaded);
      image.addEventListener('error', failed);
      if (image.complete) queueMicrotask(() => image.naturalWidth ? loaded() : failed());
      else logAsset('等待', key, url, { type: 'image' });
    });

    document.querySelectorAll('audio[data-asset]').forEach(audio => {
      const key = audio.dataset.asset;
      const url = assets[key];
      audio.addEventListener('canplay', () => logAsset('完成', key, url, { type: 'audio', readyState: audio.readyState }), { once: true });
      audio.addEventListener('error', () => logAsset('失败', key, url, { type: 'audio', code: audio.error?.code, message: audio.error?.message, networkState: audio.networkState }));
      if (audio.error) logAsset('失败', key, url, { type: 'audio', code: audio.error.code, message: audio.error.message });
      else if (audio.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) logAsset('完成', key, url, { type: 'audio', readyState: audio.readyState });
      else logAsset('等待', key, url, { type: 'audio' });
    });

    const source = video.querySelector('source');
    const videoKey = source.dataset.asset;
    const videoUrl = assets[videoKey];
    video.addEventListener('loadeddata', () => logAsset('完成', videoKey, videoUrl, { type: 'video', readyState: video.readyState, width: video.videoWidth, height: video.videoHeight }), { once: true });
    video.addEventListener('error', () => logAsset('失败', videoKey, videoUrl, { type: 'video', code: video.error?.code, message: video.error?.message, networkState: video.networkState }));
    source.addEventListener('error', () => logAsset('失败', videoKey, videoUrl, { type: 'video-source', networkState: video.networkState }));
    if (video.error) logAsset('失败', videoKey, videoUrl, { type: 'video', code: video.error.code, message: video.error.message });
    else if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) logAsset('完成', videoKey, videoUrl, { type: 'video', readyState: video.readyState });
    else logAsset('等待', videoKey, videoUrl, { type: 'video' });

    document.querySelectorAll('[data-asset-background]').forEach(element => {
      const key = element.dataset.assetBackground;
      const url = assets[key];
      const probe = new Image();
      probe.onload = () => logAsset('完成', key, url, { type: 'background', width: probe.naturalWidth, height: probe.naturalHeight });
      probe.onerror = () => logAsset('失败', key, url, { type: 'background' });
      logAsset('等待', key, url, { type: 'background' });
      probe.src = url;
    });
  }

  monitorResources();
  window.baAssetStatus = () => {
    const report = Object.fromEntries(assetStates);
    console.info('[Blue Archive][资源状态汇总]', report);
    return report;
  };

  function playBgm() {
    if (!screenReady || !titleAudioEnabled || storyActive || soundMuted || !callFinished || bgmStarted || bgmStarting) return;
    bgmStarting = true;
    bgm.play().then(() => {
      bgmStarted = true;
      if (!titleAudioEnabled || storyActive || soundMuted) bgm.pause();
    }).catch(() => {}).finally(() => { bgmStarting = false; });
  }

  function playSound(audio) {
    if (soundMuted || audio.error || audio.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) return;
    audio.currentTime = 0;
    audio.play().catch(() => {});
  }

  function finishTitleCall() {
    if (callFinished || !titleAudioEnabled || storyActive || soundMuted) return;
    callFinished = true;
    titleCall.removeEventListener('ended', finishTitleCall);
    playBgm();
  }

  function playTitleCall() {
    if (!screenReady || !titleAudioEnabled || storyActive || soundMuted || callAttempted || callFinished) return;
    if (titleCall.error) { finishTitleCall(); return; }
    callAttempted = true;
    titleCall.addEventListener('ended', finishTitleCall, { once: true });
    const playback = titleCall.play();
    if (!playback) return;
    playback.catch(reason => {
      callAttempted = false;
      titleCall.removeEventListener('ended', finishTitleCall);
      if (!titleAudioEnabled || storyActive || soundMuted) return;
      if (reason.name !== 'NotAllowedError') {
        console.warn('[Blue Archive][标题语音播放失败]', { reason, url: assets.titleCall });
        finishTitleCall();
      }
    });
  }

  function unlockSound() {
    if (!screenReady || soundMuted || !titleAudioEnabled || storyActive) return;
    if (!callFinished) playTitleCall();
    else playBgm();
  }

  function enterScreen() {
    if (!screenReady || !overlay.classList.contains('ready')) return;
    clearTimeout(readyTimer);
    overlay.classList.remove('ready');
    overlay.classList.add('hidden');
    loadingReady.hidden = true;
    if (videoAvailable) video.play().catch(reason => console.warn('[Blue Archive][视频播放失败]', { reason, url: assets.titleVideo, code: video.error?.code, message: video.error?.message }));
    if (noticePending) openNotice();
    unlockSound();
  }

  async function cacheResources() {
    if (!('serviceWorker' in navigator) || !window.isSecureContext || location.protocol === 'file:') return;
    try {
      const registrations = await navigator.serviceWorker.getRegistrations();
      await Promise.all(registrations.filter(registration => registration.active?.scriptURL.endsWith('/resources/cache-sw.js')).map(registration => registration.unregister()));
      await navigator.serviceWorker.register('./cache-sw.js', { scope: './' });
      await navigator.serviceWorker.ready;
      if (!navigator.serviceWorker.controller && !sessionStorage.getItem('blue-archive:sw-reload-v3')) {
        sessionStorage.setItem('blue-archive:sw-reload-v3', '1');
        window.location.reload();
      }
    } catch (reason) {
      console.error('[Blue Archive][缓存初始化失败]', { reason, page: location.href });
    }
  }

  function waitForImage(image) {
    const key = image.dataset.asset;
    return new Promise((resolve, reject) => {
      const failed = () => reject(new Error(`${key} 图片加载失败: ${image.currentSrc || image.src}`));
      if (image.complete) {
        image.naturalWidth ? resolve() : failed();
        return;
      }
      const cleanup = () => {
        image.removeEventListener('load', loaded);
        image.removeEventListener('error', onError);
      };
      const loaded = () => { cleanup(); resolve(); };
      const onError = () => { cleanup(); failed(); };
      image.addEventListener('load', loaded, { once: true });
      image.addEventListener('error', onError, { once: true });
    });
  }

  const releaseNotes = noticeContent.innerHTML;

  function selectNoticeTab(tab) {
    noticeTabs.forEach(item => {
      const active = item === tab;
      item.classList.toggle('active', active);
      item.setAttribute('aria-selected', String(active));
    });
    noticeContent.setAttribute('aria-labelledby', tab.id);
    noticeContent.innerHTML = tab === noticeTabs[0] ? releaseNotes : `<div class="notice-empty">${tab === noticeTabs[1] ? '暂无活动' : '暂无问题'}</div>`;
  }

  function openNotice() {
    noticeReturnFocus = document.activeElement;
    try { noticeSuppress.checked = localStorage.getItem(suppressedVersionKey) === '1'; }
    catch (_) { noticeSuppress.checked = false; }
    noticeOverlay.hidden = false;
    noticePanel.focus();
    noticePending = false;
  }

  function closeNotice() {
    try {
      if (noticeSuppress.checked) localStorage.setItem(suppressedVersionKey, '1');
      else localStorage.removeItem(suppressedVersionKey);
    } catch (_) {}
    noticeOverlay.hidden = true;
    noticeReturnFocus?.focus?.();
  }

  function showLoadingError(text) {
    overlay.classList.add('retry');
    message.textContent = text;
    error.hidden = false;
  }

  let videoAvailable = false;

  function waitForVideo() {
    if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
      videoAvailable = true;
      return Promise.resolve();
    }
    return new Promise(resolve => {
      const source = video.querySelector('source');
      const cleanup = () => {
        video.removeEventListener('loadeddata', loaded);
        video.removeEventListener('error', failed);
        source.removeEventListener('error', failed);
      };
      const loaded = () => { cleanup(); videoAvailable = true; resolve(); };
      const failed = () => {
        cleanup();
        videoAvailable = false;
        console.warn('[Blue Archive][标题视频不可用] 使用背景图片', { url: assets.titleVideo, code: video.error?.code, networkState: video.networkState });
        resolve();
      };
      video.addEventListener('loadeddata', loaded, { once: true });
      video.addEventListener('error', failed, { once: true });
      source.addEventListener('error', failed, { once: true });
      if (video.error || video.networkState === HTMLMediaElement.NETWORK_NO_SOURCE) video.load();
      else if (video.networkState === HTMLMediaElement.NETWORK_EMPTY) video.load();
      if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) loaded();
    });
  }

  function waitForAudio(audio) {
    if (audio.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA || audio.error) return Promise.resolve();
    return new Promise(resolve => {
      const done = () => {
        audio.removeEventListener('canplay', done);
        audio.removeEventListener('error', done);
        resolve();
      };
      audio.addEventListener('canplay', done, { once: true });
      audio.addEventListener('error', done, { once: true });
      audio.load();
    });
  }

  function waitForBackground() {
    const background = document.querySelector('[data-asset-background]');
    return new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = resolve;
      image.onerror = () => reject(new Error('标题背景加载失败'));
      image.src = assets[background.dataset.assetBackground];
    });
  }

  function start() {
    const current = ++attempt;
    clearTimeout(timer);
    clearTimeout(readyTimer);
    screenReady = false;
    videoAvailable = video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA;
    loadingReady.hidden = true;
    overlay.classList.remove('hidden', 'retry', 'ready');
    error.hidden = true;
    console.info('[Blue Archive][启动] 开始加载', { attempt: current, required: [...essentialImages.map(image => image.dataset.asset), 'titlePoster', 'titleVideo', 'titleCall'], serviceWorker: navigator.serviceWorker?.controller?.scriptURL || null });
    const resources = Promise.all([...essentialImages.map(waitForImage), waitForBackground(), waitForVideo(), waitForAudio(titleCall)]);
    Promise.race([resources, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('加载超时')), timeoutMs); })]).then(() => {
      if (current !== attempt) return;
      clearTimeout(timer);
      screenReady = true;
      overlay.classList.add('ready');
      loadingReady.hidden = false;
      console.info('[Blue Archive][启动完成]', { attempt: current, logo: essentialImages[0].naturalWidth, video: video.readyState, titleCall: titleCall.readyState });
      readyTimer = setTimeout(enterScreen, 900);
    }).catch(reason => {
      if (current !== attempt) return;
      clearTimeout(timer);
      console.error('[Blue Archive][启动失败] 必需资源加载失败', { reason, attempt: current, images: essentialImages.map(image => ({ key: image.dataset.asset, src: image.currentSrc || image.src, complete: image.complete, naturalWidth: image.naturalWidth })), video: { readyState: video.readyState, networkState: video.networkState, code: video.error?.code, message: video.error?.message } });
      showLoadingError(reason.message === '加载超时' ? '加载超时，请重试' : '资源加载失败，请重试');
    });
  }

  function animateTopButton(button) {
    button.classList.remove('ba-clicked');
    void button.offsetWidth;
    button.classList.add('ba-clicked');
    setTimeout(() => button.classList.remove('ba-clicked'), 280);
  }

  soundToggle.addEventListener('click', () => {
    const nextMuted = !soundMuted;
    soundMuted = nextMuted;
    sounds.forEach(audio => { audio.muted = soundMuted; });
    try { localStorage.setItem(soundPreferenceKey, soundMuted ? '1' : '0'); } catch (_) {}
    if (soundMuted) {
      bgm.pause();
      titleCall.pause();
      titleCall.removeEventListener('ended', finishTitleCall);
      if (!callFinished) callAttempted = false;
    } else {
      playSound(touchSound);
      if (!callFinished && !storyActive && titleAudioEnabled) playTitleCall();
      else playBgm();
    }
    animateTopButton(soundToggle);
    soundToggle.setAttribute('aria-pressed', String(soundMuted));
    soundToggle.setAttribute('aria-label', soundMuted ? '开启声音' : '关闭声音');
    soundToggle.title = soundMuted ? '开启声音' : '关闭声音';
  });

  fullscreenToggle.addEventListener('click', async () => {
    playSound(touchSound);
    animateTopButton(fullscreenToggle);
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await document.documentElement.requestFullscreen();
    } catch (reason) {
      console.warn('[Blue Archive][全屏切换失败]', { reason });
    }
  });

  document.addEventListener('fullscreenchange', () => {
    const label = document.fullscreenElement ? '退出全屏' : '进入全屏';
    fullscreenToggle.setAttribute('aria-label', label);
    fullscreenToggle.title = label;
  });

  loadingReady.addEventListener('click', enterScreen);
  noticeTrigger.addEventListener('click', openNotice);
  noticeClose.addEventListener('click', closeNotice);
  noticeSuppress.addEventListener('change', () => {
    try {
      if (noticeSuppress.checked) localStorage.setItem(suppressedVersionKey, '1');
      else localStorage.removeItem(suppressedVersionKey);
    } catch (_) {}
  });
  noticeTabs.forEach(tab => tab.addEventListener('click', () => selectNoticeTab(tab)));
  noticeOverlay.addEventListener('click', event => {
    if (event.target === noticeOverlay) closeNotice();
  });
  noticeOverlay.addEventListener('keydown', event => {
    if (event.key === 'Escape') closeNotice();
    if (event.key !== 'Tab') return;
    const focusable = [noticeClose, ...noticeTabs, noticeContent, noticeSuppress];
    const current = focusable.indexOf(document.activeElement);
    if (event.shiftKey && current <= 0) { event.preventDefault(); focusable.at(-1).focus(); }
    else if (!event.shiftKey && current === focusable.length - 1) { event.preventDefault(); focusable[0].focus(); }
  });

  const story = createStory({
    touch: () => playSound(touchSound),
    onExit: () => {
      storyActive = false;
      titleAudioEnabled = true;
      if (videoAvailable) video.play().catch(() => {});
      playBgm();
    }
  });
  window.baGal = {
    enter: options => story.enter(options),
    save: () => story.save(),
    generate: text => story.generate(text),
    state: () => story.getState(),
    parse: text => story.parseGal(text),
    tablet: story.tablet,
    settings: () => apiSettings.open(),
    api
  };
  startButtons.forEach(button => button.addEventListener('click', () => {
    if (isStarting || storyActive) return;
    unlockSound();
    isStarting = true;
    playSound(loginSound);
    if (button.id === 'save-game') {
      playSound(loadingSound);
      isStarting = false;
      return;
    }
    if (button.id === 'continue-game' && !story.hasSave()) {
      playSound(loadingSound);
      isStarting = false;
      return;
    }
    noticeOverlay.hidden = true;
    storyActive = true;
    titleAudioEnabled = false;
    titleCall.pause();
    titleCall.removeEventListener('ended', finishTitleCall);
    callFinished = true;
    bgm.pause();
    video.pause();
    setTimeout(() => {
      playSound(loadingSound);
      story.enter({ resume: button.id === 'continue-game' });
      isStarting = false;
    }, 240);
  }));

  controls.forEach(button => button.addEventListener('click', () => {
    unlockSound();
    playSound(touchSound);
  }));

  document.addEventListener('pointerdown', unlockSound);
  document.addEventListener('keydown', unlockSound);

  retry.addEventListener('click', () => {
    console.info('[Blue Archive][重试]');
    essentialImages.filter(image => !image.naturalWidth).forEach(image => {
      const url = new URL(image.src);
      url.searchParams.set('retry', Date.now());
      console.info('[Blue Archive][资源] 重新请求', { key: image.dataset.asset, url: url.href });
      image.src = url.href;
    });
    start();
  });
  try { noticePending = localStorage.getItem(suppressedVersionKey) !== '1'; }
  catch (_) { noticePending = true; }
  window.addEventListener('error', event => {
    if (event.target !== window) {
      const element = event.target;
      console.error('[Blue Archive][资源错误事件]', { tag: element?.tagName, key: element?.dataset?.asset || element?.dataset?.assetBackground, url: element?.currentSrc || element?.src || element?.href || null });
    } else console.error('[Blue Archive][脚本错误]', { message: event.message, filename: event.filename, line: event.lineno, column: event.colno, error: event.error });
  }, true);
  window.addEventListener('unhandledrejection', event => console.error('[Blue Archive][未处理异常]', event.reason));
  cacheResources();
  checkAssetResponses();
  start();
})();
