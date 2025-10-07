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
    const messages = await encryptedMessage.find({ chat: req.params.chatId, recipient: req.user._id })
      .populate("sender", "name pic email")
      .populate("chat");
    res.json(messages);
  } catch (error) {
    res.status(400);
    throw new Error(error.message);
  }
});


//@description     Create New Message
//@route           POST /api/Message/
//@access          Protected
const sendMessage = asyncHandler(async (req, res) => {
  console.log(req.body);

  const { content, chatId } = req.body;

  if (!content || !chatId) {
    console.log("Invalid data passed into request");
    return res.sendStatus(400);
  }
  console.log("\x1b[33mTeste1\x1b[0m");

  const senderEmail = req.user.email;
  const sender = chatId.users.find(user => user.email === senderEmail);
  console.log("Sender public key: ", sender.publicKey);

  if (!sender) {
    return res.status(400).json({ message: "Sender not found in chat" });
  }

  const destinatarios = chatId.users.filter(user => user.email !== senderEmail);
  console.log("Destinatarios: ", destinatarios);
  destinatarios.forEach(destinatario => {
    console.log("Destinatario: ", destinatario.name, "- public key: ", destinatario.publicKey);
  });

  if(destinatarios.length === 0) {
    return res.status(400).json({ message: "No recipients found in chat" });
  }

  console.log("Mensagem verdadeira: ", content);

  const remetentePublicKey = sender.publicKey;
  console.log("Chave pública do remetente: ", remetentePublicKey);
  const msgCriptografadaRemetente = await encryptMsg(content, remetentePublicKey);
  console.log("Mensagem criptografada para o remetente: ", msgCriptografadaRemetente.toString('base64'));

  const versoesMsgCriptografada = [];
  for(const destinatario of destinatarios) {
    const destinatarioPublicKeyPem = destinatario.publicKey;
    console.log("Chave pública do destinatario: ", destinatarioPublicKeyPem);
    const encrypetdMsg = await encryptMsg(content, destinatarioPublicKeyPem);
    console.log("TESTEEEE");
    versoesMsgCriptografada.push({
      dest: destinatario.name,
      msgCript: encrypetdMsg.toString('base64')
    });
    console.log(`Mensagem criptografada para ${destinatario.name}: `, encrypetdMsg.toString('base64'));
  }
  
  versoesMsgCriptografada.forEach(({dest, msgCript}) => {
    console.log(`Mensagem para ${dest}: ${msgCript}`);
  });
  
  console.log("\x1b[33mTeste111\x1b[0m");

  const msgsCriptografadas = [];
  for(const destinatario of destinatarios) {
    const destinatarioID = destinatario._id;
    const destinatarioPublicKeyPem = destinatario.publicKey;
    const encrypetdMsg = await encryptMsg(content, destinatarioPublicKeyPem);
    const dadosMsgCriptografada = {
      sender: sender._id,
      destinatario: destinatarioID,
      content: encrypetdMsg.toString('base64'),
      chat: chatId,
    };
    let msgCriptografada = await encryptedMessage.create(dadosMsgCriptografada);
    msgsCriptografadas.push(msgCriptografada);
  }
  
  console.log("\x1b[33mTeste122\x1b[0m");

  const dadosMsgCriptografadaRemetente = {
    sender: sender._id,
    content: msgCriptografadaRemetente.toString('base64'),
    chat: chatId,
  };
  
  console.log("\x1b[33mTeste1444\x1b[0m");
  let msgCriptografadaRemetenteFinal = await encryptedMessage.create(dadosMsgCriptografadaRemetente);

  console.log("\x1b[33mTeste2\x1b[0m");
  try{
    // Populate a mensagem do remetente
    mensagemCriptografadaRemetente = await encryptedMessage.findById(msgCriptografadaRemetenteFinal._id)
      .populate("sender", "name pic email")
      .populate("chat");

    mensagemCriptografadaRemetente = await User.populate(mensagemCriptografadaRemetente, {
      path: "chat.users",
      select: "name pic email",
    });

    // Populate as mensagens dos destinatários
    const msgCriptografadasPopuladas = await Promise.all(
      msgsCriptografadas.map(async (msg) => {
        let msgPopulada = await encryptedMessage.findById(msg._id)
          .populate("sender", "name pic email")
          .populate("chat");
        
        msgPopulada = await User.populate(msgPopulada, {
          path: "chat.users",
          select: "name pic email",
        });
        
        return msgPopulada;
      })
    );
    
    console.log("\x1b[33mTeste3654664\x1b[0m");
    await Chat.findByIdAndUpdate(chatId, { latestMessage: mensagemCriptografadaRemetente });
    
    console.log("\x1b[33mTeste366666\x1b[0m");
    
    // REMOVA o res.json anterior e envie apenas UMA resposta aqui
    res.json(mensagemCriptografadaRemetente);
    
    console.log("\x1b[33mTeste4\x1b[0m");

  } catch (error) {
    res.status(400);
    throw new Error(error.message);
  }
  console.log("\x1b[33mTeste3\x1b[0m");
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

const decryptMsg = (privateKeyPem, encryptedMessage) => {
  try {
    const privateKey = forge.pki.privateKeyFromPem(privateKeyPem);
    const decrypted = privateKey.decrypt(forge.util.decode64(encryptedMessage), 'RSA-OAEP');
    return forge.util.decodeUtf8(decrypted);
  } catch (error) {
    console.error("Error decrypting message: ", error);
    throw error;
  }
};


  

  // try {
  //   var message = await Message.create(newMessage);

  //   message = await message.populate("sender", "name pic").execPopulate();
  //   message = await message.populate("chat").execPopulate();
  //   message = await User.populate(message, {
  //     path: "chat.users",
  //     select: "name pic email",
  //   });

  //   await Chat.findByIdAndUpdate(req.body.chatId, { latestMessage: message });

  //   res.json(message);
  // } catch (error) {
  //   res.status(400);
  //   throw new Error(error.message);
  // }

module.exports = { allMessages, sendMessage };
