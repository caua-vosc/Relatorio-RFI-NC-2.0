async function uploadFileToWorker(siteId, section, file, metaObj, onProgress){
  return new Promise((resolve, reject)=>{
    const xhr = new XMLHttpRequest();
    xhr.open("POST", "https://rfi-20.caua-viniciusosc12.workers.dev/", true);

    xhr.upload.onprogress = (evt)=>{
      if(evt.lengthComputable && typeof onProgress === "function"){
        const p = Math.round((evt.loaded / evt.total) * 100);
        onProgress(p);
      }
    };

    xhr.onload = ()=>{
      const txt = xhr.responseText || "";
      if(xhr.status >= 200 && xhr.status < 300){
        try { resolve(JSON.parse(txt)); }
        catch { resolve({ success:true }); }
      } else {
        reject(new Error(txt || ("HTTP " + xhr.status)));
      }
    };

    xhr.onerror = ()=> reject(new Error("Falha de rede no upload"));

    const fd = new FormData();
    fd.append("siteId", siteId);
    fd.append("section", section);
    fd.append("file", file, file.name);
    fd.append("meta", JSON.stringify(metaObj || {}));

    xhr.send(fd);
  });
}
