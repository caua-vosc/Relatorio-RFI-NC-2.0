let db;
const request = indexedDB.open("ChecklistDB",1);
request.onupgradeneeded = e => {
    db = e.target.result;
    if(!db.objectStoreNames.contains("relatorios"))
        db.createObjectStore("relatorios",{keyPath:"siteId"});
};
request.onsuccess = e => { db = e.target.result; enviarOffline(); };
request.onerror = e => console.error("IndexedDB erro",e);

function salvarOffline(siteId,state){
    const tx = db.transaction("relatorios","readwrite");
    const store = tx.objectStore("relatorios");
    store.put({siteId,data:state});
}

function enviarOffline(){
    const tx = db.transaction("relatorios","readonly");
    const store = tx.objectStore("relatorios");
    store.openCursor().onsuccess = async e=>{
        const cursor = e.target.result;
        if(cursor){
            try{
                await uploadParaOneDrive(cursor.value.siteId,cursor.value.data);
                // remover se enviado com sucesso
                const delTx = db.transaction("relatorios","readwrite");
                delTx.objectStore("relatorios").delete(cursor.key);
            }catch{}
            cursor.continue();
        }
    };
}
