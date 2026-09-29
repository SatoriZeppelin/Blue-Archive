const STORAGE_KEY = 'blue-archive:api:profiles';
const defaults = { protocol: 'openai', baseUrl: '', apiKey: '', model: '', temperature: 1, maxTokens: 4096, topP: 1, stream: false, reasoningEffort: 'auto' };
const createId = () => `api_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

function normalize(profile = {}) {
  return {
    ...defaults,
    ...profile,
    id: String(profile.id || createId()),
    name: String(profile.name || '默认接口').trim() || '默认接口',
    enabled: profile.enabled !== false,
    protocol: ['openai', 'claude', 'gemini'].includes(profile.protocol) ? profile.protocol : 'openai',
    baseUrl: String(profile.baseUrl || '').trim().replace(/\/+$/, ''),
    apiKey: String(profile.apiKey || '').trim(),
    model: String(profile.model || '').trim(),
    temperature: Math.max(0, Math.min(2, Number(profile.temperature) || 0)),
    maxTokens: Math.max(1, Math.min(2000000, Number(profile.maxTokens) || defaults.maxTokens)),
    topP: Math.max(0, Math.min(1, Number(profile.topP) || 0)),
    stream: !!profile.stream
  };
}

function normalizeStore(raw) {
  const profiles = Array.isArray(raw?.profiles) && raw.profiles.length ? raw.profiles.map(normalize) : [normalize()];
  const exists = id => profiles.some(profile => profile.id === id);
  return {
    profiles,
    activeProfileId: exists(raw?.activeProfileId) ? raw.activeProfileId : profiles[0].id,
    defaultProfileId: exists(raw?.defaultProfileId) ? raw.defaultProfileId : profiles[0].id,
    routes: { main: exists(raw?.routes?.main) ? raw.routes.main : '', tabletChat: exists(raw?.routes?.tabletChat) ? raw.routes.tabletChat : '' }
  };
}

export function loadStore() {
  try { return normalizeStore(JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null')); }
  catch (_) { return normalizeStore(null); }
}

export function saveStore(raw) {
  const store = normalizeStore(raw);
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(store)); }
  catch (_) {}
  return store;
}

export function resolveConfig(route = 'main', profileId = '') {
  const store = loadStore();
  const byId = id => store.profiles.find(profile => profile.id === id && profile.enabled);
  return byId(profileId) || byId(store.routes[route]) || byId(store.defaultProfileId) || byId(store.activeProfileId) || store.profiles.find(profile => profile.enabled) || store.profiles[0];
}

function rootOf(input) {
  return String(input || '').trim().replace(/\/+$/, '')
    .replace(/(?:\/v1)+\/chat\/completions$/i, '/v1')
    .replace(/\/chat\/completions$/i, '')
    .replace(/(?:\/v1)+\/messages$/i, '/v1')
    .replace(/\/messages$/i, '')
    .replace(/\/v1beta\/models\/[^/]+(?::(?:streamGenerateContent|generateContent))?(?:\?.*)?$/i, '')
    .replace(/\/models\/[^/]+:(?:streamGenerateContent|generateContent)(?:\?.*)?$/i, '')
    .replace(/\/v1beta\/models$/i, '/v1beta')
    .replace(/\/models$/i, '')
    .replace(/(?:\/v1)+$/i, '/v1');
}

function candidates(config, kind) {
  const root = rootOf(config.baseUrl);
  const model = encodeURIComponent(config.model.replace(/^models\//, ''));
  if (config.protocol === 'gemini') {
    const tail = kind === 'models' ? 'models' : `models/${model}:${config.stream ? 'streamGenerateContent?alt=sse' : 'generateContent'}`;
    return [root.endsWith('/v1beta') ? `${root}/${tail}` : `${root}/v1beta/${tail}`, `${root}/${tail}`];
  }
  const tail = config.protocol === 'claude' ? (kind === 'models' ? 'models' : 'messages') : (kind === 'models' ? 'models' : 'chat/completions');
  return [...new Set([root.endsWith('/v1') ? `${root}/${tail}` : `${root}/v1/${tail}`, `${root}/${tail}`])];
}

function headers(config, json = true) {
  const output = json ? { 'Content-Type': 'application/json' } : {};
  if (config.protocol === 'claude') Object.assign(output, { 'x-api-key': config.apiKey, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' });
  else if (config.protocol === 'gemini') output['x-goog-api-key'] = config.apiKey;
  else output.Authorization = `Bearer ${config.apiKey}`;
  return output;
}

function requestBody(config, messages) {
  const sampling = { temperature: config.temperature, top_p: config.topP };
  if (config.protocol === 'claude') {
    const system = messages.filter(m => m.role === 'system').map(m => m.content).join('\n\n');
    const turns = messages.filter(m => m.role !== 'system').map(m => ({ role: m.role, content: m.content }));
    const compact = [];
    for (const turn of turns) {
      if (compact.at(-1)?.role === turn.role) compact.at(-1).content += `\n\n${turn.content}`;
      else compact.push({ ...turn });
    }
    if (compact[0]?.role !== 'user') compact.unshift({ role: 'user', content: '继续' });
    return { model: config.model, max_tokens: config.maxTokens, messages: compact, ...(system ? { system } : {}), temperature: config.temperature, top_p: config.topP, stream: config.stream };
  }
  if (config.protocol === 'gemini') {
    const system = messages.filter(m => m.role === 'system').map(m => m.content).join('\n\n');
    const contents = [];
    for (const message of messages.filter(m => m.role !== 'system')) {
      const role = message.role === 'assistant' ? 'model' : 'user';
      if (contents.at(-1)?.role === role) contents.at(-1).parts[0].text += `\n\n${message.content}`;
      else contents.push({ role, parts: [{ text: message.content }] });
    }
    if (contents[0]?.role !== 'user') contents.unshift({ role: 'user', parts: [{ text: '继续' }] });
    return { contents, ...(system ? { systemInstruction: { parts: [{ text: system }] } } : {}), generationConfig: { maxOutputTokens: config.maxTokens, temperature: config.temperature, topP: config.topP } };
  }
  const body = { model: config.model, messages, max_tokens: config.maxTokens, stream: config.stream, ...sampling };
  if (/^(o[1-9]|gpt-5)/i.test(config.model)) {
    delete body.temperature;
    delete body.top_p;
    if (config.reasoningEffort !== 'auto') body.reasoning_effort = config.reasoningEffort === 'xhigh' ? 'high' : config.reasoningEffort;
  }
  return body;
}

function responseText(data) {
  if (Array.isArray(data?.choices)) {
    const content = data.choices[0]?.message?.content ?? data.choices[0]?.text ?? '';
    return Array.isArray(content) ? content.map(part => part.text || '').join('') : String(content);
  }
  if (Array.isArray(data?.content)) return data.content.map(part => part.text || '').join('');
  return (data?.candidates?.[0]?.content?.parts || []).map(part => part.text || '').join('');
}

async function streamText(response, protocol, onDelta) {
  if (!response.body) throw new Error('响应不支持流式读取');
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let output = '';
  let geminiSnapshot = '';
  try {
    for (;;) {
      const { done, value } = await reader.read();
      buffer += decoder.decode(value || new Uint8Array(), { stream: !done });
      const rows = buffer.split(/\r?\n/);
      buffer = done ? '' : rows.pop();
      for (const row of rows) {
        if (!row.startsWith('data:')) continue;
        const json = row.slice(5).trim();
        if (json === '[DONE]') return output;
        try {
          const event = JSON.parse(json);
          let delta = '';
          if (protocol === 'claude') delta = event.delta?.text || event.content_block?.text || '';
          else if (protocol === 'gemini') {
            const current = responseText(event);
            delta = current.startsWith(geminiSnapshot) ? current.slice(geminiSnapshot.length) : current;
            geminiSnapshot = current;
          } else delta = event.choices?.[0]?.delta?.content || '';
          if (delta) { output += delta; onDelta?.(output, delta); }
        } catch (_) {}
      }
      if (done) break;
    }
  } finally { reader.releaseLock(); }
  return output;
}

async function execute(config, kind, { messages = [], signal, onDelta } = {}) {
  if (!config.baseUrl || !config.apiKey || (kind === 'chat' && !config.model)) throw new Error('请先在设置中配置接口地址、密钥和模型');
  if (!/^https?:\/\//i.test(config.baseUrl)) throw new Error('接口地址须以 http:// 或 https:// 开头');
  let lastError;
  for (const url of candidates(config, kind)) {
    try {
      const body = kind === 'chat' ? requestBody(config, messages) : null;
      const response = await fetch(url, { method: body ? 'POST' : 'GET', headers: headers(config, !!body), ...(body ? { body: JSON.stringify(body) } : {}), signal });
      if (!response.ok) {
        const raw = await response.text();
        const message = (() => { try { return JSON.parse(raw).error?.message || raw; } catch (_) { return raw; } })();
        const error = new Error(`HTTP ${response.status}: ${String(message).slice(0, 240)}`);
        error.status = response.status;
        throw error;
      }
      if (kind === 'models') {
        const data = await response.json();
        const list = data.data || data.models || data;
        if (!Array.isArray(list)) throw new Error('模型列表格式不正确');
        return list.map(item => String(item.id || item.name || item.model || '').replace(/^models\//, '')).filter(Boolean).sort();
      }
      if (config.stream) {
        const output = await streamText(response, config.protocol, onDelta);
        if (!output) throw new Error('接口没有返回文本');
        return output;
      }
      const text = responseText(await response.json());
      if (!text) throw new Error('接口没有返回文本');
      onDelta?.(text, text);
      return text;
    } catch (error) {
      lastError = error;
      if (signal?.aborted || (error.status && ![404, 405].includes(error.status))) break;
    }
  }
  throw lastError || new Error('接口请求失败');
}

export const api = {
  loadStore, saveStore, resolveConfig,
  chat: ({ messages, route = 'main', profileId = '', signal, onDelta }) => execute(resolveConfig(route, profileId), 'chat', { messages, signal, onDelta }),
  listModels: ({ profileId = '', signal } = {}) => execute(resolveConfig('main', profileId), 'models', { signal }),
  testMessage: ({ profileId = '', signal } = {}) => execute(resolveConfig('main', profileId), 'chat', { messages: [{ role: 'user', content: 'ping' }], signal })
};
