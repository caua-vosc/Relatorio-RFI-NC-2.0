let adminMode = false;
const ADMIN_PASSWORD = "Nova@123";

/* ===== SEÇÕES PADRÃO ===== */

let secoes = [
  "FRENTE SITE",
  "PORTÃO DE ACESSO",
  "MEDIDOR DE ENERGIA",
  "BASE DE EQUIPAMENTOS",
  "SITE FINALIZADO"
];

/* ===== ESTADO ===== */

let state = {};

/* ===== INIT ===== */

document.addEventListener("DOMContentLoaded", async () => {
  state = (await carregarEstado()) || {};
  renderChecklist();
});

/* ===== ADMIN ===== */

function toggleAdmin() {
  if (!adminMode) {
    const senha = prompt("Senha do administrador:");
    if (senha !== ADMIN_PASSWORD) {
      alert("Senha incorreta.");
      return;
    }
    adminMode = true;
    document.getElementById("btnNovaSecao").style.display = "inline-block";
    alert("Modo administrador ativado");
  } else {
    adminMode = false;
    document.getElementById("btnNovaSecao").style.display = "none";
    alert("Modo administrador desativado");
  }
  renderChecklist();
}

function criarSecao() {
  if (!adminMode) return;

  const nome = prompt("Nome da nova seção:");
  if (!nome) return;

  secoes.push(nome.toUpperCase());
  salvarEstado(state);
  renderChecklist();
}

function excluirSecao(idx) {
  if (!adminMode) return;

  if (confirm("Deseja excluir esta seção e todas as fotos?")) {
    const titulo = secoes[idx];
    delete state[titulo];
    secoes.splice(idx, 1);
    salvarEstado(state);
    renderChecklist();
  }
}

/* ===== RENDER ===== */

function renderChecklist() {
  const container = document.getElementById("checklistContainer");
  container.innerHTML = "";

  secoes.forEach((titulo, idx) => {
    const s = document.createElement("section");
    s.className = "card";

    /* ADMIN TOOLS */
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

    /* TITULO */
    const t = document.createElement("input");
    t.className = "edit-title";
    t.value = titulo;
    t.disabled = !adminMode;
    t.onchange = e => {
      secoes[idx] = e.target.value.toUpperCase();
    };
    s.appendChild(t);

    /* INPUT FILE */
    const f = document.createElement("input");
    f.type = "file";
    f.accept = "image/*";
    f.multiple = true;
    f.onchange = e => {
      const files = Array.from(e.target.files).slice(0, 10);
      if (!state[titulo]) state[titulo] = [];

      files.forEach(file => {
        const r = new FileReader();
        r.onload = ev => {
          state[titulo].push(ev.target.result);
          salvarEstado(state);
          renderImages(s, titulo);
        };
        r.readAsDataURL(file);
      });
    };
    s.appendChild(f);

    /* IMAGENS */
    const imgs = document.createElement("div");
    imgs.className = "img-container";
    s.appendChild(imgs);

    renderImages(s, titulo);
    container.appendChild(s);
  });
}

function renderImages(secao, titulo) {
  const c = secao.querySelector(".img-container");
  c.innerHTML = "";

  if (!state[titulo]) return;

  state[titulo].forEach((src, i) => {
    const img = document.createElement("img");
    img.src = src;
    img.onclick = () => {
      if (confirm("Remover foto?")) {
        state[titulo].splice(i, 1);
        salvarEstado(state);
        renderImages(secao, titulo);
      }
    };
    c.appendChild(img);
  });

  const ct = document.createElement("div");
  ct.className = "contador";
  ct.innerText = `Fotos: ${state[titulo].length}/10`;
  c.appendChild(ct);
}

/* ===== ENVIO ===== */

async function enviarRelatorio() {
  const siteId = document.getElementById("siteId").value.trim();
  if (!siteId) {
    alert("Informe o ID do site");
    return;
  }

  try {
    await uploadParaNextcloud(siteId, state);
    alert("Upload concluído");
  } catch (e) {
    alert("Offline. Será reenviado automaticamente.");
    salvarOffline(siteId, state);
  }
}
