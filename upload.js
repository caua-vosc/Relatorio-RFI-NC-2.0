async function uploadParaNextcloud(siteId, state) {

  const NC_URL =
    "https://gio.it.tab.digital/remote.php/dav";

  const USER = "caua";
  const PASS = "mTykL-rTXiG-84J6d-s7toE-QiAXz";

  const auth =
    "Basic " + btoa(`${USER}:${PASS}`);

  for (const secao of Object.keys(state)) {

    const pasta =
      `${NC_URL}/files/${USER}/Checklist/${siteId}/${secao}`;

    // ===== CRIAR PASTA =====
    try {
      await fetch(pasta, {
        method: "MKCOL",
        headers: {
          Authorization: auth
        }
      });
    } catch(e){}

    // ===== ENVIAR IMAGENS =====
    for (let i = 0; i < state[secao].length; i++) {

      const base64 =
        state[secao][i].split(",")[1];

      const bin = Uint8Array.from(
        atob(base64),
        c => c.charCodeAt(0)
      );

      const destino =
        `${pasta}/foto${i + 1}.jpg`;

      const res = await fetch(destino, {
        method: "PUT",
        headers: {
          Authorization: auth,
          "Content-Type": "image/jpeg"
        },
        body: bin
      });

      if (!res.ok) {
        throw new Error(
          `Erro Nextcloud: ${res.status}`
        );
      }
    }
  }

  return true;
}
