const mongoose = require("mongoose");
const User = require("./models/userModel");
const forge = require("node-forge");

const generateKeysForUsers = async () => {
  try {
    await mongoose.connect("mongodb+srv://usuario:usuario@cluster0.srjhj8s.mongodb.net/Cluster0", {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });

    console.log("✓ Conectado ao MongoDB");

    // Buscar todos os usuários
    const users = await User.find({});
    console.log(`\nEncontrados ${users.length} usuários`);

    console.log("\n⚠️ ATENÇÃO: As chaves privadas serão exibidas aqui.");
    console.log("Salve essas informações em um local seguro!\n");
    console.log("=".repeat(80));

    for (const user of users) {
      if (!user.publicKey || user.publicKey === '') {
        console.log(`\n\nUsuário: ${user.name} (${user.email})`);
        console.log("Gerando par de chaves...");

        // Gerar par de chaves
        const keypair = forge.pki.rsa.generateKeyPair({ bits: 2048 });
        const publicKeyPem = forge.pki.publicKeyToPem(keypair.publicKey);
        const privateKeyPem = forge.pki.privateKeyToPem(keypair.privateKey);

        // Atualizar usuário com chave pública
        user.publicKey = publicKeyPem;
        await user.save();

        console.log("✓ Chaves geradas com sucesso!");
        console.log("\n--- CHAVE PRIVADA (SALVE ISTO!) ---");
        console.log(`Nome do usuário: ${user.name}`);
        console.log(`Email: ${user.email}`);
        console.log(`\nChave Privada:\n${privateKeyPem}`);
        console.log("\n--- INSTRUÇÕES ---");
        console.log(`1. Faça login com o usuário: ${user.email}`);
        console.log(`2. Abra o Console (F12)`);
        console.log(`3. Execute o seguinte comando:`);
        console.log(`   localStorage.setItem('${user.name}_privateKey', \`${privateKeyPem}\`)`);
        console.log("=".repeat(80));
      } else {
        console.log(`\n✓ Usuário ${user.name} (${user.email}) já tem chave pública`);
      }
    }

    console.log("\n\n✓ Processo concluído!");
    process.exit(0);
  } catch (error) {
    console.error("❌ Erro:", error);
    process.exit(1);
  }
};

generateKeysForUsers();