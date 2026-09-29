export const schools = Object.freeze({
  schale: { name: '夏莱', places: { office: '办公室', lobby: '大厅' } },
  abydos: { name: '阿拜多斯高中', places: { classroom: '对策委员会活动室', campus: '校园', shop: '校外商店', road: '沙漠公路', library: '图书室' } }
});
export const students = Object.freeze({
  shiroko: { name: '砂狼白子', school: 'abydos', routine: ['road', 'classroom', 'campus', 'road', 'classroom'] },
  hoshino: { name: '小鸟游星野', school: 'abydos', routine: ['classroom', 'classroom', 'campus', 'classroom', 'classroom'] },
  serika: { name: '黑见芹香', school: 'abydos', routine: ['shop', 'classroom', 'shop', 'shop', 'shop'] },
  ayane: { name: '奥空绫音', school: 'abydos', routine: ['library', 'classroom', 'classroom', 'library', 'classroom'] },
  nonomi: { name: '十六夜野宫', school: 'abydos', routine: ['campus', 'classroom', 'campus', 'classroom', 'campus'] }
});
export const weekdays = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];
const dutyStudents = ['shiroko', 'hoshino', 'serika', 'ayane', 'nonomi'];
const validPlace = (school, place) => !!schools[school]?.places[place];
const validStudent = id => Object.hasOwn(students, id);
const dayOf = state => Math.floor(state.minute / 1440);
const timeOf = state => state.minute % 1440;
export const dayLabel = state => `第 ${dayOf(state) + 1} 天 · ${weekdays[dayOf(state) % 7]}`;
export const clockLabel = state => `${String(Math.floor(timeOf(state) / 60)).padStart(2, '0')}:${String(timeOf(state) % 60).padStart(2, '0')}`;
export const bandOf = state => timeOf(state) < 420 ? '深夜' : timeOf(state) < 660 ? '早晨' : timeOf(state) < 960 ? '白天' : timeOf(state) < 1200 ? '黄昏' : '夜晚';
export function createWorld() { return { minute: 8 * 60, school: 'schale', place: 'office', duty: {}, events: {} }; }
export function hydrateWorld(raw) {
  const state = createWorld();
  if (!raw || typeof raw !== 'object') return state;
  if (Number.isSafeInteger(raw.minute) && raw.minute >= 0 && raw.minute < 1440 * 3650) state.minute = raw.minute;
  if (validPlace(raw.school, raw.place)) { state.school = raw.school; state.place = raw.place; }
  if (raw.duty && typeof raw.duty === 'object' && !Array.isArray(raw.duty)) {
    for (const [day, id] of Object.entries(raw.duty)) if (/^(0|[1-9]\d{0,3})$/.test(day) && validStudent(id)) state.duty[day] = id;
  }
  if (raw.events && typeof raw.events === 'object' && !Array.isArray(raw.events)) {
    for (const [id, event] of Object.entries(raw.events)) {
      if (validStudent(id) && event && validPlace(event.school, event.place) && Number.isSafeInteger(event.from) && Number.isSafeInteger(event.until) && event.from >= 0 && event.until > event.from && event.until <= 1440 * 3650) state.events[id] = { school: event.school, place: event.place, from: event.from, until: event.until };
    }
  }
  return state;
}
export function advanceTime(state, minutes) {
  if (!Number.isSafeInteger(minutes) || minutes < 0) return false;
  state.minute = Math.min(1440 * 3650 - 1, state.minute + minutes);
  return true;
}
export function travel(state, school, place) {
  if (!validPlace(school, place)) return false;
  if (state.school !== school || state.place !== place) advanceTime(state, state.school === school ? 15 : 45);
  state.school = school;
  state.place = place;
  return true;
}
export function dutyFor(state, day = dayOf(state)) {
  if (!Number.isSafeInteger(day) || day < 0 || day >= 3650) return null;
  return state.duty[day] || dutyStudents[day % dutyStudents.length];
}
export function setDuty(state, day, id) {
  if (!Number.isSafeInteger(day) || day < dayOf(state) || day >= dayOf(state) + 7 || !validStudent(id)) return false;
  state.duty[day] = id;
  return true;
}
export function setEvent(state, id, event) {
  if (!validStudent(id) || !event || !validPlace(event.school, event.place) || !Number.isSafeInteger(event.from) || !Number.isSafeInteger(event.until) || event.from < state.minute || event.until <= event.from || event.until > 1440 * 3650) return false;
  state.events[id] = { school: event.school, place: event.place, from: event.from, until: event.until };
  return true;
}
export function resolveStudent(state, id) {
  const student = students[id];
  if (!student) return null;
  const event = state.events[id];
  if (event && state.minute >= event.from && state.minute < event.until) return { school: event.school, place: event.place, source: 'event' };
  if (dutyFor(state) === id && timeOf(state) >= 540 && timeOf(state) < 1080) return { school: 'schale', place: 'office', source: 'duty' };
  const time = timeOf(state);
  const slot = time < 540 ? 0 : time < 720 ? 1 : time < 900 ? 2 : time < 1140 ? 3 : 4;
  const weekend = dayOf(state) % 7 >= 5;
  return { school: student.school, place: weekend && slot === 1 ? student.routine[2] : student.routine[slot], source: 'routine' };
}
export function occupants(state, school, place) { return Object.keys(students).filter(id => { const location = resolveStudent(state, id); return location.school === school && location.place === place; }); }
