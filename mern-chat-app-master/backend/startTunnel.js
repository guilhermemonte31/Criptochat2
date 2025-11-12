// backend/startTunnel.js
const localtunnel = require("localtunnel");

(async () => {
  const port = 5001; // Porta HTTP auxiliar usada no server.js

  console.log("🌐 Iniciando LocalTunnel...");

  try {
    const tunnel = await localtunnel({
      port,
      subdomain: "cryptochat", // opcional
    });

    console.log(`✅ Tunnel ativo: ${tunnel.url}`);
    console.log("🌍 Acesse seu app completo pelo link acima");

    tunnel.on("close", () => {
      console.log("❌ Tunnel encerrado");
    });
  } catch (err) {
    console.error("❌ Erro ao iniciar LocalTunnel:", err);
  }
})();