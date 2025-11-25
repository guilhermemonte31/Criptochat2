// AVISO: Esta função é apenas para mensagens CURTAS devido ao RSA-OAEP.

const AlterarMensagemRSA = (mensagem) => {
  console.log(" TESTEINTEGRITY Alterando mensagem RSA...");
  console.log(" TESTEINTEGRITY Mensagem antes da alteração: ", mensagem);
  const mensagemAlterada = mensagem.replace('@', 'A').replace('8', 'B').replace('(', 'C');
  console.log(" TESTEINTEGRITY Mensagem após a alteração: ", mensagemAlterada);
  return mensagemAlterada;
}


export const encryptWithIntegrity = async (
  message,
  destinatarioPublicKeyPem,
  senderId,
  secretKey = "shared-secret-key"
) => {
  console.log("\n🔐 === INICIANDO CRIPTOGRAFIA COM INTEGRIDADE (Browser) ===");

  try {
    
    const pemBody = destinatarioPublicKeyPem
      .replace("-----BEGIN PUBLIC KEY-----", "")
      .replace("-----END PUBLIC KEY-----", "")
      .replace(/\n/g, "");
    const binaryDer = Uint8Array.from(atob(pemBody), (c) => c.charCodeAt(0));

    const destpublicKey = await window.crypto.subtle.importKey(
      "spki",
      binaryDer.buffer,
      { name: "RSA-OAEP", hash: "SHA-256" },
      true,
      ["encrypt"]
    );

    
    const encoded = new TextEncoder().encode(message);
    const encryptedMessage = await window.crypto.subtle.encrypt(
      { name: "RSA-OAEP" },
      destpublicKey,
      encoded
    );
    
    const encryptedB64 = btoa(String.fromCharCode(...new Uint8Array(encryptedMessage)));

    // let encryptedB64 = btoa(String.fromCharCode(...new Uint8Array(encryptedMessage)));
    // encryptedB64 = AlterarMensagemRSA(encryptedB64);
    console.log("TESTEINTEGRITY Mensagem criptografada com sucesso.");

    
    const timestamp = new Date().toISOString();
    
    
    const dataToSign = encryptedB64 + "|" + timestamp + "|" + senderId;
    
    
    const hmacKey = await window.crypto.subtle.importKey(
        "raw",
        new TextEncoder().encode(secretKey),
        { name: "HMAC", hash: { name: "SHA-256" } },
        false,
        ["sign"] 
    );
    console.log(" TESTEINTEGRITY Chave HMAC importada. ", hmacKey);

    
    const signature = await window.crypto.subtle.sign(
        "HMAC",
        hmacKey,
        new TextEncoder().encode(dataToSign)
    );
    console.log("TESTEINTEGRITY HMAC gerado com sucesso. signature: ", signature);
    
    const hmac = Array.from(new Uint8Array(signature))
        .map(b => b.toString(16).padStart(2, '0'))
        .join('');

    console.log("✅  TESTEINTEGRITY HMAC calculado: ", hmac);

    const final_message = encryptedB64 + hmac + timestamp;
    console.log(" TESTEINTEGRITY Mensagem final (criptografada + HMAC + timestamp): ", final_message);
    console.log("TESTEINTEGRITY  === CRIPTOGRAFIA CONCLUÍDA COM SUCESSO ===");
    
    return final_message;
  } catch (error) {
    console.error("❌ Erro na criptografia (Browser):", error);
    throw error;
  }
};

export const decryptWithIntegrity = async (
    final_message,
    destinatarioPrivateKey, 
    senderId,
    secretKey = "shared-secret-key"
) => {
    console.log("\n🔑 TESTEINTEGRITY === INICIANDO DESCRIPTOGRAFIA E VERIFICAÇÃO (Browser) ===");

    console.log(" TESTEINTEGRITY mensagem recebida: ", final_message);
    try {
        const HMAC_LENGTH = 64; 
        const TIMESTAMP_LENGTH_ESTIMATED = 24; 

        if (final_message.length < HMAC_LENGTH + TIMESTAMP_LENGTH_ESTIMATED) {
             throw new Error("Mensagem incompleta ou formato inválido.");
        }

        const timestamp = final_message.slice(-TIMESTAMP_LENGTH_ESTIMATED);
        const remaining = final_message.slice(0, -TIMESTAMP_LENGTH_ESTIMATED);
        
        const receivedHmac = remaining.slice(-HMAC_LENGTH); //para o teste de hmac valido, basta alterar aqui para qualquer valor que o retorno vai ser a msg de erro
        const encryptedB64 = remaining.slice(0, -HMAC_LENGTH);
        console.log(" TESTEINTEGRITY Mensagem dividida em partes:");
        console.log("TESTEINTEGRITY - EncryptedB64: ", encryptedB64);
        console.log(" TESTEINTEGRITY - Received HMAC: ", receivedHmac);
        console.log(" TESTEINTEGRITY - Timestamp: ", timestamp);
        
        const hmacBuffer = new Uint8Array(
            receivedHmac.match(/[\da-f]{2}/gi).map(h => parseInt(h, 16))
        );
        console.log(" TESTEINTEGRITY HMAC convertido para buffer: ", hmacBuffer);

        const dataToVerify = encryptedB64 + "|" + timestamp + "|" + senderId;

        const hmacKey = await window.crypto.subtle.importKey(
            "raw",
            new TextEncoder().encode(secretKey),
            { name: "HMAC", hash: { name: "SHA-256" } },
            false,
            ["verify"]
        );
        console.log(" TESTEINTEGRITY Chave HMAC para verificação importada: ", hmacKey);

        const isHmacValid = await window.crypto.subtle.verify(
            "HMAC",
            hmacKey,
            hmacBuffer,
            new TextEncoder().encode(dataToVerify)
        );
        console.log(" TESTEINTEGRITYy Verificação HMAC concluída. isHmacValid: ", isHmacValid);

        if (!isHmacValid) {
            console.error("❌ ERRO DE AUTENTICIDADE: HMAC inválido!");
            return "[Falha na descriptografia: HMAC inválido]";
            throw new Error("Verificação HMAC falhou! A mensagem foi adulterada.");
        }

        console.log("TESTEINTEGRITY Verificação HMAC bem-sucedida. Mensagem autêntica.");

        const destPrivateKey = destinatarioPrivateKey;

        const encryptedMessageBuffer = new Uint8Array(
            atob(encryptedB64).split("").map(c => c.charCodeAt(0))
        ).buffer;

        const decryptedMessageBuffer = await window.crypto.subtle.decrypt(
            { name: "RSA-OAEP" },
            destPrivateKey, 
            encryptedMessageBuffer
        );

        const decryptedMessage = new TextDecoder().decode(decryptedMessageBuffer);
        console.log("TESTEINTEGRITY Mensagem Descriptografada com sucesso: ", decryptedMessage);
        
        return decryptedMessage;

    } catch (error) {
        console.error("❌ Erro na descriptografia/verificação (Browser):", error);
        throw error;
    }
};

export default {
  encryptWithIntegrity,
  decryptWithIntegrity,
};
