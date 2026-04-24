const WORKER = "https://rfi-20.caua-viniciusosc12.workers.dev";

// ============================
// VERSÃO ATUAL VIA URL
// ============================
const urlParams = new URLSearchParams(location.search);
let CONFIG_VERSION = (urlParams.get("v") || "default").trim() || "default";

let adminMode = false;
const ADMIN_PASSWORD = "Nova@123";

let secoes = [
  "FRENTE SITE",
  "PORTÃO DE ACESSO",
  "MEDIDOR DE ENERGIA",
  "BASE DE EQUIPAMENTOS",
  "SITE FINALIZADO"
];

let state = {};
let uploadQueue = [];
let uploading = false;
const MAX_RETRY = 3;

// ============================
// LOCAL STORAGE / INDEXEDDB
// ============================
const LS_CFG_PREFIX = "cfg_secoes_";
const LS_VERSIONS = "cfg_versions_list";
const DB_NAME = "RFI_UPLOADS_DB";
const DB_STORE = "uploads";

function saveLocalConfig(version, secoesData){
  try{
    localStorage.setItem(LS_CFG_PREFIX + version, JSON.stringify(secoesData));
  }catch{}
}

function loadLocalConfig(version){
  try{
    const raw = localStorage.getItem(LS_CFG_PREFIX + version);
    if(!raw) return null;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : null;
  }catch{
    return null;
  }
}

function saveLocalVersions(list){
  try{
    localStorage.setItem(LS_VERSIONS, JSON.stringify([...new Set(list)]));
  }catch{}
}

function loadLocalVersions(){
  try{
    const raw = localStorage.getItem(LS_VERSIONS);
    if(!raw) return ["default"];
    const parsed = JSON.parse(raw);
    if(Array.isArray(parsed) && parsed.length) return [...new Set(parsed)];
    return ["default"];
  }catch{
    return ["default"];
  }
}

function openDB(){
  return new Promise((resolve, reject)=>{
    const req = indexedDB.open(DB_NAME, 1);

    req.onupgradeneeded = () => {
      const db = req.result;
      if(!db.objectStoreNames.contains(DB_STORE)){
        const store = db.createObjectStore(DB_STORE, { keyPath: "id" });
        store.createIndex("createdAt", "createdAt");
      }
    };

    req.onsuccess = ()=> resolve(req.result);
    req.onerror = ()=> reject(req.error);
  });
}

async function idbPut(record){
  const db = await openDB();
  return new Promise((resolve, reject)=>{
    const tx = db.transaction(DB_STORE, "readwrite");
    tx.objectStore(DB_STORE).put(record);
    tx.oncomplete = ()=> resolve(true);
    tx.onerror = ()=> reject(tx.error);
  });
}

async function idbDelete(id){
  const db = await openDB();
  return new Promise((resolve, reject)=>{
    const tx = db.transaction(DB_STORE, "readwrite");
    tx.objectStore(DB_STORE).delete(id);
    tx.oncomplete = ()=> resolve(true);
    tx.onerror = ()=> reject(tx.error);
  });
}

async function idbGetAll(){
  const db = await openDB();
  return new Promise((resolve, reject)=>{
    const tx = db.transaction(DB_STORE, "readonly");
    const req = tx.objectStore(DB_STORE).getAll();
    req.onsuccess = ()=> resolve(req.result || []);
    req.onerror = ()=> reject(req.error);
  });
}

// ============================
// ADMIN
// ============================
function toggleAdmin(){
  if(!adminMode){
    const senha = prompt("Senha do administrador:");
    if(senha !== ADMIN_PASSWORD){
      alert("Senha incorreta.");
      return;
    }
    adminMode = true;
    const btn = document.getElementById("btnNovaSecao");
    if(btn) btn.style.display="inline-block";
    criarBarraVersoesAdmin();
    alert("Modo administrador ativado");
  }else{
    adminMode = false;
    const btn = document.getElementById("btnNovaSecao");
    if(btn) btn.style.display="none";
    removerBarraVersoesAdmin();
    alert("Modo administrador desativado");
  }
  renderChecklist();
}

function criarSecao(){
  if(!adminMode) return;
  const nome = prompt("Nome da nova seção:");
  if(!nome) return;
  secoes.push(nome.toUpperCase());
  renderChecklist();
}

function excluirSecao(idx){
  if(!adminMode) return;
  if(confirm("Deseja excluir esta seção e todas as fotos?")){
    const titulo = secoes[idx];
    delete state[titulo];
    secoes.splice(idx,1);
    renderChecklist();
  }
}

// ============================
// UI ADMIN VERSÕES
// ============================
function gerarLink(version){
  const v = (version || "default").trim() || "default";
  const base = location.origin + location.pathname;
  return `${base}?v=${encodeURIComponent(v)}`;
}

function criarBarraVersoesAdmin(){
  if(document.getElementById("adminVersionBar")) return;

  const wrap = document.createElement("div");
  wrap.id = "adminVersionBar";
  wrap.style.marginTop = "10px";
  wrap.style.padding = "10px";
  wrap.style.border = "1px solid #e5e7eb";
  wrap.style.borderRadius = "12px";
  wrap.style.background = "#fafafa";

  const title = document.createElement("div");
  title.style.fontWeight = "700";
  title.style.marginBottom = "6px";
  title.innerText = "Versões de Seções";
  wrap.appendChild(title);

  const info = document.createElement("div");
  info.id = "adminVersionInfo";
  info.style.fontSize = "12px";
  info.style.color = "#4b5563";
  info.style.marginBottom = "10px";
  info.innerHTML = `Versão atual: <b>${CONFIG_VERSION}</b>`;
  wrap.appendChild(info);

  const row = document.createElement("div");
  row.style.display = "flex";
  row.style.flexWrap = "wrap";
  row.style.gap = "8px";
  row.style.alignItems = "center";

  const btnSave = document.createElement("button");
  btnSave.innerText = "Salvar nesta versão";
  btnSave.onclick = ()=> salvarConfiguracao(CONFIG_VERSION);
  row.appendChild(btnSave);

  const btnSaveAs = document.createElement("button");
  btnSaveAs.innerText = "Salvar como NOVA versão";
  btnSaveAs.onclick = async ()=>{
    const nome = prompt("Nome da nova versão (ex: skid-01, cliente-x):");
    if(!nome) return;
    const v = nome.trim();
    if(!v) return;

    await salvarConfiguracao(v);

    const link = gerarLink(v);
    try{
      await navigator.clipboard.writeText(link);
      alert("Nova versão salva e link copiado:\n\n" + link);
    }catch{
      alert("Nova versão salva. Link:\n\n" + link);
    }
  };
  row.appendChild(btnSaveAs);

  const btnLink = document.createElement("button");
  btnLink.innerText = "Copiar link desta versão";
  btnLink.onclick = async ()=>{
    const link = gerarLink(CONFIG_VERSION);
    try{
      await navigator.clipboard.writeText(link);
      alert("Link copiado:\n\n" + link);
    }catch{
      alert("Link:\n\n" + link);
    }
  };
  row.appendChild(btnLink);

  // MENU SUSPENSO COM TODAS AS VERSÕES
  const select = document.createElement("select");
  select.id = "versionsSelect";
  select.style.padding = "8px";
  row.appendChild(select);

  const btnAbrir = document.createElement("button");
  btnAbrir.innerText = "Abrir versão selecionada";
  btnAbrir.onclick = ()=>{
    const sel = document.getElementById("versionsSelect");
    if(!sel || !sel.value) return;
    location.href = gerarLink(sel.value);
  };
  row.appendChild(btnAbrir);

  wrap.appendChild(row);

  const checklist = document.getElementById("checklistContainer");
  if(checklist){
    document.body.insertBefore(wrap, checklist);
  }else{
    document.body.appendChild(wrap);
  }

  preencherMenuVersoes();
}

function removerBarraVersoesAdmin(){
  const el = document.getElementById("adminVersionBar");
  if(el) el.remove();
}

function atualizarBarraVersoesAdmin(){
  const info = document.getElementById("adminVersionInfo");
  if(info) info.innerHTML = `Versão atual: <b>${CONFIG_VERSION}</b>`;
  preencherMenuVersoes();
}

async function preencherMenuVersoes(){
  const select = document.getElementById("versionsSelect");
  if(!select) return;

  let versions = loadLocalVersions();

  try{
    const r = await fetch(WORKER + "?listconfigs=true", { cache:"no-store" });
    if(r.ok){
      const data = await r.json();
      if(data && Array.isArray(data.versions) && data.versions.length){
        versions = [...new Set([...versions, ...data.versions])];
        saveLocalVersions(versions);
      }
    }
  }catch{}

  select.innerHTML = "";
  versions.forEach(v=>{
    const opt = document.createElement("option");
    opt.value = v;
    opt.textContent = v;
    if(v === CONFIG_VERSION) opt.selected = true;
    select.appendChild(opt);
  });
}

// ============================
// CONFIG REMOTA + LOCAL
// ============================
async function salvarConfiguracao(version = CONFIG_VERSION){
  try{
    const v = (version || "default").trim() || "default";

    const r = await fetch(WORKER + `?config=true&v=${encodeURIComponent(v)}`, {
      method:"POST",
      headers: {"Content-Type":"application/json"},
      body: JSON.stringify({ secoes })
    });

    if(!r.ok) throw new Error(await r.text());

    CONFIG_VERSION = v;
    saveLocalConfig(v, secoes);

    const versions = loadLocalVersions();
    if(!versions.includes(v)){
      versions.push(v);
      saveLocalVersions(versions);
    }

    atualizarBarraVersoesAdmin();
    alert("Configuração salva na versão: " + v);
  } catch(e){
    // mesmo offline, salva localmente
    const v = (version || "default").trim() || "default";
    CONFIG_VERSION = v;
    saveLocalConfig(v, secoes);

    const versions = loadLocalVersions();
    if(!versions.includes(v)){
      versions.push(v);
      saveLocalVersions(versions);
    }

    atualizarBarraVersoesAdmin();
    alert("Worker indisponível. Configuração salva localmente na versão: " + v);
  }
}

async function carregarConfiguracao(){
  const secoesPadrao = [
    "FRENTE SITE",
    "PORTÃO DE ACESSO",
    "MEDIDOR DE ENERGIA",
    "BASE DE EQUIPAMENTOS",
    "SITE FINALIZADO"
  ];

  // 1) carrega local primeiro
  const local = loadLocalConfig(CONFIG_VERSION);
  if(local && local.length){
    secoes = local;
    renderChecklist();
  }

  // fallback default local
  if((!local || !local.length) && CONFIG_VERSION !== "default"){
    const localDefault = loadLocalConfig("default");
    if(localDefault && localDefault.length){
      secoes = localDefault;
      renderChecklist();
    }
  }

  // 2) tenta worker
  try{
    const r = await fetch(WORKER + `?getconfig=true&v=${encodeURIComponent(CONFIG_VERSION)}`, {
      cache: "no-store"
    });

    if(r.ok){
      const data = await r.json();
      if(data && Array.isArray(data.secoes) && data.secoes.length){
        secoes = data.secoes;
        saveLocalConfig(CONFIG_VERSION, secoes);
        renderChecklist();
        return;
      }
    }

    // fallback worker default
    if(CONFIG_VERSION !== "default"){
      const r2 = await fetch(WORKER + `?getconfig=true&v=default`, { cache:"no-store" });
      if(r2.ok){
        const data2 = await r2.json();
        if(data2 && Array.isArray(data2.secoes) && data2.secoes.length){
          secoes = data2.secoes;
          saveLocalConfig("default", secoes);
          renderChecklist();
          return;
        }
      }
    }
  }catch{}

  if(!Array.isArray(secoes) || !secoes.length){
    secoes = secoesPadrao;
  }

  renderChecklist();
}

// ============================
// DATA/HORA
// ============================
function getTimestampInfo(){
  const now = new Date();
  return {
    iso: now.toISOString(),
    local: now.toLocaleString("pt-BR"),
    timezoneOffsetMin: now.getTimezoneOffset()
  };
}

// ============================
// GEOLOCALIZAÇÃO
// ============================
function getGeolocation(){
  return new Promise((resolve)=>{
    if(!navigator.geolocation){
      resolve({ available:false, error:"Geolocation não suportada" });
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos)=>{
        resolve({
          available:true,
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
          accuracy_m: pos.coords.accuracy,
          altitude_m: pos.coords.altitude,
          heading_deg: pos.coords.heading,
          speed_mps: pos.coords.speed
        });
      },
      (err)=>{
        resolve({ available:false, error: err.message || "Sem permissão GPS" });
      },
      { enableHighAccuracy:true, timeout:12000, maximumAge:0 }
    );
  });
}

// ============================
// AZIMUTE
// ============================
async function requestOrientationPermissionIfNeeded(){
  if (typeof DeviceOrientationEvent !== "undefined" &&
      typeof DeviceOrientationEvent.requestPermission === "function") {
    try {
      const res = await DeviceOrientationEvent.requestPermission();
      return res === "granted";
    } catch {
      return false;
    }
  }
  return true;
}

function getAzimuthOnce(){
  return new Promise(async (resolve)=>{
    const ok = await requestOrientationPermissionIfNeeded();
    if(!ok){
      resolve({ available:false, error:"Permissão de orientação negada" });
      return;
    }
    if(typeof window.DeviceOrientationEvent === "undefined"){
      resolve({ available:false, error:"DeviceOrientation não suportado" });
      return;
    }

    const handler = (event)=>{
      let az = null;
      if (typeof event.webkitCompassHeading === "number") {
        az = event.webkitCompassHeading;
      } else if (typeof event.alpha === "number") {
        az = event.alpha;
      }
      window.removeEventListener("deviceorientation", handler, true);

      if(az === null){
        resolve({ available:false, error:"Azimute indisponível" });
      } else {
        resolve({ available:true, azimuth_deg: Math.round(az * 10) / 10 });
      }
    };

    window.addEventListener("deviceorientation", handler, true);

    setTimeout(()=>{
      try { window.removeEventListener("deviceorientation", handler, true); } catch {}
      resolve({ available:false, error:"Timeout azimute" });
    }, 2500);
  });
}

// ============================
// ENDEREÇO
// ============================
async function reverseGeocode(lat, lon){
  try{
    const url =
      `https://nominatim.openstreetmap.org/reverse` +
      `?format=jsonv2&lat=${lat}&lon=${lon}&zoom=18&addressdetails=1`;

    const r = await fetch(url, { headers: { "Accept": "application/json" } });
    if(!r.ok) throw new Error("Falha reverse geocoding");

    const data = await r.json();
    const a = data.address || {};

    return {
      display: data.display_name || "",
      road: a.road || a.pedestrian || "",
      house_number: a.house_number || "",
      neighbourhood: a.neighbourhood || a.suburb || "",
      city: a.city || a.town || a.village || "",
      state: a.state || "",
      postcode: a.postcode || "",
      country: a.country || ""
    };
  }catch(e){
    return { error: e.message || "Endereço indisponível" };
  }
}

// ============================
// HELPERS IMAGEM/TEXTO
// ============================
function loadImageFromFile(file){
  return new Promise((resolve, reject)=>{
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = ()=>{ URL.revokeObjectURL(url); resolve(img); };
    img.onerror = ()=>{ try{URL.revokeObjectURL(url);}catch{} reject(new Error("Imagem inválida")); };
    img.src = url;
  });
}

function formatCoord(n){
  if(typeof n !== "number") return "—";
  return n.toFixed(6);
}
function formatAcc(n){
  if(typeof n !== "number") return "—";
  return `${Math.round(n)}m`;
}
function formatAz(n){
  if(typeof n !== "number") return "—";
  return `${Math.round(n)}°`;
}

function buildAddressText(addr){
  if(!addr || addr.error) return "Endereço indisponível";
  const parts = [addr.road, addr.house_number, addr.neighbourhood, addr.city, addr.state].filter(Boolean);
  if(parts.length) return parts.join(" - ");
  if(addr.display) return addr.display;
  return "Endereço indisponível";
}

function roundRect(ctx, x, y, w, h, r){
  const radius = Math.min(r, w/2, h/2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

function wrapTextLines(ctx, text, maxWidth){
  const words = String(text || "").split(/\s+/).filter(Boolean);
  const lines = [];
  let line = "";
  for(const w of words){
    const test = line ? (line + " " + w) : w;
    if(ctx.measureText(test).width <= maxWidth) line = test;
    else { if(line) lines.push(line); line = w; }
  }
  if(line) lines.push(line);
  return lines;
}

function ellipsizeToWidth(ctx, text, maxWidth){
  let t = String(text || "");
  if(ctx.measureText(t).width <= maxWidth) return t;
  while(t.length > 3 && ctx.measureText(t + "…").width > maxWidth){
    t = t.slice(0, -1);
  }
  return t + "…";
}

// ============================
// CARIMBO PREMIUM
// ============================
async function stampAndCompress(file, meta, maxWidth = 1800, quality = 0.88){
  const img = await loadImageFromFile(file);
  const scale = Math.min(1, maxWidth / img.width);
  const w = Math.round(img.width * scale);
  const h = Math.round(img.height * scale);

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");

  ctx.drawImage(img, 0, 0, w, h);

  const base = Math.min(w, h);
  const pad = Math.max(10, Math.round(base * 0.020));
  const margin = Math.max(12, Math.round(base * 0.025));
  const radius = Math.max(10, Math.round(base * 0.020));
  const maxBoxWidth = Math.min(Math.round(w * 0.78), Math.round(base * 1.55));

  const fSmall = Math.max(12, Math.round(base * 0.030));
  const fTiny  = Math.max(11, Math.round(base * 0.028));

  const tsLocal = meta?.capturedAt?.local || new Date().toLocaleString("pt-BR");
  const lat = meta?.geolocation?.available ? formatCoord(meta.geolocation.latitude) : "—";
  const lon = meta?.geolocation?.available ? formatCoord(meta.geolocation.longitude) : "—";
  const acc = meta?.geolocation?.available ? formatAcc(meta.geolocation.accuracy_m) : "—";
  const az  = meta?.azimuth?.available ? formatAz(meta.azimuth.azimuth_deg) : "—";
  const addrText = buildAddressText(meta?.address);

  const line1 = `Lat ${lat}   Lon ${lon}   (±${acc})`;
  const line2 = `Azimute ${az}   ${tsLocal}`;

  ctx.font = `600 ${fTiny}px system-ui, -apple-system, Segoe UI, Roboto, Arial`;
  const addrMaxWidth = maxBoxWidth - (pad * 2);
  let addrLines = wrapTextLines(ctx, addrText, addrMaxWidth);
  if(addrLines.length > 2){
    addrLines = addrLines.slice(0,2);
    addrLines[1] = ellipsizeToWidth(ctx, addrLines[1], addrMaxWidth);
  }

  ctx.font = `800 ${fSmall}px system-ui, -apple-system, Segoe UI, Roboto, Arial`;
  const w1 = ctx.measureText(line1).width;
  const w2 = ctx.measureText(line2).width;

  ctx.font = `600 ${fTiny}px system-ui, -apple-system, Segoe UI, Roboto, Arial`;
  const wA1 = addrLines[0] ? ctx.measureText(addrLines[0]).width : 0;
  const wA2 = addrLines[1] ? ctx.measureText(addrLines[1]).width : 0;

  const boxW = Math.min(
    maxBoxWidth,
    Math.ceil(Math.max(w1, w2, wA1, wA2) + pad * 2)
  );

  const lh1 = Math.round(fSmall * 1.18);
  const lh2 = Math.round(fSmall * 1.18);
  const lhA = Math.round(fTiny  * 1.20);

  const boxH = Math.ceil(
    (lh1 + lh2) +
    (addrLines.length ? (addrLines.length * lhA + Math.round(base*0.008)) : 0) +
    pad * 1.2
  );

  const x = margin;
  const y = h - margin - boxH;

  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,0.35)";
  ctx.shadowBlur = Math.max(8, Math.round(base * 0.02));
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = Math.max(2, Math.round(base * 0.006));
  ctx.fillStyle = "rgba(0,0,0,0.55)";
  roundRect(ctx, x, y, boxW, boxH, radius);
  ctx.fill();
  ctx.restore();

  ctx.save();
  ctx.fillStyle = "#fff";
  ctx.textBaseline = "top";

  let ty = y + Math.round(pad * 0.6);

  ctx.font = `900 ${fSmall}px system-ui, -apple-system, Segoe UI, Roboto, Arial`;
  ctx.fillText(line1, x + pad, ty);
  ty += lh1;

  ctx.font = `900 ${fSmall}px system-ui, -apple-system, Segoe UI, Roboto, Arial`;
  ctx.fillText(line2, x + pad, ty);
  ty += lh2;

  if(addrLines.length){
    ty += Math.round(base * 0.006);
    ctx.font = `650 ${fTiny}px system-ui, -apple-system, Segoe UI, Roboto, Arial`;
    for(const l of addrLines){
      ctx.fillText(l, x + pad, ty);
      ty += lhA;
    }
  }

  ctx.restore();

  return new Promise((resolve, reject)=>{
    canvas.toBlob((blob)=>{
      if(!blob) return reject(new Error("Falha ao gerar imagem carimbada"));
      const baseName = (file.name || "foto").replace(/\.[^/.]+$/, "");
      const outName = `${baseName}_STAMP.jpg`;
      resolve(new File([blob], outName, { type:"image/jpeg" }));
    }, "image/jpeg", quality);
  });
}

// ============================
// UI / RENDER
// ============================
function ensureSecoes(){
  if(!Array.isArray(secoes) || !secoes.length){
    secoes = [
      "FRENTE SITE",
      "PORTÃO DE ACESSO",
      "MEDIDOR DE ENERGIA",
      "BASE DE EQUIPAMENTOS",
      "SITE FINALIZADO"
    ];
  }
}

function renderChecklist(){
  ensureSecoes();

  const container = document.getElementById("checklistContainer");
  if(!container) return;
  container.innerHTML = "";

  secoes.forEach((titulo, idx)=>{
    const s = document.createElement("section");
    s.className = "card";

    if(adminMode){
      const tools = document.createElement("div");
      tools.className="admin-tools";

      const del = document.createElement("button");
      del.className="btn-danger";
      del.innerText="Excluir seção";
      del.onclick=()=>excluirSecao(idx);

      tools.appendChild(del);
      s.appendChild(tools);
    }

    const t = document.createElement("input");
    t.className="edit-title";
    t.value=titulo;
    t.disabled=!adminMode;
    t.onchange=e=>{
      const novo = (e.target.value || "").trim();
      if(!novo){ e.target.value = titulo; return; }
      secoes[idx]=novo.toUpperCase();
      renderChecklist();
    };

    s.appendChild(t);
  
    async function abrirCameraForcada() {
  // 🔒 precisa HTTPS
  if (location.protocol !== "https:" && location.hostname !== "localhost") {
    alert("A câmera só funciona em HTTPS");
    return null;
  }

  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: { ideal: "environment" }
      },
      audio: false
    });

    return stream;

  } catch (err) {
    console.warn("getUserMedia falhou:", err);
    return null;
  }
}

/* ===== UX COMPLETO (CÂMERA + GALERIA + SISTEMA) ===== */

const actions = document.createElement("div");
actions.style.display = "flex";
actions.style.gap = "10px";
actions.style.marginBottom = "10px";

/* BOTÃO PRINCIPAL (ESCOLHA INTELIGENTE) */
const btnMain = document.createElement("button");
btnMain.innerText = "📷 Adicionar Foto";

/* INPUT UNIVERSAL (camera + galeria do sistema) */
const inputFile = document.createElement("input");
inputFile.type = "file";
inputFile.accept = "image/*";
inputFile.style.display = "none";

/* BOTÃO CÂMERA REAL */
const btnCamera = document.createElement("button");
btnCamera.innerText = "📸 Tirar Foto";

/* BOTÃO GALERIA */
const btnGaleria = document.createElement("button");
btnGaleria.innerText = "🖼️ Galeria";

/* ========= FUNÇÃO ÚNICA DE PROCESSAMENTO ========= */
async function processarImagem(file, titulo, s){
  const siteId = document.getElementById("siteId")?.value.trim();
  if(!siteId){
    alert("Informe o ID do site");
    return;
  }

  if(!state[titulo]) state[titulo] = [];
  if(state[titulo].length >= 10){
    alert("Limite de 10 fotos atingido");
    return;
  }

  const geo = await getGeolocation();
  const address = geo.available ? await reverseGeocode(geo.latitude, geo.longitude) : null;
  const az = await getAzimuthOnce();
  const ts = getTimestampInfo();

  const itemId = crypto.randomUUID();

  const item = {
    id: itemId,
    name: file.name,
    preview: URL.createObjectURL(file),
    status: navigator.onLine ? "fila" : "offline",
    progress: 0,
    siteId,
    section: titulo
  };

  state[titulo].push(item);
  renderImages(s, titulo);

  const meta = {
    siteId,
    section: titulo,
    originalName: file.name,
    capturedAt: ts,
    geolocation: geo,
    azimuth: az,
    address,
    userAgent: navigator.userAgent,
    configVersion: CONFIG_VERSION
  };

  const stamped = await stampAndCompress(file, meta);
  meta.savedName = stamped.name;

  await idbPut({
    id: itemId,
    createdAt: Date.now(),
    siteId,
    section: titulo,
    file: stamped,
    meta
  });

  await rebuildQueueFromDB();
  processQueue();
}

/* ========= AÇÕES ========= */

// SISTEMA (mostra camera + galeria do celular)
btnMain.onclick = () => {
  inputFile.value = "";
  inputFile.click();
};

inputFile.onchange = (e)=>{
  const file = e.target.files[0];
  if(file) processarImagem(file, titulo, s);
};

// CÂMERA REAL
btnCamera.onclick = async () => {
  const stream = await abrirCameraForcada();

  if (!stream) {
    alert("Não foi possível abrir a câmera");
    return;
  }

  const video = document.createElement("video");
  video.style.position = "fixed";
  video.style.top = "0";
  video.style.left = "0";
  video.style.width = "100%";
  video.style.height = "100%";
  video.style.background = "#000";
  video.style.zIndex = "9999";
  video.autoplay = true;
  video.srcObject = stream;

  document.body.appendChild(video);

  const btnCapture = document.createElement("button");
  btnCapture.innerText = "📸 Capturar";
  btnCapture.style.position = "fixed";
  btnCapture.style.bottom = "20px";
  btnCapture.style.left = "50%";
  btnCapture.style.transform = "translateX(-50%)";
  btnCapture.style.zIndex = "10000";

  document.body.appendChild(btnCapture);

  btnCapture.onclick = () => {
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    const ctx = canvas.getContext("2d");
    ctx.drawImage(video, 0, 0);

    stream.getTracks().forEach(t => t.stop());
    video.remove();
    btnCapture.remove();

    canvas.toBlob((blob)=>{
      const file = new File([blob], "camera.jpg", { type: "image/jpeg" });
      processarImagem(file, titulo, s);
    }, "image/jpeg", 0.9);
  };
};

// GALERIA DIRETA
btnGaleria.onclick = () => {
  inputFile.value = "";
  inputFile.click();
};

/* APPEND */
actions.appendChild(btnMain);
actions.appendChild(btnCamera);
actions.appendChild(btnGaleria);
actions.appendChild(inputFile);

s.appendChild(actions);
   // ===== TÍTULO =====
const t = document.createElement("input");
t.className = "edit-title";
t.value = titulo;
t.disabled = !adminMode;
t.onchange = e => {
  const novo = (e.target.value || "").trim();
  if (!novo) {
    e.target.value = titulo;
    return;
  }
  secoes[idx] = novo.toUpperCase();
  renderChecklist();
};

// ===== CONTAINER DE IMAGENS =====
const imgs = document.createElement("div");
imgs.className = "img-container";

// ===== APPEND NA ORDEM CORRETA =====
s.appendChild(t);        // 🔥 TÍTULO PRIMEIRO
s.appendChild(actions);  // 🔥 BOTÕES
s.appendChild(imgs);     // 🔥 IMAGENS

    renderImages(s, titulo);
    container.appendChild(s);
  });
}

function findItemById(id){
  for(const secao of Object.keys(state)){
    const item = (state[secao] || []).find(x => x.id === id);
    if(item) return item;
  }
  return null;
}

function renderImages(secaoEl, titulo){
  const c = secaoEl.querySelector(".img-container");
  if(!c) return;
  c.innerHTML = "";

  const items = state[titulo] || [];

  items.forEach((it, i)=>{
    const wrap = document.createElement("div");
    wrap.style.display = "inline-block";
    wrap.style.margin = "6px";
    wrap.style.verticalAlign = "top";
    wrap.style.width = "110px";

    const img = document.createElement("img");
    img.src = it.preview;
    img.style.maxWidth = "100px";
    img.style.display = "block";
    img.style.cursor = "pointer";
    img.title = "Clique para remover";

    img.onclick = async ()=>{
      if(confirm("Remover foto?")){
        uploadQueue = uploadQueue.filter(j => j.id !== it.id);
        await idbDelete(it.id);
        try{ URL.revokeObjectURL(it.preview); }catch{}
        items.splice(i,1);
        renderImages(secaoEl, titulo);
      }
    };

    const barWrap = document.createElement("div");
    barWrap.style.width = "100%";
    barWrap.style.height = "10px";
    barWrap.style.background = "#e5e7eb";
    barWrap.style.borderRadius = "6px";
    barWrap.style.overflow = "hidden";
    barWrap.style.marginTop = "6px";

    const bar = document.createElement("div");
    bar.style.height = "100%";
    bar.style.width = (it.progress||0) + "%";

    if(it.status === "erro") bar.style.background = "#dc2626";
    else if(it.status === "ok") bar.style.background = "#16a34a";
    else if(it.status === "offline") bar.style.background = "#f59e0b";
    else bar.style.background = "#2563eb";

    barWrap.appendChild(bar);

    const label = document.createElement("div");
    label.style.fontSize = "11px";
    label.style.color = "#374151";
    label.style.marginTop = "4px";

    if(it.status === "ok") label.innerText = "Enviado";
    else if(it.status === "erro") label.innerText = "Erro";
    else if(it.status === "offline") label.innerText = "Aguardando internet";
    else if(it.status === "enviando") label.innerText = `Enviando ${it.progress||0}%`;
    else label.innerText = "Na fila";

    wrap.appendChild(img);
    wrap.appendChild(barWrap);
    wrap.appendChild(label);

    c.appendChild(wrap);
  });

  const ct = document.createElement("div");
  ct.className = "contador";
  ct.innerText = `Fotos: ${items.length}/10`;
  c.appendChild(ct);
}

// ============================
// FILA OFFLINE / ONLINE
// ============================
async function rebuildQueueFromDB(){
  const all = await idbGetAll();
  uploadQueue = all.sort((a,b)=>a.createdAt - b.createdAt);

  for(const job of uploadQueue){
    let item = findItemById(job.id);
    if(!item){
      if(!state[job.section]) state[job.section] = [];
      item = {
        id: job.id,
        name: job.file?.name || "foto",
        preview: URL.createObjectURL(job.file),
        status: navigator.onLine ? "fila" : "offline",
        progress: 0,
        siteId: job.siteId,
        section: job.section
      };
      state[job.section].push(item);
    } else {
      if(item.status !== "ok") item.status = navigator.onLine ? "fila" : "offline";
    }
  }

  Object.keys(state).forEach(secao=>{
  if(!secoes.includes(secao)){
    secoes.push(secao);
  }
});


  
renderChecklist();
}

async function processQueue(){
  if(uploading) return;
  if(!navigator.onLine){
    Object.values(state).flat().forEach(it=>{
      if(it.status !== "ok") it.status = "offline";
    });
    renderChecklist();
    return;
  }

  uploading = true;

  while(uploadQueue.length && navigator.onLine){
    const job = uploadQueue[0];
    const itemRef = findItemById(job.id);

    if(itemRef){
      itemRef.status = "enviando";
      itemRef.progress = 0;
      renderChecklist();
    }

    let ok = false;
    let lastErr = null;

    for(let attempt=1; attempt<=MAX_RETRY; attempt++){
      try{
        await uploadFileToWorker(job.siteId, job.section, job.file, job.meta, (p)=>{
          const item = findItemById(job.id);
          if(item){
            item.progress = p;
            item.status = "enviando";
            renderChecklist();
          }
        });

        ok = true;
        break;
      } catch(e){
        lastErr = e;
        if(!navigator.onLine) break;
      }
    }

    if(ok){
      const item = findItemById(job.id);
      if(item){
        item.status = "ok";
        item.progress = 100;
      }
      await idbDelete(job.id);
      uploadQueue.shift();
    }else{
      const item = findItemById(job.id);
      if(item){
        item.status = navigator.onLine ? "erro" : "offline";
      }
      if(!navigator.onLine) break;

      // se falhou online, pula pro próximo ciclo futuro
      console.error("Falha upload:", lastErr);
      break;
    }

    renderChecklist();
  }

  uploading = false;
}

// ============================
// BOTÃO ENVIAR
// ============================
async function enviarRelatorio(){
  const siteId = document.getElementById("siteId")?.value.trim();
  if(!siteId){
    alert("Informe o ID do site");
    return;
  }

  const pendentes = Object.values(state).flat().some(it => it.status !== "ok");
  if(pendentes){
    if(!navigator.onLine){
      alert("Você está offline. As fotos serão enviadas automaticamente quando a internet voltar.");
      return;
    }
    alert("Ainda existem fotos enviando ou com erro. Aguarde concluir.");
    return;
  }

  alert("Tudo enviado! Você pode encerrar.");
}

// ============================
// EVENTOS DE REDE
// ============================
window.addEventListener("online", async ()=>{
  console.log("Internet voltou. Sincronizando uploads...");
  await rebuildQueueFromDB();
  processQueue();
});

window.addEventListener("offline", ()=>{
  console.log("Modo offline ativado.");
  Object.values(state).flat().forEach(it=>{
    if(it.status !== "ok") it.status = "offline";
  });
  renderChecklist();
});

// ============================
// INIT
// ============================
(async function init(){
  await carregarConfiguracao();
  await rebuildQueueFromDB();
  if(navigator.onLine) processQueue();
})();
