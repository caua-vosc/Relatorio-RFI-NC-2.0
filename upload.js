async function uploadParaNextcloud(siteId, state) {
  const response = await fetch(
    "https://relatorio-rfi-nc-2-0-api-o3jt-8s7q7vfrk-caua-voscs-projects.vercel.app/api/upload",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ siteId, state })
    }
  );

  if (!response.ok) {
    const txt = await response.text();
    throw new Error(txt || "Falha no upload");
  }

  return response.json();
}
