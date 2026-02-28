const WORKER = "https://rfi-20.caua-viniciusosc12.workers.dev/";

let adminMode = false;
const ADMIN_PASSWORD = "Nova@123";

let secoes = [
  "FRENTE SITE",
  "PORTÃO DE ACESSO",
  "MEDIDOR DE ENERGIA",
  "BASE DE EQUIPAMENTOS",
  "SITE FINALIZADO"
];

// state por seção: itens com preview/status/progresso
let state = {};
let uploadQueue = [];
let uploading = false;
const MAX_RETRY = 3;

// ================= ADMIN =================
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
    criarBotaoSalvarConfig();
    alert("Modo administrador ativado");
  } else {
    adminMode = false;
    const btn = document.getElementById("btnNovaSecao");
    if(btn) btn.style.display="none";
    removerBotaoSalvarConfig();
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

function criarBotaoSalvarConfig(){
  if(document.getElementById("btnSalvarConfig")) return;
  const btn = document.createElement("button");
  btn.id = "btnSalvarConfig";
  btn.innerText = "Salvar Configuração";
  btn.style.marginTop = "10px";
  btn.onclick = salvarConfiguracao;
  document.body.appendChild(btn);
}

function removerBotaoSalvarConfig(){
  const btn = document.getElementById("btnSalvarConfig");
  if(btn) btn.remove();
}

// ================= CONFIG REMOTA =================
async function salvarConfiguracao(){
  try{
    const r = await fetch(WORKER + "?config=true", {
      method:"POST",
      headers: {"Content-Type":"application/json"},
      body: JSON.stringify({ secoes })
    });
    if(!r.ok) throw new Error(await r.text());
    alert("Configuração salva!");
  } catch(e){
    alert("Erro ao salvar configuração: " + e.message);
  }
}

async function carregarConfiguracao(){
  try{
    const r = await fetch(WORKER + "?getconfig=true");
    if(r.ok){
      const data = await r.json();
      if(data && Array.isArray(data.secoes) && data.secoes.length){
        secoes = data.secoes;
      }
    }
  } catch(e){}
  renderChecklist();
}

// ================= DATA/HORA =================
function getTimestampInfo(){
  const now = new Date();
  return {
    iso: now.toISOString(),
    local: now.toLocaleString("pt-BR"),
    timezoneOffsetMin: now.getTimezoneOffset()
  };
}

// ================= GEOLOCALIZAÇÃO =================
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

// ================= AZIMUTE (BÚSSOLA) =================
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
        az = event.webkitCompassHeading; // iOS
      } else if (typeof event.alpha === "number") {
        az = event.alpha; // Android (aprox)
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

// ================= ENDEREÇO (Reverse Geocoding) =================
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

// ================= HELPERS IMAGEM/TEXTO =================
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

// ================= CARIMBO PREMIUM (box pequeno no canto) =================
async function stampAndCompress(file, meta, maxWidth = 1800, quality = 0.88){
  const img = await loadImageFromFile(file);

  // escala proporcional
  const scale = Math.min(1, maxWidth / img.width);
  const w = Math.round(img.width * scale);
  const h = Math.round(img.height * scale);

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");

  ctx.drawImage(img, 0, 0, w, h);

  const base = Math.min(w, h);

  // box premium
  const pad = Math.max(10, Math.round(base * 0.020));
  const margin = Math.max(12, Math.round(base * 0.025));
  const radius = Math.max(10, Math.round(base * 0.020));
  const maxBoxWidth = Math.min(Math.round(w * 0.78), Math.round(base * 1.55));

  // fontes proporcionais
  const fSmall = Math.max(12, Math.round(base * 0.030));
  const fTiny  = Math.max(11, Math.round(base * 0.028));

  // dados
  const tsLocal = meta?.capturedAt?.local || new Date().toLocaleString("pt-BR");
  const lat = meta?.geolocation?.available ? formatCoord(meta.geolocation.latitude) : "—";
  const lon = meta?.geolocation?.available ? formatCoord(meta.geolocation.longitude) : "—";
  const acc = meta?.geolocation?.available ? formatAcc(meta.geolocation.accuracy_m) : "—";
  const az  = meta?.azimuth?.available ? formatAz(meta.azimuth.azimuth_deg) : "—";
  const addrText = buildAddressText(meta?.address);

  const line1 = `Lat ${lat}   Lon ${lon}   (±${acc})`;
  const line2 = `Azimute ${az}   ${tsLocal}`;

  // endereço 1–2 linhas
  ctx.font = `600 ${fTiny}px system-ui, -apple-system, Segoe UI, Roboto, Arial`;
  const addrMaxWidth = maxBoxWidth - (pad * 2);
  let addrLines = wrapTextLines(ctx, addrText, addrMaxWidth);
  if(addrLines.length > 2){
    addrLines = addrLines.slice(0,2);
    addrLines[1] = ellipsizeToWidth(ctx, addrLines[1], addrMaxWidth);
  }

  // mede box
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

  const boxH = Math.ceil((lh1 + lh2) + (addrLines.length ? (addrLines.length * lhA + Math.round(base*0.008)) : 0) + pad * 1.2);

  // posição: canto inferior esquerdo (premium)
  const x = margin;
  const y = h - margin - boxH;

  // fundo translúcido + sombra suave
  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,0.35)";
  ctx.shadowBlur = Math.max(8, Math.round(base * 0.02));
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = Math.max(2, Math.round(base * 0.006));

  ctx.fillStyle = "rgba(0,0,0,0.55)";
  roundRect(ctx, x, y, boxW, boxH, radius);
  ctx.fill();
  ctx.restore();

  // texto branco limpo
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

  // exporta JPG
  return new Promise((resolve, reject)=>{
    canvas.toBlob((blob)=>{
      if(!blob) return reject(new Error("Falha ao gerar imagem carimbada"));
      const baseName = (file.name || "foto").replace(/\.[^/.]+$/, "");
      const outName = `${baseName}_STAMP.jpg`;
      resolve(new File([blob], outName, { type:"image/jpeg" }));
    }, "image/jpeg", quality);
  });
}

// ================= UI / RENDER =================
function renderChecklist(){
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

    const f = document.createElement("input");
    f.type="file";
    f.accept="image/*";
    f.multiple=true;

    f.onchange = async (e)=>{
      const siteId = document.getElementById("siteId")?.value.trim();
      if(!siteId){
        alert("Informe o ID do site antes de adicionar fotos.");
        e.target.value = "";
        return;
      }

      const files = Array.from(e.target.files).slice(0,10);
      if(!state[titulo]) state[titulo] = [];

      // coleta geo + endereço + azimute (1x por seleção)
      const geo = await getGeolocation();
      let address = null;
      if(geo.available){
        address = await reverseGeocode(geo.latitude, geo.longitude);
      }
      const az = await getAzimuthOnce();
      const ts = getTimestampInfo();

      for(const file of files){
        const item = {
          name: file.name,
          preview: URL.createObjectURL(file),
          status: "fila",
          progress: 0
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
          address: address,
          userAgent: navigator.userAgent
        };

        const stamped = await stampAndCompress(file, meta, 1800, 0.88);
        meta.savedName = stamped.name;

        uploadQueue.push({
          siteId,
          section: titulo,
          file: stamped,
          meta,
          itemRef: item,
          secaoEl: s,
          titulo
        });
      }

      e.target.value = "";
      processQueue();
    };

    s.appendChild(f);

    const imgs = document.createElement("div");
    imgs.className = "img-container";
    s.appendChild(imgs);

    renderImages(s, titulo);
    container.appendChild(s);
  });
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

    img.onclick = ()=>{
      if(confirm("Remover foto?")){
        uploadQueue = uploadQueue.filter(j => j.itemRef !== it);
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
    bar.style.background = it.status === "erro" ? "#dc2626" : (it.status === "ok" ? "#16a34a" : "#2563eb");
    barWrap.appendChild(bar);

    const label = document.createElement("div");
    label.style.fontSize = "11px";
    label.style.color = "#374151";
    label.style.marginTop = "4px";
    label.innerText =
      it.status === "ok" ? "Enviado" :
      it.status === "erro" ? "Erro" :
      it.status === "enviando" ? `Enviando ${it.progress||0}%` :
      "Na fila";

    wrap.appendChild(img);
    wrap.appendChild(barWrap);
    wrap.appendChild(label);

    c.appendChild(wrap);
  });

  const ct=document.createElement("div");
  ct.className="contador";
  ct.innerText=`Fotos: ${items.length}/10`;
  c.appendChild(ct);
}

// ================= FILA + RETRY =================
async function processQueue(){
  if(uploading) return;
  uploading = true;

  while(uploadQueue.length){
    const job = uploadQueue.shift();
    const { siteId, section, file, meta, itemRef, secaoEl, titulo } = job;

    itemRef.status = "enviando";
    itemRef.progress = 0;
    renderImages(secaoEl, titulo);

    let ok = false;
    let lastErr = null;

    for(let attempt=1; attempt<=MAX_RETRY; attempt++){
      try{
        await uploadFileToWorker(siteId, section, file, meta, (p)=>{
          itemRef.progress = p;
          renderImages(secaoEl, titulo);
        });
        ok = true;
        break;
      } catch(e){
        lastErr = e;
      }
    }

    if(ok){
      itemRef.status = "ok";
      itemRef.progress = 100;
    } else {
      itemRef.status = "erro";
      itemRef.progress = 100;
      console.error("Falha upload:", lastErr);
    }

    renderImages(secaoEl, titulo);
  }

  uploading = false;
}

// ================= BOTÃO ENVIAR =================
async function enviarRelatorio(){
  const siteId = document.getElementById("siteId")?.value.trim();
  if(!siteId){
    alert("Informe o ID do site");
    return;
  }

  const pendentes = Object.values(state).flat().some(it => it.status !== "ok");
  if(pendentes){
    alert("Ainda existem fotos enviando ou com erro. Aguarde concluir ou remova/reenvie.");
    return;
  }

  alert("Tudo enviado! Você pode encerrar.");
}

// ================= INIT =================
carregarConfiguracao();
