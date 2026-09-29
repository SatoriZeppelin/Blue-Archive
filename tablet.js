import { api } from './api.js';
import { mountArona, aronaAnimationNames } from './resources/tablet/arona-bundle.js';
import { schools, students, weekdays, createWorld, hydrateWorld, dayLabel, clockLabel, bandOf, advanceTime, travel, dutyFor, setDuty, setEvent, resolveStudent, occupants } from './world.js';

const aronaExpressionLabels = Object.freeze({
  '01': '正常', '02': '张嘴挑眉', '03': '闭眼笑', '04': '张嘴流汗', '05': '不悦',
  '06': '气哭', '07': '黑线', '08': '黑线张嘴', '09': '黑线瞥眼', '10': '闭眼叹气',
  '11': '高兴', '12': '兴奋', '13': '安详', '14': '撅嘴', '15': '流汗',
  '16': '害羞', '17': '晕眩', '18': '非常害羞', '19': '黑线害羞', '20': '大门牙笑',
  '21': '兴奋流口水', '22': '兴奋撇嘴', '23': '安详流口水', '24': '安详张嘴', '25': '兴奋张嘴',
  '26': '皱眉张嘴', '27': '黑线无奈', '28': '白眼圈圈眼', '29': '圈圈眼带泪', '30': '圈圈眼',
  '31': '三角嘴', '32': '闭眼三角嘴', '99': '闭眼'
});
const contacts = { arona: '阿罗娜', plana: '普拉娜', ...Object.fromEntries(Object.entries(students).map(([id, student]) => [id, student.name])) };
const get = id => document.getElementById(id);
const make = (tag, className = '', text = '') => { const node = document.createElement(tag); node.className = className; node.textContent = text; return node; };
const button = (text, fn, className = 'tablet-action') => { const node = make('button', className, text); node.type = 'button'; node.addEventListener('click', fn); return node; };
const panel = title => { const node = make('section', 'tablet-panel'); node.append(make('h3', '', title)); return node; };
const limitText = value => String(value || '').replace(/<[^>]*>/g, '').trim().slice(0, 1200);

export function createTablet({ onOpen = () => {}, onClose = () => {}, onChange = () => {}, getStoryContext = () => ({}) } = {}) {
  const overlay = get('tablet-overlay');
  const content = get('tablet-content');
  let world = createWorld();
  let sessions = {};
  let app = 'home';
  let aronaVisible = false;
  let contact = 'arona';
  let open = false;
  let busy = false;
  let controller = null;
  let chatError = '';
  let generation = 0;
  let focusBefore = null;
  let disposeArona = null;
  let selectedAronaAnimation = 'Idle_01';
  const emit = () => { get('tablet-clock').textContent = `${dayLabel(world)} ${clockLabel(world)}`; onChange(); };

  function reset() { controller?.abort(); disposeArona?.(); disposeArona = null; generation++; controller = null; busy = false; chatError = ''; world = createWorld(); sessions = {}; app = 'home'; aronaVisible = false; contact = 'arona'; if (open) render(); }
  function restore(raw) {
    controller?.abort(); disposeArona?.(); disposeArona = null; generation++; controller = null; busy = false; chatError = '';
    world = hydrateWorld(raw?.world);
    sessions = {};
    if (raw?.sessions && typeof raw.sessions === 'object' && !Array.isArray(raw.sessions)) for (const [id, messages] of Object.entries(raw.sessions)) {
      if (!Object.hasOwn(contacts, id) || !Array.isArray(messages)) continue;
      sessions[id] = messages.filter(message => message && ['user', 'assistant'].includes(message.role) && typeof message.content === 'string').slice(-40).map(message => ({ role: message.role, content: limitText(message.content) }));
    }
    app = ['home', 'map', 'chat', 'schedule'].includes(raw?.app) ? raw.app : 'home';
    aronaVisible = raw?.aronaVisible === true;
    contact = Object.hasOwn(contacts, raw?.contact) ? raw.contact : 'arona';
    if (open) render();
  }
  const snapshot = () => ({ world: structuredClone(world), sessions: structuredClone(sessions), app, aronaVisible, contact });
  function openTablet() { if (open || get('story').hidden || !get('story-log').hidden || !get('story-menu').hidden || !get('api-settings').hidden) return; onOpen(); open = true; focusBefore = document.activeElement; overlay.hidden = false; render(); get('tablet-close').focus(); }
  function closeTablet() { if (!open) return; controller?.abort(); disposeArona?.(); disposeArona = null; generation++; controller = null; busy = false; open = false; overlay.hidden = true; onClose(); emit(); focusBefore?.focus?.(); }
  function switchApp(next) { if (!['home', 'map', 'chat', 'schedule'].includes(next)) return; app = next; render(); emit(); }
  function renderHome() {
    const home = make('div', 'tablet-home');
    if (aronaVisible) {
      const arona = make('canvas', 'tablet-arona');
      arona.setAttribute('role', 'img');
      arona.setAttribute('aria-label', '阿罗娜');
      home.append(arona);
      const picker = make('aside', 'tablet-arona-picker');
      picker.setAttribute('aria-label', '阿罗娜动作列表');
      const list = make('div', 'tablet-arona-picker-list');
      list.setAttribute('role', 'group');
      list.setAttribute('aria-label', '阿罗娜动作');
      for (const name of aronaAnimationNames) {
        const choice = button(aronaExpressionLabels[name] ? `${name} ${aronaExpressionLabels[name]}` : name, () => {
          selectedAronaAnimation = name;
          for (const item of list.children) {
            item.classList.toggle('active', item.dataset.animation === name);
            item.setAttribute('aria-pressed', String(item.dataset.animation === name));
          }
          disposeArona?.play(name, { loop: true, returnToIdle: false });
        }, `tablet-arona-picker-item${name === selectedAronaAnimation ? ' active' : ''}`);
        choice.dataset.animation = name;
        choice.setAttribute('aria-pressed', String(name === selectedAronaAnimation));
        list.append(choice);
      }
      picker.append(list);
      home.append(picker);
      requestAnimationFrame(() => {
        if (!arona.isConnected || !open || app !== 'home') return;
        disposeArona = mountArona(arona);
        if (selectedAronaAnimation !== 'Idle_01') disposeArona.play(selectedAronaAnimation, { loop: true, returnToIdle: false });
      });
    } else {
      const intro = make('button', 'tablet-home-intro');
      intro.type = 'button';
      intro.setAttribute('aria-label', '与阿罗娜见面');
      intro.append(make('span', 'tablet-home-eyebrow', 'S.C.H.A.L.E.  /  SHITTIM CHEST'), make('strong', '', '早上好，老师。'), make('span', '', `${dayLabel(world)}  ·  ${bandOf(world)}  ·  ${schools[world.school].name}`));
      intro.addEventListener('click', () => { aronaVisible = true; render(); emit(); });
      home.append(intro);
    }
    const grid = make('div', 'tablet-grid');
    for (const [id, title, subtitle, image] of [['map', '地图', '探索基沃托斯', 'Academy_Abydos.jpg'], ['chat', 'MomoTalk', '与大家保持联络', 'Contents_Image_Story.png'], ['schedule', '夏莱日程', '今天也请多指教', 'Contents_Image_Week.png']]) {
      const card = button('', () => switchApp(id), `tablet-card tablet-card-${id}`);
      const picture = make('span', 'tablet-card-art'); picture.style.backgroundImage = `url("./resources/tablet/${image}")`;
      card.append(picture, make('span', 'tablet-card-label', title), make('span', 'tablet-card-caption', subtitle)); grid.append(card);
    }
    home.append(grid);
    content.append(home);
  }
  function renderMap() {
    content.append(make('h2', '', '地图'), make('p', 'tablet-subtitle', `当前位置：${schools[world.school].name} · ${schools[world.school].places[world.place]}`));
    for (const [schoolId, school] of Object.entries(schools)) {
      const group = panel(school.name);
      group.classList.add('tablet-school-panel', `tablet-school-${schoolId}`);
      for (const [placeId, name] of Object.entries(school.places)) {
        const row = make('div', 'tablet-row');
        const here = world.school === schoolId && world.place === placeId;
        const go = button(here ? `${name} · 当前所在` : `前往 ${name}`, () => { if (travel(world, schoolId, placeId)) { render(); emit(); } });
        go.disabled = here;
        row.append(go);
        const people = occupants(world, schoolId, placeId).map(id => students[id].name);
        row.append(make('span', '', people.length ? people.join('、') : '暂无学生'));
        group.append(row);
      }
      content.append(group);
    }
  }
  function renderSchedule() {
    content.append(make('h2', '', '夏莱日程'), make('p', 'tablet-subtitle', `${dayLabel(world)} · ${clockLabel(world)}`));
    const today = Math.floor(world.minute / 1440);
    for (let offset = 0; offset < 7; offset++) {
      const day = today + offset;
      const box = panel(`第 ${day + 1} 天 · ${weekdays[day % 7]}${offset === 0 ? ' · 今天' : ''}`);
      const row = make('div', 'tablet-row');
      row.append(make('span', 'tablet-badge', '值日生'));
      const select = make('select'); select.setAttribute('aria-label', `第 ${day + 1} 天值日生`);
      for (const [id, student] of Object.entries(students)) { const option = make('option', '', student.name); option.value = id; select.append(option); }
      select.value = dutyFor(world, day);
      select.addEventListener('change', () => { if (setDuty(world, day, select.value)) { render(); emit(); } });
      row.append(select);
      box.append(row, make('p', '', '值日时间 09:00—18:00 · 夏莱办公室'));
      content.append(box);
    }
  }
  function renderChat() {
    content.append(make('h2', '', '聊天'));
    const split = make('div', 'tablet-split');
    const list = make('aside', 'tablet-contacts');
    for (const [id, name] of Object.entries(contacts)) {
      const entry = button(name, () => { contact = id; render(); emit(); }, id === contact ? 'active' : '');
      list.append(entry);
    }
    const chat = make('section', 'tablet-chat');
    chat.append(make('h3', '', contacts[contact]));
    const messages = make('div', 'tablet-messages'); messages.setAttribute('aria-live', 'polite');
    for (const message of sessions[contact] || []) messages.append(make('div', `tablet-message${message.role === 'user' ? ' mine' : ''}`, message.content));
    if (busy) messages.append(make('div', 'tablet-message', '正在回复…'));
    chat.append(messages);
    if (chatError) chat.append(make('p', 'tablet-error', chatError));
    const form = make('form', 'tablet-compose');
    const input = make('input'); input.type = 'text'; input.maxLength = 600; input.placeholder = `发送给${contacts[contact]}`; input.setAttribute('aria-label', '聊天消息'); input.disabled = busy;
    const send = make('button', 'tablet-action', '发送'); send.type = 'submit'; send.disabled = busy;
    form.append(input, send);
    form.addEventListener('submit', event => { event.preventDefault(); sendMessage(input.value); });
    chat.append(form); split.append(list, chat); content.append(split); messages.scrollTop = messages.scrollHeight;
  }
  function render() {
    disposeArona?.();
    disposeArona = null;
    overlay.dataset.app = app;
    overlay.dataset.arona = aronaVisible ? 'visible' : 'hidden';
    get('tablet-header-title').textContent = { home: '夏莱', map: '地图', chat: 'MomoTalk', schedule: '夏莱日程' }[app];
    get('tablet-back').hidden = app === 'home';
    get('tablet-clock').textContent = `${dayLabel(world)} ${clockLabel(world)}`;
    content.replaceChildren();
    if (app === 'map') renderMap(); else if (app === 'chat') renderChat(); else if (app === 'schedule') renderSchedule(); else renderHome();
  }
  async function sendMessage(input) {
    const text = limitText(input);
    if (!text || busy) return;
    const id = contact;
    const history = sessions[id] || [];
    const student = students[id];
    const position = student ? resolveStudent(world, id) : null;
    const location = position ? `${schools[position.school].name} · ${schools[position.school].places[position.place]}` : '什亭之匣';
    const duty = students[dutyFor(world)]?.name || '';
    const story = getStoryContext();
    const context = `你在《蔚蓝档案》世界中扮演${contacts[id]}，通过夏莱平板与老师单独私聊。只用简体中文，以角色本人的口吻回复，保持人物性格，不扮演其他人，不写旁白或格式标签。你不能修改时间、地图、学生位置、排班或剧情事实。当前${dayLabel(world)} ${clockLabel(world)}，${bandOf(world)}。${student ? `你当前所在：${location}。今日值日生：${duty}。` : `老师所在：${schools[world.school].name} · ${schools[world.school].places[world.place]}。今日值日生：${duty}。`}${story?.who ? `主剧情当前发言人：${String(story.who).slice(0, 40)}。` : ''}回答简洁自然。`;
    sessions[id] = [...history, { role: 'user', content: text }].slice(-40);
    chatError = ''; busy = true; render(); emit();
    const current = new AbortController(); controller = current; const token = ++generation;
    try {
      const answer = limitText(await api.chat({ route: 'tabletChat', signal: current.signal, messages: [{ role: 'system', content: context }, ...history.slice(-18), { role: 'user', content: text }] }));
      if (token !== generation) return;
      if (!answer) throw new Error('没有收到回复');
      sessions[id] = [...sessions[id], { role: 'assistant', content: answer }].slice(-40);
      advanceTime(world, 5);
    } catch (error) {
      if (token !== generation) return;
      sessions[id] = history;
      if (error.name !== 'AbortError') chatError = `发送失败：${error.message}`;
    } finally {
      if (token === generation) { busy = false; controller = null; if (open) render(); emit(); }
    }
  }
  get('tablet-trigger').addEventListener('click', openTablet);
  get('tablet-close').addEventListener('click', closeTablet);
  get('tablet-back').addEventListener('click', () => switchApp('home'));
  overlay.addEventListener('click', event => { if (event.target === overlay) closeTablet(); });
  overlay.addEventListener('keydown', event => {
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); closeTablet(); }
    if (event.key === 'Tab') {
      const items = [...overlay.querySelectorAll('button:not(:disabled),input:not(:disabled),select:not(:disabled)')];
      const first = items[0], last = items.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    }
  });
  return { open: openTablet, close: closeTablet, reset, restore, snapshot, getWorld: () => structuredClone(world), advance: minutes => { const changed = advanceTime(world, minutes); if (changed) { if (open) render(); emit(); } return changed; }, setEvent: (id, event) => { const changed = setEvent(world, id, event); if (changed) { if (open) render(); emit(); } return changed; }, isOpen: () => open };
}
