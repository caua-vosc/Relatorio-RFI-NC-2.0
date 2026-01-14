let admin = false;
const SENHA_ADMIN = "Nova@123";

document.getElementById("adminBtn").onclick = () => {
  const senha = prompt("Senha do administrador:");
  if (senha === SENHA_ADMIN) {
    admin = true;
    alert("Modo administrador ativado");
  } else {
    alert("Senha incorreta");
  }
};

function enviarRelatorio() {
  const siteId = document.getElementById("siteId").value;
  if (!siteId) {
    alert("Informe o ID do site");
    return;
  }

  carregarEstado().then(state => {
    uploadParaNextcloud(siteId, state)
      .then(() => alert("Relatório enviado com sucesso"))
      .catch(e => alert("Erro no envio: " + e.message));
  });
}
