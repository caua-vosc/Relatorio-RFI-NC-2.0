async function uploadParaNextcloud(siteId, state){
    const res = await fetch("https://SEU-PROJETO.vercel.app/api/upload",{
        method:"POST",
        headers:{ "Content-Type":"application/json" },
        body: JSON.stringify({ siteId, state })
    });

    if(!res.ok){
        throw new Error("Erro no upload");
    }
}
