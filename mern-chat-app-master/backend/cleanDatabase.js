const mongoose = require("mongoose");

const cleanDatabase = async () => {
  try {
    await mongoose.connect("mongodb+srv://usuario:usuario@cluster0.srjhj8s.mongodb.net/Cluster0", {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });

    console.log("✓ Conectado ao MongoDB");

    // Limpar collections
    await mongoose.connection.db.collection("users").deleteMany({});
    await mongoose.connection.db.collection("chats").deleteMany({});
    await mongoose.connection.db.collection("encryptedmessages").deleteMany({});
    await mongoose.connection.db.collection("messages").deleteMany({});

    console.log("✓ Banco de dados limpo!");
    console.log("\nAgora você pode:");
    console.log("1. Recarregar a página");
    console.log("2. Fazer signup de novos usuários");
    console.log("3. As chaves serão geradas automaticamente");

    process.exit(0);
  } catch (error) {
    console.error("❌ Erro:", error);
    process.exit(1);
  }
};

cleanDatabase();