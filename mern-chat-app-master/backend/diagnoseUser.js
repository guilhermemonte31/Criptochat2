const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

const diagnoseUser = async () => {
  try {
    await mongoose.connect(
      "mongodb+srv://usuario:usuario@cluster0.srjhj8s.mongodb.net/Cluster0",
      {
        useNewUrlParser: true,
        useUnifiedTopology: true,
      }
    );

    console.log("✓ Conectado ao MongoDB\n");

    // Liste todos os usuários
    const User = mongoose.connection.db.collection("users");
    const users = await User.find().toArray();

    console.log("=== TODOS OS USUÁRIOS NO BANCO ===\n");
    
    for (let i = 0; i < users.length; i++) {
      const user = users[i];
      console.log(`${i + 1}. Nome: ${user.name}`);
      console.log(`   Email: ${user.email}`);
      console.log(`   ID: ${user._id}`);
      console.log(`   Hash da senha (primeiros 20 chars): ${user.password.substring(0, 20)}...`);
      console.log(`   Comprimento do hash: ${user.password.length} caracteres`);
      
      // Testar com senhas comuns
      const testPasswords = ["123456", "password", "123456789", user.name];
      
      console.log(`   Testando senhas comuns:`);
      for (const testPass of testPasswords) {
        const isMatch = await bcrypt.compare(testPass, user.password);
        if (isMatch) {
          console.log(`   ✓ SENHA ENCONTRADA: "${testPass}"`);
        }
      }
      console.log();
    }

    console.log("\n=== AÇÕES RECOMENDADAS ===");
    console.log("1. Anote o email do usuário que você quer usar");
    console.log("2. Execute o script resetPassword.js para resetar a senha");
    console.log("3. Ou delete todos os usuários e crie novos\n");

    process.exit(0);
  } catch (error) {
    console.error("❌ Erro:", error);
    process.exit(1);
  }
};

diagnoseUser();