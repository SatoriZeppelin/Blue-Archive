import { api } from './api.js';
import { createTablet } from './tablet.js';
import { schools, students, dayLabel, clockLabel, dutyFor, resolveStudent } from './world.js';
import { portraits, aliases, backgrounds, cutscenes, demo, parseGal, buildMessages } from './scenario.js';

const SAVE_KEY = 'blue-archive:gal:save:1';
const clone = value => JSON.parse(JSON.stringify(value));
const canonical = who => aliases[who] || who;
const isNarration = who => !who || who === '旁白' || who === '旁白。';

export function createStory({ touch, onExit }) {
  const get = id => document.getElementById(id);
  const screen = get('story');
  const backdrop = get('story-backdrop');
  const character = get('story-character');
  const portrait = get('story-portrait');
  const chapter = screen.querySelector('.story-chapter');
  const name = get('story-name');
  const text = get('story-text');
  const next = get('story-next');
  const dialogue = get('story-dialogue');
  const autoButton = get('story-auto');
  const log = get('story-log');
  const logList = get('story-log-list');
  const menu = get('story-menu');
  const choices = get('story-choices');
  const status = get('story-status');
  const cg = get('story-cg');
  const cgPicture = get('story-cg-picture');
  const prompt = get('story-prompt');
  const promptForm = get('story-prompt-form');
  const promptInput = get('story-prompt-input');
  const generateButton = get('story-generate');
  const configButton = get('story-config');
  let modules = clone(demo);
  let branches = [];
  let history = [];
  let played = [];
  let index = 0;
  let position = 0;
  let typeTimer = 0;
  let autoTimer = 0;
  let request = null;
  let requestId = 0;
  let auto = false;
  let active = false;
  let transitioning = false;
  let busy = false;
  let streaming = false;
  let awaiting = false;
  let backgroundKey = '';
  let portraitUrl = '';
  let spriteToken = 0;
  const sprites = [portrait, portrait.cloneNode()];
  sprites[1].removeAttribute('id');
  portrait.after(sprites[1]);
  sprites[1].classList.add('story-portrait-layer');
  portrait.classList.add('story-portrait-layer');
  let front = sprites[0];
  let back = sprites[1];
  let advanceToken = 0;
  const tablet = createTablet({
    onOpen: () => { setAuto(false); stopTimers(); },
    onClose: () => { if (active && position < [...(modules[index]?.text || '')].length) typeTimer = setTimeout(writeNext, 100); },
    onChange: () => { if (active) save(); },
    getStoryContext: () => ({ who: modules[index]?.who })
  });

  function stopTimers() {
    clearTimeout(typeTimer);
    clearTimeout(autoTimer);
  }

  function setAuto(value) {
    auto = !!value;
    autoButton.setAttribute('aria-pressed', String(auto));
    clearTimeout(autoTimer);
    if (auto) scheduleAuto();
  }

  function scheduleAuto() {
    clearTimeout(autoTimer);
    if (!auto || !active || tablet.isOpen() || busy || awaiting || !choices.hidden || !prompt.hidden || !menu.hidden || !log.hidden || screen.classList.contains('ui-hidden')) return;
    if (index < modules.length - 1 && position >= [...modules[index].text].length) autoTimer = setTimeout(advance, 1600);
  }

  function setStatus(value) {
    status.textContent = value || '';
    status.hidden = !value;
  }

  function paintBackground(key) {
    const url = backgrounds[key] || backgrounds['联邦学生会'];
    if (!url || (backgroundKey === key && backdrop.style.backgroundImage)) return;
    backgroundKey = key;
    backdrop.style.backgroundImage = `url("${url}")`;
    chapter.textContent = key === '联邦学生会室' ? '連邦生徒会室' : '連邦生徒会室・ロビー';
  }

  function paintPortrait(who) {
    const url = portraits[canonical(who)] || '';
    if (url === portraitUrl) return Promise.resolve();
    portraitUrl = url;
    const token = ++spriteToken;
    if (!url) {
      front.classList.remove('is-on');
      back.classList.remove('is-on');
      character.style.opacity = '0';
      return Promise.resolve();
    }
    character.style.opacity = '1';
    return new Promise(resolve => {
      const image = new Image();
      const timeout = setTimeout(() => finish(), 3500);
      let settled = false;
      function finish() {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        if (token === spriteToken) {
          back.src = url;
          back.classList.add('is-on');
          front.classList.remove('is-on');
          [front, back] = [back, front];
        }
        resolve();
      }
      image.onload = () => image.decode?.().then(finish, finish) || finish();
      image.onerror = finish;
      image.src = url;
      if (image.complete) finish();
    });
  }

  function paintCg(key) {
    const url = cutscenes[key] || '';
    cgPicture.style.backgroundImage = url ? `url("${url}")` : '';
    cg.hidden = !url;
    character.hidden = !!url;
  }

  function preloadNext() {
    for (const module of modules.slice(index + 1, index + 3)) {
      const url = portraits[canonical(module?.who)];
      if (url) { const image = new Image(); image.src = url; }
    }
  }

  function writeNext() {
    if (!active || tablet.isOpen() || !modules[index] || !log.hidden || !menu.hidden) return;
    const chars = [...modules[index].text];
    if (position >= chars.length) {
      next.hidden = false;
      if (index === modules.length - 1) showBranches();
      scheduleAuto();
      return;
    }
    const char = chars[position++];
    text.textContent += char;
    typeTimer = setTimeout(writeNext, /[。！？]/.test(char) ? 180 : 38);
  }

  function showBranches() {
    if (busy || streaming || !branches.length || index !== modules.length - 1 || position < [...modules[index].text].length) return;
    choices.replaceChildren();
    branches.forEach(choice => {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = choice;
      button.addEventListener('click', () => { touch(); choices.hidden = true; generate(choice); });
      choices.append(button);
    });
    choices.hidden = false;
    clearTimeout(autoTimer);
  }

  async function displayLine() {
    if (!active || !modules[index]) return;
    const token = ++advanceToken;
    stopTimers();
    choices.hidden = true;
    position = 0;
    next.hidden = true;
    text.textContent = '';
    const line = modules[index];
    const who = canonical(line.who || line.name);
    name.textContent = isNarration(who) ? '' : who;
    name.hidden = isNarration(who);
    paintBackground(line.bg || backgroundKey || '联邦学生会');
    paintCg(line.cg);
    preloadNext();
    await paintPortrait(who);
    if (token !== advanceToken || !active) return;
    if (!tablet.isOpen()) typeTimer = setTimeout(writeNext, 100);
  }

  function remember(line) {
    if (!line) return;
    const entry = { who: canonical(line.who || line.name), text: String(line.text || '') };
    if (!played.length || played.at(-1).source !== line) played.push({ ...entry, source: line });
  }

  function advance() {
    if (!active || tablet.isOpen() || !log.hidden || !menu.hidden || !prompt.hidden || !choices.hidden || screen.classList.contains('ui-hidden')) return;
    touch();
    stopTimers();
    const line = modules[index];
    if (!line) return;
    const chars = [...line.text];
    if (position < chars.length) {
      position = chars.length;
      text.textContent = line.text;
      next.hidden = false;
      if (index === modules.length - 1) showBranches();
      scheduleAuto();
      return;
    }
    remember(line);
    if (index < modules.length - 1) { index++; displayLine(); return; }
    if (busy || streaming) { awaiting = true; setStatus('正在等待后续剧情…'); return; }
    if (branches.length) { showBranches(); return; }
    setAuto(false);
    prompt.hidden = false;
    promptInput.focus();
  }

  function cancelRequest() {
    requestId++;
    request?.abort();
    request = null;
    busy = false;
    streaming = false;
    awaiting = false;
    setStatus('');
  }

  async function generate(userText = '请根据当前状态继续演出下一轮剧情。') {
    if (!active || busy || tablet.isOpen()) return;
    const wasPromptOpen = !prompt.hidden;
    prompt.hidden = true;
    choices.hidden = true;
    menu.hidden = true;
    setAuto(false);
    const controller = new AbortController();
    request = controller;
    const token = ++requestId;
    const previous = modules;
    const previousPosition = position;
    const previousText = text.textContent;
    const previousIndex = index;
    const previousBranches = branches;
    const previousPlayed = [...played];
    const previousBackground = backgroundKey;
    const nextHistory = [...history, { role: 'user', content: userText }];
    const config = api.resolveConfig('main');
    const world = tablet.getWorld();
    const duty = students[dutyFor(world)]?.name || '';
    const location = `${schools[world.school].name} · ${schools[world.school].places[world.place]}`;
    const studentLocations = Object.entries(students).map(([id, student]) => {
      const result = resolveStudent(world, id);
      return `${student.name}：${schools[result.school].name} / ${schools[result.school].places[result.place]}`;
    }).join('；');
    const worldContext = `游戏世界确定状态：${dayLabel(world)} ${clockLabel(world)}；老师当前位置：${location}；今日值日生：${duty}；学生位置：${studentLocations}。只作为场景参考，不得凭空更改位置或排班。`;
    busy = true;
    streaming = !!config.stream;
    awaiting = false;
    branches = [];
    generateButton.disabled = true;
    setStatus('剧情生成中…');
    let started = false;
    const receive = accumulated => {
      if (token !== requestId || !active || !streaming) return;
      const partial = parseGal(accumulated, { partial: true });
      if (!partial.modules.length) return;
      if (!started) {
        if (previousIndex < previous.length) remember(previous[previousIndex]);
        modules = partial.modules;
        index = 0;
        started = true;
        displayLine();
      } else {
        const current = modules[index];
        modules = partial.modules;
        if (current && modules[index] && current.text !== modules[index].text && position >= [...current.text].length) displayLine();
      }
      if (awaiting && index < modules.length - 1) { remember(modules[index]); awaiting = false; setStatus(''); index++; displayLine(); }
    };
    try {
      const raw = await api.chat({ route: 'main', messages: [{ role: 'system', content: worldContext }, ...buildMessages(history, userText)], signal: controller.signal, onDelta: receive });
      if (token !== requestId || !active) return;
      const parsed = parseGal(raw);
      if (started && index >= parsed.modules.length) index = parsed.modules.length - 1;
      if (started && position > [...(parsed.modules[index]?.text || '')].length) position = [...(parsed.modules[index]?.text || '')].length;
      modules = parsed.modules;
      branches = parsed.choices;
      history = [...nextHistory, { role: 'assistant', content: raw }];
      tablet.advance(15);
      busy = false;
      streaming = false;
      request = null;
      generateButton.disabled = false;
      setStatus('');
      if (!started) { if (previousIndex < previous.length) remember(previous[previousIndex]); index = 0; displayLine(); }
      else if (awaiting && index < modules.length - 1) { remember(modules[index]); awaiting = false; index++; displayLine(); }
      else if (awaiting) { awaiting = false; showBranches(); if (choices.hidden) { prompt.hidden = false; promptInput.focus(); } }
      else if (index === modules.length - 1) showBranches();
    } catch (error) {
      if (token !== requestId || !active) return;
      cancelRequest();
      generateButton.disabled = false;
      modules = previous; index = previousIndex; branches = previousBranches; played = previousPlayed; backgroundKey = previousBackground; portraitUrl = '';
      if (started) displayLine().then(() => { stopTimers(); position = previousPosition; text.textContent = previousText; next.hidden = position < [...modules[index].text].length; });
      setStatus(error.name === 'AbortError' ? '' : `生成失败：${error.message}`);
      prompt.hidden = wasPromptOpen || (!previousBranches.length && previousIndex === previous.length - 1) ? false : true;
      promptInput.value = userText.startsWith('请根据') ? '' : userText;
      if (prompt.hidden) showBranches();
      console.error('[Blue Archive][剧情生成失败]', error);
    }
  }

  function save() {
    if (!active) return false;
    const state = { version: 2, modules, branches, history, index, played: played.map(({ source, ...entry }) => entry), backgroundKey, tablet: tablet.snapshot(), timestamp: Date.now() };
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(state)); return true; }
    catch (_) { return false; }
  }

  function hasSave() {
    try { return !!localStorage.getItem(SAVE_KEY); }
    catch (_) { return false; }
  }

  function closePanels() {
    log.hidden = true;
    menu.hidden = true;
    prompt.hidden = true;
    choices.hidden = true;
  }

  function enter({ resume = false } = {}) {
    if (active || transitioning) return;
    transitioning = true;
    cancelRequest();
    let state;
    if (resume) {
      try { state = JSON.parse(localStorage.getItem(SAVE_KEY) || 'null'); }
      catch (_) {}
    }
    modules = Array.isArray(state?.modules) && state.modules.length ? state.modules : clone(demo);
    branches = Array.isArray(state?.branches) ? state.branches : [];
    history = Array.isArray(state?.history) ? state.history : [];
    played = Array.isArray(state?.played) ? state.played : [];
    index = Math.max(0, Math.min(Number(state?.index) || 0, modules.length - 1));
    backgroundKey = state?.backgroundKey || '';
    tablet.restore(state?.tablet);
    portraitUrl = '';
    setAuto(false);
    closePanels();
    front.classList.remove('is-on');
    back.classList.remove('is-on');
    screen.classList.remove('ui-hidden');
    get('story-reveal').hidden = true;
    active = true;
    screen.hidden = false;
    if (resume && state && !state.tablet) save();
    displayLine();
    requestAnimationFrame(() => requestAnimationFrame(() => {
      screen.classList.add('is-visible');
      setTimeout(() => { transitioning = false; }, 490);
    }));
  }

  function exit() {
    if (!active || transitioning) return;
    transitioning = true;
    save();
    active = false;
    tablet.close();
    cancelRequest();
    stopTimers();
    setAuto(false);
    closePanels();
    screen.classList.remove('is-visible');
    setTimeout(() => {
      screen.hidden = true;
      transitioning = false;
      onExit();
    }, 490);
  }

  get('story-advance').addEventListener('click', advance);
  dialogue.addEventListener('click', event => { if (!event.target.closest('.story-extra')) advance(); });
  dialogue.addEventListener('keydown', event => {
    if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); advance(); }
  });
  autoButton.addEventListener('click', () => { touch(); setAuto(!auto); });
  get('story-skip').addEventListener('click', () => {
    touch(); setAuto(false);
    if (!modules.length) return;
    index = modules.length - 1;
    displayLine().then(() => {
      stopTimers();
      position = [...modules[index].text].length;
      text.textContent = modules[index].text;
      next.hidden = false;
      showBranches();
    });
  });
  get('story-hide').addEventListener('click', () => {
    touch(); clearTimeout(autoTimer); screen.classList.add('ui-hidden'); get('story-reveal').hidden = false; get('story-reveal').focus();
  });
  get('story-reveal').addEventListener('click', () => {
    touch(); screen.classList.remove('ui-hidden'); get('story-reveal').hidden = true; scheduleAuto(); get('story-hide').focus();
  });
  get('story-log-button').addEventListener('click', () => {
    touch(); clearTimeout(autoTimer); logList.replaceChildren();
    const earlier = played.map(({ source, ...entry }) => entry);
    const current = modules.slice(0, index + 1).filter(line => !played.some(entry => entry.source === line)).map(line => ({ who: canonical(line.who || line.name), text: line.text }));
    const entries = [...earlier, ...current];
    entries.forEach(line => {
      const entry = document.createElement('div');
      entry.className = 'story-log-entry';
      const speaker = document.createElement('strong');
      speaker.textContent = isNarration(line.who) ? '' : line.who;
      const body = document.createElement('p');
      body.textContent = line.text;
      entry.append(speaker, body);
      logList.append(entry);
    });
    log.hidden = false; logList.scrollTop = logList.scrollHeight; get('story-log-close').focus();
  });
  get('story-log-close').addEventListener('click', () => { touch(); log.hidden = true; scheduleAuto(); get('story-log-button').focus(); });
  get('story-menu-button').addEventListener('click', () => { touch(); clearTimeout(autoTimer); menu.hidden = false; get('story-resume').focus(); });
  get('story-resume').addEventListener('click', () => { touch(); menu.hidden = true; scheduleAuto(); get('story-menu-button').focus(); });
  get('story-restart').addEventListener('click', () => {
    touch(); cancelRequest(); tablet.close(); tablet.reset(); modules = clone(demo); history = []; branches = []; played = []; index = 0;
    closePanels(); setAuto(false); displayLine(); save();
  });
  get('story-title').addEventListener('click', () => { touch(); exit(); });
  get('story-save').addEventListener('click', () => { touch(); setStatus(save() ? '已保存' : '保存失败'); menu.hidden = true; });
  generateButton.addEventListener('click', () => { touch(); generate(); });
  promptForm.addEventListener('submit', event => {
    event.preventDefault();
    const input = promptInput.value.trim();
    if (!input) return;
    touch(); promptInput.value = ''; generate(input);
  });
  configButton.addEventListener('click', () => { touch(); menu.hidden = true; window.dispatchEvent(new Event('ba:api-settings')); });
  document.addEventListener('keydown', event => {
    if (!active || tablet.isOpen() || !get('api-settings').hidden) return;
    if (event.key === 'Escape') {
      if (!log.hidden) { log.hidden = true; scheduleAuto(); }
      else if (!prompt.hidden) prompt.hidden = true;
      else if (!menu.hidden) { menu.hidden = true; scheduleAuto(); }
      else if (screen.classList.contains('ui-hidden')) { screen.classList.remove('ui-hidden'); get('story-reveal').hidden = true; scheduleAuto(); }
      else { menu.hidden = false; clearTimeout(autoTimer); get('story-resume').focus(); }
    } else if ((event.key === ' ' || event.key === 'Enter') && event.target === document.body) { event.preventDefault(); advance(); }
  });

  return { enter, exit, save, hasSave, generate, parseGal, tablet, getState: () => ({ modules, branches, history, index, active, tablet: tablet.snapshot() }) };
}
