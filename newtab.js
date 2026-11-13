/* ── Storage ─────────────────────────────────────────────────────────── */
const hasChromeStorage =
  typeof chrome !== "undefined" && chrome.storage && chrome.storage.local;

async function load() {
  if (hasChromeStorage) {
    const { items } = await chrome.storage.local.get("items");
    return items ?? [];
  }
  try {
    return JSON.parse(localStorage.getItem("speeddial.items")) ?? [];
  } catch {
    return [];
  }
}

function save() {
  if (hasChromeStorage) {
    chrome.storage.local.set({ items: state.items });
  } else {
    localStorage.setItem("speeddial.items", JSON.stringify(state.items));
  }
}

/* ── State ───────────────────────────────────────────────────────────── */
const state = { items: [] };
let path = []; // stack of folder ids currently open
let sheetMode = null; // null | {mode:"add"} | {mode:"edit", list, item}
let editType = "link";

const grid = document.getElementById("grid");
const folderBar = document.getElementById("folderBar");
const folderTitle = document.getElementById("folderTitle");
const emptyHint = document.getElementById("emptyHint");

/* ── Helpers ─────────────────────────────────────────────────────────── */
const FOLDER_GLYPH = `<svg viewBox="0 0 24 24" fill="currentColor">
  <path d="M4 5.5A1.5 1.5 0 0 1 5.5 4h4l2 2.5h7A1.5 1.5 0 0 1 20 8v10a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 18v-12.5z"/>
</svg>`;

function currentList() {
  let list = state.items;
  for (const id of path) {
    const folder = list.find((t) => t.id === id);
    if (!folder) break;
    folder.children ??= [];
    list = folder.children;
  }
  return list;
}

function listFor(pathIds) {
  let list = state.items;
  for (const id of pathIds) {
    const folder = list.find((t) => t.id === id);
    if (!folder) return null;
    folder.children ??= [];
    list = folder.children;
  }
  return list;
}

function normalizeUrl(raw) {
  const url = raw.trim();
  if (!url) return "";
  return /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(url) ? url : "https://" + url;
}

function faviconFor(url) {
  try {
    const host = new URL(url).hostname;
    return `https://www.google.com/s2/favicons?domain=${host}&sz=64`;
  } catch {
    return null;
  }
}

function hueFor(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) >>> 0;
  return h % 360;
}

function id() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

/* ── Rendering ───────────────────────────────────────────────────────── */
function render() {
  grid.classList.remove("nav-forward", "nav-back"); // don't replay nav animation on data edits
  const list = currentList();
  grid.textContent = "";

  // Tiles
  for (const item of list) {
    grid.appendChild(makeTile(item, list));
  }

  // Add tile
  const add = document.createElement("button");
  add.className = "tile add";
  add.innerHTML = `<span class="circle"><svg class="plus" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round">
    <path d="M12 5v14M5 12h14"/>
  </svg></span>
    <span class="label"></span>`;
  add.addEventListener("click", () => openSheet("add"));
  grid.appendChild(add);

  // Folder bar
  if (path.length) {
    const name =
      listFor(path.slice(0, -1))?.find((t) => t.id === path[path.length - 1])
        ?.name ?? "";
    folderTitle.textContent = name;
    folderBar.classList.remove("hidden");
  } else {
    folderBar.classList.add("hidden");
  }

  emptyHint.classList.toggle("hidden", list.length > 0);
}

function makeTile(item, list) {
  const tile = document.createElement("button");
  tile.className = "tile";

  if (item.type === "folder") {
    tile.innerHTML = `
      <span class="circle"></span>
      <span class="label"></span>`;
    const circle = tile.querySelector(".circle");
    const preview = (item.children ?? []).slice(0, 4);

    if (preview.length === 0) {
      circle.innerHTML = FOLDER_GLYPH;
      circle.firstElementChild.classList.add("folder-glyph");
    } else {
      const mg = document.createElement("span");
      mg.className = "mini-grid";
      for (const child of preview) {
        const cell = document.createElement("span");
        {
          const img = document.createElement("img");
          img.alt = "";
          img.loading = "lazy";
          img.draggable = false;
          const src = child.icon || faviconFor(child.url);
          if (src) {
            img.src = src;
            img.onerror = () => makeLetterAvatar(img, child.name, true);
          } else {
            makeLetterAvatar(img, child.name, true);
          }
          cell.appendChild(img);
        }
        mg.appendChild(cell);
      }
      circle.appendChild(mg);
    }
  } else {
    tile.innerHTML = `
      <span class="circle"><img alt="" loading="lazy" draggable="false"></span>
      <span class="label"></span>`;
    const img = tile.querySelector("img");
    const src = item.icon || faviconFor(item.url);
    if (src) {
      img.src = src;
      img.onerror = () => makeLetterAvatar(img, item.name);
    } else {
      makeLetterAvatar(img, item.name);
    }
  }

  tile.querySelector(".label").textContent = item.name;

  let pressTimer = null;
  let longPressed = false;

  const cancelPress = () => {
    if (pressTimer) clearTimeout(pressTimer);
    pressTimer = null;
  };

  // Long-press → edit (touch)
  tile.addEventListener("pointerdown", (e) => {
    if (e.button !== 0 && e.pointerType === "mouse") return;
    longPressed = false;
    const startX = e.clientX;
    const startY = e.clientY;
    pressTimer = setTimeout(() => {
      longPressed = true;
      openSheet("edit", list, item);
    }, 550);
    const onMove = (ev) => {
      if (Math.hypot(ev.clientX - startX, ev.clientY - startY) > 10) {
        cancelPress();
        tile.removeEventListener("pointermove", onMove);
      }
    };
    tile.addEventListener("pointermove", onMove);
    for (const evt of ["pointerup", "pointercancel", "pointerleave"]) {
      tile.addEventListener(evt, () => {
        cancelPress();
        tile.removeEventListener("pointermove", onMove);
      }, { once: true });
    }
  });

  // Right-click → edit (desktop testing)
  tile.addEventListener("contextmenu", (e) => {
    e.preventDefault();
    openSheet("edit", list, item);
  });

  // Tap → open
  tile.addEventListener("click", (e) => {
    e.preventDefault();
    if (longPressed) return; // the click fires after a long-press release
    if (item.type === "folder") {
      path = [...path, item.id];
      render();
      animateGrid("forward");
    } else {
      window.location.href = item.url;
    }
  });

  return tile;
}

function makeLetterAvatar(img, name, mini = false) {
  const letter = (name.trim()[0] || "?").toUpperCase();
  const span = document.createElement("span");
  span.className = mini ? "letter mini" : "letter";
  span.textContent = letter;
  span.style.background = `hsl(${hueFor(name)} 45% 45%)`;
  if (!mini) {
    span.style.width = span.style.height = "100%";
  }
  img.replaceWith(span);
}

/* Populate the "Folder" picker with top-level folders (links only — folders
   always stay at the top level). Preselects the link's current container. */
function setupMoveSelect(item) {
  moveLabel.classList.toggle("hidden", item.type !== "link");
  if (item.type !== "link") return;
  const current = path.length ? path[path.length - 1] : "";
  moveSelect.textContent = "";
  const options = [["", "Top level"]];
  for (const f of state.items) {
    if (f.type === "folder") options.push([f.id, f.name]);
  }
  for (const [value, label] of options) {
    const opt = document.createElement("option");
    opt.value = value;
    opt.textContent = label;
    if (value === current) opt.selected = true;
    moveSelect.appendChild(opt);
  }
}

/* ── Sheet (add / edit) ──────────────────────────────────────────────── */
const sheetOverlay = document.getElementById("sheetOverlay");
const sheetTitle = document.getElementById("sheetTitle");
const typeToggle = document.getElementById("typeToggle");
const inputName = document.getElementById("inputName");
const inputUrl = document.getElementById("inputUrl");
const urlLabel = document.getElementById("urlLabel");
const moveLabel = document.getElementById("moveLabel");
const moveSelect = document.getElementById("moveSelect");
const iconLabel = document.getElementById("iconLabel");
const iconPreview = document.getElementById("iconPreview");
const iconCustom = document.getElementById("iconCustom");
const iconAuto = document.getElementById("iconAuto");
const iconFile = document.getElementById("iconFile");
const deleteBtn = document.getElementById("deleteBtn");
const saveBtn = document.getElementById("saveBtn");

/* Title auto-fill */
let nameAutoFilled = false; // true while the name field holds an auto-fetched title
let titleTimer = null;
let titleAbort = null;

/* Custom icon */
let iconDraft = undefined; // undefined = untouched; "" = reset to auto; dataUrl = use this

function hostnameName(url) {
  try {
    const labels = new URL(url).hostname
      .replace(/^www\.|^m\./, "")
      .split(".");
    return labels[0] ? labels[0][0].toUpperCase() + labels[0].slice(1) : "";
  } catch {
    return "";
  }
}

async function fetchTitle(url, signal) {
  const res = await fetch(url, { signal, redirect: "follow" });
  if (!res.ok) throw new Error(res.status);
  const text = await res.text();
  const doc = new DOMParser().parseFromString(text, "text/html");
  return (doc.querySelector("title")?.textContent ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 60);
}

function maybeAutofillName() {
  if (!sheetMode || editType !== "link") return;
  const url = normalizeUrl(inputUrl.value);
  try {
    if (!url) throw 0;
    new URL(url);
  } catch {
    return;
  }

  clearTimeout(titleTimer);
  titleTimer = setTimeout(async () => {
    // If the user is editing the name themselves, don't touch it
    if (inputName.value.trim() && !nameAutoFilled) return;

    if (titleAbort) titleAbort.abort();
    titleAbort = new AbortController();

    let name = "";
    try {
      name = await fetchTitle(url, titleAbort.signal);
    } catch {
      /* site offline, blocked, or host permission not granted */
    }
    if (!name) name = hostnameName(url);
    if (!name || !inputUrl.value.trim()) return;
    // Page may have changed while fetching; only apply if URL still matches
    if (normalizeUrl(inputUrl.value) !== url) return;

    inputName.value = name;
    nameAutoFilled = true;
  }, 600);
}

inputUrl.addEventListener("input", maybeAutofillName);
inputUrl.addEventListener("input", updateIconPreview);
inputUrl.addEventListener("paste", maybeAutofillName);
inputName.addEventListener("input", () => {
  nameAutoFilled = false;
});

function openSheet(mode, list, item) {
  sheetMode = { mode, list, item };
  const editing = mode === "edit";

  sheetTitle.textContent = editing ? "Edit" : "Add shortcut";
  // Folders can only live at the top level
  typeToggle.classList.toggle("hidden", editing || path.length > 0);
  urlLabel.classList.toggle("hidden", false);
  deleteBtn.classList.toggle("hidden", !editing);

  if (editing) {
    editType = item.type;
    inputName.value = item.name;
    inputUrl.value = item.type === "folder" ? "" : item.url;
    setupMoveSelect(item);
  } else {
    editType = "link";
    inputName.value = "";
    inputUrl.value = "";
    moveLabel.classList.add("hidden");
  }
  nameAutoFilled = false;
  iconDraft = editing && item.type === "link" ? (item.icon ?? "") : "";
  syncTypeUI();
  updateIconPreview();
  sheetOverlay.classList.remove("hidden");
  inputName.focus({ preventScroll: true });
}

function syncTypeUI() {
  for (const btn of typeToggle.querySelectorAll("button")) {
    btn.classList.toggle("active", btn.dataset.type === editType);
  }
  urlLabel.classList.toggle("hidden", editType === "folder");
  iconLabel.classList.toggle("hidden", editType !== "link");
}

function updateIconPreview() {
  const src = iconDraft || faviconFor(normalizeUrl(inputUrl.value));
  iconPreview.classList.toggle("hidden", !src);
  if (src) {
    iconPreview.src = src;
  } else {
    iconPreview.removeAttribute("src");
  }
}

iconCustom.addEventListener("click", () => iconFile.click());

iconFile.addEventListener("change", async () => {
  const file = iconFile.files[0];
  iconFile.value = "";
  if (!file) return;
  try {
    iconDraft = await imageToDataUrl(file, 128, "image/png");
    updateIconPreview();
  } catch {
    toast("Couldn't load that image");
  }
});

iconAuto.addEventListener("click", () => {
  iconDraft = "";
  updateIconPreview();
});

function closeSheet() {
  sheetOverlay.classList.add("hidden");
  sheetMode = null;
  clearTimeout(titleTimer);
  if (titleAbort) titleAbort.abort();
  nameAutoFilled = false;
}

typeToggle.addEventListener("click", (e) => {
  const btn = e.target.closest("button");
  if (!btn) return;
  editType = btn.dataset.type;
  syncTypeUI();
});

saveBtn.addEventListener("click", () => {
  const name = inputName.value.trim();
  const url = normalizeUrl(inputUrl.value);
  if (!name) {
    inputName.focus();
    return;
  }
  if (editType === "link" && !url) {
    inputUrl.focus();
    return;
  }

  if (sheetMode.mode === "add") {
    const item =
      editType === "folder"
        ? { id: id(), type: "folder", name, children: [] }
        : { id: id(), type: "link", name, url };
    if (editType === "link" && iconDraft) item.icon = iconDraft;
    currentList().push(item);
  } else {
    const { item } = sheetMode;
    item.name = name;
    if (item.type === "link") {
      item.url = url;
      if (iconDraft !== undefined) {
        if (iconDraft) item.icon = iconDraft;
        else delete item.icon;
      }
    }

    // Apply the folder move if the picker changed
    const current = path.length ? path[path.length - 1] : "";
    const dest = moveSelect.value;
    if (item.type === "link" && dest !== current) {
      const from = current ? listFor([current]) : state.items;
      const to = dest ? listFor([dest]) : state.items;
      from.splice(from.indexOf(item), 1);
      to.push(item);
    }
  }

  save();
  closeSheet();
  render();
});

deleteBtn.addEventListener("click", () => {
  const { list, item } = sheetMode;
  if (item.type === "folder" && (item.children?.length ?? 0) > 0) {
    closeSheet();
    confirmAction(
      `Delete "${item.name}" and its ${item.children.length} item(s)?`,
      () => {
        list.splice(list.indexOf(item), 1);
        save();
        render();
        toast("Folder deleted");
      }
    );
  } else {
    list.splice(list.indexOf(item), 1);
    save();
    closeSheet();
    render();
  }
});

document.getElementById("cancelBtn").addEventListener("click", closeSheet);
sheetOverlay.addEventListener("click", (e) => {
  if (e.target === sheetOverlay) closeSheet();
});

/* ── Confirm dialog ──────────────────────────────────────────────────── */
const confirmOverlay = document.getElementById("confirmOverlay");
const confirmText = document.getElementById("confirmText");
let confirmCb = null;

function confirmAction(text, cb) {
  confirmText.textContent = text;
  confirmCb = cb;
  confirmOverlay.classList.remove("hidden");
}

document.getElementById("confirmYes").addEventListener("click", () => {
  confirmOverlay.classList.add("hidden");
  confirmCb?.();
});
document.getElementById("confirmNo").addEventListener("click", () => {
  confirmOverlay.classList.add("hidden");
  confirmCb = null;
});

/* ── Toast ───────────────────────────────────────────────────────────── */
let toastTimer;
function toast(msg) {
  const el = document.getElementById("toast");
  el.textContent = msg;
  el.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove("show"), 1800);
}

/* ── Navigation ──────────────────────────────────────────────────────── */
function animateGrid(kind) {
  grid.classList.remove("nav-forward", "nav-back");
  void grid.offsetWidth; // restart the animation if it's already applied
  grid.classList.add(kind === "forward" ? "nav-forward" : "nav-back");
}

document.getElementById("backBtn").addEventListener("click", () => {
  path = path.slice(0, -1);
  render();
  animateGrid("back");
});

/* ── Wallpaper ───────────────────────────────────────────────────────── */
const wallpaperEl = document.getElementById("wallpaper");
const settingsOverlay = document.getElementById("settingsOverlay");
const wpPreview = document.getElementById("wpPreview");
const wpNone = document.getElementById("wpNone");
const wpRemove = document.getElementById("wpRemove");
const wpFile = document.getElementById("wpFile");

async function getStored(key) {
  if (hasChromeStorage) {
    return (await chrome.storage.local.get(key))[key] ?? null;
  }
  try {
    return JSON.parse(localStorage.getItem("speeddial." + key));
  } catch {
    return null;
  }
}

function setStored(key, value) {
  if (hasChromeStorage) {
    chrome.storage.local.set({ [key]: value });
  } else {
    localStorage.setItem("speeddial." + key, JSON.stringify(value));
  }
}

function applyWallpaper(src) {
  if (src) {
    wallpaperEl.style.backgroundImage = `url("${src}")`;
    wallpaperEl.classList.remove("hidden");
  } else {
    wallpaperEl.style.backgroundImage = "";
    wallpaperEl.classList.add("hidden");
  }
}

function refreshSettingsUI(wp) {
  if (wp) {
    wpPreview.src = wp;
    wpPreview.classList.remove("hidden");
    wpNone.classList.add("hidden");
    wpRemove.classList.remove("hidden");
  } else {
    wpPreview.removeAttribute("src");
    wpPreview.classList.add("hidden");
    wpNone.classList.remove("hidden");
    wpRemove.classList.add("hidden");
  }
}

document.getElementById("settingsBtn").addEventListener("click", async () => {
  refreshSettingsUI(await getStored("wallpaper"));
  settingsOverlay.classList.remove("hidden");
});

document.getElementById("settingsClose").addEventListener("click", () => {
  settingsOverlay.classList.add("hidden");
});
settingsOverlay.addEventListener("click", (e) => {
  if (e.target === settingsOverlay) settingsOverlay.classList.add("hidden");
});

document.getElementById("wpChoose").addEventListener("click", () => wpFile.click());

wpRemove.addEventListener("click", () => {
  setStored("wallpaper", null);
  applyWallpaper(null);
  refreshSettingsUI(null);
  toast("Wallpaper removed");
});

// Downscale and re-encode: wallpaper → 1920px JPEG (~100-400KB),
// custom icons → 128px PNG (keeps transparency)
function imageToDataUrl(file, max, mime = "image/jpeg", quality = 0.85) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      const scale = Math.min(1, max / Math.max(img.width, img.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(img.width * scale));
      canvas.height = Math.max(1, Math.round(img.height * scale));
      const ctx = canvas.getContext("2d");
      if (mime === "image/jpeg") {
        ctx.fillStyle = "#14151a";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
      }
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL(mime, quality));
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("not an image"));
    };
    img.src = url;
  });
}

wpFile.addEventListener("change", async () => {
  const file = wpFile.files[0];
  wpFile.value = "";
  if (!file) return;
  try {
    const dataUrl = await imageToDataUrl(file, 1920, "image/jpeg", 0.85);
    setStored("wallpaper", dataUrl);
    applyWallpaper(dataUrl);
    refreshSettingsUI(dataUrl);
    toast("Wallpaper set");
  } catch {
    toast("Couldn't load that image");
  }
});

/* ── Import / Export ─────────────────────────────────────────────────── */
const exportBtn = document.getElementById("exportBtn");
const importBtn = document.getElementById("importBtn");
const importFile = document.getElementById("importFile");

exportBtn.addEventListener("click", async () => {
  const data = {
    app: "speeddial",
    version: 1,
    items: state.items,
    wallpaper: await getStored("wallpaper"),
  };
  const blob = new Blob([JSON.stringify(data)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `speeddial-backup-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  toast("Backup downloaded");
});

// Only accept well-formed entries; anything else is dropped rather than
// corrupting the live data. Nested folders are dropped (one level only).
function sanitizeItems(list) {
  const out = [];
  for (const it of list ?? []) {
    if (!it || typeof it !== "object") continue;
    const name = String(it.name ?? "").slice(0, 24);
    if (it.type === "folder") {
      const children = sanitizeItems(it.children)
        .filter((c) => c.type === "link");
      out.push({ id: it.id || id(), type: "folder", name: name || "Folder", children });
    } else if (it.type === "link" && typeof it.url === "string" && it.url) {
      const entry = { id: it.id || id(), type: "link", name: name || "Link", url: it.url };
      if (typeof it.icon === "string" && it.icon.startsWith("data:")) entry.icon = it.icon;
      out.push(entry);
    }
  }
  return out;
}

importBtn.addEventListener("click", () => importFile.click());

importFile.addEventListener("change", async () => {
  const file = importFile.files[0];
  importFile.value = "";
  if (!file) return;
  let data;
  try {
    data = JSON.parse(await file.text());
  } catch {
    toast("Not a valid backup file");
    return;
  }
  const items = sanitizeItems(data?.items);
  const wallpaper =
    typeof data?.wallpaper === "string" && data.wallpaper.startsWith("data:image")
      ? data.wallpaper
      : null;
  if (!items.length && !wallpaper) {
    toast("Nothing to import");
    return;
  }

  confirmAction(
    `Replace all current dials with the backup (${items.length} item${items.length === 1 ? "" : "s"})?`,
    () => {
      state.items = items;
      save();
      if (wallpaper) {
        setStored("wallpaper", wallpaper);
        applyWallpaper(wallpaper);
        refreshSettingsUI(wallpaper);
      }
      render();
      toast("Imported");
    }
  );
});

/* ── Init ────────────────────────────────────────────────────────────── */
(async () => {
  state.items = await load();
  applyWallpaper(await getStored("wallpaper"));
  render();
})();
