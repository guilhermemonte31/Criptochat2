const express = require("express");
const http = require("http");
const https = require("https");
const fs = require("fs");
const path = require("path");
const dotenv = require("dotenv");
const colors = require("colors");
const connectDB = require("./config/db");
const { Server } = require("socket.io");

// Rotas
const userRoutes = require("./routes/userRoutes");
const chatRoutes = require("./routes/chatRoutes");
const messageRoutes = require("./routes/messageRoutes");

dotenv.config();
connectDB();

const app = express();
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ limit: "10mb", extended: true }));

// -------------------- Rotas principais --------------------
app.use("/api/user", userRoutes);
app.use("/api/chat", chatRoutes);
app.use("/api/message", messageRoutes);

// -------------------- Caminhos e build --------------------
const __dirname1 = path.resolve(__dirname, "..");
const buildPath = path.join(__dirname1, "frontend", "build");

if (fs.existsSync(buildPath)) {
  app.use(express.static(buildPath));
  app.get("*", (req, res) =>
    res.sendFile(path.join(buildPath, "index.html"))
  );
} else {
  app.get("/", (req, res) => res.send("⚠️ Build do frontend não encontrado."));
}

// -------------------- Certificados HTTPS --------------------
const certPath = path.join(__dirname, "certs");
const keyFile = path.join(certPath, "key.pem");
const certFile = path.join(certPath, "cert.pem");

// Gera certificados automaticamente se não existirem
if (!fs.existsSync(keyFile) || !fs.existsSync(certFile)) {
  console.log("⚙️  Gerando certificados autoassinados...");
  require("child_process").execSync("node backend/certs/generateCert.js", { stdio: "inherit" });
}

const options = {
  key: fs.readFileSync(keyFile),
  cert: fs.readFileSync(certFile),
};

// -------------------- Servidores --------------------
const HTTPS_PORT = process.env.PORT || 5000;
const HTTP_PORT = 5001; // Porta auxiliar p/ LocalTunnel

// 🔒 Servidor HTTPS principal
const httpsServer = https.createServer(options, app).listen(HTTPS_PORT, () => {
  console.log(`🚀 Servidor HTTPS rodando em https://localhost:${HTTPS_PORT}`.green.bold);
});

// 🌍 Servidor HTTP auxiliar (LocalTunnel)
const httpServer = http.createServer(app).listen(HTTP_PORT, () => {
  console.log(`🌍 Servidor HTTP rodando em http://localhost:${HTTP_PORT}`.yellow.bold);
  console.log(`(Use esta porta no LocalTunnel)\n`);
});

// -------------------- Socket.IO --------------------
const io = new Server(httpsServer, {
  pingTimeout: 60000,
  cors: {
    origin: "*",
    credentials: true,
  },
});

app.set("io", io);

io.on("connection", (socket) => {
  console.log("🟢 Novo cliente conectado via Socket.IO");

  // Evento de configuração inicial
  socket.on("setup", (userData) => {
    socket.join(userData._id);
    socket.emit("connected");
  });

  // Entrar em uma sala específica (chat)
  socket.on("join chat", (room) => {
    socket.join(room);
    console.log(`👥 Usuário entrou na sala ${room}`);
  });

  // Digitando...
  socket.on("typing", (room) => socket.in(room).emit("typing"));
  socket.on("stop typing", (room) => socket.in(room).emit("stop typing"));

  // Nova mensagem enviada → atualizar os usuários do chat
  socket.on("new message", (data) => {
    console.log(`📨 Nova mensagem recebida no servidor (sala ${data.room})`);

    const chat = data.chat;
    if (!chat?.users) return console.warn("Chat sem lista de usuários.");

    chat.users.forEach((user) => {
      if (user._id === data.sender._id) return; // não reenviar ao remetente
      io.to(user._id).emit("message received", data); // envia diretamente para o destinatário
    });
  });

  socket.on("disconnect", () => console.log("🔴 Cliente desconectado"));
});