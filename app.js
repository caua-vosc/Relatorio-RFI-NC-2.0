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

// state agora guarda itens por seção: { preview, name, status, progress }
let state = {};

// ============ UPLOAD FILA / ESTADO ============
let uploadQueue = [];
let uploading = false;
const MAX_RETRY = 3;

// ============ ADMIN ============
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

  // tenta colocar próximo do botão admin, se existir container
  document.body.appendChild(btn);
}

function removerBotaoSalvarConfig(){
  const btn = document.getElementById("btnSalvarConfig");
  if(btn) btn.remove();
}

// ============ CONFIG REMOTA (NEXTCLOUD VIA WORKER) ============
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
  } catch(e){
    // sem config remota, segue padrão
  }
  renderChecklist();
}

// ============ UI ============
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
      if(!novo) { e.target.value = titulo; return; }
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

      for(const file of files){
        // cria item na UI imediatamente (preview local)
        const item = {
          name: file.name,
          preview: URL.createObjectURL(file),
          status: "fila",
          progress: 0
        };
        state[titulo].push(item);
        renderImages(s, titulo);

        // compressão + enfileirar upload em background
        const compressed = await compressImage(file, 1600, 0.72);

        uploadQueue.push({
          siteId,
          section: titulo,
          file: compressed,
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
        // remove também da fila, se ainda estiver
        uploadQueue = uploadQueue.filter(j => j.itemRef !== it);
        // revoga preview
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

// ============ COMPRESSÃO ============
function compressImage(file, maxWidth = 1600, quality = 0.72){
  return new Promise((resolve, reject)=>{
    const img = new Image();
    const reader = new FileReader();

    reader.onload = (ev)=> img.src = ev.target.result;
    reader.onerror = reject;

    img.onload = ()=>{
      const canvas = document.createElement("canvas");
      const scale = Math.min(1, maxWidth / img.width);
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);

      const ctx = canvas.getContext("2d");
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

      canvas.toBlob((blob)=>{
        if(!blob) return reject(new Error("Falha ao comprimir imagem."));
        const outName = (file.name || "foto").replace(/\.[^/.]+$/, "") + ".jpg";
        resolve(new File([blob], outName, { type: "image/jpeg" }));
      }, "image/jpeg", quality);
    };

    img.onerror = ()=> reject(new Error("Imagem inválida."));
    reader.readAsDataURL(file);
  });
}

// ============ FILA + RETRY ============
async function processQueue(){
  if(uploading) return;
  uploading = true;

  while(uploadQueue.length){
    const job = uploadQueue.shift();
    const { siteId, section, file, itemRef, secaoEl, titulo } = job;

    itemRef.status = "enviando";
    itemRef.progress = 0;
    renderImages(secaoEl, titulo);

    let ok = false;
    let lastErr = null;

    for(let attempt=1; attempt<=MAX_RETRY; attempt++){
      try{
        await uploadFileToWorker(siteId, section, file, (p)=>{
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

// ============ ENVIO RELATÓRIO ============
async function enviarRelatorio(){
  const siteId = document.getElementById("siteId").value.trim();
  if(!siteId){
    alert("Informe o ID do site");
    return;
  }

  // se ainda há uploads na fila/rodando, avisa
  const pendentes = Object.values(state).flat().some(it => it.status !== "ok");
  if(pendentes){
    alert("Ainda existem fotos enviando ou com erro. Aguarde concluir ou remova/reenvie.");
    return;
  }

  alert("Tudo enviado! Você pode encerrar.");
}

// ============ INIT ============
carregarConfiguracao();
