let admin = false;
const SENHA_ADMIN = "Nova@123";

const container = document.getElementById("checklistContainer");

/* ================= ADMIN ================= */

document.getElementById("adminBtn").onclick = async () => {
  const senha = prompt("Senha do administrador:");
  if (senha !== SENHA_ADMIN) {
    alert("Senha incorreta");
    return;
  }
  admin = true;
  alert("Modo administrador ativado");
  renderizar();
};

/* ================= ESTADO ================= */

async function obterEstado() {
  return (await carregarEstado()) || {};
}

async function salvar(state) {
  await salvarEstado(state);
  renderizar();
}

/* ================= SEÇÕES ================= */

async function adicionarSecao() {
  if (!admin) return;

  const nome = prompt("Nome da nova seção:");
  if (!nome) return;

  const state = await obterEstado();
  if (state[nome]) {
    alert("Seção já existe");
    return;
  }

  state[nome] = [];
  await salvar(state);
}

async function removerSecao(nome) {
  if (!admin) return;
  if (!confirm(`Excluir a seção "${nome}"?`)) return;

  const state = await obterEstado();
  delete state[nome];
  await salvar(state);
}

/* ================= FOTOS ================= */

async function adicionarFoto(secao, file) {
  const reader = new FileReader();
  reader.onload = async e => {
    const state = await obterEstado();
    state[secao].push(e.target.result);
    await salvar(state);
  };
  reader.readAsDataURL(file);
}

/* ================= RENDER ================= */

async function renderizar() {
  const state = await obterEstado();
  container.innerHTML = "";

  if (admin) {
    const btn = document.createElement("button");
    btn.textContent = "+ Adicionar seção";
    btn.onclick = adicionarSecao;
    btn.className = "primary";
    container.appendChild(btn);
  }

  Object.keys(state).forEach(secao => {
    const section = document.createElement("section");

    section.innerHTML = `
      <h2>${secao}</h2>
      <input type="file" accept="image/*" />
      <div class="fotos"></div>
    `;

    if (admin) {
      const del = document.createElement("button");
      del.textContent = "Excluir seção";
      del.onclick = () => removerSecao(secao);
      del.style.background = "#dc2626";
      del.style.color = "#fff";
      section.appendChild(del);
    }

    const input = section.querySelector("input");
    input.onchange = e => adicionarFoto(secao, e.target.files[0]);

    const fotos = section.querySelector(
