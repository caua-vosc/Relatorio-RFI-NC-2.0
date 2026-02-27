/* =========================
   CONFIG
========================= */
const WORKER = "https://rfi-20.caua-viniciusosc12.workers.dev/";
const CHUNK_SIZE = 1024 * 1024; // 1MB
const MAX_RETRY = 3;

let adminMode = false;
const ADMIN_PASSWORD = "Nova@123";

let secoes = [
  "FRENTE SITE",
  "PORTÃO DE ACESSO",
  "MEDIDOR DE ENERGIA",
  "BASE DE EQUIPAMENTOS",
  "SITE FINALIZADO"
];

// Guarda previews locais (blob urls) para o layout/contador
let state = {}; // { [secaoTitulo]: [ { url: "blob:..." } ] }

/* =========================
   FILA DE UPLOAD
========================= */
let uploadQueue = [];
let uploading = false;

/* =========================
   COMPRESSÃO DE IMAGEM
========================= */
async function compressImage(file, quality = 0.7) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const reader = new FileReader();

    reader.onerror = () => reject(new Error("Falha ao ler imagem"));
    reader.onload = e => (img.src = e.target.result);

    img.onload = () => {
      const canvas = document.createElement("canvas");

      const maxWidth = 1600;
      const scale = Math.min(1, maxWidth / img.width);

      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);

      const ctx = canvas.getContext("2d");
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

      canvas.toBlob(
        blob => {
          if (!blob) return reject(new Error("Falha ao comprimir imagem"));
          resolve(new File([blob], file.name, { type: "image/jpeg" }));
        },
        "image/jpeg",
        quality
      );
    };

    img.onerror = () => reject(new Error("Imagem inválida"));
    reader.readAsDataURL(file);
  });
}

/* =========================
   UI: BARRA DE PROGRESSO
========================= */
function criarBarra(container) {
  const wrapper = document.createElement("div");
  wrapper.style.width = "100%";
  wrapper.style.background = "#ddd";
  wrapper.style.marginTop = "5px";
  wrapper.style.borderRadius = "6px";
  wrapper.style.overflow = "hidden";

  const bar = document.createElement("div");
  bar.style.height = "20px";
  bar.style.width = "0%";
  bar.style.background = "#4caf50";
  bar.style.color = "#fff";
  bar.style.textAlign = "center";
  bar.style.fontSize = "12px";
  bar.style.lineHeight = "20px";

  wrapper.appendChild(bar);
  container.appendChild(wrapper);

  return bar;
}

/* =========================
   UPLOAD: CHUNK + RETRY
   (Mantém sua atualização)
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
        // opcional: envie metadados do chunk se seu Worker precisar
        formData.append("chunkIndex", String(i));
        formData.append("totalChunks", String(totalChunks));

        const resp = await fetch(WORKER, { method: "POST", body: formData });
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
    try {
      await uploadArquivo(job.file, job.siteId, job.section, job.progressBar);
    } catch (e) {
      // Mantém a fila andando mesmo se um arquivo falhar
      console.error("Upload falhou:", e);
    }
  }

  uploading = false;
}

/* =========================
   ADMIN MODE
========================= */
function toggleAdmin() {
  if (!adminMode) {
    const senha = prompt("Senha do administrador:");
    if (senha !== ADMIN_PASSWORD) {
      alert("Senha incorreta.");
      return;
    }

    adminMode = true;
    const btnNova = document.getElementById("btnNovaSecao");
    if (btnNova) btnNova.style.display = "inline-block";
    criarBotaoSalvar();
    alert("Modo administrador ativado");
  } else {
    adminMode = false;
    const btnNova = document.getElementById("btnNovaSecao");
    if (btnNova) btnNova.style.display = "none";
    removerBotaoSalvar();
    alert("Modo administrador desativado");
  }

  renderChecklist();
}

function criarBotaoSalvar() {
  if (document.getElementById("btnSalvarConfig")) return;

  const btn = document.createElement("button");
  btn.id = "btnSalvarConfig";
  btn.innerText = "Salvar Configuração";
  btn.style.margin = "10px";
  btn.onclick = salvarConfiguracao;

  document.body.appendChild(btn);
}

function removerBotaoSalvar() {
  const btn = document.getElementById("btnSalvarConfig");
  if (btn) btn.remove();
}

/* =========================
   SEÇÕES
========================= */
function criarSecao() {
  if (!adminMode) return;
  const nome = prompt("Nome da nova seção:");
  if (!nome) return;
  secoes.push(nome.toUpperCase());
  renderChecklist();
}

function excluirSecao(idx) {
  if (!adminMode) return;
  if (confirm("Deseja excluir esta seção e todas as fotos?")) {
    const titulo = secoes[idx];
    // limpa URLs blob para não vazar memória
    if (state[titulo]) {
      state[titulo].forEach(x => {
        try { URL.revokeObjectURL(x.url); } catch {}
      });
    }
    delete state[titulo];
    secoes.splice(idx, 1);
    renderChecklist();
  }
}

/* =========================
   RENDER / LAYOUT
========================= */
function renderChecklist() {
  const container = document.getElementById("checklistContainer");
  if (!container) {
    console.error("Elemento #checklistContainer não encontrado no HTML.");
    return;
  }

  container.innerHTML = "";

  secoes.forEach((titulo, idx) => {
    const s = document.createElement("section");

    if (adminMode) {
      const tools = document.createElement("div");
      tools.className = "admin-tools";

      const del = document.createElement("button");
      del.className = "btn-danger";
      del.innerText = "Excluir seção";
      del.onclick = () => excluirSecao(idx);

      tools.appendChild(del);
      s.appendChild(tools);
    }

    const t = document.createElement("input");
    t.className = "edit-title";
    t.value = titulo;
    t.disabled = !adminMode;
    t.onchange = e => {
      // renomeia seção e move o estado junto
      const novo = String(e.target.value || "").toUpperCase().trim();
      if (!novo) {
        e.target.value = secoes[idx];
        return;
      }
      if (novo === secoes[idx]) return;

      const antigo = secoes[idx];
      secoes[idx] = novo;

      if (state[antigo]) {
        state[novo] = state[antigo];
        delete state[antigo];
      }

      renderChecklist();
    };
    s.appendChild(t);

    const f = document.createElement("input");
    f.type = "file";
    f.accept = "image/*";
    f.multiple = true;

    // containers: 1) progresso 2) imagens
    const progressWrap = document.createElement("div");
    const imgs = document.createElement("div");

    s.appendChild(f);
    s.appendChild(progressWrap);
    s.appendChild(imgs);

    // handler merge: preview + fila otimizada
    f.onchange = async e => {
      const files = Array.from(e.target.files || []);
      const siteId = document.getElementById("siteId")?.value?.trim();

      if (!siteId) {
        alert("Informe o ID do site antes de enviar fotos");
        f.value = "";
        return;
      }

      if (!files.length) return;

      // limita 10 previews por seção como no antigo
      if (!state[titulo]) state[titulo] = [];

      const remaining = Math.max(0, 10 - state[titulo].length);
      const limitedFiles = files.slice(0, remaining);

      if (limitedFiles.length < files.length) {
        alert("Limite de 10 fotos por seção. Algumas foram ignoradas.");
      }

      for (const file of limitedFiles) {
        // preview imediato
        const url = URL.createObjectURL(file);
        state[titulo].push({ url });
        renderImages(s, titulo);

        // barra + compress + fila
        const progressBar = criarBarra(progressWrap);
        try {
          const compressed = await compressImage(file);
          uploadQueue.push({
            file: compressed,
            siteId,
            section: titulo, // usa o título atual como seção no Worker
            progressBar
          });
        } catch (err) {
          progressBar.style.background = "red";
          progressBar.innerText = "Erro";
          console.error(err);
        }
      }

      processQueue();
      f.value = "";
    };

    renderImages(s, titulo);
    container.appendChild(s);
  });
}

function renderImages(secao, titulo) {
  const containers = secao.querySelectorAll("div");
  const imgsContainer = containers[containers.length - 1]; // último div = imagens
  imgsContainer.innerHTML = "";

  if (!state[titulo]) {
    // contador mesmo vazio
    const ct = document.createElement("div");
    ct.className = "contador";
    ct.innerText = `Fotos: 0/10`;
    imgsContainer.appendChild(ct);
    return;
  }

  state[titulo].forEach((item, i) => {
    const img = document.createElement("img");
    img.src = item.url;

    img.onclick = () => {
      if (confirm("Remover foto?")) {
        try { URL.revokeObjectURL(item.url); } catch {}
        state[titulo].splice(i, 1);
        renderImages(secao, titulo);
      }
    };

    imgsContainer.appendChild(img);
  });

  const ct = document.createElement("div");
  ct.className = "contador";
  ct.innerText = `Fotos: ${state[titulo].length}/10`;
  imgsContainer.appendChild(ct);
}

/* =========================
   CONFIGURAÇÃO REMOTA (mantida)
========================= */
async function salvarConfiguracao() {
  try {
    await fetch(WORKER + "?config=true", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ secoes })
    });

    alert("Configuração salva com sucesso!");
  } catch (e) {
    alert("Erro ao salvar configuração");
  }
}

async function carregarConfiguracao() {
  try {
    const r = await fetch(WORKER + "?getconfig=true");
    if (r.ok) {
      const data = await r.json();
      if (data.secoes) secoes = data.secoes;
    }
  } catch (e) {
    console.log("Sem configuração remota");
  }

  renderChecklist();
}

/* =========================
   INIT
========================= */
carregarConfiguracao();

}

carregarConfiguracao();
