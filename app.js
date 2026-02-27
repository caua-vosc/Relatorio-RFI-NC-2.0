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

let state = {}; // { "TITULO": [{ id, previewUrl, name }] }

/* =========================
   FILA DE UPLOAD (NOVO)
========================= */
let uploadQueue = [];
let uploading = false;

/* =========================
   COMPRESSÃO DE IMAGEM (NOVO)
========================= */
async function compressImage(file, quality = 0.7) {
  return new Promise(resolve => {
    const img = new Image();
    const reader = new FileReader();

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
          // fallback de segurança
          if (!blob) return resolve(file);
          resolve(new File([blob], file.name, { type: "image/jpeg" }));
        },
        "image/jpeg",
        quality
      );
    };

    reader.readAsDataURL(file);
  });
}

/* =========================
   BARRA DE PROGRESSO (NOVO)
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
   UPLOAD COM CHUNK + RETRY (NOVO)
========================= */
async function uploadArquivo(job) {
  const { file, siteId, section, progressBar } = job;

  // Se foi cancelado antes de iniciar
  if (job.cancelled) {
    progressBar.style.background = "#999";
    progressBar.style.width = "100%";
    progressBar.innerText = "Cancelado";
    return;
  }

  const totalChunks = Math.ceil(file.size / CHUNK_SIZE);

  for (let i = 0; i < totalChunks; i++) {
    // Cancelamento durante a fila
    if (job.cancelled) {
      progressBar.style.background = "#999";
      progressBar.style.width = "100%";
      progressBar.innerText = "Cancelado";
      return;
    }

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
        formData.append("chunkIndex", String(i));
        formData.append("totalChunks", String(totalChunks));

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
   PROCESSAR FILA (NOVO)
========================= */
async function processQueue() {
  if (uploading) return;
  uploading = true;

  while (uploadQueue.length > 0) {
    const job = uploadQueue.shift();
    try {
      await uploadArquivo(job);
    } catch (e) {
      console.error("Erro no upload:", e);
      // continua para próximos jobs
    }
  }

  uploading = false;
}

/* =========================
   ADMIN MODE (ANTIGO)
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
   SEÇÕES (ANTIGO)
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
    delete state[titulo];
    secoes.splice(idx, 1);
    renderChecklist();
  }
}

/* =========================
   PREVIEW / UI
========================= */
function ensureStateSection(titulo) {
  if (!state[titulo]) state[titulo] = [];
}

function addPreview(titulo, file, secaoEl) {
  ensureStateSection(titulo);

  // limite 10 por seção
  if (state[titulo].length >= 10) return null;

  const id = crypto.randomUUID ? crypto.randomUUID() : String(Date.now() + Math.random());
  const previewUrl = URL.createObjectURL(file);

  const item = { id, previewUrl, name: file.name };
  state[titulo].push(item);

  renderImages(secaoEl, titulo);
  return item;
}

function removePreview(titulo, id) {
  if (!state[titulo]) return;
  const idx = state[titulo].findIndex(x => x.id === id);
  if (idx >= 0) {
    try {
      URL.revokeObjectURL(state[titulo][idx].previewUrl);
    } catch {}
    state[titulo].splice(idx, 1);
  }
}

/* =========================
   INTEGRAÇÃO INPUT FILE (NOVO + UI)
========================= */
function ativarUpload(input, progressContainer, secaoEl, sectionTitle) {
  input.onchange = async e => {
    const files = Array.from(e.target.files || []);
    const siteId = document.getElementById("siteId")?.value?.trim();

    if (!siteId) {
      alert("Informe o ID do site antes de enviar fotos");
      input.value = "";
      return;
    }

    // adiciona e enfileira
    for (let file of files) {
      ensureStateSection(sectionTitle);

      if (state[sectionTitle].length >= 10) {
        alert(`Limite de 10 fotos atingido na seção: ${sectionTitle}`);
        break;
      }

      // preview imediato (antes da compressão)
      const previewItem = addPreview(sectionTitle, file, secaoEl);
      if (!previewItem) continue;

      const progressBar = criarBarra(progressContainer);

      // compressão + fila
      const compressed = await compressImage(file);

      const job = {
        id: previewItem.id,
        file: compressed,
        siteId,
        section: sectionTitle,
        progressBar,
        cancelled: false
      };

      uploadQueue.push(job);
    }

    // reset pra permitir selecionar o mesmo arquivo novamente
    input.value = "";
    processQueue();
  };
}

/* =========================
   RENDER (ANTIGO restaurado)
========================= */
function renderChecklist() {
  const container = document.getElementById("checklistContainer");
  if (!container) {
    console.error('Elemento #checklistContainer não encontrado no HTML.');
    return;
  }

  container.innerHTML = "";

  secoes.forEach((titulo, idx) => {
    const s = document.createElement("section");

    // ferramentas admin
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

    // título editável no admin
    const t = document.createElement("input");
    t.className = "edit-title";
    t.value = titulo;
    t.disabled = !adminMode;

    t.onchange = e => {
      const novo = String(e.target.value || "").toUpperCase().trim();
      if (!novo) {
        e.target.value = secoes[idx];
        return;
      }

      // renomeia chave do state
      const antigo = secoes[idx];
      if (antigo !== novo) {
        if (state[antigo]) {
          state[novo] = state[antigo];
          delete state[antigo];
        }
        secoes[idx] = novo;
      }
      renderChecklist();
    };

    s.appendChild(t);

    // input file
    const f = document.createElement("input");
    f.type = "file";
    f.accept = "image/*";
    f.multiple = true;
    s.appendChild(f);

    // área de imagens (preview)
    const imgs = document.createElement("div");
    s.appendChild(imgs);

    // área de progressos (barras)
    const progressArea = document.createElement("div");
    progressArea.style.marginTop = "8px";
    s.appendChild(progressArea);

    // ativa o upload (novo)
    ativarUpload(f, progressArea, s, titulo);

    renderImages(s, titulo);
    container.appendChild(s);
  });
}

function renderImages(secaoEl, titulo) {
  // div de imagens é o 1º div após o input file (no nosso render: s.appendChild(imgs); s.appendChild(progressArea);)
  const divs = secaoEl.querySelectorAll("div");
  const imgsContainer = divs.length ? divs[0] : null;
  if (!imgsContainer) return;

  imgsContainer.innerHTML = "";

  if (!state[titulo] || state[titulo].length === 0) {
    const ct = document.createElement("div");
    ct.className = "contador";
    ct.innerText = `Fotos: 0/10`;
    imgsContainer.appendChild(ct);
    return;
  }

  state[titulo].forEach(item => {
    const img = document.createElement("img");
    img.src = item.previewUrl;
    img.title = item.name;

    img.onclick = () => {
      if (!confirm("Remover foto?")) return;

      // remove do state + preview
      removePreview(titulo, item.id);

      // tenta cancelar job ainda na fila
      for (const job of uploadQueue) {
        if (job.id === item.id) job.cancelled = true;
      }

      renderImages(secaoEl, titulo);
    };

    imgsContainer.appendChild(img);
  });

  const ct = document.createElement("div");
  ct.className = "contador";
  ct.innerText = `Fotos: ${state[titulo].length}/10`;
  imgsContainer.appendChild(ct);
}

/* =========================
   CONFIGURAÇÃO REMOTA (ANTIGO)
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
      if (data.secoes && Array.isArray(data.secoes)) {
        secoes = data.secoes;
      }
    }
  } catch (e) {
    console.log("Sem configuração remota");
  }

  renderChecklist();
}

/* =========================
   INIT
========================= */
function init() {
  // garante que botões existam no HTML
  const btnNova = document.getElementById("btnNovaSecao");
  if (btnNova) {
    btnNova.onclick = criarSecao;
    btnNova.style.display = adminMode ? "inline-block" : "none";
  }

  const btnAdmin = document.getElementById("btnAdmin");
  if (btnAdmin) btnAdmin.onclick = toggleAdmin;

  carregarConfiguracao();
}

// Evita rodar antes do DOM existir
document.addEventListener("DOMContentLoaded", init);
