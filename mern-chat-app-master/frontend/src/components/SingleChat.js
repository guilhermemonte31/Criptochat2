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

// Importar funções do sistema híbrido
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

  // Gerenciamento de sequências
  const sequenceMapRef = useRef(new Map()); // Map<chatId, Map<senderId, lastSeq>>
  const mySequenceRef = useRef(new Map()); // Map<chatId, myNextSeq>

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

  /**
   * Carrega a chave privada do sessionStorage
   */
  const loadPrivateKey = async () => {
    try {
      const privateKeyJwkStr = sessionStorage.getItem("privateKeyJwk");
      if (!privateKeyJwkStr) {
        console.warn("⚠️ Nenhuma chave privada encontrada na sessão.");
        toast({
          title: "Private Key Missing",
          description: "Please log in again to restore your encryption key.",
          status: "error",
          duration: 5000,
          isClosable: true,
          position: "bottom",
        });
        return null;
      }

      const privateKeyJwk = JSON.parse(privateKeyJwkStr);
      console.log("✅ Chave privada carregada do sessionStorage");
      setPrivateKey(privateKeyJwk);
      return privateKeyJwk;
    } catch (err) {
      console.error("❌ Erro ao carregar chave privada:", err);
      toast({
        title: "Encryption Error",
        description: "Failed to load your encryption key.",
        status: "error",
        duration: 5000,
        isClosable: true,
        position: "bottom",
      });
      return null;
    }
  };

  /**
   * Obtém o próximo número de sequência para envio
   */
  const getNextSequenceNumber = async (chatId) => {
    try {
      // Tenta obter do cache local primeiro
      if (mySequenceRef.current.has(chatId)) {
        const next = mySequenceRef.current.get(chatId);
        mySequenceRef.current.set(chatId, next + 1);
        return next;
      }

      // Busca do servidor
      const config = {
        headers: { Authorization: `Bearer ${user.token}` },
      };

      const { data } = await axios.get(
        `/api/message/sequence/${chatId}`,
        config
      );

      // Armazena no cache
      mySequenceRef.current.set(chatId, data.sequence + 1);

      console.log(`📊 Sequência obtida do servidor: ${data.sequence}`);
      return data.sequence;
    } catch (error) {
      console.error("❌ Erro ao obter sequência:", error);
      // Fallback: usa timestamp como sequência temporária
      return Date.now() % 1000000;
    }
  };

  /**
   * Valida número de sequência de mensagem recebida
   */
  const validateMessageSequence = (envelope, chatId) => {
    const senderId = envelope.metadata.senderId;
    const receivedSeq = envelope.metadata.sequence;

    // Inicializa map do chat se não existir
    if (!sequenceMapRef.current.has(chatId)) {
      sequenceMapRef.current.set(chatId, new Map());
    }

    const chatSequences = sequenceMapRef.current.get(chatId);
    const expectedSeq = chatSequences.get(senderId) || 0;

    try {
      // Valida sequência
      validateSequence(receivedSeq, expectedSeq, 10);

      // Atualiza última sequência conhecida
      if (receivedSeq > expectedSeq) {
        chatSequences.set(senderId, receivedSeq);
      }

      return true;
    } catch (error) {
      console.error("⚠️ Validação de sequência falhou:", error.message);
      toast({
        title: "Security Warning",
        description: error.message,
        status: "warning",
        duration: 5000,
        isClosable: true,
        position: "bottom",
      });
      return false;
    }
  };

  /**
   * Decifra mensagem usando sistema híbrido
   */
  const decryptMessage = async (envelopeStr, chatId) => {
    if (!privateKey) {
      console.warn("⚠️ Chave privada não disponível");
      return "[Chave privada não carregada]";
    }

    try {
      // Parse do envelope
      const envelope =
        typeof envelopeStr === "string" ? JSON.parse(envelopeStr) : envelopeStr;

      // ⭐ CORREÇÃO: Verificar se a mensagem é para o usuário atual
      if (envelope.metadata.recipientId !== user._id) {
        console.log(
          `ℹ️ Ignorando mensagem destinada a outro usuário (${envelope.metadata.recipientId})`
        );
        return null; // Retorna null para indicar que não deve ser exibida
      }

      // VALIDAÇÃO 1: Estrutura do envelope
      try {
        validateEnvelope(envelope, user._id, null);
      } catch (validationError) {
        console.error(
          "❌ Validação do envelope falhou:",
          validationError.message
        );
        return "[Envelope inválido]";
      }

      // VALIDAÇÃO 2: Timestamp
      try {
        validateTimestamp(envelope.metadata.timestamp);
      } catch (timestampError) {
        console.warn("⚠️ Timestamp inválido:", timestampError.message);
        // Continua mesmo com timestamp inválido (mensagem antiga)
      }

      // VALIDAÇÃO 3: Sequência (previne replay/reorder)
      if (!validateMessageSequence(envelope, chatId)) {
        return "[Sequência inválida - possível replay attack]";
      }

      // DESCRIPTOGRAFIA
      const plaintext = await hybridDecrypt(envelope, privateKey);

      console.log("✅ Mensagem decifrada com sucesso");
      console.log("📋 Metadados validados:", {
        sender: envelope.metadata.senderId,
        recipient: envelope.metadata.recipientId,
        sequence: envelope.metadata.sequence,
        timestamp: new Date(envelope.metadata.timestamp).toLocaleString(),
      });

      return plaintext;
    } catch (error) {
      console.error("❌ Erro na descriptografia:", error);

      if (error.message.includes("INTEGRITY_VIOLATION")) {
        return "[ALERTA: Mensagem adulterada - falha na verificação de integridade]";
      }

      return "[Falha ao descriptografar]";
    }
  };

  /**
   * Busca e decifra todas as mensagens do chat
   */
  const fetchMessages = async (isRefresh = false) => {
    if (!selectedChat || !privateKey) {
      console.log("⏸️ Aguardando chat selecionado e chave privada...");
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

      console.log(`📦 ${data.length} envelopes cifrados recebidos`);

      // Decifrar todas as mensagens
      const decryptedMessages = await Promise.all(
        data.map(async (msg) => {
          const decrypted = await decryptMessage(msg.content, selectedChat._id);
          return {
            ...msg,
            decrypted: decrypted,
          };
        })
      );

      // ⭐ CORREÇÃO: Filtrar mensagens null (não destinadas ao usuário) e inválidas
      const validMessages = decryptedMessages.filter(
        (msg) =>
          msg.decrypted !== null &&
          msg.decrypted !== undefined &&
          !msg.decrypted.startsWith("[")
      );

      // Remove duplicatas baseado em conteúdo + timestamp
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

  /**
   * Envia mensagem cifrada usando sistema híbrido
   */
  const sendMessage = async (event) => {
    if (event.key === "Enter" && newMessage.trim()) {
      console.log("\n============================================");
      console.log("🔐 CIFRANDO E ENVIANDO MENSAGEM");
      console.log("============================================");

      socket.emit("stop typing", selectedChat._id);

      try {
        const config = {
          headers: {
            "Content-type": "application/json",
            Authorization: `Bearer ${user.token}`,
          },
        };

        // Obtém informações do chat
        const { data: chatInfo } = await axios.get(
          `/api/chat/${selectedChat._id}`,
          config
        );

        console.log(`👥 Chat com ${chatInfo.users.length} membros`);

        // Cifra mensagem para cada membro
        const encryptedMessages = [];

        for (const member of chatInfo.users) {
          console.log(`\n🔐 Cifrando para ${member.name}...`);

          // Obtém número de sequência
          const sequence = await getNextSequenceNumber(selectedChat._id);

          // Prepara metadados
          const metadata = {
            senderId: user._id,
            recipientId: member._id,
            chatId: selectedChat._id,
            timestamp: Date.now(),
            sequence: sequence,
          };

          console.log("📋 Metadados:", metadata);

          // Cifra usando sistema híbrido
          const envelope = await hybridEncrypt(
            newMessage,
            member.publicKey,
            metadata
          );

          console.log("✅ Envelope criado para", member.name);

          encryptedMessages.push({
            destinatarioId: member._id,
            envelope: envelope,
          });
        }

        // Envia cada versão cifrada
        console.log(
          `\n📤 Enviando ${encryptedMessages.length} envelopes cifrados...`
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

        console.log("✅ Todas as mensagens enviadas com sucesso!");
        console.log("🔒 Proteções aplicadas:");
        console.log("   ✓ Confidencialidade (AES-256-GCM)");
        console.log("   ✓ Integridade (Authentication Tag)");
        console.log("   ✓ Autenticidade (AAD)");
        console.log("   ✓ Anti-Replay (Sequence Numbers)");
        console.log("   ✓ Forward Secrecy (Unique Session Keys)");
        console.log("============================================\n");

        setNewMessage("");
        socket.emit("new message", { room: selectedChat._id });
      } catch (error) {
        console.error("\n❌ ERRO AO ENVIAR MENSAGEM");
        console.error("Erro:", error.response?.data || error.message);
        console.log("============================================\n");

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

  // Effect: Inicializa socket e carrega chave privada
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

  // Effect: Busca mensagens quando chat muda
  useEffect(() => {
    if (selectedChat && privateKey) {
      fetchMessages(false);
      selectedChatCompare = selectedChat;
    }
  }, [selectedChat, privateKey]);

  // Effect: Atualiza mensagens via socket
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
          {/* Header do chat */}
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

          {/* Área de mensagens */}
          <div className="messages-container">
            {loading ? (
              <div className="messages-loading">
                <Spinner size="xl" color="#00a88e" />
              </div>
            ) : (
              <ScrollableChat messages={messages} />
            )}

            {/* Indicador de digitação */}
            {istyping && (
              <div className="typing-indicator">
                <div className="typing-dot"></div>
                <div className="typing-dot"></div>
                <div className="typing-dot"></div>
              </div>
            )}
          </div>

          {/* Input de mensagem */}
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
