import { api } from "./api.js";
import {
  aronaAnimationNames,
  mountArona,
} from "./resources/tablet/arona-bundle.js";
import {
  advanceTime,
  bandOf,
  clockLabel,
  createWorld,
  dayLabel,
  dutyFor,
  hydrateWorld,
  resolveStudent,
  schools,
  setDuty,
  setEvent,
  students,
  weekdays,
} from "./world.js";

const aronaExpressionLabels = Object.freeze({
  "01": "正常",
  "02": "张嘴挑眉",
  "03": "闭眼笑",
  "04": "张嘴流汗",
  "05": "不悦",
  "06": "气哭",
  "07": "黑线",
  "08": "黑线张嘴",
  "09": "黑线瞥眼",
  10: "闭眼叹气",
  11: "高兴",
  12: "兴奋",
  13: "安详",
  14: "撅嘴",
  15: "流汗",
  16: "害羞",
  17: "晕眩",
  18: "非常害羞",
  19: "黑线害羞",
  20: "大门牙笑",
  21: "兴奋流口水",
  22: "兴奋撇嘴",
  23: "安详流口水",
  24: "安详张嘴",
  25: "兴奋张嘴",
  26: "皱眉张嘴",
  27: "黑线无奈",
  28: "白眼圈圈眼",
  29: "圈圈眼带泪",
  30: "圈圈眼",
  31: "三角嘴",
  32: "闭眼三角嘴",
  99: "闭眼",
});
const mapRegionFiles = { abydos: "./resources/tablet/school-maps/abydos-regions.json" };
const mapRegions = new Map();
const pendingMapRegions = new Map();

const contacts = {
  arona: "阿罗娜",
  plana: "普拉娜",
  ...Object.fromEntries(
    Object.entries(students).map(([id, student]) => [id, student.name]),
  ),
};
const get = (id) => document.getElementById(id);
const make = (tag, className = "", text = "") => {
  const node = document.createElement(tag);
  node.className = className;
  node.textContent = text;
  return node;
};
const button = (text, fn, className = "tablet-action") => {
  const node = make("button", className, text);
  node.type = "button";
  node.addEventListener("click", fn);
  return node;
};
const panel = (title) => {
  const node = make("section", "tablet-panel");
  node.append(make("h3", "", title));
  return node;
};
const limitText = (value) =>
  String(value || "")
    .replace(/<[^>]*>/g, "")
    .trim()
    .slice(0, 1200);

export function createTablet({
  onOpen = () => {},
  onClose = () => {},
  onChange = () => {},
  getStoryContext = () => ({}),
} = {}) {
  const overlay = get("tablet-overlay");
  const content = get("tablet-content");
  let world = createWorld();
  let sessions = {};
  let app = "home";
  let aronaVisible = false;
  let contact = "arona";
  let open = false;
  let busy = false;
  let controller = null;
  let chatError = "";
  let generation = 0;
  let focusBefore = null;
  let disposeArona = null;
  let selectedAronaAnimation = "Idle_01";
  let selectedMapSchool = null;
  let mapFlight = null;
  const cancelMapFlight = () => {
    mapFlight?.cancel();
    mapFlight = null;
  };
  const emit = () => { onChange(); };

  function reset() {
    controller?.abort();
    disposeArona?.();
    disposeArona = null;
    generation++;
    controller = null;
    busy = false;
    chatError = "";
    world = createWorld();
    sessions = {};
    app = "home";
    aronaVisible = false;
    contact = "arona";
    selectedMapSchool = null;
    if (open) render();
  }
  function restore(raw) {
    controller?.abort();
    disposeArona?.();
    disposeArona = null;
    generation++;
    controller = null;
    busy = false;
    chatError = "";
    world = hydrateWorld(raw?.world);
    sessions = {};
    if (
      raw?.sessions &&
      typeof raw.sessions === "object" &&
      !Array.isArray(raw.sessions)
    )
      for (const [id, messages] of Object.entries(raw.sessions)) {
        if (!Object.hasOwn(contacts, id) || !Array.isArray(messages)) continue;
        sessions[id] = messages
          .filter(
            (message) =>
              message &&
              ["user", "assistant"].includes(message.role) &&
              typeof message.content === "string",
          )
          .slice(-40)
          .map((message) => ({
            role: message.role,
            content: limitText(message.content),
          }));
      }
    app = ["home", "map", "chat", "schedule"].includes(raw?.app)
      ? raw.app
      : "home";
    selectedMapSchool = null;
    aronaVisible = raw?.aronaVisible === true;
    contact = Object.hasOwn(contacts, raw?.contact) ? raw.contact : "arona";
    if (open) render();
  }
  const snapshot = () => ({
    world: structuredClone(world),
    sessions: structuredClone(sessions),
    app,
    aronaVisible,
    contact,
  });
  function openTablet() {
    if (
      open ||
      get("story").hidden ||
      !get("story-log").hidden ||
      !get("story-menu").hidden ||
      !get("api-settings").hidden
    )
      return;
    onOpen();
    open = true;
    focusBefore = document.activeElement;
    overlay.hidden = false;
    render();
    content.querySelector("button")?.focus();
  }
  function closeTablet() {
    if (!open) return;
    cancelMapFlight();
    appTransition?.finish();
    frameCleanup();
    controller?.abort();
    disposeArona?.();
    disposeArona = null;
    generation++;
    controller = null;
    busy = false;
    open = false;
    overlay.hidden = true;
    onClose();
    emit();
    focusBefore?.focus?.();
  }
  let appTransition = null;
  const frameCleanup = () => overlay.querySelectorAll(".tablet-app-transition-out").forEach((node) => node.remove());
  function switchApp(next, source = null) {
    if (!["home", "map", "chat", "schedule"].includes(next) || !open || next === app) return;
    appTransition?.finish();
    frameCleanup();
    const previous = app;
    const outgoing = content;
    const frame = overlay.querySelector(".tablet-screen");
    const origin = source?.getBoundingClientRect();
    const bounds = frame.getBoundingClientRect();
    const x = origin ? origin.left + origin.width / 2 - bounds.left : bounds.width / 2;
    const y = origin ? origin.top + origin.height / 2 - bounds.top : bounds.height / 2;
    const startRadius = origin ? Math.hypot(origin.width, origin.height) / 2 : 24;
    const maxRadius = Math.hypot(Math.max(x, bounds.width - x), Math.max(y, bounds.height - y));
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!reduced && previous !== "home") {
      const snapshot = outgoing.cloneNode(true);
      snapshot.className = "tablet-app-transition-out";
      snapshot.querySelectorAll("[id]").forEach((node) => node.removeAttribute("id"));
      snapshot.style.padding = getComputedStyle(outgoing).padding;
      frame.append(snapshot);
      const exit = snapshot.animate(
        [{ opacity: 1, transform: "scale(1)" }, { opacity: 0, transform: "scale(.92)" }],
        { duration: 380, easing: "cubic-bezier(.22,1,.36,1)", fill: "forwards" },
      );
      exit.addEventListener("finish", () => snapshot.remove(), { once: true });
    }
    app = next;
    selectedMapSchool = null;
    render();
    emit();
    if (reduced) return;
    if (next !== "home") {
      const mask = `circle(${startRadius}px at ${x}px ${y}px)`;
      const full = `circle(${maxRadius}px at ${x}px ${y}px)`;
      const motion = content.animate(
        [{ clipPath: mask, opacity: .65, transform: "scale(.97)" }, { clipPath: full, opacity: 1, transform: "scale(1)" }],
        { duration: 500, easing: "cubic-bezier(.22,1,.36,1)" },
      );
      appTransition = { finish: () => { motion.cancel(); appTransition = null; } };
      motion.addEventListener("finish", () => appTransition?.finish(), { once: true });
    }
  }
  function renderHome() {
    const home = make("div", "tablet-home");
    const dismiss = button("关闭", closeTablet, "tablet-home-close");
    dismiss.setAttribute("aria-label", "关闭夏莱平板");
    home.append(dismiss);
    if (aronaVisible) {
      const arona = make("canvas", "tablet-arona");
      arona.setAttribute("role", "img");
      arona.setAttribute("aria-label", "阿罗娜");
      home.append(arona);
      const picker = make("aside", "tablet-arona-picker");
      picker.setAttribute("aria-label", "阿罗娜动作列表");
      const list = make("div", "tablet-arona-picker-list");
      list.setAttribute("role", "group");
      list.setAttribute("aria-label", "阿罗娜动作");
      for (const name of aronaAnimationNames) {
        const choice = button(
          aronaExpressionLabels[name]
            ? `${name} ${aronaExpressionLabels[name]}`
            : name,
          () => {
            selectedAronaAnimation = name;
            for (const item of list.children) {
              item.classList.toggle("active", item.dataset.animation === name);
              item.setAttribute(
                "aria-pressed",
                String(item.dataset.animation === name),
              );
            }
            disposeArona?.play(name, { loop: true, returnToIdle: false });
          },
          `tablet-arona-picker-item${name === selectedAronaAnimation ? " active" : ""}`,
        );
        choice.dataset.animation = name;
        choice.setAttribute(
          "aria-pressed",
          String(name === selectedAronaAnimation),
        );
        list.append(choice);
      }
      picker.append(list);
      home.append(picker);
      requestAnimationFrame(() => {
        if (!arona.isConnected || !open || app !== "home") return;
        disposeArona = mountArona(arona);
        if (selectedAronaAnimation !== "Idle_01")
          disposeArona.play(selectedAronaAnimation, {
            loop: true,
            returnToIdle: false,
          });
      });
    } else {
      const intro = make("button", "tablet-home-intro");
      intro.type = "button";
      intro.setAttribute("aria-label", "与阿罗娜见面");
      intro.append(
        make("span", "tablet-home-eyebrow", "S.C.H.A.L.E.  /  SHITTIM CHEST"),
        make("strong", "", "早上好，老师。"),
        make(
          "span",
          "",
          `${dayLabel(world)}  ·  ${bandOf(world)}  ·  ${schools[world.school].name}`,
        ),
      );
      intro.addEventListener("click", () => {
        aronaVisible = true;
        render();
        emit();
      });
      home.append(intro);
    }
    const grid = make("div", "tablet-grid");
    for (const [id, title, subtitle, image] of [
      ["map", "地图", "探索基沃托斯", "Academy_Abydos.jpg"],
      ["chat", "MomoTalk", "与大家保持联络", "Contents_Image_Story.png"],
      ["schedule", "夏莱日程", "今天也请多指教", "Contents_Image_Week.png"],
    ]) {
      const card = button(
        "",
        () => switchApp(id, card),
        `tablet-card tablet-card-${id}`,
      );
      const picture = make("span", "tablet-card-art");
      picture.style.backgroundImage = `url("./resources/tablet/${image}")`;
      card.append(
        picture,
        make("span", "tablet-card-label", title),
        make("span", "tablet-card-caption", subtitle),
      );
      grid.append(card);
    }
    home.append(grid);
    content.append(home);
  }
  function renderMap() {
    const back = button(
      "",
      () => {
        if (selectedMapSchool) selectMapSchool(selectedMapSchool);
        else switchApp("home");
      },
      "tablet-map-back",
    );
    back.setAttribute("aria-label", "返回");
    content.append(back);
    const badges = make("div", "tablet-map-badges");
    const emblems = [
      ["abydos", "ABYDOS", "阿拜多斯高中"],
      ["trinity", "TRINITY", "圣三一综合学园"],
      ["gehenna", "GEHENNA", "格黑娜学园"],
      ["millennium", "MILLENNIUM", "千禧科技学园"],
      ["redwinter", "RED WINTER", "红冬联邦学园"],
      ["hyakkiyako", "HYAKKIYAKO", "百鬼夜行联合学园"],
      ["valkyrie", "VALKYRIE", "瓦尔基里警察学校"],
      ["srt", "SRT", "SRT特殊学园"],
      ["arius", "ARIUS", "阿里乌斯分校"],
      ["highlander", "HIGHLANDER", "高原铁道学园"],
      ["wildhunt", "WILDHUNT", "狂猎艺术学园"],
      ["shanhaijing", "SHANHAIJING", "山海经高级中学"],
      ["odyssey", "ODYSSEY", "奥德赛海洋学园"],
      ["federal", "GENERAL STUDENT COUNCIL", "联邦学生会"],
      ["schale", "S.C.H.A.L.E.", "夏莱"],
    ];
    for (const [id, english, name] of emblems) {
      const badge = button(
        "",
        () => selectMapSchool(id, name),
        `tablet-map-badge tablet-map-badge-${id}`,
      );
      const icon = make("img", "tablet-map-badge-image");
      icon.src = `./resources/tablet/${id === "schale" ? "schale-emblem.png" : `school-icons/${id}.png`}`;
      icon.alt = "";
      icon.loading = "lazy";
      badge.append(
        icon,
        make("span", "tablet-map-badge-english", english),
        make("span", "tablet-map-badge-name", name),
      );
      badges.append(badge);
    }
    content.append(badges);
    if (selectedMapSchool) {
      const chosen = badges.querySelector(
        `.tablet-map-badge-${selectedMapSchool}`,
      );
      if (chosen)
        showMapSchool(
          badges,
          chosen,
          selectedMapSchool,
          chosen.querySelector(".tablet-map-badge-name").textContent,
        );
      else selectedMapSchool = null;
    }
  }
  function loadMapRegions(id, stage, mount) {
    const file = mapRegionFiles[id];
    if (!file) return;
    let pending = pendingMapRegions.get(id);
    if (!pending) {
      pending = fetch(file)
        .then((response) => {
          if (!response.ok) throw new Error(`Map regions: ${response.status}`);
          return response.json();
        })
        .then((data) => {
          const regions = Array.isArray(data.regions) ? data.regions.filter((region) =>
            typeof region.name === "string" && Array.isArray(region.points) &&
            region.points.length >= 3 && region.points.every((point) =>
              Array.isArray(point) && point.length === 2 && point.every(Number.isFinite)) &&
            typeof region.part?.image === "string" && Array.isArray(region.part.bounds) &&
            region.part.bounds.length === 4 && region.part.bounds.every(Number.isFinite) &&
            Array.isArray(region.part.outline) && region.part.outline.length >= 3) : [];
          mapRegions.set(id, regions);
          return regions;
        })
        .catch(() => {
          pendingMapRegions.delete(id);
          return [];
        });
      pendingMapRegions.set(id, pending);
    }
    pending.then((regions) => {
      if (regions.length && stage.isConnected) mount(regions);
    });
  }
  function createMapDetail(id, name) {
    const detail = make("section", "tablet-map-detail");
    detail.setAttribute("aria-label", `${name}地图`);
    const maps = {
      abydos: [["abydos", "阿拜多斯高中"]],
      trinity: [["trinity", "圣三一综合学园"]],
      gehenna: [["gehenna", "格黑娜学园"]],
      millennium: [["millennium-research", "研究学习区"], ["millennium-akihabara", "春叶原"]],
      redwinter: [["redwinter", "红冬联邦学园"]],
      hyakkiyako: [["hyakkiyako", "百鬼夜行联合学园"]],
      shanhaijing: [["shanhaijing", "山海经高级中学"]],
      wildhunt: [["wildhunt", "狂猎艺术学园"]],
      federal: [["federal", "D.U.白鸟区（重建后）"], ["federal-shiratori", "D.U.白鸟区"]],
      schale: [["schale", "夏莱"]],
    };
    const locations = maps[id];
    if (!locations) {
      detail.append(
        make("p", "tablet-map-detail-empty", `${name} · 暂无校区地图`),
      );
      return detail;
    }
    let current = 0;
    const stage = make("div", "tablet-map-stage");
    let locationName = null;
    let mapVersion = 0;
    let transition = null;
    const setLocation = (index, direction = 0) => {
      const version = ++mapVersion;
      const previousStage = stage.querySelector(".tablet-map-location-frame");
      transition?.cancel();
      transition = null;
      stage.querySelectorAll(".tablet-map-location-ghost").forEach((node) => {
        node.getAnimations().forEach((animation) => animation.cancel());
        node.remove();
      });
      if (direction && previousStage && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
        previousStage.getAnimations().forEach((animation) => animation.cancel());
        const ghost = previousStage.cloneNode(true);
        ghost.classList.add("tablet-map-location-ghost");
        ghost.setAttribute("aria-hidden", "true");
        ghost.querySelectorAll("[tabindex]").forEach((node) => node.removeAttribute("tabindex"));
        stage.append(ghost);
        const exit = ghost.animate(
          [{ opacity: 1, transform: "translateY(0)" }, { opacity: 0, transform: `translateY(${-direction * 36}px)` }],
          { duration: 340, easing: "ease-in", fill: "forwards" },
        );
        exit.addEventListener("finish", () => ghost.remove(), { once: true });
      }
      current = (index + locations.length) % locations.length;
      const [file, label] = locations[current];
      stage.className = `tablet-map-stage tablet-map-stage-${file}`;
      const frame = make("div", "tablet-map-location-frame");
      if (direction && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) frame.style.opacity = "0";
      const image = make("img", "tablet-map-detail-image");
      image.alt = `${label}地图`;
      frame.append(image);
      previousStage?.remove();
      stage.append(frame);
      image.src = `./resources/tablet/school-maps/${file}.png`;
      detail.setAttribute("aria-label", `${label}地图`);
      if (locationName) {
        locationName.textContent = label;
        if (direction && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
          locationName.getAnimations().forEach((animation) => animation.cancel());
          locationName.animate(
            [{ opacity: 0, transform: `translate(-50%, ${direction * 12}px)` }, { opacity: 1, transform: "translate(-50%, 0)" }],
            { duration: 380, easing: "ease-out" },
          );
        }
      }
      const reveal = () => {
        if (version !== mapVersion) return;
        frame.style.opacity = "";
        if (direction && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
          transition = frame.animate(
            [{ opacity: 0, transform: `translateY(${direction * 36}px)` }, { opacity: 1, transform: "translateY(0)" }],
            { duration: 430, easing: "cubic-bezier(.22,.65,.2,1)", fill: "both" },
          );
          transition.addEventListener("finish", () => { if (version === mapVersion) transition = null; }, { once: true });
        }
      };
      if (image.complete && image.naturalWidth) reveal();
      else image.addEventListener("load", reveal, { once: true });
      if (mapRegionFiles[file]) {
        const showRegions = (regions) => {
          if (version !== mapVersion) return;
          if (image.complete && image.naturalWidth) mountRegions(regions, frame, image);
          else image.addEventListener("load", () => {
            if (version === mapVersion) mountRegions(regions, frame, image);
          }, { once: true });
        };
        if (mapRegions.has(file)) showRegions(mapRegions.get(file));
        else loadMapRegions(file, stage, showRegions);
      }
    };
    detail.append(stage);
    if (locations.length > 1) {
      const switcher = make("div", "tablet-map-location-switcher");
      locationName = make("span", "tablet-map-location-name");
      const previous = button("", () => setLocation(current - 1, -1), "tablet-map-location-arrow tablet-map-location-arrow-up");
      const next = button("", () => setLocation(current + 1, 1), "tablet-map-location-arrow tablet-map-location-arrow-down");
      previous.setAttribute("aria-label", "上一地点");
      next.setAttribute("aria-label", "下一地点");
      switcher.append(previous, locationName, next);
      detail.append(switcher);
    }
    const mountRegions = (regions, frame, image) => {
      if (frame.querySelector(".tablet-map-regions") || !image.naturalWidth) return;
      const overlay = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      overlay.setAttribute("class", "tablet-map-regions");
      overlay.setAttribute("viewBox", `0 0 ${image.naturalWidth} ${image.naturalHeight}`);
      overlay.setAttribute("preserveAspectRatio", "none");
      overlay.setAttribute("role", "group");
      overlay.setAttribute("aria-label", `${name}地点`);
      const label = make("span", "tablet-map-region-label");
      label.setAttribute("aria-hidden", "true");
      const clearActive = () => {
        overlay.querySelector(".is-hovered")?.classList.remove("is-hovered");
        label.classList.remove("is-visible");
      };
      const setActive = (group, region) => {
        overlay.querySelector(".is-hovered")?.classList.remove("is-hovered");
        group.classList.add("is-hovered");
        label.textContent = region.name;
        label.classList.add("is-visible");
      };
      for (const region of regions) {
        const [x, y, width, height] = region.part.bounds;
        const group = document.createElementNS("http://www.w3.org/2000/svg", "g");
        group.setAttribute("class", "tablet-map-region");
        group.setAttribute("role", "img");
        group.setAttribute("aria-label", region.name);
        group.setAttribute("tabindex", "0");
        const cutout = document.createElementNS("http://www.w3.org/2000/svg", "image");
        cutout.setAttribute("href", `./resources/tablet/school-maps/${region.part.image}`);
        cutout.setAttribute("x", x);
        cutout.setAttribute("y", y);
        cutout.setAttribute("width", width);
        cutout.setAttribute("height", height);
        cutout.setAttribute("preserveAspectRatio", "none");
        cutout.setAttribute("class", "tablet-map-region-cutout");
        const outline = document.createElementNS("http://www.w3.org/2000/svg", "path");
        outline.setAttribute("d", `M ${region.part.outline.map(([px, py]) => `${px} ${py}`).join(" L ")} Z`);
        outline.setAttribute("class", "tablet-map-region-outline");
        const hit = document.createElementNS("http://www.w3.org/2000/svg", "path");
        hit.setAttribute("d", `M ${region.points.map(([px, py]) => `${px} ${py}`).join(" L ")} Z`);
        hit.setAttribute("class", "tablet-map-region-hit");
        group.append(cutout, outline, hit);
        group.addEventListener("pointerenter", () => setActive(group, region));
        group.addEventListener("pointerleave", () => {
          if (overlay.querySelector(".is-hovered") === group) clearActive();
        });
        group.addEventListener("focus", () => setActive(group, region));
        group.addEventListener("blur", () => {
          if (overlay.querySelector(".is-hovered") === group) clearActive();
        });
        overlay.append(group);
      }
      frame.append(overlay, label);
    };
    setLocation(0);
    return detail;
  }
  function showMapSchool(badges, badge, id, name) {
    content.querySelector(".tablet-map-detail.is-leaving")?.remove();
    badges.classList.add("is-detail");
    badge.classList.add("is-selected");
    badge.setAttribute("aria-pressed", "true");
    badge.setAttribute("aria-label", `${name} · 返回学院列表`);
    for (const other of badges.children)
      if (other !== badge) {
        other.tabIndex = -1;
        other.setAttribute("aria-hidden", "true");
      }
    badges.after(createMapDetail(id, name));
  }
  function selectMapSchool(id, name) {
    const badges = content.querySelector(".tablet-map-badges");
    if (!badges) return;
    const badge = badges.querySelector(`.tablet-map-badge-${id}`);
    if (!badge) return;
    cancelMapFlight();
    const returning = selectedMapSchool === id;
    content.querySelector(".tablet-map-detail.is-leaving")?.remove();
    const startScroll = content.scrollTop;
    const start = badge.getBoundingClientRect();
    const detail = content.querySelector(".tablet-map-detail");
    if (returning && detail && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      detail.getAnimations().forEach((animation) => animation.finish());
      const position = detail.getBoundingClientRect();
      const host = content.getBoundingClientRect();
      detail.style.left = `${position.left - host.left + content.scrollLeft}px`;
      detail.style.top = `${position.top - host.top + content.scrollTop}px`;
      detail.style.width = `${position.width}px`;
      detail.style.height = `${position.height}px`;
      detail.classList.add("is-leaving");
      const exit = detail.animate(
        [{ opacity: 1, transform: "translateX(0)" }, { opacity: 0, transform: "translateX(20px)" }],
        { duration: 500, easing: "ease", fill: "forwards" },
      );
      exit.addEventListener("finish", () => detail.remove(), { once: true });
    }
    if (returning) {
      selectedMapSchool = null;
      badges.classList.remove("is-detail");
      badge.classList.remove("is-selected");
      badge.removeAttribute("aria-pressed");
      badge.removeAttribute("aria-label");
      for (const other of badges.children) {
        other.tabIndex = 0;
        other.removeAttribute("aria-hidden");
      }
      if (!detail?.classList.contains("is-leaving")) detail?.remove();
    } else {
      const previous = badges.querySelector(".is-selected");
      if (previous) {
        previous.classList.remove("is-selected");
        previous.removeAttribute("aria-pressed");
        previous.removeAttribute("aria-label");
        content.querySelector(".tablet-map-detail:not(.is-leaving)")?.remove();
      }
      selectedMapSchool = id;
      showMapSchool(badges, badge, id, name);
    }
    content.scrollTop = startScroll;
    const end = badge.getBoundingClientRect();
    const dx = start.left - end.left;
    const dy = start.top - end.top;
    const scaleX = start.width / end.width;
    const scaleY = start.height / end.height;
    badge.classList.add("is-moving");
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches ||
        (!dx && !dy && scaleX === 1 && scaleY === 1)) {
      badge.classList.remove("is-moving");
      return;
    }
    const motion = badge.animate(
      [{ transform: `translate(${dx}px, ${dy}px) scale(${scaleX}, ${scaleY})` }, { transform: "none" }],
      { duration: 650, easing: "cubic-bezier(.22,1,.36,1)" },
    );
    const finish = () => {
      if (mapFlight?.cancel !== finish) return;
      motion.cancel();
      badge.classList.remove("is-moving");
      mapFlight = null;
    };
    mapFlight = { cancel: finish };
    motion.addEventListener("finish", finish, { once: true });
  }
  function renderSchedule() {
    const back = button("←", () => switchApp("home"), "tablet-app-back");
    back.setAttribute("aria-label", "返回");
    content.append(back);
    content.append(
      make("h2", "", "夏莱日程"),
      make("p", "tablet-subtitle", `${dayLabel(world)} · ${clockLabel(world)}`),
    );
    const today = Math.floor(world.minute / 1440);
    for (let offset = 0; offset < 7; offset++) {
      const day = today + offset;
      const box = panel(
        `第 ${day + 1} 天 · ${weekdays[day % 7]}${offset === 0 ? " · 今天" : ""}`,
      );
      const row = make("div", "tablet-row");
      row.append(make("span", "tablet-badge", "值日生"));
      const select = make("select");
      select.setAttribute("aria-label", `第 ${day + 1} 天值日生`);
      for (const [id, student] of Object.entries(students)) {
        const option = make("option", "", student.name);
        option.value = id;
        select.append(option);
      }
      select.value = dutyFor(world, day);
      select.addEventListener("change", () => {
        if (setDuty(world, day, select.value)) {
          render();
          emit();
        }
      });
      row.append(select);
      box.append(row, make("p", "", "值日时间 09:00—18:00 · 夏莱办公室"));
      content.append(box);
    }
  }
  function renderChat() {
    const back = button("←", () => switchApp("home"), "tablet-app-back");
    back.setAttribute("aria-label", "返回");
    content.append(back);
    content.append(make("h2", "", "聊天"));
    const split = make("div", "tablet-split");
    const list = make("aside", "tablet-contacts");
    for (const [id, name] of Object.entries(contacts)) {
      const entry = button(
        name,
        () => {
          contact = id;
          render();
          emit();
        },
        id === contact ? "active" : "",
      );
      list.append(entry);
    }
    const chat = make("section", "tablet-chat");
    chat.append(make("h3", "", contacts[contact]));
    const messages = make("div", "tablet-messages");
    messages.setAttribute("aria-live", "polite");
    for (const message of sessions[contact] || [])
      messages.append(
        make(
          "div",
          `tablet-message${message.role === "user" ? " mine" : ""}`,
          message.content,
        ),
      );
    if (busy) messages.append(make("div", "tablet-message", "正在回复…"));
    chat.append(messages);
    if (chatError) chat.append(make("p", "tablet-error", chatError));
    const form = make("form", "tablet-compose");
    const input = make("input");
    input.type = "text";
    input.maxLength = 600;
    input.placeholder = `发送给${contacts[contact]}`;
    input.setAttribute("aria-label", "聊天消息");
    input.disabled = busy;
    const send = make("button", "tablet-action", "发送");
    send.type = "submit";
    send.disabled = busy;
    form.append(input, send);
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      sendMessage(input.value);
    });
    chat.append(form);
    split.append(list, chat);
    content.append(split);
    messages.scrollTop = messages.scrollHeight;
  }
  function render() {
    cancelMapFlight();
    disposeArona?.();
    disposeArona = null;
    overlay.dataset.app = app;
    overlay.dataset.arona = aronaVisible ? "visible" : "hidden";
    content.replaceChildren();
    if (app === "map") renderMap();
    else if (app === "chat") renderChat();
    else if (app === "schedule") renderSchedule();
    else renderHome();
  }
  async function sendMessage(input) {
    const text = limitText(input);
    if (!text || busy) return;
    const id = contact;
    const history = sessions[id] || [];
    const student = students[id];
    const position = student ? resolveStudent(world, id) : null;
    const location = position
      ? `${schools[position.school].name} · ${schools[position.school].places[position.place]}`
      : "什亭之匣";
    const duty = students[dutyFor(world)]?.name || "";
    const story = getStoryContext();
    const context = `你在《蔚蓝档案》世界中扮演${contacts[id]}，通过夏莱平板与老师单独私聊。只用简体中文，以角色本人的口吻回复，保持人物性格，不扮演其他人，不写旁白或格式标签。你不能修改时间、地图、学生位置、排班或剧情事实。当前${dayLabel(world)} ${clockLabel(world)}，${bandOf(world)}。${student ? `你当前所在：${location}。今日值日生：${duty}。` : `老师所在：${schools[world.school].name} · ${schools[world.school].places[world.place]}。今日值日生：${duty}。`}${story?.who ? `主剧情当前发言人：${String(story.who).slice(0, 40)}。` : ""}回答简洁自然。`;
    sessions[id] = [...history, { role: "user", content: text }].slice(-40);
    chatError = "";
    busy = true;
    render();
    emit();
    const current = new AbortController();
    controller = current;
    const token = ++generation;
    try {
      const answer = limitText(
        await api.chat({
          route: "tabletChat",
          signal: current.signal,
          messages: [
            { role: "system", content: context },
            ...history.slice(-18),
            { role: "user", content: text },
          ],
        }),
      );
      if (token !== generation) return;
      if (!answer) throw new Error("没有收到回复");
      sessions[id] = [
        ...sessions[id],
        { role: "assistant", content: answer },
      ].slice(-40);
      advanceTime(world, 5);
    } catch (error) {
      if (token !== generation) return;
      sessions[id] = history;
      if (error.name !== "AbortError") chatError = `发送失败：${error.message}`;
    } finally {
      if (token === generation) {
        busy = false;
        controller = null;
        if (open) render();
        emit();
      }
    }
  }
  const trigger = get("tablet-trigger");
  let dragStart = null;
  let moved = false;
  let suppressClick = false;
  trigger.addEventListener("pointerdown", (event) => {
    if (event.button !== 0 && event.pointerType === "mouse") return;
    const rect = trigger.getBoundingClientRect();
    dragStart = {
      id: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      left: rect.left,
      top: rect.top,
    };
    moved = false;
    trigger.setPointerCapture(event.pointerId);
  });
  trigger.addEventListener("pointermove", (event) => {
    if (!dragStart || event.pointerId !== dragStart.id) return;
    const dx = event.clientX - dragStart.x;
    const dy = event.clientY - dragStart.y;
    if (!moved && Math.hypot(dx, dy) < 6) return;
    if (!moved) {
      moved = true;
      trigger.classList.add("is-dragging");
    }
    const area = get("story").getBoundingClientRect();
    const width = trigger.offsetWidth;
    const height = trigger.offsetHeight;
    const left = Math.max(
      0,
      Math.min(area.width - width, dragStart.left - area.left + dx),
    );
    const top = Math.max(
      0,
      Math.min(area.height - height, dragStart.top - area.top + dy),
    );
    trigger.style.left = `${left}px`;
    trigger.style.top = `${top}px`;
    trigger.style.right = "auto";
    trigger.style.transform = "none";
  });
  const finishDrag = (event) => {
    if (!dragStart || event.pointerId !== dragStart.id) return;
    if (moved) {
      suppressClick = true;
      setTimeout(() => {
        suppressClick = false;
      }, 250);
    }
    dragStart = null;
    moved = false;
    trigger.classList.remove("is-dragging");
  };
  trigger.addEventListener("pointerup", finishDrag);
  trigger.addEventListener("pointercancel", finishDrag);
  trigger.addEventListener("click", () => {
    if (!suppressClick) openTablet();
  });
  overlay.addEventListener("click", (event) => {
    if (event.target === overlay) closeTablet();
  });
  overlay.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      closeTablet();
    }
    if (event.key === "Tab") {
      const items = [
        ...overlay.querySelectorAll(
          "button:not(:disabled),input:not(:disabled),select:not(:disabled)",
        ),
      ];
      const first = items[0],
        last = items.at(-1);
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }
  });
  return {
    open: openTablet,
    close: closeTablet,
    reset,
    restore,
    snapshot,
    getWorld: () => structuredClone(world),
    advance: (minutes) => {
      const changed = advanceTime(world, minutes);
      if (changed) {
        if (open) render();
        emit();
      }
      return changed;
    },
    setEvent: (id, event) => {
      const changed = setEvent(world, id, event);
      if (changed) {
        if (open) render();
        emit();
      }
      return changed;
    },
    isOpen: () => open,
  };
}
