const mongoose = require("mongoose");

const viewDatabase = async () => {
  try {
    await mongoose.connect("mongodb+srv://usuario:usuario@cluster0.srjhj8s.mongodb.net/Cluster0", {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });

    console.log("✓ Conectado ao MongoDB\n");

    // Ver usuários
    const users = await mongoose.connection.db.collection("users").find().toArray();
    console.log("=== USUÁRIOS ===");
    console.log(`Total: ${users.length}\n`);
    users.forEach((user, i) => {
      console.log(`${i + 1}. ${user.name} (${user.email})`);
      console.log(`   ID: ${user._id}`);
      console.log(`   Tem chave pública: ${user.publicKey ? 'Sim' : 'Não'}`);
      console.log();
    });

    // Ver chats
    const chats = await mongoose.connection.db.collection("chats").find().toArray();
    console.log("\n=== CHATS ===");
    console.log(`Total: ${chats.length}\n`);
    chats.forEach((chat, i) => {
      console.log(`${i + 1}. ${chat.chatName || 'Chat sem nome'}`);
      console.log(`   ID: ${chat._id}`);
      console.log(`   Usuários: ${chat.users.length}`);
      console.log(`   Grupo: ${chat.isGroupChat ? 'Sim' : 'Não'}`);
      console.log();
    });

    // Ver mensagens
    const messages = await mongoose.connection.db.collection("encryptedmessages").find().toArray();
    console.log("\n=== MENSAGENS ===");
    console.log(`Total: ${messages.length}\n`);
    
    if (messages.length > 0) {
      console.log("Últimas 10 mensagens:");
      messages.slice(-10).forEach((msg, i) => {
        console.log(`\n${i + 1}. Mensagem ID: ${msg._id}`);
        console.log(`   Sender: ${msg.sender}`);
        console.log(`   Destinatário: ${msg.destinatario || 'Nenhum (próprio remetente)'}`);
        console.log(`   Chat: ${msg.chat}`);
        console.log(`   Conteúdo (50 chars): ${msg.content.substring(0, 50)}...`);
        console.log(`   Data: ${msg.createdAt}`);
      });
    } else {
      console.log("Nenhuma mensagem encontrada.");
    }

    process.exit(0);
  } catch (error) {
    console.error("❌ Erro:", error);
    process.exit(1);
  }
};

viewDatabase();