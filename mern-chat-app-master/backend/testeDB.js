const mongoose = require("mongoose");

const testConnection = async () => {
  try {
    await mongoose.connect("mongodb+srv://usuario:usuario@cluster0.srjhj8s.mongodb.net/Cluster0", {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });

    console.log("✓ Conectado ao MongoDB");

    // Listar todas as collections
    const collections = await mongoose.connection.db.listCollections().toArray();
    console.log("\nCollections disponíveis:");
    collections.forEach(c => console.log(`  - ${c.name}`));

    // Verificar mensagens
    const EncryptedMessage = mongoose.connection.db.collection("encryptedmessages");
    const count = await EncryptedMessage.countDocuments();
    console.log(`\nTotal de mensagens criptografadas: ${count}`);

    if (count > 0) {
      const messages = await EncryptedMessage.find().limit(5).toArray();
      console.log("\nÚltimas 5 mensagens:");
      messages.forEach((msg, i) => {
        console.log(`\nMensagem ${i + 1}:`);
        console.log(`  ID: ${msg._id}`);
        console.log(`  Sender: ${msg.sender}`);
        console.log(`  Destinatario: ${msg.destinatario || 'nenhum'}`);
        console.log(`  Chat: ${msg.chat}`);
        console.log(`  Content (50 chars): ${msg.content.substring(0, 50)}`);
        console.log(`  CreatedAt: ${msg.createdAt}`);
      });
    }

    process.exit(0);
  } catch (error) {
    console.error("❌ Erro:", error);
    process.exit(1);
  }
};

testConnection();