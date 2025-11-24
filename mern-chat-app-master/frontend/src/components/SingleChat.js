// SingleChat.js — VERSÃO CORRIGIDA COM LOGGING DETALHADO

import { FormControl, FormLabel } from "@chakra-ui/form-control";
import { Input } from "@chakra-ui/input";
import "./styles.css";
import { Spinner, useToast, Button } from "@chakra-ui/react";
import { getSender, getSenderFull } from "../config/ChatLogics";
import { useEffect, useState } from "react";
import axios from "axios";
import { ArrowBackIcon } from "@chakra-ui/icons";
import ProfileModal from "./miscellaneous/ProfileModal";
import ScrollableChat from "./ScrollableChat";
import io from "socket.io-client";
import UpdateGroupChatModal from "./miscellaneous/UpdateGroupChatModal";
import { ChatState } from "../Context/ChatProvider";
import "./SingleChat.css";

import {
  encryptWithIntegrity,
  decryptWithIntegrity,
} from "../utils/cryptoIntegrity";

import {
  Modal,
  ModalOverlay,
  ModalContent,
  ModalHeader,
  ModalFooter,
  ModalBody,
  ModalCloseButton,
  useDisclosure,
} from "@chakra-ui/react";

const ENDPOINT = process.env.REACT_APP_API_URL || "http://localhost:5000";
let socket, selectedChatCompare;

// UTILITÁRIOS
const arrayBufferFromBase64 = (b64) => {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
};

const arrayBufferToBase64 = (buffer) => {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
};

// FUNÇÕES DE GERENCIAMENTO DE CHAVES
const deriveAesKey = async (password, salt) => {
  const enc = new TextEncoder();
  const keyMaterial = await window.crypto.subtle.importKey(
    "raw",
    enc.encode(password),
    { name: "PBKDF2" },
    false,
    ["deriveKey"]
  );

  return await window.crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt,
      iterations: 100000,
      hash: "SHA-256",
    },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
};

const encryptPrivateKey = async (privateKeyArrayBuffer, password) => {
  const salt = window.crypto.getRandomValues(new Uint8Array(16));
  const iv = window.crypto.getRandomValues(new Uint8Array(12));

  const aesKey = await deriveAesKey(password, salt);
  const encrypted = await window.crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    aesKey,
    privateKeyArrayBuffer
  );

  return {
    cipher: arrayBufferToBase64(encrypted),
    iv: arrayBufferToBase64(iv.buffer),
    salt: arrayBufferToBase64(salt.buffer),
  };
};

async function decryptPrivateKey(encryptedData, password) {
  console.log("decryptPrivateKey called");
  const salt = Uint8Array.from(atob(encryptedData.salt), (c) =>
    c.charCodeAt(0)
  );
  const iv = Uint8Array.from(atob(encryptedData.iv), (c) => c.charCodeAt(0));
  const cipherBytes = Uint8Array.from(atob(encryptedData.cipher), (c) =>
    c.charCodeAt(0)
  );

  const aesKey = await deriveAesKey(password, salt);
  let decrypted;
  try {
    decrypted = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv },
      aesKey,
      cipherBytes
    );
  } catch (e) {
    console.error("Decryption failed:", e);
    throw e;
  }

  return await crypto.subtle.importKey(
    "pkcs8",
    decrypted,
    { name: "RSA-OAEP", hash: "SHA-256" },
    true,
    ["decrypt"]
  );
}

const decryptStoredPrivateKey = async () => {
  try {
    const privateKeyJwkStr = sessionStorage.getItem("privateKeyJwk");
    if (!privateKeyJwkStr) {
      console.warn("Nenhuma chave privada encontrada na sessão.");
      return;
    }
    const privateKeyJwk = JSON.parse(privateKeyJwkStr);
    const privateKey = await window.crypto.subtle.importKey(
      "jwk",
      privateKeyJwk,
      { name: "RSA-OAEP", hash: "SHA-256" },
      true,
      ["decrypt"]
    );
    console.log("✅ Chave privada importada com sucesso da sessão.");
    return privateKey;
  } catch (err) {
    console.error("❌ Erro ao importar chave privada:", err);
    return null;
  }
};

const encryptMessageForUser = async (message, publicKeyPem) => {
  const pemBody = publicKeyPem
    .replace("-----BEGIN PUBLIC KEY-----", "")
    .replace("-----END PUBLIC KEY-----", "")
    .replace(/\n/g, "");
  const binaryDer = Uint8Array.from(atob(pemBody), (c) => c.charCodeAt(0));

  const publicKey = await window.crypto.subtle.importKey(
    "spki",
    binaryDer.buffer,
    { name: "RSA-OAEP", hash: "SHA-256" },
    true,
    ["encrypt"]
  );

  const encoded = new TextEncoder().encode(message);
  const encrypted = await window.crypto.subtle.encrypt(
    { name: "RSA-OAEP" },
    publicKey,
    encoded
  );
  const encryptedB64 = btoa(String.fromCharCode(...new Uint8Array(encrypted)));
  return encryptedB64;
};

const decryptMessage = async (encryptedB64, privateKey) => {
  try {
    const encryptedBytes = new Uint8Array(arrayBufferFromBase64(encryptedB64));
    const decrypted = await window.crypto.subtle.decrypt(
      { name: "RSA-OAEP" },
      privateKey,
      encryptedBytes
    );
    const decoded = new TextDecoder().decode(decrypted);
    return decoded;
  } catch (err) {
    console.error("❌ Falha na descriptografia:", err);
    return null;
  }
};

const SingleChat = ({ fetchAgain, setFetchAgain }) => {
  const [show, setShow] = useState(false);
  const handleClick = () => setShow(!show);
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(false);
  const [newMessage, setNewMessage] = useState("");
  const [socketConnected, setSocketConnected] = useState(false);
  const [typing, setTyping] = useState(false);
  const [istyping, setIsTyping] = useState(false);
  const [privateKey, setPrivateKey] = useState(null);
  const [isRotatingKeys, setIsRotatingKeys] = useState(false);
  const [passwordVerification, setPasswordVerification] = useState("");
  const [isVerifyingPass, setIsVerifyingPass] = useState(false);
  const { isOpen, onOpen, onClose } = useDisclosure();

  const toast = useToast();
  const { selectedChat, setSelectedChat, user } = ChatState();

  useEffect(() => {
    (async () => {
      const key = await decryptStoredPrivateKey();
      if (key) setPrivateKey(key);
    })();

    socket = io(ENDPOINT, { transports: ["websocket"] });
    socket.emit("setup", user);
    socket.on("connected", () => setSocketConnected(true));
    socket.on("typing", () => setIsTyping(true));
    socket.on("stop typing", () => setIsTyping(false));

    return () => {
      socket.off("connected");
      socket.off("typing");
      socket.off("stop typing");
    };
  }, []);

  const fetchMessages = async (isRefresh = false) => {
    if (!selectedChat || !privateKey) return;
    console.log(
      isRefresh
        ? "\n🔄 Atualizando mensagens..."
        : "\n=== BUSCANDO MENSAGENS ==="
    );

    try {
      const config = {
        headers: { Authorization: `Bearer ${user.token}` },
      };

      const { data } = await axios.get(
        `${ENDPOINT}/api/message/${selectedChat._id}`,
        config
      );

      const decryptedMessages = [];
      let verifiedCount = 0;
      for (const msg of data) {
        if (!msg.destinatario || (!msg.sender && !msg.chat)) continue;
        if (msg.destinatario?._id !== user._id && msg.sender?._id !== user._id)
          continue;
        if (msg.sender?._id === user._id && msg.destinatario?._id !== user._id)
          continue;
        if (!privateKey) continue;

        const clear = await decryptWithIntegrity(
          {
            content: msg.content,
            encryptedKey: msg.encryptedKey,
            iv: msg.iv,
            authTag: msg.authTag,
            timestamp: msg.timestamp,
            hmac: msg.hmac,
          },
          privateKey,
          msg.sender._id,
          "shared-secret-key"
        );

        if (clear === null) {
          decryptedMessages.push({
            ...msg,
            decrypted: "[⚠️ MENSAGEM ADULTERADA - NÃO CONFIÁVEL]",
            tampered: true,
            integrityVerified: false,
          });

          toast({
            title: "⚠️ Mensagem Suspeita Detectada!",
            description: `Mensagem de ${msg.sender.name} falhou na verificação de integridade`,
            status: "warning",
            duration: 5000,
            isClosable: true,
          });
        } else {
          verifiedCount++;
          decryptedMessages.push({
            ...msg,
            decrypted: clear,
            tampered: false,
            integrityVerified: true,
          });
        }
      }

      const uniqueMessages = decryptedMessages.filter(
        (msg, index, self) => index === self.findIndex((m) => m._id === msg._id)
      );

      setMessages(uniqueMessages);
      if (!isRefresh) socket.emit("join chat", selectedChat._id);
      console.log(`✅ Mensagens processadas. Verificadas: ${verifiedCount}`);
    } catch (error) {
      console.error("❌ Erro ao buscar mensagens:", error);
      toast({
        title: "Erro!",
        description: "Falha ao carregar mensagens.",
        status: "error",
        duration: 5000,
        isClosable: true,
        position: "bottom",
      });
    }
  };

  useEffect(() => {
    if (selectedChat && privateKey) {
      fetchMessages(false);
      selectedChatCompare = selectedChat;
    }
  }, [selectedChat, privateKey]);

  useEffect(() => {
    if (!socket) return;
    socket.on("refresh messages", () => fetchMessages(true));
    return () => socket.off("refresh messages");
  }, [socket, privateKey, selectedChat]);

  // ============================================================================
  // FUNÇÃO DE ENVIO CORRIGIDA COM LOGGING DETALHADO
  // ============================================================================
  const sendMessage = async (event) => {
    if (
      (event.key === "Enter" || event.type === "click") &&
      newMessage.trim()
    ) {
      console.log("\n=== ENVIANDO MENSAGEM COM INTEGRIDADE ===");
      console.log("📝 Mensagem:", newMessage);
      console.log("👤 User ID:", user._id);
      socket.emit("stop typing", selectedChat._id);

      try {
        const config = {
          headers: {
            "Content-type": "application/json",
            Authorization: `Bearer ${user.token}`,
          },
        };

        // Buscar info do chat
        console.log("📡 Buscando informações do chat...");
        const { data: chatInfo } = await axios.get(
          `${ENDPOINT}/api/chat/${selectedChat._id}`,
          config
        );

        console.log(
          "👥 Usuários no chat:",
          chatInfo.users.map((u) => `${u.name} (${u.email})`).join(", ")
        );

        const encryptedMessages = [];

        for (const member of chatInfo.users) {
          console.log(`\n🔐 Processando ${member.name} (${member.email})...`);

          if (!member.publicKey) {
            console.warn(
              `⚠️ Usuário ${member.email} não tem chave pública. Pulando.`
            );
            toast({
              title: "Usuário sem chave pública",
              description: `Não foi possível cifrar mensagem para ${member.email}.`,
              status: "warning",
              duration: 4000,
              isClosable: true,
            });
            continue;
          }

          try {
            console.log(`   Criptografando mensagem...`);

            const encrypted = await encryptWithIntegrity(
              newMessage,
              member.publicKey,
              user._id, // senderId (SEM nonce agora!)
              "shared-secret-key"
            );

            console.log(`   ✅ Criptografia concluída para ${member.email}`);
            console.log(`   Dados gerados (SEM NONCE):`, {
              contentLength: encrypted.content?.length || 0,
              encryptedKeyLength: encrypted.encryptedKey?.length || 0,
              ivLength: encrypted.iv?.length || 0,
              authTagLength: encrypted.authTag?.length || 0,
              timestamp: encrypted.timestamp,
              hmacLength: encrypted.hmac?.length || 0,
            });

            // Validação detalhada (SEM NONCE)
            const required = [
              "content",
              "encryptedKey",
              "iv",
              "authTag",
              "timestamp",
              "hmac",
            ];
            const missing = required.filter((k) => {
              const value = encrypted[k];
              return value === undefined || value === null || value === "";
            });

            if (missing.length > 0) {
              console.error(
                `❌ Campos faltando para ${member.email}:`,
                missing
              );
              console.error("Objeto encrypted completo:", encrypted);
              toast({
                title: "Erro de Criptografia",
                description: `Campos faltando para ${
                  member.email
                }: ${missing.join(", ")}`,
                status: "error",
                duration: 5000,
                isClosable: true,
                position: "bottom",
              });
              continue;
            }

            // Validar tipos (SEM NONCE)
            const typeErrors = [];
            if (typeof encrypted.content !== "string")
              typeErrors.push("content deve ser string");
            if (typeof encrypted.encryptedKey !== "string")
              typeErrors.push("encryptedKey deve ser string");
            if (typeof encrypted.iv !== "string")
              typeErrors.push("iv deve ser string");
            if (typeof encrypted.authTag !== "string")
              typeErrors.push("authTag deve ser string");
            if (typeof encrypted.hmac !== "string")
              typeErrors.push("hmac deve ser string");
            if (typeof encrypted.timestamp !== "string")
              typeErrors.push("timestamp deve ser string");

            if (typeErrors.length > 0) {
              console.error(
                `❌ Erros de tipo para ${member.email}:`,
                typeErrors
              );
              console.error("Tipos encontrados (SEM NONCE):", {
                content: typeof encrypted.content,
                encryptedKey: typeof encrypted.encryptedKey,
                iv: typeof encrypted.iv,
                authTag: typeof encrypted.authTag,
                hmac: typeof encrypted.hmac,
                timestamp: typeof encrypted.timestamp,
              });
              continue;
            }

            // Montar payload (SEM NONCE)
            const messagePayload = {
              chatId: selectedChat._id,
              destinatarioId: member._id,
              content: encrypted.content,
              encryptedKey: encrypted.encryptedKey,
              iv: encrypted.iv,
              authTag: encrypted.authTag,
              timestamp: encrypted.timestamp,
              hmac: encrypted.hmac,
            };

            console.log(`   📦 Payload preparado para ${member.email}`);
            encryptedMessages.push(messagePayload);
          } catch (err) {
            console.error(`❌ Erro ao criptografar para ${member.email}:`, err);
            console.error("Stack trace:", err.stack);
            toast({
              title: "Erro ao cifrar",
              description: `Não foi possível cifrar para ${member.email}: ${err.message}`,
              status: "error",
              duration: 4000,
              isClosable: true,
              position: "bottom",
            });
          }
        }

        if (encryptedMessages.length === 0) {
          console.error("❌ Nenhuma mensagem foi preparada para envio!");
          toast({
            title: "Nada a enviar",
            description:
              "Nenhuma versão cifrada foi gerada (verifique chaves públicas).",
            status: "warning",
            duration: 4000,
            isClosable: true,
          });
          return;
        }

        console.log(
          `\n📤 Enviando ${encryptedMessages.length} mensagens ao servidor...`
        );
        console.log(
          "⚠️ Enviando SEQUENCIALMENTE para evitar race condition no servidor..."
        );

        const results = [];

        // Enviar mensagens UMA POR VEZ (sequencialmente)
        for (let i = 0; i < encryptedMessages.length; i++) {
          const msg = encryptedMessages[i];
          console.log(
            `\n📨 Enviando mensagem ${i + 1}/${encryptedMessages.length}...`
          );
          console.log("Payload (SEM NONCE):", {
            chatId: msg.chatId,
            destinatarioId: msg.destinatarioId,
            timestamp: msg.timestamp,
            contentLength: msg.content?.length,
            encryptedKeyLength: msg.encryptedKey?.length,
            ivLength: msg.iv?.length,
            authTagLength: msg.authTag?.length,
            hmacLength: msg.hmac?.length,
          });

          try {
            const response = await axios.post(
              `${ENDPOINT}/api/message`,
              msg,
              config
            );
            console.log(`✅ Mensagem ${i + 1} enviada com sucesso!`);
            console.log("Resposta do servidor:", response.data);
            results.push({ status: "fulfilled", value: response });
          } catch (error) {
            console.error(`❌ Erro ao enviar mensagem ${i + 1}:`);
            console.error("Status:", error.response?.status);
            console.error("Status Text:", error.response?.statusText);
            console.error("Data:", error.response?.data);
            console.error("Payload enviado:", msg);
            results.push({ status: "rejected", reason: error });
          }

          // Pequeno delay entre mensagens para garantir ordem no servidor
          if (i < encryptedMessages.length - 1) {
            await new Promise((resolve) => setTimeout(resolve, 100)); // 100ms entre mensagens
          }
        }

        const rejections = results.filter((r) => r.status === "rejected");
        const successes = results.filter((r) => r.status === "fulfilled");

        console.log(`\n📊 Resultado do envio:`);
        console.log(`   ✅ Sucessos: ${successes.length}`);
        console.log(`   ❌ Falhas: ${rejections.length}`);

        if (rejections.length > 0) {
          console.error("\n❌ Detalhes das falhas:");
          rejections.forEach((rejection, index) => {
            console.error(`Falha ${index + 1}:`, {
              message: rejection.reason?.message,
              status: rejection.reason?.response?.status,
              data: rejection.reason?.response?.data,
            });
          });

          toast({
            title: "Envio parcial",
            description: `${rejections.length} de ${results.length} mensagens falharam ao enviar.`,
            status: "warning",
            duration: 6000,
            isClosable: true,
            position: "bottom",
          });
        } else {
          console.log(
            "\n✅ === TODAS AS MENSAGENS ENVIADAS COM SUCESSO! ===\n"
          );
          setNewMessage("");
          socket.emit("new message", { room: selectedChat._id });
        }
      } catch (error) {
        console.error("\n❌ === ERRO GERAL NO ENVIO ===");
        console.error("Erro:", error);
        console.error("Response:", error.response);
        console.error("Status:", error.response?.status);
        console.error("Data:", error.response?.data);
        console.error("Stack:", error.stack);

        if (error.response?.status === 400) {
          toast({
            title: "Erro de Validação (400)",
            description:
              error.response.data?.message ||
              "Mensagem rejeitada pelo servidor",
            status: "error",
            duration: 5000,
            isClosable: true,
            position: "bottom",
          });
        } else if (error.response?.status === 429) {
          toast({
            title: "Muitas Mensagens!",
            description: "Aguarde um momento antes de enviar mais mensagens",
            status: "warning",
            duration: 5000,
            isClosable: true,
            position: "bottom",
          });
        } else {
          toast({
            title: "Erro!",
            description:
              error.response?.data?.message || "Falha ao enviar mensagem.",
            status: "error",
            duration: 5000,
            isClosable: true,
            position: "bottom",
          });
        }
      }
    }
  };

  const typingHandler = (e) => {
    setNewMessage(e.target.value);
    if (!socketConnected) return;
    if (!typing) {
      setTyping(true);
      socket.emit("typing", selectedChat._id);
    }
    let lastTypingTime = new Date().getTime();
    var timerLength = 3000;
    setTimeout(() => {
      var timeNow = new Date().getTime();
      var timeDiff = timeNow - lastTypingTime;
      if (timeDiff >= timerLength && typing) {
        socket.emit("stop typing", selectedChat._id);
        setTyping(false);
      }
    }, timerLength);
  };

  const handlePasswordVerification = async () => {
    if (!passwordVerification) {
      toast({
        title: "Por favor, insira sua senha.",
        status: "warning",
        duration: 5000,
        isClosable: true,
        position: "bottom",
      });
      return;
    }

    setIsVerifyingPass(true);

    try {
      const encryptedPrivateKey = {
        cipher: user.encryptedPrivateKey,
        iv: user.encryptedPrivateKeyIV,
        salt: user.encryptedPrivateKeySalt,
      };

      const privateKey = await decryptPrivateKey(
        encryptedPrivateKey,
        passwordVerification
      );

      if (!privateKey) throw new Error("Senha incorreta.");

      setPrivateKey(privateKey);
      onClose();

      toast({
        title: "Senha verificada!",
        status: "success",
        duration: 3000,
        isClosable: true,
        position: "bottom",
      });

      await changeKeys(passwordVerification);
    } catch (error) {
      toast({
        title: "Senha incorreta!",
        description: "Não foi possível validar a senha.",
        status: "error",
        duration: 5000,
        isClosable: true,
        position: "bottom",
      });
    } finally {
      setIsVerifyingPass(false);
    }
  };

  const changeKeys = async (verifiedPassword) => {
    console.log("\n🔄 === INICIANDO ROTAÇÃO DE CHAVES ===");

    const config = {
      headers: { Authorization: `Bearer ${user.token}` },
    };
    await fetchMessages(true);

    if (!privateKey) {
      toast({
        title: "Erro!",
        description: "Chave privada atual não encontrada.",
        status: "error",
        duration: 5000,
        isClosable: true,
        position: "bottom",
      });
      return;
    }

    setIsRotatingKeys(true);
    const userInfos = JSON.parse(localStorage.getItem("userInfo"));
    const userName = userInfos.name;
    const userID = userInfos._id;
    const oldPrivateKey = privateKey;

    const newKeyPair = await window.crypto.subtle.generateKey(
      {
        name: "RSA-OAEP",
        modulusLength: 2048,
        publicExponent: new Uint8Array([1, 0, 1]),
        hash: "SHA-256",
      },
      true,
      ["encrypt", "decrypt"]
    );

    const spki = await window.crypto.subtle.exportKey(
      "spki",
      newKeyPair.publicKey
    );
    const publicB64 = arrayBufferToBase64(spki);
    const newpublicPem = `-----BEGIN PUBLIC KEY-----\n${publicB64
      .match(/.{1,64}/g)
      .join("\n")}\n-----END PUBLIC KEY-----`;
    const pkcs8 = await window.crypto.subtle.exportKey(
      "pkcs8",
      newKeyPair.privateKey
    );
    const privateB64 = arrayBufferToBase64(pkcs8);

    const allMessagesParaUsuario = await axios.get(
      `${ENDPOINT}/api/message/getmessages/${userID}`,
      config
    );

    for (const mensagem of allMessagesParaUsuario.data) {
      const testeClear = await decryptMessage(mensagem.content, oldPrivateKey);
      if (testeClear === null) {
        console.warn(
          `Não foi possível decifrar mensagem ${mensagem._id}; pulando.`
        );
        continue;
      }
      const clearEncrypted = await encryptMessageForUser(
        testeClear,
        newpublicPem
      );
      try {
        await axios.post(
          `${ENDPOINT}/api/message/editmessage`,
          {
            msgID: mensagem._id,
            content: clearEncrypted,
          },
          config
        );
        console.log("Mensagem recriptada e salva:", mensagem._id);
      } catch (e) {
        console.error(
          "Erro ao recriptografar mensagem ",
          mensagem._id,
          ": ",
          e.message
        );
      }
    }

    const privateKeyBytes = await window.crypto.subtle.exportKey(
      "pkcs8",
      newKeyPair.privateKey
    );
    const encryptedPrivate = await encryptPrivateKey(
      privateKeyBytes,
      verifiedPassword
    );
    localStorage.setItem(
      `${userName}_privateKey`,
      JSON.stringify(encryptedPrivate)
    );
    try {
      await axios.post(
        `${ENDPOINT}/api/user/rotatekeys`,
        {
          newPublicKey: newpublicPem,
          encryptedPrivateKey: encryptedPrivate.cipher,
          encryptedPrivateKeyIV: encryptedPrivate.iv,
          encryptedPrivateKeySalt: encryptedPrivate.salt,
        },
        config
      );
      console.log("Chave pública atualizada no servidor.");
    } catch (e) {
      console.log("Erro na atualização da chave pública no servidor. ", e);
    }

    setPasswordVerification("");

    const privateKeyJwk = await crypto.subtle.exportKey(
      "jwk",
      newKeyPair.privateKey
    );
    sessionStorage.setItem("privateKeyJwk", JSON.stringify(privateKeyJwk));
    setPrivateKey(newKeyPair.privateKey);

    toast({
      title: "Sucesso!",
      description: "Chaves rotacionadas com sucesso.",
      status: "success",
      duration: 5000,
      isClosable: true,
      position: "bottom",
    });
    setIsRotatingKeys(false);
  };

  return (
    <>
      {selectedChat ? (
        <div className="singlechat-container">
          <div className="chat-header">
            <div className="chat-header-left">
              <button
                className="back-button"
                onClick={() => setSelectedChat("")}
              >
                <ArrowBackIcon />
              </button>
              <h2 className="chat-header-title">
                {!selectedChat.isGroupChat
                  ? getSender(user, selectedChat.users)
                  : selectedChat.chatName.toUpperCase()}
              </h2>
            </div>
            <div className="chat-header-actions">
              <div style={{ display: "flex", gap: "10px" }}>
                {!selectedChat.isGroupChat ? (
                  <ProfileModal user={getSenderFull(user, selectedChat.users)}>
                    <button className="header-icon-btn">
                      <i className="fas fa-info-circle"></i>
                    </button>
                  </ProfileModal>
                ) : (
                  <UpdateGroupChatModal
                    fetchMessages={fetchMessages}
                    fetchAgain={fetchAgain}
                    setFetchAgain={setFetchAgain}
                  >
                    <button className="header-icon-btn">
                      <i className="fas fa-cog"></i>
                    </button>
                  </UpdateGroupChatModal>
                )}
                <Button onClick={onOpen} size="sm" colorScheme="blue">
                  Rotacionar Chaves
                </Button>
              </div>
            </div>
          </div>

          <div className="messages-container">
            {loading ? (
              <div className="messages-loading">
                <Spinner size="xl" color="#00a88e" />
              </div>
            ) : (
              <ScrollableChat messages={messages} />
            )}
            {istyping && (
              <div className="typing-indicator">
                <div className="typing-dot"></div>
                <div className="typing-dot"></div>
                <div className="typing-dot"></div>
              </div>
            )}
          </div>

          <div className="message-input-container">
            <div className="message-input-wrapper">
              <input
                className="message-input"
                placeholder="Enter a message..."
                value={newMessage}
                onChange={typingHandler}
                onKeyDown={sendMessage}
              />
              <button
                className="send-button"
                onClick={(e) => {
                  e.preventDefault();
                  e.type = "click";
                  sendMessage(e);
                }}
                disabled={!newMessage.trim()}
              >
                Send
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div className="empty-chat-state">
          <div className="empty-chat-icon">💬</div>
          <div className="empty-chat-text">
            Click on a user to start chatting
          </div>
        </div>
      )}

      <Modal isOpen={isOpen} onClose={onClose} isCentered>
        <ModalOverlay />
        <ModalContent>
          <ModalHeader>Verificação de Conta</ModalHeader>
          <ModalCloseButton />
          <ModalBody>
            <p style={{ marginBottom: "15px" }}>
              Por favor, insira sua senha novamente para confirmar a rotação de
              chaves.
            </p>
            <FormControl>
              <FormLabel>Senha</FormLabel>
              <Input
                placeholder="Digite sua senha"
                type={show ? "text" : "password"}
                maxLength={20}
                onChange={(e) => setPasswordVerification(e.target.value)}
                value={passwordVerification}
              />
            </FormControl>
          </ModalBody>
          <ModalFooter>
            <Button
              colorScheme="blue"
              isLoading={isVerifyingPass}
              onClick={handlePasswordVerification}
            >
              Confirmar
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </>
  );
};

export default SingleChat;
