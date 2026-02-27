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
   INTEGRAÇÃO INPUT FILE
========================= */
function ativarUpload(input, container, section) {

  input.onchange = async e => {

    const files = Array.from(e.target.files);
    const siteId = document.getElementById("siteId").value;

    if (!siteId) {
      alert("Informe o ID do site antes de enviar fotos");
      return;
    }

    for (let file of files) {

      const progressBar = criarBarra(container);

      const compressed = await compressImage(file);

      uploadQueue.push({
        file: compressed,
        siteId,
        section,
        progressBar
      });
    }

    processQueue();
  };
}

    }
}

carregarConfiguracao();
