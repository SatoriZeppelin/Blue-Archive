import { api } from './api.js';

export function createApiSettings() {
  const get = id => document.getElementById(id);
  const overlay = get('api-settings');
  const form = get('api-settings-form');
  const profiles = get('api-profiles');
  const keyInput = get('api-key');
  const status = get('api-settings-status');
  const modelOptions = get('api-model-options');
  let controller = null;
  let focusBefore = null;
  let activeTab = 'game';
  const tabs = [...overlay.querySelectorAll('[data-settings-tab]')];
  const sections = [...overlay.querySelectorAll('[data-settings-section]')];

  function selectTab(id) {
    if (!tabs.some(tab => tab.dataset.settingsTab === id)) return;
    activeTab = id;
    for (const tab of tabs) {
      const active = tab.dataset.settingsTab === id;
      tab.classList.toggle('is-active', active);
      if (active) tab.setAttribute('aria-current', 'page');
      else tab.removeAttribute('aria-current');
    }
    for (const section of sections) section.hidden = section.dataset.settingsSection !== id;
    overlay.querySelector('.api-settings-content').scrollTop = 0;
  }

  function notify(message) { status.textContent = message || ''; }

  function render() {
    const store = api.loadStore();
    profiles.replaceChildren();
    for (const profile of store.profiles) {
      const option = document.createElement('option');
      option.value = profile.id;
      option.textContent = `${profile.name}${profile.enabled ? '' : '（已禁用）'}`;
      profiles.append(option);
    }
    profiles.value = store.activeProfileId;
    const profile = store.profiles.find(item => item.id === store.activeProfileId) || store.profiles[0];
    get('api-name').value = profile.name;
    get('api-protocol').value = profile.protocol;
    get('api-url').value = profile.baseUrl;
    keyInput.value = profile.apiKey;
    get('api-model').value = profile.model;
    get('api-temperature').value = profile.temperature;
    get('api-top-p').value = profile.topP;
    get('api-max-tokens').value = profile.maxTokens;
    get('api-reasoning').value = profile.reasoningEffort || 'auto';
    get('api-stream').checked = profile.stream;
    get('api-enabled').checked = profile.enabled;
    get('api-default').checked = store.defaultProfileId === profile.id;
    get('api-route').checked = store.routes.main === profile.id;
    get('api-route-tablet').checked = store.routes.tabletChat === profile.id;
    notify('');
  }

  function save() {
    const store = api.loadStore();
    const id = profiles.value;
    const entry = store.profiles.find(item => item.id === id);
    if (!entry) return;
    Object.assign(entry, {
      name: get('api-name').value.trim() || '默认接口',
      protocol: get('api-protocol').value,
      baseUrl: get('api-url').value.trim(),
      apiKey: keyInput.value.trim(),
      model: get('api-model').value.trim(),
      temperature: Number(get('api-temperature').value),
      topP: Number(get('api-top-p').value),
      maxTokens: Number(get('api-max-tokens').value),
      reasoningEffort: get('api-reasoning').value,
      stream: get('api-stream').checked,
      enabled: get('api-enabled').checked
    });
    if (get('api-default').checked) store.defaultProfileId = id;
    else if (store.defaultProfileId === id) store.defaultProfileId = store.profiles.find(item => item.id !== id && item.enabled)?.id || id;
    store.routes.main = get('api-route').checked ? id : (store.routes.main === id ? '' : store.routes.main);
    store.routes.tabletChat = get('api-route-tablet').checked ? id : (store.routes.tabletChat === id ? '' : store.routes.tabletChat);
    api.saveStore(store);
    const current = profiles.selectedOptions[0];
    if (current) current.textContent = entry.name + (entry.enabled ? '' : '（已禁用）');
    notify('已保存');
  }

  function open() {
    focusBefore = document.activeElement;
    render();
    selectTab('game');
    get('api-settings-sound').checked = get('sound-toggle').getAttribute('aria-pressed') !== 'true';
    get('api-settings-fullscreen').checked = Boolean(document.fullscreenElement);
    overlay.hidden = false;
    get('api-settings-close').focus();
  }

  function close() {
    controller?.abort();
    controller = null;
    overlay.hidden = true;
    focusBefore?.focus?.();
  }

  for (const tab of tabs) tab.addEventListener('click', () => selectTab(tab.dataset.settingsTab));
  overlay.querySelectorAll('[data-settings-target]').forEach(button => button.addEventListener('click', () => selectTab(button.dataset.settingsTarget)));
  get('api-settings-sound').addEventListener('change', event => {
    const toggle = get('sound-toggle');
    if (event.target.checked === (toggle.getAttribute('aria-pressed') === 'true')) toggle.click();
  });
  get('api-settings-fullscreen').addEventListener('change', event => {
    if (event.target.checked !== Boolean(document.fullscreenElement)) get('fullscreen-toggle').click();
  });
  document.addEventListener('fullscreenchange', () => { get('api-settings-fullscreen').checked = Boolean(document.fullscreenElement); });
  form.addEventListener('submit', event => { event.preventDefault(); save(); });
  profiles.addEventListener('change', () => {
    const store = api.loadStore();
    store.activeProfileId = profiles.value;
    api.saveStore(store);
    render();
  });
  get('api-add').addEventListener('click', () => {
    const store = api.loadStore();
    const profile = { id: `api_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`, name: '新接口', protocol: 'openai', enabled: true };
    store.profiles.push(profile);
    store.activeProfileId = profile.id;
    api.saveStore(store);
    render();
  });
  get('api-duplicate').addEventListener('click', () => {
    const store = api.loadStore();
    const original = store.profiles.find(item => item.id === profiles.value);
    if (!original) return;
    const profile = { ...original, id: `api_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`, name: `${original.name} 副本` };
    store.profiles.push(profile);
    store.activeProfileId = profile.id;
    api.saveStore(store);
    render();
  });
  get('api-remove').addEventListener('click', () => {
    const store = api.loadStore();
    if (store.profiles.length === 1) return;
    store.profiles = store.profiles.filter(item => item.id !== profiles.value);
    store.activeProfileId = store.profiles[0].id;
    api.saveStore(store);
    render();
  });
  get('api-key-visible').addEventListener('click', () => { keyInput.type = keyInput.type === 'password' ? 'text' : 'password'; });
  get('api-settings-close').addEventListener('click', close);
  overlay.addEventListener('click', event => { if (event.target === overlay) close(); });
  overlay.addEventListener('keydown', event => { if (event.key === 'Escape') { event.stopPropagation(); close(); } });

  async function check(kind) {
    save();
    controller?.abort();
    const current = new AbortController();
    controller = current;
    const button = get(kind === 'models' ? 'api-list-models' : 'api-test');
    button.disabled = true;
    notify(kind === 'models' ? '正在获取模型…' : '正在测试连接…');
    try {
      const result = kind === 'models' ? await api.listModels({ profileId: profiles.value, signal: current.signal }) : await api.testMessage({ profileId: profiles.value, signal: current.signal });
      if (controller !== current) return;
      if (kind === 'models') {
        modelOptions.replaceChildren();
        for (const model of result) { const option = document.createElement('option'); option.value = model; modelOptions.append(option); }
        notify(`获取到 ${result.length} 个模型`);
      } else notify(`连接成功：${result.slice(0, 90)}`);
    } catch (error) {
      if (controller !== current) return;
      notify(`连接失败：${error.message}`);
    } finally {
      button.disabled = false;
      if (controller === current) controller = null;
    }
  }
  get('api-list-models').addEventListener('click', () => check('models'));
  get('api-test').addEventListener('click', () => check('test'));
  window.addEventListener('ba:api-settings', open);
  return { open, close };
}
