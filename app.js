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
    document.getElementById("btnNovaSecao").style.display="inline-block";
    criarBotaoSalvarConfig();
    alert("Modo administrador ativado");
  } else {
    adminMode = false;
    document.getElementById("btnNovaSecao").style.display="none";
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
        az = event.webkitCompassHeading;       // iOS
      } else if (typeof event.alpha === "number") {
        az = event.alpha;                      // Android (aprox.)
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

// quebra texto em múltiplas linhas sem cortar
function wrapText(ctx, text, maxWidth){
  const words = String(text || "").split(/\s+/).filter(Boolean);
  const lines = [];
  let line = "";

  for(const w of words){
    const test = line ? (line + " " + w) : w;
    if(ctx.measureText(test).width <= maxWidth){
      line = test;
    } else {
      if(line) lines.push(line);
      line = w;
    }
  }
  if(line) lines.push(line);
  return lines;
}

// texto premium: stroke + fill + leve sombra
function drawTextPremium(ctx, text, x, y){
  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,0.35)";
  ctx.shadowBlur = Math.max(2, Math.round(parseInt(ctx.font,10) * 0.12));
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 1;

  ctx.lineJoin = "round";
  ctx.miterLimit = 2;
  ctx.strokeStyle = "rgba(0,0,0,0.85)";
  ctx.lineWidth = Math.max(3, Math.round(parseInt(ctx.font,10) * 0.18));
  ctx.strokeText(text, x, y);

  ctx.fillStyle = "#ffffff";
  ctx.fillText(text, x, y);
  ctx.restore();
}

// ================= CARIMBO PREMIUM (SEM FUNDO, PROPORCIONAL) =================
async function stampAndCompress(file, meta, maxWidth = 1800, quality = 0.85){
  const img = await loadImageFromFile(file);

  // escala proporcional
  const scale = Math.min(1, maxWidth / img.width);
  const w = Math.round(img.width * scale);
  const h = Math.round(img.height * scale);

  // canvas MESMO tamanho da foto (sem faixa)
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");

  ctx.drawImage(img, 0, 0, w, h);

  // base de proporção: menor lado
  const base = Math.min(w, h);

  // margens proporcionais
  const padX = Math.max(18, Math.round(base * 0.035));
  const padBottom = Math.max(18, Math.round(base * 0.035));
  const maxTextWidth = w - padX * 2;

  // fontes proporcionais (premium)
  let fTitle = Math.max(18, Math.round(base * 0.040)); // linha 1 (valores)
  let fSub   = Math.max(16, Math.round(base * 0.034)); // linha 2 (az/data)
  let fAddr  = Math.max(14, Math.round(base * 0.030)); // endereço

  // valores
  const tsLocal = meta?.capturedAt?.local || new Date().toLocaleString("pt-BR");
  const lat = meta?.geolocation?.available ? formatCoord(meta.geolocation.latitude) : "—";
  const lon = meta?.geolocation?.available ? formatCoord(meta.geolocation.longitude) : "—";
  const acc = meta?.geolocation?.available ? formatAcc(meta.geolocation.accuracy_m) : "—";
  const az  = meta?.azimuth?.available ? formatAz(meta.azimuth.azimuth_deg) : "—";
  const addrText = buildAddressText(meta?.address);

  // layout premium em colunas (linha 1)
  const colGap = Math.max(14, Math.round(base * 0.02));
  const col1 = `LAT ${lat}`;
  const col2 = `LON ${lon}`;
  const col3 = `±${acc}`;

  // linha 2: az à esquerda / data à direita
  const left2 = `AZ ${az}`;
  const right2 = tsLocal;

  // função para montar e garantir que cabe sem cortar
  function computeLines(){
    // linha 1 (colunas)
    ctx.font = `800 ${fTitle}px system-ui, -apple-system, Segoe UI, Roboto, Arial`;
    const w1 = ctx.measureText(col1).width;
    const w2 = ctx.measureText(col2).width;
    const w3 = ctx.measureText(col3).width;
    const totalCols = w1 + colGap + w2 + colGap + w3;

    // se estourar largura, reduz fonte
    if(totalCols > maxTextWidth){
      return { ok:false };
    }

    // linha 2
    ctx.font = `800 ${fSub}px system-ui, -apple-system, Segoe UI, Roboto, Arial`;
    const leftW = ctx.measureText(left2).width;
    const rightW = ctx.measureText(right2).width;

    if(leftW + colGap + rightW > maxTextWidth){
      return { ok:false };
    }

    // endereço (até 3 linhas)
    ctx.font = `700 ${fAddr}px system-ui, -apple-system, Segoe UI, Roboto, Arial`;
    let addrLines = wrapText(ctx, addrText, maxTextWidth);
    if(addrLines.length > 3){
      addrLines = addrLines.slice(0,3);
      // ellipsis na última
      const last = addrLines[2];
      addrLines[2] = last.length > 6 ? last.replace(/\s+\S*$/, "…") : (last + "…");
    }

    // altura total necessária
    const lh1 = Math.round(fTitle * 1.25);
    const lh2 = Math.round(fSub * 1.25);
    const lh3 = Math.round(fAddr * 1.25);
    const totalH = lh1 + lh2 + (addrLines.length * lh3) + Math.round(base * 0.02);

    // área “segura” do rodapé proporcional
    const safeH = Math.max(150, Math.round(base * 0.28));
    if(totalH > safeH){
      return { ok:false };
    }

    return { ok:true, addrLines, lh1, lh2, lh3, totalH, w1, w2, w3, leftW, rightW };
  }

  // ajuste automático de fonte para caber em qualquer proporção
  let layout = null;
  for(let i=0;i<12;i++){
    const test = computeLines();
    if(test.ok){ layout = test; break; }
    fTitle = Math.max(14, fTitle - 2);
    fSub   = Math.max(13, fSub - 2);
    fAddr  = Math.max(12, fAddr - 2);
  }

  // se ainda assim falhar, cai para layout simples (nunca corta)
  if(!layout){
    ctx.font = `800 ${fTitle}px system-ui, -apple-system, Segoe UI, Roboto, Arial`;
    const lh = Math.round(fTitle * 1.25);
    const safeH = Math.max(150, Math.round(base * 0.30));

    const lineA = `LAT ${lat}  LON ${lon}  ±${acc}`;
    const lineB = `AZ ${az}  ${tsLocal}`;

    ctx.font = `700 ${fAddr}px system-ui, -apple-system, Segoe UI, Roboto, Arial`;
    let addrLines = wrapText(ctx, addrText, maxTextWidth);
    if(addrLines.length > 3){
      addrLines = addrLines.slice(0,3);
      addrLines[2] = addrLines[2].replace(/\s+\S*$/, "…");
    }

    const lhA = Math.round(fTitle * 1.25);
    const lhB = Math.round(fSub * 1.25);
    const lhC = Math.round(fAddr * 1.25);
    const totalH = lhA + lhB + addrLines.length * lhC + 8;

    let y = h - padBottom - Math.min(totalH, safeH);

    ctx.textBaseline = "top";
    ctx.textAlign = "left";

    ctx.font = `900 ${fTitle}px system-ui, -apple-system, Segoe UI, Roboto, Arial`;
    drawTextPremium(ctx, lineA, padX, y); y += lhA;

    ctx.font = `900 ${fSub}px system-ui, -apple-system, Segoe UI, Roboto, Arial`;
    drawTextPremium(ctx, lineB, padX, y); y += lhB;

    ctx.font = `800 ${fAddr}px system-ui, -apple-system, Segoe UI, Roboto, Arial`;
    for(const l of addrLines){
      drawTextPremium(ctx, l, padX, y); y += lhC;
    }

  } else {
    // desenha premium alinhado
    let y = h - padBottom - layout.totalH;

    ctx.textBaseline = "top";

    // Linha 1 em colunas
    ctx.font = `900 ${fTitle}px system-ui, -apple-system, Segoe UI, Roboto, Arial`;
    ctx.textAlign = "left";
    drawTextPremium(ctx, col1, padX, y);

    const x2 = padX + layout.w1 + colGap;
    drawTextPremium(ctx, col2, x2, y);

    const x3 = x2 + layout.w2 + colGap;
    drawTextPremium(ctx, col3, x3, y);
    y += layout.lh1;

    // Linha 2: AZ à esquerda / Data à direita
    ctx.font = `900 ${fSub}px system-ui, -apple-system, Segoe UI, Roboto, Arial`;
    ctx.textAlign = "left";
    drawTextPremium(ctx, left2, padX, y);

    ctx.textAlign = "right";
    drawTextPremium(ctx, right2, w - padX, y);
    y += layout.lh2;

    // Endereço (1..3 linhas)
    ctx.font = `800 ${fAddr}px system-ui, -apple-system, Segoe UI, Roboto, Arial`;
    ctx.textAlign = "left";
    for(const l of layout.addrLines){
      drawTextPremium(ctx, l, padX, y);
      y += layout.lh3;
    }
  }

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
      const siteId = document.getElementById("siteId").value.trim();
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

        const stamped = await stampAndCompress(file, meta, 1800, 0.85);
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

  const ct = document.createElement("div");
  ct.className="contador";
  ct.innerText = `Fotos: ${items.length}/10`;
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
  const siteId = document.getElementById("siteId").value.trim();
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
