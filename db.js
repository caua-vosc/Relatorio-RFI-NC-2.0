const DB_NAME = "checklistDB";
const STORE = "estado";

function abrirDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);

    req.onupgradeneeded = e => {
      e.target.result.createObjectStore(STORE);
    };

    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function salvarEstado(state) {
  const db = await abrirDB();
  const tx = db.transaction(STORE, "readwrite");
  tx.objectStore(STORE).put(state, "estado");
}

async function carregarEstado() {
  const db = await abrirDB();
  const tx = db.transaction(STORE, "readonly");
  return new Promise(resolve => {
    const req = tx.objectStore(STORE).get("estado");
    req.onsuccess = () => resolve(req.result || {});
  });
}
