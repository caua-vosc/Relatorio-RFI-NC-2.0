const WORKER =
  "https://rfi-20.caua-viniciusosc12.workers.dev/";

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
        t.onchange=e=>secoes[idx]=e.target.value;
        s.appendChild(t);

        const f = document.createElement("input");
        f.type="file";
        f.accept="image/*";
        f.multiple=true;

        f.onchange=e=>{

            const files=
              Array.from(e.target.files).slice(0,10);

            if(!state[titulo]) state[titulo]=[];

            files.forEach(file=>{
                const r=new FileReader();
                r.onload=ev=>{
                    state[titulo].push(ev.target.result);
                    renderImages(s,titulo);
                };
                r.readAsDataURL(file);
            });
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
// ENVIO RELATÓRIO
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
