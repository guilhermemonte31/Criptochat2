const asyncHandler = require("express-async-handler");
const { encryptedMessage } = require("../models/messageModel");
const User = require("../models/userModel");
const Chat = require("../models/chatModel");

/*
  ==========================================================
   🔐 SISTEMA DE MENSAGENS CIFRADAS - EXPLICAÇÃO DO FLUXO
  ==========================================================
  1️⃣ O cliente (frontend) gera um par de chaves RSA:
      - Pública (PEM): compartilhada com outros usuários via servidor.
      - Privada (CryptoKey WebCrypto): armazenada localmente no navegador.

  2️⃣ Ao enviar uma mensagem:
      - O navegador cifra o conteúdo com a chave pública do destinatário.
      - O resultado (base64, RSA-OAEP) é enviado ao servidor.

  3️⃣ O servidor:
      - Recebe o conteúdo cifrado (sem texto puro).
      - Apenas armazena no banco e distribui via Socket/REST.
      - Mantém registros (logs) de auditoria e fluxo.

  4️⃣ O destinatário:
      - Recebe o conteúdo cifrado e o decifra localmente
        usando sua chave privada guardada no navegador.

  ➤ O servidor nunca tem acesso ao conteúdo original das mensagens.
*/

//
// @desc  Buscar todas as mensagens cifradas de um chat
// @route GET /api/message/:chatId
// @access Protected
//
const allMessages = asyncHandler(async (req, res) => {
  try {
    console.log("\n[MENSAGENS] Iniciando busca de mensagens cifradas...");
    const { chatId } = req.params;

    const messages = await encryptedMessage
      .find({
        chat: chatId,
        $or: [
          { destinatario: req.user._id },   // mensagens destinadas ao usuário
          { sender: req.user._id },         // ou mensagens que o usuário enviou
        ],
      })
      .populate("sender", "name pic email")
      .populate("destinatario", "name email")
      .populate("chat")
      .sort({ createdAt: 1 });


    console.log(`${messages.length} mensagens encontradas para o chat ${chatId}`);
    console.log("Enviando mensagens cifradas para o cliente...");
    res.json(messages);
  } catch (error) {
    console.error("Erro ao buscar mensagens:", error);
    res.status(400).json({ message: error.message });
  }
});


//
// @desc  Armazenar nova mensagem (já cifrada pelo cliente)
// @route POST /api/message
// @access Protected
//
const sendMessage = asyncHandler(async (req, res) => {
  console.log("\n=== RECEBENDO NOVA MENSAGEM CIFRADA ===");

  const { content, chatId, destinatarioId } = req.body;

  if (!content || !chatId) {
    console.log("Dados inválidos: faltando conteúdo ou ID do chat.");
    return res.sendStatus(400);
  }

  try {
    console.log("Localizando chat...");
    const chat = await Chat.findById(chatId).populate("users", "name email");
    if (!chat) {
      console.log("Chat não encontrado.");
      return res.status(404).json({ message: "Chat not found" });
    }

    const sender = req.user._id;
    const destinatario = destinatarioId || null;

    // 🔒 Conteúdo já está cifrado pelo cliente via WebCrypto (RSA-OAEP)
    console.log("Armazenando mensagem cifrada no banco...");
    const newMessage = await encryptedMessage.create({
      sender,
      destinatario,
      content, // Conteúdo cifrado em Base64 (não altere!)
      chat: chat._id,
    });

    // Popular informações do remetente e do chat
    let populatedMessage = await encryptedMessage.findById(newMessage._id)
      .populate("sender", "name pic email")
      .populate("chat");

    populatedMessage = await User.populate(populatedMessage, {
      path: "chat.users",
      select: "name pic email",
    });

    // Atualizar última mensagem do chat
    await Chat.findByIdAndUpdate(chat._id, { latestMessage: populatedMessage });

    console.log("Mensagem cifrada armazenada com sucesso!");
    console.log("ID:", newMessage._id);
    console.log("Remetente:", req.user.name);
    console.log("Chat:", chat._id);
    console.log("Tamanho do conteúdo cifrado:", content.length, "bytes");

    res.json(populatedMessage);
  } catch (error) {
    console.error("Erro ao salvar mensagem:", error);
    res.status(400).json({ message: error.message });
  }

  console.log("Fim do processamento da mensagem.\n");
});

const allMessagesDestinatario = asyncHandler(async (req, res) => {
  try {
    console.log("\n[MENSAGENS] Iniciando busca de mensagens cifradas por destinatário...", req.params);
    const { destinatarioID } = req.params;

    const messages = await encryptedMessage
      .find({ destinatario: destinatarioID })
      .populate("sender", "name pic email")
      .populate("destinatario", "name email")
      .populate("chat")
      .sort({ createdAt: 1 });

    console.log(`${messages.length} mensagens encontradas para o destinatário ${destinatarioID}`);
    console.log("Enviando mensagens cifradas para o cliente...");
    res.json(messages);
  } catch (error) {
    console.error("Erro ao buscar mensagens:", error);
    res.status(400).json({ message: error.message });
  }
});

const editedMessage = asyncHandler(async (req, res) => {
  
  console.log("\n[MENSAGENS] Iniciando busca de mensagem cifrada para edição...", req.params);
  console.log("{messagecontrolle] body: ", req.body);
  const { msgID, content } = req.body;
  console.log("ID da URL para busca:", req.params.msgId);
  console.log("tentando algo aq ", msgID, " ", content);
  try{  
    const mensagem = await encryptedMessage.findById(msgID);
    console.log("sixxx mensagem encontrada para edição: ", mensagem);
    if(mensagem){
      console.log("sixxx mensagem encontrada para edição: ", mensagem);
      mensagem.content = content;
      await mensagem.save();
      res.json({ message: "Mensagem atualizada com sucesso" });
    }else{
      console.log("socorro");
      res.status(404).json({ message: "Mensagem não encontrada" });
    }
  }catch (error){
    console.log("misericordia");
    res.status(400).json({ message: error.message });
    console.error("Erro ao buscar mensagens:", error.message);
  }
});



//
// 🔒 NOTA:
// As funções de criptografia e descriptografia foram removidas,
// pois agora o processo é inteiramente realizado no cliente.
// O servidor apenas armazena e entrega dados cifrados.
//
module.exports = { allMessages, sendMessage, allMessagesDestinatario, editedMessage };
