async function uploadParaNextcloud(siteId, state) {

  const ENDPOINT =
    "https://SEU-WORKER.cloudflare.dev";

  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ siteId, state })
  });

  if (!res.ok)
    throw new Error(await res.text());

  return res.json();
}
