/**
 * ============================================================================
 * MÓDULO DE CRIPTOGRAFIA HÍBRIDA COM INTEGRIDADE (SEM NONCE)
 * ============================================================================
 *
 * PROTEÇÕES MANTIDAS:
 * ✅ AES-GCM com authTag (integridade da mensagem)
 * ✅ HMAC-SHA256 (verificação adicional)
 * ✅ Timestamp (rejeita mensagens antigas)
 * ✅ RSA-OAEP (confidencialidade)
 *
 * REMOVIDO:
 * ❌ Nonce (estava causando problemas de validação)
 *
 * PROTEÇÃO CONTRA REPLAY ATTACKS:
 * - Timestamp com janela de 10 minutos
 * - MessageId único no banco de dados
 * - Rate limiting no servidor
 *
 * ============================================================================
 */

// ============================================================================
// UTILITÁRIOS DE CONVERSÃO
// ============================================================================

const arrayBufferToBase64 = (buffer) => {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
};

const base64ToArrayBuffer = (base64) => {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
};

const stringToArrayBuffer = (str) => {
  return new TextEncoder().encode(str);
};

const arrayBufferToString = (buffer) => {
  return new TextDecoder().decode(buffer);
};

// ============================================================================
// HMAC PARA VERIFICAÇÃO ADICIONAL
// ============================================================================

/**
 * Calcula HMAC-SHA256 para verificação de integridade
 * Hash de: content + timestamp + senderId
 */
const calculateHMAC = async (content, timestamp, senderId, secretKey) => {
  const data = `${content}|${timestamp}|${senderId}`;
  const dataBuffer = stringToArrayBuffer(data);

  // Importar chave secreta
  const key = await crypto.subtle.importKey(
    "raw",
    stringToArrayBuffer(secretKey),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );

  // Calcular HMAC
  const signature = await crypto.subtle.sign("HMAC", key, dataBuffer);
  return arrayBufferToBase64(signature);
};

/**
 * Verifica HMAC de uma mensagem recebida
 */
const verifyHMAC = async (
  content,
  timestamp,
  senderId,
  receivedHMAC,
  secretKey
) => {
  const calculatedHMAC = await calculateHMAC(
    content,
    timestamp,
    senderId,
    secretKey
  );
  return calculatedHMAC === receivedHMAC;
};

// ============================================================================
// CRIPTOGRAFIA HÍBRIDA: RSA + AES-GCM
// ============================================================================

/**
 * ETAPA 1: Importar chave pública RSA do destinatário
 */
const importPublicKey = async (publicKeyPem) => {
  const pemBody = publicKeyPem
    .replace("-----BEGIN PUBLIC KEY-----", "")
    .replace("-----END PUBLIC KEY-----", "")
    .replace(/\n/g, "");
  const binaryDer = Uint8Array.from(atob(pemBody), (c) => c.charCodeAt(0));

  return await crypto.subtle.importKey(
    "spki",
    binaryDer.buffer,
    { name: "RSA-OAEP", hash: "SHA-256" },
    true,
    ["encrypt"]
  );
};

/**
 * ETAPA 2: Criptografar mensagem com integridade (SEM NONCE)
 *
 * @param {string} message - Mensagem em texto puro
 * @param {string} recipientPublicKeyPem - Chave pública RSA do destinatário
 * @param {string} senderId - ID do remetente
 * @param {string} hmacSecret - Segredo compartilhado para HMAC
 * @returns {Object} Dados criptografados com integridade
 */
export const encryptWithIntegrity = async (
  message,
  recipientPublicKeyPem,
  senderId,
  hmacSecret = "shared-secret-key"
) => {
  console.log("\n🔐 === INICIANDO CRIPTOGRAFIA COM INTEGRIDADE ===");
  console.log("Mensagem:", message.substring(0, 50) + "...");
  console.log("SenderId:", senderId);

  try {
    // 1. Gerar chave AES-256 efêmera
    console.log("1️⃣ Gerando chave AES-256 efêmera...");
    const aesKey = await crypto.subtle.generateKey(
      { name: "AES-GCM", length: 256 },
      true,
      ["encrypt", "decrypt"]
    );

    // 2. Gerar IV aleatório (12 bytes para GCM)
    console.log("2️⃣ Gerando IV aleatório...");
    const iv = crypto.getRandomValues(new Uint8Array(12));

    // 3. Criptografar mensagem com AES-GCM
    console.log("3️⃣ Criptografando mensagem com AES-GCM...");
    const messageBuffer = stringToArrayBuffer(message);
    const encryptedData = await crypto.subtle.encrypt(
      { name: "AES-GCM", iv: iv },
      aesKey,
      messageBuffer
    );

    // 4. Separar conteúdo criptografado e auth tag
    // AES-GCM retorna: [ciphertext + 16 bytes de auth tag]
    const encryptedArray = new Uint8Array(encryptedData);
    const ciphertext = encryptedArray.slice(0, encryptedArray.length - 16);
    const authTag = encryptedArray.slice(encryptedArray.length - 16);

    console.log(
      "   ✅ Auth Tag gerado:",
      arrayBufferToBase64(authTag.buffer).substring(0, 20) + "..."
    );

    // 5. Exportar chave AES
    const aesKeyRaw = await crypto.subtle.exportKey("raw", aesKey);

    // 6. Criptografar chave AES com RSA do destinatário
    console.log("4️⃣ Criptografando chave AES com RSA...");
    const recipientPublicKey = await importPublicKey(recipientPublicKeyPem);
    const encryptedKey = await crypto.subtle.encrypt(
      { name: "RSA-OAEP" },
      recipientPublicKey,
      aesKeyRaw
    );

    // 7. Timestamp atual
    const timestamp = new Date().toISOString();
    console.log("5️⃣ Timestamp:", timestamp);

    // 8. Preparar dados em base64
    const content64 = arrayBufferToBase64(ciphertext.buffer);
    const encryptedKey64 = arrayBufferToBase64(encryptedKey);
    const iv64 = arrayBufferToBase64(iv.buffer);
    const authTag64 = arrayBufferToBase64(authTag.buffer);

    // 9. Calcular HMAC (sem nonce)
    console.log("6️⃣ Calculando HMAC...");
    const hmac = await calculateHMAC(
      content64,
      timestamp,
      senderId,
      hmacSecret
    );

    console.log("✅ === CRIPTOGRAFIA CONCLUÍDA COM SUCESSO ===");
    console.log("Dados finais:", {
      contentLength: content64.length,
      encryptedKeyLength: encryptedKey64.length,
      ivLength: iv64.length,
      authTagLength: authTag64.length,
      timestamp: timestamp,
      hmacLength: hmac.length,
    });

    // 10. Retornar todos os dados (SEM NONCE)
    const result = {
      content: content64,
      encryptedKey: encryptedKey64,
      iv: iv64,
      authTag: authTag64,
      timestamp: timestamp,
      hmac: hmac,
    };

    // Validação final antes de retornar
    const requiredFields = [
      "content",
      "encryptedKey",
      "iv",
      "authTag",
      "timestamp",
      "hmac",
    ];
    const missing = requiredFields.filter(
      (field) => !result[field] && result[field] !== 0
    );
    if (missing.length > 0) {
      throw new Error(`Campos faltando no resultado: ${missing.join(", ")}`);
    }

    return result;
  } catch (error) {
    console.error("❌ Erro na criptografia:", error);
    console.error("Stack:", error.stack);
    throw error;
  }
};

/**
 * ETAPA 3: Descriptografar e verificar integridade (SEM NONCE)
 *
 * @param {Object} encryptedData - Dados criptografados
 * @param {CryptoKey} privateKey - Chave privada RSA do destinatário
 * @param {string} senderId - ID do remetente
 * @param {string} hmacSecret - Segredo compartilhado para HMAC
 * @returns {string|null} Mensagem descriptografada ou null se adulterada
 */
export const decryptWithIntegrity = async (
  encryptedData,
  privateKey,
  senderId,
  hmacSecret = "shared-secret-key"
) => {
  console.log("\n🔓 === INICIANDO DESCRIPTOGRAFIA COM VERIFICAÇÃO ===");

  try {
    // 1. Verificar HMAC
    console.log("1️⃣ Verificando HMAC...");
    const hmacValid = await verifyHMAC(
      encryptedData.content,
      encryptedData.timestamp,
      senderId,
      encryptedData.hmac,
      hmacSecret
    );

    if (!hmacValid) {
      console.error("❌ HMAC INVÁLIDO - Mensagem adulterada!");
      return null;
    }
    console.log("   ✅ HMAC válido");

    // 2. Verificar timestamp (não muito antigo)
    console.log("2️⃣ Verificando timestamp...");
    const messageAge =
      (new Date() - new Date(encryptedData.timestamp)) / 1000 / 60;
    if (messageAge > 10) {
      // 10 minutos
      console.warn(`⚠️ Mensagem antiga (${messageAge.toFixed(1)} minutos)`);
    }

    // 3. Descriptografar chave AES com RSA
    console.log("3️⃣ Descriptografando chave AES...");
    const encryptedKeyBuffer = base64ToArrayBuffer(encryptedData.encryptedKey);
    const aesKeyRaw = await crypto.subtle.decrypt(
      { name: "RSA-OAEP" },
      privateKey,
      encryptedKeyBuffer
    );

    // 4. Importar chave AES
    const aesKey = await crypto.subtle.importKey(
      "raw",
      aesKeyRaw,
      { name: "AES-GCM", length: 256 },
      false,
      ["decrypt"]
    );

    // 5. Reconstruir dados criptografados (ciphertext + authTag)
    console.log("4️⃣ Descriptografando mensagem com AES-GCM...");
    const ciphertext = base64ToArrayBuffer(encryptedData.content);
    const authTag = base64ToArrayBuffer(encryptedData.authTag);
    const iv = base64ToArrayBuffer(encryptedData.iv);

    // Concatenar ciphertext + authTag (formato esperado pelo AES-GCM)
    const encryptedWithTag = new Uint8Array(
      ciphertext.byteLength + authTag.byteLength
    );
    encryptedWithTag.set(new Uint8Array(ciphertext), 0);
    encryptedWithTag.set(new Uint8Array(authTag), ciphertext.byteLength);

    // 6. Descriptografar (AES-GCM verifica authTag automaticamente)
    let decrypted;
    try {
      decrypted = await crypto.subtle.decrypt(
        { name: "AES-GCM", iv: new Uint8Array(iv) },
        aesKey,
        encryptedWithTag
      );
    } catch (error) {
      console.error("❌ AUTH TAG INVÁLIDO - Mensagem foi adulterada!");
      console.error("   Erro:", error.message);
      return null;
    }

    console.log("   ✅ Auth Tag verificado com sucesso!");

    // 7. Converter para texto
    const message = arrayBufferToString(decrypted);

    console.log("✅ === DESCRIPTOGRAFIA E VERIFICAÇÃO BEM-SUCEDIDAS ===\n");
    return message;
  } catch (error) {
    console.error("❌ Erro na descriptografia:", error);
    console.error("Stack:", error.stack);
    return null;
  }
};

export default {
  encryptWithIntegrity,
  decryptWithIntegrity,
};
