const baseUrl = 'https://huggingface.co/think-denim-frisk/BlueArchive/resolve/main/resources';

export const assets = Object.freeze({
  storyBackground: `${baseUrl}/背景/BG_UpperOffice.jpg`,
  storyBackgroundInside: `${baseUrl}/背景/BG_MainOffice.jpg`,
  storyRinPortrait: `${baseUrl}/立绘/Rin_00.png`,
  storyShirokoPortrait: `${baseUrl}/立绘/Shiroko_00.png`,
  storyHoshinoPortrait: `${baseUrl}/立绘/Hoshino_00.png`,
  storySerikaPortrait: `${baseUrl}/立绘/Serika_00.png`,
  storyAyanePortrait: `${baseUrl}/立绘/Ayane_00.png`,
  storyNonomiPortrait: `${baseUrl}/立绘/Nonomi_00.png`,
  prologueCGOpening: `${baseUrl}/CG/BG_CS_PR_00.jpg`,
  prologueCGNext: `${baseUrl}/CG/BG_CS_PR_01.jpg`,
  prologueAronaCG: `${baseUrl}/CG/BG_CS_Arona.jpg`,
  prologueOpeningVideo: `${baseUrl}/视频/10000_Title_Video.mp4`,
  titleVideo: `${baseUrl}/视频/title-browser.mp4`,
  titlePoster: `${baseUrl}/背景/title-poster.jpg`,
  logoEnglish: `${baseUrl}/其他/logo-en.png`,
  licenseCC: `${baseUrl}/其他/cc.png`,
  licenseBY: `${baseUrl}/其他/by.png`,
  licenseNC: `${baseUrl}/其他/nc.png`,
  licenseSA: `${baseUrl}/其他/sa.png`,
  titleBgm: `${baseUrl}/BGM/Theme_01_Constant_Moderato.ogg`,
  titleCall: `${baseUrl}/语音/Shiroko_Title.ogg`,
  loginSfx: `${baseUrl}/音效/UI_Login.wav`,
  touchSfx: `${baseUrl}/音效/UI_Button_Touch.wav`,
  loadingSfx: `${baseUrl}/音效/UI_Loading.wav`,
  loadingArona: `${baseUrl}/其他/arona-loading.png`,
  loadingNow: `${baseUrl}/其他/now-loading.png`,
  noticeTitle: `${baseUrl}/其他/schale-news.png`,
  noticeTab: `${baseUrl}/其他/tab-category.png`,
  noticeClose: `${baseUrl}/其他/close.png`,
  creativeCommonsLicense: 'https://creativecommons.org/licenses/by-nc-sa/4.0/?ref=chooser-v1'
});

export function bindAssets(root = document) {
  root.querySelectorAll('[data-asset]').forEach(element => {
    const key = element.dataset.asset;
    if (!Object.hasOwn(assets, key)) throw new Error(`Unknown asset: ${key}`);
    element.src = assets[key];
  });

  root.querySelectorAll('[data-asset-background]').forEach(element => {
    const key = element.dataset.assetBackground;
    if (!Object.hasOwn(assets, key)) throw new Error(`Unknown asset: ${key}`);
    element.style.backgroundImage = `url("${assets[key]}")`;
  });

  root.querySelectorAll('[data-asset-url]').forEach(element => {
    const key = element.dataset.assetUrl;
    if (!Object.hasOwn(assets, key)) throw new Error(`Unknown asset: ${key}`);
    element.href = assets[key];
  });
}
