/**
 * ============================================================================
 * SCRIPT PARA CRIAR ÍNDICES NO MONGODB
 * ============================================================================
 *
 * Execução:
 * node createIndexes.js
 */

const mongoose = require("mongoose");
const connectDB = require("./config/db");
const MessageSequence = require("./models/messageSequenceModel");
const Message = require("./models/messageModel");
const Chat = require("./models/chatModel");
const User = require("./models/userModel");

const createIndexes = async () => {
  try {
    console.log("🔗 Conectando ao MongoDB...");
    await connectDB();

    console.log("\n📊 Criando índices...\n");

    // MessageSequence - Índice único em (chat, sender)
    console.log("1️⃣  MessageSequence - Índice único (chat, sender)");
    await MessageSequence.collection.createIndex(
      { chat: 1, sender: 1 },
      { unique: true }
    );
    console.log("   ✅ Criado com sucesso\n");

    // MessageSequence - Índices auxiliares
    console.log("2️⃣  MessageSequence - Índices auxiliares");
    await MessageSequence.collection.createIndex({ chat: 1 });
    await MessageSequence.collection.createIndex({ sender: 1 });
    await MessageSequence.collection.createIndex({ lastUpdate: 1 });
    console.log("   ✅ Criados com sucesso\n");

    // Message - Índices
    console.log("3️⃣  Message - Índices");
    await Message.collection.createIndex({ chat: 1 });
    await Message.collection.createIndex({ sender: 1 });
    await Message.collection.createIndex({ createdAt: 1 });
    console.log("   ✅ Criados com sucesso\n");

    // Chat - Índices
    console.log("4️⃣  Chat - Índices");
    await Chat.collection.createIndex({ users: 1 });
    await Chat.collection.createIndex({ updatedAt: 1 });
    console.log("   ✅ Criados com sucesso\n");

    // User - Índices
    console.log("5️⃣  User - Índices");
    await User.collection.createIndex({ email: 1 }, { unique: true });
    console.log("   ✅ Criados com sucesso\n");

    console.log("🎉 Todos os índices foram criados com sucesso!");

    // Lista os índices criados
    console.log("\n📋 Índices no MongoDB:\n");
    const indexes = await MessageSequence.collection.getIndexes();
    console.log("MessageSequence indexes:", Object.keys(indexes));

    process.exit(0);
  } catch (error) {
    console.error("❌ Erro ao criar índices:", error.message);
    process.exit(1);
  }
};

createIndexes();
