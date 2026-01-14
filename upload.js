async function uploadParaNextcloud(siteId, state){
    const response = await fetch(
        "https://relatorio-rfi-nc-2-0-9d9hdmc47-caua-voscs-projects.vercel.app/api/upload",
        {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ siteId, state })
        }
    );

    if (!response.ok) {
        throw new Error("Falha no upload");
    }
}
