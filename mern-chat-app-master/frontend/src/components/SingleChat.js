// ============================================================================
// VERSÃO PARA DEMONSTRAÇÃO ACADÊMICA - COM LOGS DETALHADOS
// ============================================================================

import { FormControl } from "@chakra-ui/form-control";
import { Input } from "@chakra-ui/input";
import { Box, Text } from "@chakra-ui/layout";
import "./styles.css";
import { IconButton, Spinner, useToast } from "@chakra-ui/react";
import { getSender, getSenderFull } from "../config/ChatLogics";
import { useEffect, useState, useRef } from "react";
import { useHistory } from "react-router";
import axios from "axios";
import { ArrowBackIcon } from "@chakra-ui/icons";
import ProfileModal from "./miscellaneous/ProfileModal";
import ScrollableChat from "./ScrollableChat";
import Lottie from "react-lottie";
import animationData from "../animations/typing.json";
import io from "socket.io-client";
import UpdateGroupChatModal from "./miscellaneous/UpdateGroupChatModal";
import { ChatState } from "../Context/ChatProvider";
import "./SingleChat.css";

import {
  hybridEncrypt,
  hybridDecrypt,
  validateEnvelope,
  validateSequence,
  validateTimestamp,
} from "../crypto/hybridCrypto";

const ENDPOINT = "http://localhost:5000";
var socket, selectedChatCompare;

const SingleChat = ({ fetchAgain, setFetchAgain }) => {
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(false);
  const [newMessage, setNewMessage] = useState("");
  const [socketConnected, setSocketConnected] = useState(false);
  const [typing, setTyping] = useState(false);
  const [istyping, setIsTyping] = useState(false);
  const [privateKey, setPrivateKey] = useState(null);

  const sequenceMapRef = useRef(new Map());
  const mySequenceRef = useRef(new Map());

  const toast = useToast();

  const defaultOptions = {
    loop: true,
    autoplay: true,
    animationData: animationData,
    rendererSettings: {
      preserveAspectRatio: "xMidYMid slice",
    },
  };

  const { selectedChat, setSelectedChat, user, notification, setNotification } =
    ChatState();

  const loadPrivateKey = async () => {
    try {
      const privateKeyJwkStr = sessionStorage.getItem("privateKeyJwk");
      if (!privateKeyJwkStr) {
        console.warn("⚠️ Nenhuma chave privada encontrada na sessão.");
        return null;
      }

      const privateKeyJwk = JSON.parse(privateKeyJwkStr);
      console.log("✅ Chave privada carregada do sessionStorage");
      setPrivateKey(privateKeyJwk);
      return privateKeyJwk;
    } catch (err) {
      console.error("❌ Erro ao carregar chave privada:", err);
      return null;
    }
  };

  const getNextSequenceNumber = async (chatId) => {
    try {
      if (mySequenceRef.current.has(chatId)) {
        const next = mySequenceRef.current.get(chatId);
        mySequenceRef.current.set(chatId, next + 1);
        return next;
      }

      const config = {
        headers: { Authorization: `Bearer ${user.token}` },
      };

      const { data } = await axios.get(
        `/api/message/sequence/${chatId}`,
        config
      );

      mySequenceRef.current.set(chatId, data.sequence + 1);

      console.log(`📊 Sequência obtida: ${data.sequence}`);
      return data.sequence;
    } catch (error) {
      console.error("❌ Erro ao obter sequência:", error);
      return Date.now() % 1000000;
    }
  };

  const validateMessageSequence = (envelope, chatId) => {
    const senderId = envelope.metadata.senderId;
    const receivedSeq = envelope.metadata.sequence;

    if (!sequenceMapRef.current.has(chatId)) {
      sequenceMapRef.current.set(chatId, new Map());
    }

    const chatSequences = sequenceMapRef.current.get(chatId);
    const expectedSeq = chatSequences.get(senderId) || 0;

    try {
      validateSequence(receivedSeq, expectedSeq, 10);

      if (receivedSeq > expectedSeq) {
        chatSequences.set(senderId, receivedSeq);
      }

      return true;
    } catch (error) {
      console.error("⚠️ Validação de sequência falhou:", error.message);
      return false;
    }
  };

  const decryptMessage = async (envelopeStr, chatId) => {
    if (!privateKey) {
      console.warn("⚠️ Chave privada não disponível");
      return "[Chave privada não carregada]";
    }

    try {
      const envelope =
        typeof envelopeStr === "string" ? JSON.parse(envelopeStr) : envelopeStr;

      // ========================================================================
      // 🎓 DEMONSTRAÇÃO 1: MOSTRAR COMPONENTES DO ENVELOPE
      // ========================================================================
      console.log("\n" + "=".repeat(70));
      console.log("📦 DEMONSTRAÇÃO: COMPONENTES DO ENVELOPE");
      console.log("=".repeat(70));
      console.log(
        "🔐 Session Key Cifrada (primeiros 40 chars):",
        envelope.encryptedKey.substring(0, 40) + "..."
      );
      console.log(
        "📄 Ciphertext (primeiros 40 chars):",
        envelope.ciphertext.substring(0, 40) + "..."
      );
      console.log("🎲 IV (Initialization Vector):", envelope.iv);
      console.log("🛡️ AUTH TAG (Tag de Integridade):", envelope.authTag);
      console.log(
        "📋 Metadados Protegidos:",
        JSON.stringify(envelope.metadata, null, 2)
      );
      console.log("=".repeat(70) + "\n");

      // Verificar destinatário
      if (envelope.metadata.recipientId !== user._id) {
        console.log(
          `ℹ️ Ignorando mensagem destinada a outro usuário (${envelope.metadata.recipientId})`
        );
        return null;
      }

      // ========================================================================
      // 🎓 DEMONSTRAÇÃO 2: VALIDAÇÃO DE ESTRUTURA
      // ========================================================================
      console.log("\n" + "=".repeat(70));
      console.log("🔍 DEMONSTRAÇÃO: VALIDAÇÃO DE ESTRUTURA");
      console.log("=".repeat(70));
      try {
        validateEnvelope(envelope, user._id, null);
        console.log("✅ Estrutura do envelope: VÁLIDA");
        console.log("   ✓ encryptedKey presente");
        console.log("   ✓ ciphertext presente");
        console.log("   ✓ iv presente");
        console.log("   ✓ authTag presente");
        console.log("   ✓ metadata completa");
      } catch (validationError) {
        console.error("❌ Estrutura INVÁLIDA:", validationError.message);
        console.log("=".repeat(70) + "\n");
        return "[Envelope inválido]";
      }
      console.log("=".repeat(70) + "\n");

      // ========================================================================
      // 🎓 DEMONSTRAÇÃO 3: VALIDAÇÃO DE TIMESTAMP
      // ========================================================================
      console.log("\n" + "=".repeat(70));
      console.log("⏰ DEMONSTRAÇÃO: VALIDAÇÃO DE TIMESTAMP");
      console.log("=".repeat(70));
      const messageDate = new Date(envelope.metadata.timestamp);
      const now = new Date();
      const age = now - messageDate;
      console.log("📅 Timestamp da mensagem:", messageDate.toLocaleString());
      console.log("📅 Timestamp atual:", now.toLocaleString());
      console.log("⏱️ Idade da mensagem:", Math.floor(age / 1000), "segundos");

      try {
        validateTimestamp(envelope.metadata.timestamp);
        console.log("✅ Timestamp: VÁLIDO (mensagem recente)");
      } catch (timestampError) {
        console.warn("⚠️ Timestamp:", timestampError.message);
      }
      console.log("=".repeat(70) + "\n");

      // ========================================================================
      // 🎓 DEMONSTRAÇÃO 4: VALIDAÇÃO DE SEQUÊNCIA (ANTI-REPLAY)
      // ========================================================================
      console.log("\n" + "=".repeat(70));
      console.log("🔢 DEMONSTRAÇÃO: VALIDAÇÃO DE SEQUÊNCIA (ANTI-REPLAY)");
      console.log("=".repeat(70));
      console.log(
        "📊 Número de sequência recebido:",
        envelope.metadata.sequence
      );

      if (!sequenceMapRef.current.has(chatId)) {
        console.log("ℹ️ Primeira mensagem deste sender neste chat");
      } else {
        const chatSeqs = sequenceMapRef.current.get(chatId);
        const lastSeq = chatSeqs.get(envelope.metadata.senderId) || 0;
        console.log("📊 Última sequência conhecida:", lastSeq);
        console.log("📊 Nova sequência:", envelope.metadata.sequence);

        if (envelope.metadata.sequence <= lastSeq) {
          console.log("❌ ALERTA: Possível REPLAY ATTACK detectado!");
        } else {
          console.log("✅ Sequência em ordem correta");
        }
      }

      if (!validateMessageSequence(envelope, chatId)) {
        console.log("❌ Validação de sequência: FALHOU");
        console.log("=".repeat(70) + "\n");
        return "[Sequência inválida - possível replay attack]";
      }
      console.log("✅ Validação de sequência: PASSOU");
      console.log("=".repeat(70) + "\n");

      // ========================================================================
      // 🎓 DEMONSTRAÇÃO 5: DESCRIPTOGRAFIA E VALIDAÇÃO DE INTEGRIDADE
      // ========================================================================
      console.log("\n" + "=".repeat(70));
      console.log(
        "🔓 DEMONSTRAÇÃO: DESCRIPTOGRAFIA + VALIDAÇÃO DE INTEGRIDADE"
      );
      console.log("=".repeat(70));
      console.log("🔑 Iniciando descriptografia híbrida...");
      console.log("   1. Descriptografando session key com RSA...");

      const plaintext = await hybridDecrypt(envelope, privateKey);

      console.log("   2. Descriptografando mensagem com AES-GCM...");
      console.log("   3. Validando tag de integridade (GCM)...");
      console.log("✅ INTEGRIDADE VERIFICADA!");
      console.log("✅ Tag GCM válida - nenhuma adulteração detectada");
      console.log("💬 Mensagem decifrada:", plaintext);
      console.log("=".repeat(70) + "\n");

      return plaintext;
    } catch (error) {
      // ========================================================================
      // 🎓 DEMONSTRAÇÃO 7: DETECÇÃO DE ADULTERAÇÃO
      // ========================================================================
      console.log("\n" + "=".repeat(70));
      console.log("❌ DEMONSTRAÇÃO: FALHA NA VALIDAÇÃO DE INTEGRIDADE");
      console.log("=".repeat(70));
      console.error("❌ Erro:", error.message);

      if (error.message.includes("INTEGRITY_VIOLATION")) {
        console.log("🚨 ADULTERAÇÃO DETECTADA!");
        console.log("   A tag de autenticação GCM não corresponde aos dados");
        console.log("   Possíveis causas:");
        console.log("   • Ciphertext foi modificado");
        console.log("   • Metadados foram alterados");
        console.log("   • AuthTag foi corrompido");
        console.log("   • Session key incorreta");
        console.log("=".repeat(70) + "\n");
        return "[🚨 ALERTA: Mensagem adulterada - falha na verificação de integridade]";
      }

      console.log("=".repeat(70) + "\n");
      return "[Falha ao descriptografar]";
    }
  };

  const fetchMessages = async (isRefresh = false) => {
    if (!selectedChat || !privateKey) {
      return;
    }

    console.log(
      isRefresh
        ? "\n🔄 Atualizando mensagens..."
        : "\n=== BUSCANDO E DECIFRANDO MENSAGENS ==="
    );

    try {
      setLoading(!isRefresh);

      const config = {
        headers: { Authorization: `Bearer ${user.token}` },
      };

      const { data } = await axios.get(
        `/api/message/${selectedChat._id}`,
        config
      );

      console.log(`📦 ${data.length} envelopes cifrados recebidos do servidor`);

      const decryptedMessages = await Promise.all(
        data.map(async (msg) => {
          const decrypted = await decryptMessage(msg.content, selectedChat._id);
          return {
            ...msg,
            decrypted: decrypted,
          };
        })
      );

      const validMessages = decryptedMessages.filter(
        (msg) =>
          msg.decrypted !== null &&
          msg.decrypted !== undefined &&
          !msg.decrypted.startsWith("[")
      );

      const uniqueMessages = validMessages.filter(
        (msg, index, self) =>
          index ===
          self.findIndex(
            (m) =>
              m.sender._id === msg.sender._id &&
              m.decrypted === msg.decrypted &&
              Math.abs(new Date(m.createdAt) - new Date(msg.createdAt)) < 2000
          )
      );

      setMessages(uniqueMessages);
      setLoading(false);

      if (!isRefresh) {
        socket.emit("join chat", selectedChat._id);
      }

      console.log(
        `✅ ${uniqueMessages.length} mensagens válidas exibidas (de ${data.length} recebidas)`
      );
    } catch (error) {
      console.error("❌ Erro ao buscar mensagens:", error);
      setLoading(false);
    }
  };

  const sendMessage = async (event) => {
    if (event.key === "Enter" && newMessage.trim()) {
      console.log("\n" + "=".repeat(70));
      console.log("🔐 DEMONSTRAÇÃO: CIFRANDO E ENVIANDO MENSAGEM");
      console.log("=".repeat(70));

      socket.emit("stop typing", selectedChat._id);

      try {
        const config = {
          headers: {
            "Content-type": "application/json",
            Authorization: `Bearer ${user.token}`,
          },
        };

        const { data: chatInfo } = await axios.get(
          `/api/chat/${selectedChat._id}`,
          config
        );

        console.log(`👥 Participantes do chat: ${chatInfo.users.length}`);

        const encryptedMessages = [];

        for (const member of chatInfo.users) {
          console.log(`\n🔐 Cifrando mensagem para: ${member.name}`);

          const sequence = await getNextSequenceNumber(selectedChat._id);

          const metadata = {
            senderId: user._id,
            recipientId: member._id,
            chatId: selectedChat._id,
            timestamp: Date.now(),
            sequence: sequence,
          };

          console.log("📋 Metadados da mensagem:", metadata);

          const envelope = await hybridEncrypt(
            newMessage,
            member.publicKey,
            metadata
          );

          // ========================================================================
          // 🎓 DEMONSTRAÇÃO: COMPONENTES DO ENVELOPE CRIADO
          // ========================================================================
          console.log("\n📦 ENVELOPE CRIADO:");
          console.log(
            "   🔐 Encrypted Key (40 chars):",
            envelope.encryptedKey.substring(0, 40) + "..."
          );
          console.log(
            "   📄 Ciphertext (40 chars):",
            envelope.ciphertext.substring(0, 40) + "..."
          );
          console.log("   🎲 IV:", envelope.iv);
          console.log("   🛡️ AUTH TAG:", envelope.authTag);
          console.log(
            "   📊 Tamanho total:",
            JSON.stringify(envelope).length,
            "bytes"
          );

          encryptedMessages.push({
            destinatarioId: member._id,
            envelope: envelope,
          });
        }

        console.log(
          `\n📤 Enviando ${encryptedMessages.length} envelopes ao servidor...`
        );

        await Promise.all(
          encryptedMessages.map((msg) =>
            axios.post(
              "/api/message",
              {
                content: JSON.stringify(msg.envelope),
                chatId: selectedChat._id,
                destinatarioId: msg.destinatarioId,
              },
              config
            )
          )
        );

        setNewMessage("");
        socket.emit("new message", { room: selectedChat._id });
      } catch (error) {
        console.error("\n❌ ERRO AO ENVIAR MENSAGEM");
        console.error("Erro:", error.response?.data || error.message);
        console.log("=".repeat(70) + "\n");
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

  useEffect(() => {
    loadPrivateKey();

    socket = io(ENDPOINT);
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

  useEffect(() => {
    if (selectedChat && privateKey) {
      fetchMessages(false);
      selectedChatCompare = selectedChat;
    }
  }, [selectedChat, privateKey]);

  useEffect(() => {
    if (!socket) return;

    socket.on("refresh messages", () => {
      if (selectedChat && privateKey) {
        fetchMessages(true);
      }
    });

    return () => socket.off("refresh messages");
  }, [socket, privateKey, selectedChat]);

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
                  e.key = "Enter";
                  sendMessage(e);
                }}
                disabled={!newMessage.trim()}
              >
                🔒 Send
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
    </>
  );
};

export default SingleChat;
