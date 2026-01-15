async function uploadParaNextcloud(siteId, state) {

  if (!siteId || !state) {
    throw new Error("Dados inválidos antes do envio");
  }

  const ENDPOINT =
    "https://rfi-20.caua-viniciusosc12.workers.dev/";

  const payload = {
    siteId: siteId,
    state: state
  };

  console.log("ENVIANDO:", payload);

  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });

  const txt = await res.text();
  console.log("RESPOSTA WORKER:", txt);

  if (!res.ok) {
    throw new Error(txt);
  }

  return JSON.parse(txt);
}
