const schools = [
  ["abydos", "阿拜多斯高中"],
  ["trinity", "圣三一综合学园"],
  ["gehenna", "格黑娜学园"],
  ["millennium", "千禧科技学园"],
  ["redwinter", "红冬联邦学园"],
  ["hyakkiyako", "百鬼夜行联合学园"],
  ["valkyrie", "瓦尔基里警察学校"],
  ["srt", "SRT特殊学园"],
  ["arius", "阿里乌斯分校"],
  ["highlander", "高原铁路学园"],
  ["wildhunt", "狂猎艺术学园"],
  ["shanhaijing", "山海经高级中学"],
  ["odyssey", "奥德赛海洋学园"],
  ["federal", "D.U.白鸟区（重建后）"],
  ["schale", "夏莱"],
];
const availableMaps = new Set(["abydos", "trinity", "gehenna", "millennium-research", "millennium-akihabara", "redwinter", "hyakkiyako", "wildhunt", "shanhaijing", "federal", "federal-shiratori", "schale"]);
const schoolLocations = {
  millennium: [["millennium-research", "研究学习区"], ["millennium-akihabara", "春叶原"]],
  federal: [["federal", "D.U.白鸟区（重建后）"], ["federal-shiratori", "D.U.白鸟区"]],
};
const key = "ba-map-regions-v1";
const $ = id => document.getElementById(id);
const viewport = $("viewport");
const plane = $("map-plane");
const image = $("map-image");
const svg = $("map-svg");
const regionList = $("region-list");
const schoolList = $("school-list");
const nameInput = $("region-name");
const idInput = $("region-id");
const colorInput = $("region-color");
const colors = ["#60d8f7", "#ffba69", "#a79dff", "#89e6b8", "#ff88a8", "#ffe182"];
let data = {};
try { data = JSON.parse(localStorage.getItem(key)) || {}; } catch { data = {}; }
let school = "abydos";
let location = school;
let selected = null;
let tool = "polygon";
let draft = [];
let drawing = false;
let drag = null;
let space = false;
let scale = 1;
let offsetX = 0;
let offsetY = 0;
let size = { width: 0, height: 0 };
let imageVersion = 0;
let previewUrl = null;
let saveTimer;
const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
const svgEl = (tag, attrs) => {
  const node = document.createElementNS("http://www.w3.org/2000/svg", tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  return node;
};
const entries = () => data[location] || (data[location] = []);
const active = () => entries().find(region => region.id === selected);
const status = text => { $("save-state").textContent = text; };
function save() {
  try { localStorage.setItem(key, JSON.stringify(data)); status("已自动保存"); }
  catch { status("本地保存失败，请导出 JSON"); }
}
function changed() {
  status("未保存");
  clearTimeout(saveTimer);
  saveTimer = setTimeout(save, 280);
  renderSchools();
  renderRegions();
  renderSvg();
}
function selectSchool(id, mapId = id) {
  clearTimeout(saveTimer);
  save();
  school = id;
  location = id === "millennium" && mapId === id ? "millennium-research" : mapId;
  mapId = location;
  selected = null;
  cancelDraft();
  if (previewUrl) { URL.revokeObjectURL(previewUrl); previewUrl = null; }
  size = { width: 0, height: 0 };
  imageVersion++;
  image.hidden = true;
  svg.replaceChildren();
  const locations = schoolLocations[id] || [[id, schools.find(item => item[0] === id)[1]]];
  const entry = locations.find(item => item[0] === mapId);
  $("location-switcher").hidden = locations.length < 2;
  $("location-name").textContent = entry?.[1] || "";
  const url = availableMaps.has(mapId) ? `./resources/tablet/school-maps/${mapId}.png` : "";
  image.onload = () => {
    size = { width: image.naturalWidth, height: image.naturalHeight };
    plane.style.width = `${size.width}px`;
    plane.style.height = `${size.height}px`;
    svg.setAttribute("viewBox", `0 0 ${size.width} ${size.height}`);
    image.hidden = false;
    $("empty-map").hidden = true;
    $("map-info").textContent = `${entry?.[1] || schools.find(item => item[0] === id)[1]} · ${size.width} × ${size.height}`;
    requestAnimationFrame(fit);
    renderSvg();
  };
  image.onerror = () => {
    size = { width: 0, height: 0 };
    image.hidden = true;
    $("empty-map").hidden = false;
    $("map-info").textContent = "暂无地图 · 可导入本地图片预览";
  };
  image.src = url;
  if (!url) image.onerror();
  renderSchools();
  renderRegions();
  renderSvg();
}
function changeLocation(step) {
  const locations = schoolLocations[school];
  if (!locations) return;
  const index = locations.findIndex(item => item[0] === location);
  selectSchool(school, locations[(index + step + locations.length) % locations.length][0]);
}
function renderSchools() {
  schoolList.replaceChildren();
  $("school-count").textContent = String(schools.length);
  for (const [id, name] of schools) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = `school-button${id === school ? " active" : ""}`;
    btn.setAttribute("role", "option");
    btn.setAttribute("aria-selected", String(id === school));
    const icon = document.createElement("img");
    icon.src = id === "schale" ? "./resources/tablet/schale-emblem.png" : `./resources/tablet/school-icons/${id}.png`;
    icon.alt = "";
    const label = document.createElement("span");
    label.className = "school-name";
    label.textContent = name;
    const count = document.createElement("span");
    count.className = "school-count";
    count.textContent = String((schoolLocations[id] || [[id]]).reduce((total, [mapId]) => total + (data[mapId]?.length || 0), 0) || "");
    btn.append(icon, label, count);
    btn.addEventListener("click", () => { if (id !== school) selectSchool(id); });
    schoolList.append(btn);
  }
}
function selectRegion(id) {
  cancelDraft();
  selected = id;
  renderRegions();
  renderSvg();
}
function renderRegions() {
  regionList.replaceChildren();
  $("region-count").textContent = String(entries().length);
  for (const region of entries()) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = `region-button${region.id === selected ? " active" : ""}`;
    const color = document.createElement("span");
    color.className = "region-swatch";
    color.style.background = region.color;
    const title = document.createElement("span");
    title.className = "region-title";
    title.textContent = region.name || "未命名地点";
    const points = document.createElement("span");
    points.className = "region-points";
    points.textContent = region.points.length ? `${region.points.length}点` : "未选取";
    btn.append(color, title, points);
    btn.addEventListener("click", () => selectRegion(region.id));
    regionList.append(btn);
  }
  const region = active();
  nameInput.value = region?.name || "";
  idInput.value = region?.id || "";
  colorInput.value = region?.color || colors[0];
  for (const el of [nameInput, idInput, colorInput, $("clear-region"), $("delete-region")]) el.disabled = !region;
}
function renderSvg() {
  svg.replaceChildren();
  if (!size.width) return;
  for (const region of entries()) {
    if (region.points.length < 3) continue;
    const polygon = svgEl("polygon", {
      points: region.points.map(([x, y]) => `${x},${y}`).join(" "),
      fill: region.color,
      "fill-opacity": region.id === selected ? .22 : .13,
      stroke: region.color,
      class: `region-shape${region.id === selected ? " selected" : ""}`,
    });
    polygon.addEventListener("pointerdown", event => {
      if (event.button !== 0 || tool === "pan" || space) return;
      event.stopPropagation();
      if (draft.length) { beginSelection(event); return; }
      if (selected !== region.id) selectRegion(region.id);
      else if (tool !== "polygon") beginSelection(event);
    });
    svg.append(polygon);
  }
  const region = active();
  if (region && !draft.length) region.points.forEach(([x, y], index) => {
    const point = svgEl("circle", { cx: x, cy: y, r: clamp(5 / scale, 2.2, 12), fill: region.color, class: "region-point" });
    point.addEventListener("pointerdown", event => {
      if (event.button !== 0 || space || tool === "pan") return;
      event.stopPropagation();
      drag = { type: "vertex", index, pointerId: event.pointerId };
      viewport.setPointerCapture(event.pointerId);
    });
    point.addEventListener("contextmenu", event => {
      event.preventDefault();
      if (region.points.length <= 3) return;
      region.points.splice(index, 1);
      changed();
    });
    svg.append(point);
  });
  if (draft.length) {
    const node = svgEl(draft.length >= 3 ? "polygon" : "polyline", {
      points: draft.map(([x, y]) => `${x},${y}`).join(" "),
      class: "draft-shape",
    });
    svg.append(node);
    draft.forEach(([x, y]) => svg.append(svgEl("circle", { cx: x, cy: y, r: clamp(3 / scale, 1.5, 8), class: "draft-point" })));
  }
}
function addRegion() {
  const used = new Set(entries().map(item => item.id));
  let index = 1;
  while (used.has(`place_${index}`)) index++;
  const region = { id: `place_${index}`, name: `地点 ${index}`, color: colors[(entries().length) % colors.length], points: [] };
  entries().push(region);
  selected = region.id;
  changed();
  nameInput.focus();
  nameInput.select();
}
function cancelDraft() { draft = []; drawing = false; drag = null; renderSvg(); }
function commitDraft() {
  if (draft.length < 3 || !active()) { cancelDraft(); return; }
  active().points = draft.map(([x, y]) => [Math.round(x * 10) / 10, Math.round(y * 10) / 10]);
  draft = [];
  drawing = false;
  changed();
}
function setTool(next) {
  cancelDraft();
  tool = next;
  viewport.dataset.tool = next;
  document.querySelectorAll("[data-tool]").forEach(btn => btn.classList.toggle("active", btn.dataset.tool === next));
  const hints = { polygon: "单击描点 · 双击/Enter 完成", freehand: "按住并拖动绘制选区", rectangle: "拖动绘制矩形选区", pan: "拖动画布" };
  $("tool-hint").textContent = hints[next];
}
function pointAt(event) {
  const rect = viewport.getBoundingClientRect();
  return [clamp((event.clientX - rect.left - offsetX) / scale, 0, size.width), clamp((event.clientY - rect.top - offsetY) / scale, 0, size.height)];
}
function updateTransform() {
  plane.style.transform = `translate(${offsetX}px, ${offsetY}px) scale(${scale})`;
  $("zoom-label").textContent = `${Math.round(scale * 100)}%`;
  renderSvg();
}
function fit() {
  if (!size.width) return;
  scale = Math.min((viewport.clientWidth - 64) / size.width, (viewport.clientHeight - 64) / size.height, 3);
  scale = Math.max(.05, scale);
  offsetX = (viewport.clientWidth - size.width * scale) / 2;
  offsetY = (viewport.clientHeight - size.height * scale) / 2;
  updateTransform();
}
function zoomAt(factor, x = viewport.clientWidth / 2, y = viewport.clientHeight / 2) {
  if (!size.width) return;
  const next = clamp(scale * factor, .05, 8);
  offsetX = x - (x - offsetX) * next / scale;
  offsetY = y - (y - offsetY) * next / scale;
  scale = next;
  updateTransform();
}
function beginSelection(event) {
  if (!size.width || ![0, 1].includes(event.button)) return;
  viewport.focus({ preventScroll: true });
  if (event.button === 1 || space || tool === "pan") {
    event.preventDefault();
    drag = { type: "pan", pointerId: event.pointerId, x: event.clientX, y: event.clientY, ox: offsetX, oy: offsetY };
    viewport.classList.add("panning");
    viewport.setPointerCapture(event.pointerId);
    return;
  }
  if (!active()) addRegion();
  const p = pointAt(event);
  if (tool === "polygon") {
    if (event.detail >= 2) { commitDraft(); return; }
    draft.push(p);
    renderSvg();
    return;
  }
  drawing = true;
  draft = tool === "rectangle" ? [p, p, p, p] : [p];
  drag = { type: "draw", pointerId: event.pointerId, origin: p };
  renderSvg();
  viewport.setPointerCapture(event.pointerId);
}
viewport.addEventListener("pointerdown", beginSelection);
viewport.addEventListener("pointermove", event => {
  if (size.width) {
    const [x, y] = pointAt(event);
    $("cursor-info").textContent = `${Math.round(x)}, ${Math.round(y)}`;
  }
  if (!drag || drag.pointerId !== event.pointerId) return;
  if (drag.type === "pan") { offsetX = drag.ox + event.clientX - drag.x; offsetY = drag.oy + event.clientY - drag.y; updateTransform(); }
  else if (drag.type === "vertex") {
    const region = active();
    if (!region) return;
    const [x, y] = pointAt(event);
    region.points[drag.index] = [Math.round(x * 10) / 10, Math.round(y * 10) / 10];
    renderSvg();
  } else if (drag.type === "draw") {
    const p = pointAt(event);
    if (tool === "rectangle") {
      const [x, y] = drag.origin;
      draft = [[x, y], [p[0], y], p, [x, p[1]]];
    } else if (!draft.length || Math.hypot((draft.at(-1)[0] - p[0]) * scale, (draft.at(-1)[1] - p[1]) * scale) > 3) draft.push(p);
    renderSvg();
  }
});
function endPointer(event) {
  if (!drag || drag.pointerId !== event.pointerId) return;
  const kind = drag.type;
  drag = null;
  viewport.classList.remove("panning");
  if (kind === "vertex") changed();
  if (kind === "draw") {
    drawing = false;
    if (tool === "rectangle" && (Math.abs(draft[0][0] - draft[2][0]) < 2 || Math.abs(draft[0][1] - draft[2][1]) < 2)) cancelDraft();
    else commitDraft();
  }
}
viewport.addEventListener("pointerup", endPointer);
viewport.addEventListener("pointercancel", event => { if (drag?.type === "draw") cancelDraft(); else endPointer(event); });
viewport.addEventListener("dblclick", event => { if (tool !== "polygon" || !draft.length) return; event.preventDefault(); commitDraft(); });
viewport.addEventListener("wheel", event => {
  if (!size.width) return;
  event.preventDefault();
  const rect = viewport.getBoundingClientRect();
  zoomAt(event.deltaY < 0 ? 1.12 : 1 / 1.12, event.clientX - rect.left, event.clientY - rect.top);
}, { passive: false });
viewport.addEventListener("contextmenu", event => event.preventDefault());
document.querySelectorAll("[data-tool]").forEach(btn => btn.addEventListener("click", () => setTool(btn.dataset.tool)));
$("zoom-in").addEventListener("click", () => zoomAt(1.25));
$("zoom-out").addEventListener("click", () => zoomAt(1 / 1.25));
$("zoom-fit").addEventListener("click", fit);
$("location-previous").addEventListener("click", () => changeLocation(-1));
$("location-next").addEventListener("click", () => changeLocation(1));
$("add-region").addEventListener("click", addRegion);
nameInput.addEventListener("input", () => { const region = active(); if (!region) return; region.name = nameInput.value; changed(); });
idInput.addEventListener("change", () => {
  const region = active();
  if (!region) return;
  const next = idInput.value.trim().replace(/[^a-zA-Z0-9_-]/g, "_");
  if (!next || entries().some(item => item !== region && item.id === next)) { idInput.value = region.id; return; }
  region.id = next;
  selected = next;
  changed();
});
colorInput.addEventListener("input", () => { const region = active(); if (!region) return; region.color = colorInput.value; changed(); });
$("clear-region").addEventListener("click", () => { if (!active()) return; cancelDraft(); active().points = []; changed(); });
$("delete-region").addEventListener("click", () => { if (!active()) return; cancelDraft(); data[location] = entries().filter(item => item.id !== selected); selected = null; changed(); });
window.addEventListener("keydown", event => {
  if (event.code === "Space" && !["INPUT", "TEXTAREA", "BUTTON"].includes(document.activeElement?.tagName)) { event.preventDefault(); space = true; viewport.dataset.tool = "pan"; }
  if (["INPUT", "TEXTAREA"].includes(document.activeElement?.tagName) || event.ctrlKey || event.metaKey || event.altKey) return;
  if (event.key === "Escape") cancelDraft();
  if (event.key === "Enter" && draft.length) commitDraft();
  if (event.key.toLowerCase() === "l") setTool("polygon");
  if (event.key.toLowerCase() === "f") setTool("freehand");
  if (event.key.toLowerCase() === "r") setTool("rectangle");
});
window.addEventListener("keyup", event => { if (event.code === "Space") { space = false; viewport.dataset.tool = tool; } });
window.addEventListener("blur", () => { space = false; viewport.dataset.tool = tool; });
$("map-upload").addEventListener("change", event => {
  const file = event.target.files?.[0];
  if (!file) return;
  const version = ++imageVersion;
  if (previewUrl) URL.revokeObjectURL(previewUrl);
  const url = URL.createObjectURL(file);
  previewUrl = url;
  image.onload = () => {
    if (version !== imageVersion) return;
    size = { width: image.naturalWidth, height: image.naturalHeight };
    plane.style.width = `${size.width}px`;
    plane.style.height = `${size.height}px`;
    svg.setAttribute("viewBox", `0 0 ${size.width} ${size.height}`);
    image.hidden = false;
    $("empty-map").hidden = true;
    $("map-info").textContent = `${file.name} · ${size.width} × ${size.height}`;
    requestAnimationFrame(fit);
  };
  image.src = url;
  event.target.value = "";
});
$("export-button").addEventListener("click", () => {
  save();
  const payload = {
    version: 1,
    coordinateSystem: "image-pixels",
    schools: Object.fromEntries(schools.map(([id, name]) => [id, {
      name,
      map: availableMaps.has(id) ? `resources/tablet/school-maps/${id}.png` : null,
      regions: data[id] || [],
      locations: (schoolLocations[id] || []).map(([mapId, label]) => ({ id: mapId, name: label, map: `resources/tablet/school-maps/${mapId}.png`, regions: data[mapId] || [] })),
    }])),
  };
  const url = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = "school-map-regions.json";
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
});
$("import-button").addEventListener("click", () => $("import-file").click());
$("import-file").addEventListener("change", async event => {
  const file = event.target.files?.[0];
  if (!file) return;
  try {
    const payload = JSON.parse(await file.text());
    if (payload.version !== 1 || typeof payload.schools !== "object" || !payload.schools) throw Error("文件格式不正确");
    const next = {};
    for (const [id] of schools) {
      const raw = payload.schools[id]?.regions;
      const validRegions = regions => Array.isArray(regions) ? regions.filter(r => typeof r.id === "string" && typeof r.name === "string" && /^#[0-9a-fA-F]{6}$/.test(r.color) && Array.isArray(r.points) && r.points.every(p => Array.isArray(p) && p.length === 2 && p.every(Number.isFinite))).map(r => ({ id: r.id, name: r.name, color: r.color, points: r.points })) : [];
      next[id] = validRegions(raw);
      for (const [mapId] of schoolLocations[id] || []) {
        if (mapId === id) continue;
        next[mapId] = validRegions(payload.schools[id]?.locations?.find(item => item.id === mapId)?.regions);
      }
    }
    data = next;
    selected = null;
    changed();
    status("导入成功");
  } catch { status("导入失败：JSON 格式不正确"); }
  event.target.value = "";
});
setTool("polygon");
selectSchool(school);
