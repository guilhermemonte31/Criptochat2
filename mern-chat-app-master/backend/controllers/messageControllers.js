
const asyncHandler = require("express-async-handler");
const {Message, encryptedMessage} = require("../models/messageModel");
const User = require("../models/userModel");
const Chat = require("../models/chatModel");
const forge = require("node-forge");

//@description     Get all Messages
//@route           GET /api/Message/:chatId
//@access          Protected
const allMessages = asyncHandler(async (req, res) => {
  try {
    console.log("\n=== BUSCANDO MENSAGENS ===");
    console.log("Chat ID:", req.params.chatId);
    console.log("Usuario ID:", req.user._id);
    console.log("Usuario Email:", req.user.email);
    
    // Buscar TODAS as mensagens do chat primeiro
    const allChatMessages = await encryptedMessage.find({ 
      chat: req.params.chatId
    })
      .populate("sender", "name pic email")
      .populate("destinatario", "name email")
      .populate("chat")
      .sort({ createdAt: 1 });
    
    console.log("Total de mensagens no chat:", allChatMessages.length);
    
    // Converter req.user._id para string para comparação
    const currentUserId = req.user._id.toString();
    
    // Filtrar apenas as mensagens que o usuário pode ver
    const userMessages = allChatMessages.filter(msg => {
      const senderId = msg.sender._id.toString();
      const destinatarioId = msg.destinatario ? msg.destinatario._id.toString() : null;
      
      // Se não tem destinatário E o sender é o usuário atual, é mensagem dele
      const isSender = !msg.destinatario && senderId === currentUserId;
      // Se tem destinatário E o destinatário é o usuário atual
      const isRecipient = msg.destinatario && destinatarioId === currentUserId;
      
      console.log(`Mensagem ${msg._id}:`);
      console.log(`  - Sender: ${msg.sender.email} (${senderId})`);
      console.log(`  - Destinatario: ${msg.destinatario ? msg.destinatario.email : 'nenhum'} ${destinatarioId ? `(${destinatarioId})` : ''}`);
      console.log(`  - Current User: ${req.user.email} (${currentUserId})`);
      console.log(`  - isSender: ${isSender}`);
      console.log(`  - isRecipient: ${isRecipient}`);
      console.log(`  - Incluir: ${isSender || isRecipient}`);
      
      return isSender || isRecipient;
    });
    
    console.log("Mensagens filtradas para o usuário:", userMessages.length);
    console.log("=== FIM DA BUSCA ===\n");
    
    res.json(userMessages);
  } catch (error) {
    console.error("ERRO ao buscar mensagens:", error);
    res.status(400);
    throw new Error(error.message);
  }
});

const encryptMsg = async (message, publicKeyPem) => {
  try {
    const publicKey = forge.pki.publicKeyFromPem(publicKeyPem);
    const encrypted = publicKey.encrypt(forge.util.encodeUtf8(message), 'RSA-OAEP');
    return forge.util.encode64(encrypted);
  } catch (error) {
    console.error("Error encrypting message: ", error);
    throw error;
  }
};

//@description     Create New Message
//@route           POST /api/Message/
//@access          Protected
const sendMessage = asyncHandler(async (req, res) => {
  console.log("\n=== INICIANDO ENVIO DE MENSAGEM ===");
  console.log("Body recebido:", JSON.stringify(req.body, null, 2));
  console.log("Usuario:", req.user.email, "ID:", req.user._id);

  const { content, chatId } = req.body;

  if (!content || !chatId) {
    console.log("❌ Dados inválidos - content ou chatId faltando");
    return res.sendStatus(400);
  }

  try {
    // Buscar o chat completo com os usuários
    const chatIdValue = chatId._id || chatId;
    console.log("Buscando chat com ID:", chatIdValue);
    
    const chat = await Chat.findById(chatIdValue).populate("users", "name email publicKey");
    
    if (!chat) {
      console.log("❌ Chat não encontrado");
      return res.status(404).json({ message: "Chat not found" });
    }

    console.log("✓ Chat encontrado:", chat._id);
    console.log("✓ Usuários no chat:", chat.users.map(u => `${u.name} (${u.email})`).join(", "));

    const senderEmail = req.user.email;
    const sender = chat.users.find(user => user.email === senderEmail);

    if (!sender) {
      console.log("❌ Remetente não encontrado no chat");
      return res.status(400).json({ message: "Sender not found in chat" });
    }

    console.log("✓ Remetente:", sender.name, sender.email);

    const destinatarios = chat.users.filter(user => user.email !== senderEmail);
    
    console.log("✓ Destinatários:", destinatarios.map(d => `${d.name} (${d.email})`).join(", "));

    if(destinatarios.length === 0) {
      console.log("⚠️ Nenhum destinatário encontrado (chat consigo mesmo?)");
      return res.status(400).json({ message: "No recipients found in chat" });
    }

    console.log("📝 Mensagem original:", content);

    // 1. Criptografar e criar mensagem para o REMETENTE (sem destinatario)
    console.log("\n--- Criando mensagem para o REMETENTE ---");
    const msgCriptografadaRemetente = await encryptMsg(content, sender.publicKey);
    console.log("✓ Mensagem criptografada (50 primeiros chars):", msgCriptografadaRemetente.substring(0, 50));

    const dadosMsgRemetente = {
      sender: sender._id,
      content: msgCriptografadaRemetente,
      chat: chat._id,
      // NÃO incluir destinatario aqui
    };

    console.log("Dados da mensagem do remetente:", {
      sender: sender.email,
      chat: chat._id,
      hasDestinatario: false,
      contentLength: msgCriptografadaRemetente.length
    });

    const msgRemetente = await encryptedMessage.create(dadosMsgRemetente);
    console.log("✓ Mensagem do remetente criada com ID:", msgRemetente._id);

    // 2. Criar mensagens para cada DESTINATÁRIO
    console.log("\n--- Criando mensagens para DESTINATÁRIOS ---");
    const msgsDestinatarios = [];
    
    for(const destinatario of destinatarios) {
      console.log(`\nProcessando destinatário: ${destinatario.name} (${destinatario.email})`);
      
      const encryptedMsg = await encryptMsg(content, destinatario.publicKey);
      console.log("✓ Mensagem criptografada");
      
      const dadosMsgDestinatario = {
        sender: sender._id,
        destinatario: destinatario._id, // IMPORTANTE: incluir o destinatário
        content: encryptedMsg,
        chat: chat._id,
      };
      
      console.log("Dados da mensagem do destinatário:", {
        sender: sender.email,
        destinatario: destinatario.email,
        chat: chat._id,
        contentLength: encryptedMsg.length
      });
      
      const msgDestinatario = await encryptedMessage.create(dadosMsgDestinatario);
      console.log("✓ Mensagem criada com ID:", msgDestinatario._id);
      msgsDestinatarios.push(msgDestinatario);
    }

    console.log(`\n✓ Total de mensagens criadas: 1 (remetente) + ${msgsDestinatarios.length} (destinatários)`);

    // 3. Populate a mensagem do remetente para retornar
    console.log("\n--- Preparando resposta ---");
    let mensagemFinal = await encryptedMessage.findById(msgRemetente._id)
      .populate("sender", "name pic email")
      .populate("chat");

    mensagemFinal = await User.populate(mensagemFinal, {
      path: "chat.users",
      select: "name pic email",
    });

    // 4. Atualizar o chat com a última mensagem
    await Chat.findByIdAndUpdate(chat._id, { latestMessage: mensagemFinal });
    console.log("✓ Chat atualizado com latestMessage");

    console.log("\n✓ Mensagem final preparada:", {
      _id: mensagemFinal._id,
      sender: mensagemFinal.sender.email,
      chat: mensagemFinal.chat._id,
      hasContent: !!mensagemFinal.content,
      contentLength: mensagemFinal.content.length
    });

    console.log("=== ENVIO CONCLUÍDO COM SUCESSO ===\n");
    
    res.json(mensagemFinal);

  } catch (error) {
    console.error("❌ ERRO ao enviar mensagem:", error);
    console.error("Stack:", error.stack);
    res.status(400);
    throw new Error(error.message);
  }
});

module.exports = { allMessages, sendMessage };