/* =========================
   NOVO (mantido como você enviou)
========================= */
const WORKER = "https://rfi-20.caua-viniciusosc12.workers.dev/";
const CHUNK_SIZE = 1024 * 1024; // 1MB
const MAX_RETRY = 3;

let uploadQueue = [];
let uploading = false;

/* =========================
   COMPRESSÃO DE IMAGEM
========================= */
async function compressImage(file, quality = 0.7) {
  return new Promise(resolve => {
    const img = new Image();
    const reader = new FileReader();

    reader.onload = e => img.src = e.target.result;

    img.onload = () => {
      const canvas = document.createElement("canvas");

      const maxWidth = 1600;
      const scale = Math.min(1, maxWidth / img.width);

      canvas.width = img.width * scale;
      canvas.height = img.height * scale;

      const ctx = canvas.getContext("2d");
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

      canvas.toBlob(blob => {
        resolve(new File([blob], file.name, { type: "image/jpeg" }));
      }, "image/jpeg", quality);
    };

    reader.readAsDataURL(file);
  });
}

/* =========================
   CRIAR BARRA
========================= */
function criarBarra(container) {
  const wrapper = document.createElement("div");
  wrapper.style.width = "100%";
  wrapper.style.background = "#ddd";
  wrapper.style.marginTop = "5px";

  const bar = document.createElement("div");
  bar.style.height = "20px";
  bar.style.width = "0%";
  bar.style.background = "#4caf50";
  bar.style.color = "#fff";
  bar.style.textAlign = "center";
  bar.style.fontSize = "12px";

  wrapper.appendChild(bar);
  container.appendChild(wrapper);

  return bar;
}

/* =========================
   UPLOAD COM CHUNK + RETRY
========================= */
async function uploadArquivo(file, siteId, section, progressBar) {

  const totalChunks = Math.ceil(file.size / CHUNK_SIZE);

  for (let i = 0; i < totalChunks; i++) {

    const start = i * CHUNK_SIZE;
    const end = Math.min(start + CHUNK_SIZE, file.size);
    const chunk = file.slice(start, end);

    let tentativa = 0;
    let enviado = false;

    while (!enviado && tentativa < MAX_RETRY) {

      try {

        const formData = new FormData();
        formData.append("file", chunk, file.name);
        formData.append("siteId", siteId);
        formData.append("section", section);

        const resp = await fetch(WORKER, {
          method: "POST",
          body: formData
        });

        if (!resp.ok) throw new Error("Falha no chunk");

        enviado = true;

      } catch (err) {
        tentativa++;
        if (tentativa >= MAX_RETRY) {
          progressBar.style.background = "red";
          progressBar.innerText = "Erro";
          throw err;
        }
      }
    }

    const percent = Math.round(((i + 1) / totalChunks) * 100);
    progressBar.style.width = percent + "%";
    progressBar.innerText = percent + "%";
  }

  progressBar.style.background = "#2196f3";
  progressBar.innerText = "Concluído";
}

/* =========================
   FILA INTELIGENTE
========================= */
async function processQueue() {

  if (uploading) return;
  uploading = true;

  while (uploadQueue.length > 0) {

    const job = uploadQueue.shift();

    await uploadArquivo(
      job.file,
      job.siteId,
      job.section,
      job.progressBar
    );
  }

  uploading = false;
}


/* =========================
   ANTIGO (igual ao que funcionava)
========================= */

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

// ============================
// ADMIN MODE
// ============================

function toggleAdmin(){

    if(!adminMode){
        const senha = prompt("Senha do administrador:");
        if(senha !== ADMIN_PASSWORD){
            alert("Senha incorreta.");
            return;
        }

        adminMode = true;
        document.getElementById("btnNovaSecao").style.display="inline-block";
        criarBotaoSalvar();
        alert("Modo administrador ativado");

    }else{

        adminMode = false;
        document.getElementById("btnNovaSecao").style.display="none";
        removerBotaoSalvar();
        alert("Modo administrador desativado");
    }

    renderChecklist();
}

function criarBotaoSalvar(){

    if(document.getElementById("btnSalvarConfig")) return;

    const btn = document.createElement("button");
    btn.id = "btnSalvarConfig";
    btn.innerText = "Salvar Configuração";
    btn.style.margin = "10px";
    btn.onclick = salvarConfiguracao;

    document.body.appendChild(btn);
}

function removerBotaoSalvar(){
    const btn = document.getElementById("btnSalvarConfig");
    if(btn) btn.remove();
}

// ============================
// SEÇÕES
// ============================

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
// RENDER
// ============================

function renderChecklist(){

    const container =
      document.getElementById("checklistContainer");

    container.innerHTML = "";

    secoes.forEach((titulo, idx)=>{

        const s = document.createElement("section");

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
        t.onchange=e=>secoes[idx]=e.target.value; // (mantido como era)
        s.appendChild(t);

        const f = document.createElement("input");
        f.type="file";
        f.accept="image/*";
        f.multiple=true;

        // ✅ CORREÇÃO: manter o comportamento antigo (state + preview)
        // + adicionar o novo (compress + fila + chunk upload + barra)
        f.onchange = async e => {

            const files =
              Array.from(e.target.files).slice(0,10);

            if(!state[titulo]) state[titulo]=[];

            // 1) antigo: salvar no state e renderizar preview
            files.forEach(file=>{
                const r=new FileReader();
                r.onload=ev=>{
                    state[titulo].push(ev.target.result);
                    renderImages(s,titulo);
                };
                r.readAsDataURL(file);
            });

            // 2) novo: compress + fila + upload por chunks com barra
            const siteId = document.getElementById("siteId").value;

            if (!siteId) {
              alert("Informe o ID do site antes de enviar fotos");
              return;
            }

            for (let file of files) {
              const progressBar = criarBarra(imgs);
              const compressed = await compressImage(file);

              uploadQueue.push({
                file: compressed,
                siteId,
                section: titulo,
                progressBar
              });
            }

            processQueue();
        };

        s.appendChild(f);

        const imgs=document.createElement("div");
        s.appendChild(imgs);

        renderImages(s,titulo);
        container.appendChild(s);
    });
}

function renderImages(secao,titulo){

    const c=secao.querySelector("div:last-child");
    c.innerHTML="";

    if(!state[titulo]) return;

    state[titulo].forEach((src,i)=>{

        const img=document.createElement("img");
        img.src=src;

        img.onclick=()=>{
            if(confirm("Remover foto?")){
                state[titulo].splice(i,1);
                renderImages(secao,titulo);
            }
        };

        c.appendChild(img);
    });

    const ct=document.createElement("div");
    ct.className="contador";
    ct.innerText=`Fotos: ${state[titulo].length}/10`;
    c.appendChild(ct);
}

// ============================
// CONFIGURAÇÃO REMOTA
// ============================

async function salvarConfiguracao(){

    try{
        await fetch(WORKER + "?config=true", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ secoes })
        });

        alert("Configuração salva com sucesso!");
    }
    catch(e){
        alert("Erro ao salvar configuração");
    }
}

async function carregarConfiguracao(){

    try{
        const r = await fetch(
          WORKER + "?getconfig=true"
        );

        if(r.ok){
            const data = await r.json();
            if(data.secoes){
                secoes = data.secoes;
            }
        }
    }
    catch(e){
        console.log("Sem configuração remota");
    }

    renderChecklist();
}

// ============================
// ENVIO RELATÓRIO (mantido)
// ============================

async function enviarRelatorio(){

  const siteId =
    document.getElementById("siteId").value.trim();

  if(!siteId){
    alert("Informe o ID do site");
    return;
  }

  try {
    await uploadParaNextcloud(siteId, state);
    alert("Upload concluído com sucesso!");
    state = {};
    renderChecklist();
  }
  catch(e){
    alert("Erro no envio: " + e.message);
  }
}

// ============================
// INICIALIZAÇÃO
// ============================

carregarConfiguracao();
// ============================

carregarConfiguracao();
