const asyncHandler = require("express-async-handler");
const Chat = require("../models/chatModel");
const User = require("../models/userModel");

/*
=======================================================
🟢 accessChat()
Cria ou busca um chat individual entre dois usuários.
Também envia as chaves públicas para que o front possa
criptografar as mensagens (E2EE - ponta a ponta).
=======================================================
*/
const accessChat = asyncHandler(async (req, res) => {
  const { userId } = req.body;

  if (!userId) {
    console.log("⚠️ UserId param not sent with request");
    return res.sendStatus(400);
  }

  console.log(`Buscando chat entre ${req.user._id} e ${userId}`);

  let isChat = await Chat.find({
    isGroupChat: false,
    $and: [
      { users: { $elemMatch: { $eq: req.user._id } } },
      { users: { $elemMatch: { $eq: userId } } },
    ],
  })
    .populate("users", "-password -privateKey") // evita expor chave privada
    .populate("latestMessage");

  isChat = await User.populate(isChat, {
    path: "latestMessage.sender",
    select: "name pic email",
  });

  if (isChat.length > 0) {
    console.log("✅ Chat encontrado, retornando com chaves públicas");
    return res.send(isChat[0]);
  } else {
    console.log("Nenhum chat encontrado, criando novo...");

    const chatData = {
      chatName: "sender",
      isGroupChat: false,
      users: [req.user._id, userId],
    };

    try {
      const createdChat = await Chat.create(chatData);
      const fullChat = await Chat.findOne({ _id: createdChat._id }).populate(
        "users",
        "-password -privateKey"
      );

      console.log("✅ Novo chat criado e retornado com chaves públicas");
      res.status(200).json(fullChat);
    } catch (error) {
      console.error("❌ Erro ao criar chat:", error.message);
      res.status(400);
      throw new Error(error.message);
    }
  }
});

/*
=======================================================
🟢 fetchChats()
Lista todos os chats do usuário atual.
Inclui as chaves públicas dos participantes para o front
saber como cifrar as mensagens.
=======================================================
*/
const fetchChats = asyncHandler(async (req, res) => {
  try {
    console.log(`Buscando todos os chats de ${req.user._id}`);

    const results = await Chat.find({
      users: { $elemMatch: { $eq: req.user._id } },
    })
      .populate("users", "-password -privateKey") // só chave pública
      .populate("groupAdmin", "-password -privateKey")
      .populate("latestMessage")
      .sort({ updatedAt: -1 });

    const populatedResults = await User.populate(results, {
      path: "latestMessage.sender",
      select: "name pic email",
    });

    console.log("✅ Chats retornados com chaves públicas");
    res.status(200).send(populatedResults);
  } catch (error) {
    console.error("❌ Erro ao buscar chats:", error.message);
    res.status(400);
    throw new Error(error.message);
  }
});

/*
=======================================================
🟢 createGroupChat()
Cria um grupo e envia as chaves públicas dos membros.
=======================================================
*/
const createGroupChat = asyncHandler(async (req, res) => {
  if (!req.body.users || !req.body.name) {
    return res.status(400).send({ message: "Please fill all fields" });
  }

  const users = JSON.parse(req.body.users);

  if (users.length < 2) {
    return res
      .status(400)
      .send("More than 2 users are required to form a group chat");
  }

  users.push(req.user);

  try {
    console.log(`Criando grupo: ${req.body.name}`);
    const groupChat = await Chat.create({
      chatName: req.body.name,
      users: users,
      isGroupChat: true,
      groupAdmin: req.user,
    });

    const fullGroupChat = await Chat.findOne({ _id: groupChat._id })
      .populate("users", "-password -privateKey")
      .populate("groupAdmin", "-password -privateKey");

    console.log("✅ Grupo criado com chaves públicas incluídas");
    res.status(200).json(fullGroupChat);
  } catch (error) {
    console.error("❌ Erro ao criar grupo:", error.message);
    res.status(400);
    throw new Error(error.message);
  }
});

/*
=======================================================
Funções auxiliares de grupo (rename, add, remove)
Sem mudanças relevantes para criptografia.
=======================================================
*/
const renameGroup = asyncHandler(async (req, res) => {
  const { chatId, chatName } = req.body;
  const updatedChat = await Chat.findByIdAndUpdate(
    chatId,
    { chatName },
    { new: true }
  )
    .populate("users", "-password -privateKey")
    .populate("groupAdmin", "-password -privateKey");

  if (!updatedChat) {
    res.status(404);
    throw new Error("Chat Not Found");
  } else res.json(updatedChat);
});

const removeFromGroup = asyncHandler(async (req, res) => {
  const { chatId, userId } = req.body;
  const removed = await Chat.findByIdAndUpdate(
    chatId,
    { $pull: { users: userId } },
    { new: true }
  )
    .populate("users", "-password -privateKey")
    .populate("groupAdmin", "-password -privateKey");

  if (!removed) {
    res.status(404);
    throw new Error("Chat Not Found");
  } else res.json(removed);
});

const addToGroup = asyncHandler(async (req, res) => {
  const { chatId, userId } = req.body;
  const added = await Chat.findByIdAndUpdate(
    chatId,
    { $push: { users: userId } },
    { new: true }
  )
    .populate("users", "-password -privateKey")
    .populate("groupAdmin", "-password -privateKey");

  if (!added) {
    res.status(404);
    throw new Error("Chat Not Found");
  } else res.json(added);
});

//@description     Fetch a single chat by ID
//@route           GET /api/chat/:chatId
//@access          Protected
const getChatById = asyncHandler(async (req, res) => {
  const chatId = req.params.chatId;
  console.log(`🔍 Solicitada busca do chat com ID: ${chatId}`);

  try {
    const chat = await Chat.findById(chatId)
      .populate("users", "-password -privateKey")
      .populate("groupAdmin", "-password -privateKey")
      .populate("latestMessage");

    if (!chat) {
      console.log("⚠️ Chat não encontrado para o ID informado.");
      return res.status(404).json({ message: "Chat não encontrado" });
    }

    console.log("✅ Chat encontrado e retornado com chaves públicas.");
    res.status(200).json(chat);
  } catch (error) {
    console.error("❌ Erro ao buscar chat:", error.message);
    res.status(500).json({ message: "Erro interno ao buscar chat" });
  }
});

module.exports = {
  accessChat,
  fetchChats,
  createGroupChat,
  renameGroup,
  addToGroup,
  removeFromGroup,
  getChatById,
};
