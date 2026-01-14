const API_URL = "https://relatorio-rfi-nc-2-0-api-o3jt.vercel.app/api/upload";

async function uploadParaNextcloud(siteId, state) {
  const response = await fetch(API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ siteId, state })
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(text);
  }
}
