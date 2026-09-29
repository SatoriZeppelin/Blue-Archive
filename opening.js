import { assets } from './resources/assets.js';

export function createOpening({ isMuted, onComplete }) {
  const overlay = document.getElementById('story-opening');
  const video = document.getElementById('story-opening-video');
  const skip = document.getElementById('story-opening-skip');
  let active = false;
  let ending = false;
  let timer = 0;
  let playbackId = 0;

  function finish() {
    if (!active || ending) return;
    ending = true;
    clearTimeout(timer);
    video.pause();
    overlay.classList.remove('is-visible');
    setTimeout(() => {
      overlay.hidden = true;
      video.removeAttribute('src');
      video.load();
      active = false;
      ending = false;
      onComplete();
    }, 360);
  }

  function play() {
    if (active) return;
    active = true;
    ending = false;
    const current = ++playbackId;
    overlay.hidden = false;
    video.muted = isMuted();
    video.src = assets.prologueOpeningVideo;
    video.currentTime = 0;
    video.load();
    requestAnimationFrame(() => overlay.classList.add('is-visible'));
    timer = setTimeout(() => {
      if (video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
        console.warn('[Blue Archive][序章视频加载超时]');
        finish();
      }
    }, 20000);
    const attempt = video.play();
    attempt?.catch(reason => {
      if (!active || ending || current !== playbackId) return;
      console.warn('[Blue Archive][序章视频无法播放]', reason);
      finish();
    });
  }

  video.addEventListener('loadeddata', () => clearTimeout(timer));
  video.addEventListener('ended', finish);
  video.addEventListener('error', () => {
    if (!active || ending) return;
    console.warn('[Blue Archive][序章视频加载失败]', video.error);
    finish();
  });
  skip.addEventListener('click', finish);
  overlay.addEventListener('keydown', event => {
    if (event.key === 'Escape') finish();
  });

  return { play, setMuted: value => { video.muted = value; } };
}
