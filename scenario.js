import { assets } from './resources/assets.js';

export const portraits = Object.freeze({
  '七神凛': assets.storyRinPortrait,
  '砂狼白子': assets.storyShirokoPortrait,
  '小鸟游星野': assets.storyHoshinoPortrait,
  '黑见芹香': assets.storySerikaPortrait,
  '奥空绫音': assets.storyAyanePortrait,
  '十六夜野宫': assets.storyNonomiPortrait
});

export const aliases = Object.freeze({
  '凛': '七神凛', 'Rin': '七神凛',
  '白子': '砂狼白子', 'Shiroko': '砂狼白子',
  '星野': '小鸟游星野', 'Hoshino': '小鸟游星野',
  '芹香': '黑见芹香', 'Serika': '黑见芹香',
  '绫音': '奥空绫音', 'Ayane': '奥空绫音',
  '野宫': '十六夜野宫', 'Nonomi': '十六夜野宫'
});

export const backgrounds = Object.freeze({
  '联邦学生会': assets.storyBackground,
  '联邦学生会室': assets.storyBackgroundInside,
  '联邦学生会大厅': assets.storyBackground,
  'BG_UpperOffice': assets.storyBackground,
  'BG_MainOffice': assets.storyBackgroundInside
});

export const cutscenes = Object.freeze({
  BG_CS_PR_00: assets.prologueCGOpening,
  BG_CS_PR_01: assets.prologueCGNext,
  BG_CS_Arona: assets.prologueAronaCG
});

export const demo = Object.freeze([
  { who: '砂狼白子', text: '老师，你好。我是阿拜多斯对策委员会的砂狼白子。', bg: '联邦学生会' },
  { who: '小鸟游星野', text: '哎呀，老师来了？我是小鸟游星野，请多关照～', bg: '联邦学生会' },
  { who: '黑见芹香', text: '我、我是黑见芹香！可别以为我会特别照顾你哦。', bg: '联邦学生会' },
  { who: '奥空绫音', text: '老师，您好！我是对策委员会的奥空绫音。', bg: '联邦学生会' },
  { who: '十六夜野宫', text: '欢迎，老师！我是十六夜野宫，请多多指教！', bg: '联邦学生会' }
]);

export const systemPrompt = `你是《蔚蓝档案》同人互动视觉小说的演出系统，不是客服。场景是基沃托斯，老师由玩家扮演。可使用的人物：七神凛、砂狼白子、小鸟游星野、黑见芹香、奥空绫音、十六夜野宫。用简体中文，每轮推进数句剧情，保持人物性格，不要代替老师做决定。只输出以下格式，不要 Markdown：
<summernight>
<summernight_maintext>
<背景|联邦学生会|联邦学生会大厅>
<七神凛|普通|老师，您终于来了。>
<旁白|阳光照进了大厅。>
</summernight_maintext>
<summernight_branches>[问候凛][了解情况]</summernight_branches>
</summernight>
每句使用 <角色|表情|正文> 或 <旁白|正文>；支持 <CG|BG_CS_PR_00> 和 </CG>；背景从联邦学生会、联邦学生会室中选。立绘仅在这六位已知角色发言时出现；表情当前统一使用普通。选项 1 到 4 个，末尾给出；不要使用未知图片地址、HTML 或其他标签。`; 

function readChoices(block) {
  return [...String(block || '').matchAll(/\[([^\]]+)\]/g)].map(match => match[1].trim()).filter(Boolean).slice(0, 4);
}

export function parseGal(raw, { partial = false } = {}) {
  const input = String(raw || '');
  const hasOpening = /<summernight(?:\s[^>]*)?>/i.test(input);
  const hasClosing = /<\/summernight\s*>/i.test(input);
  if (!partial && (!hasOpening || !hasClosing)) throw new Error('接口返回缺少 <summernight> 剧情标签');
  const start = input.match(/<summernight_maintext(?:\s[^>]*)?>/i);
  let main = start ? input.slice(start.index + start[0].length) : '';
  const end = main.search(/<\/summernight_maintext\s*>|<summernight_(?:branches|snapshots|variables)|<\/summernight\s*>/i);
  if (end >= 0) main = main.slice(0, end);
  const body = main;
  const modules = [];
  let background = '';
  let cg = '';
  for (const match of body.matchAll(/<([^<>]+)>/g)) {
    const tag = match[1].trim();
    if (/^\/CG$/i.test(tag)) { cg = ''; continue; }
    const cgTag = tag.match(/^CG\s*\|\s*(.+)$/i);
    if (cgTag) { cg = cgTag[1].trim(); continue; }
    const bgTag = tag.match(/^背景\s*\|\s*([^|>]+)(?:\|[^>]*)?$/);
    if (bgTag) { background = bgTag[1].trim(); continue; }
    if (/^\/?summernight/i.test(tag) || /^\/?UpdateVariable/i.test(tag)) continue;
    const parts = tag.split('|');
    if (parts.length < 2) continue;
    const who = parts.shift().trim();
    let expr = '-';
    if (parts.length >= 2) expr = parts.shift().trim();
    const text = parts.join('|').trim();
    if (text && who) modules.push({ type: 'line', who, expr, text, bg: background, cg });
  }
  const choices = readChoices(input.match(/<summernight_branches(?:\s[^>]*)?>([\s\S]*?)<\/summernight_branches\s*>/i)?.[1]);
  if (!partial && !modules.length) throw new Error('接口没有返回可演出的台词');
  return { modules, choices, partial, complete: hasClosing };
}

export function buildMessages(history, userText) {
  return [{ role: 'system', content: systemPrompt }, ...history.slice(-18), { role: 'user', content: userText }];
}
