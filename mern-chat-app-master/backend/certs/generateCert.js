// backend/certs/generateCert.js
import { execSync } from "child_process";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const keyPath = path.join(__dirname, "key.pem");
const certPath = path.join(__dirname, "cert.pem");

try {
  console.log("🔧 Gerando certificado autoassinado...");

  try {
    // Verifica se o OpenSSL está disponível
    execSync("openssl version", { stdio: "ignore" });

    execSync(
      `openssl req -x509 -newkey rsa:4096 -keyout "${keyPath}" -out "${certPath}" -days 365 -nodes -subj "/CN=localhost"`,
      { stdio: "inherit" }
    );
  } catch {
    console.log("⚙️ OpenSSL não encontrado — usando método Node.js (selfsigned)");
    const selfsigned = await import("selfsigned");
    const attrs = [{ name: "commonName", value: "localhost" }];
    const pems = selfsigned.default.generate(attrs, { days: 365 });

    fs.writeFileSync(keyPath, pems.private);
    fs.writeFileSync(certPath, pems.cert);
  }

  console.log(`✅ Certificados criados em: ${__dirname}`);
} catch (err) {
  console.error("❌ Erro ao gerar certificado:", err.message);
}
