require("dotenv").config();

const express = require("express");
const https = require("https");
const fs = require("fs");
const path = require("path");
const colors = require("colors");
const connectDB = require("./config/db");
const { Server } = require("socket.io");

// Rotas
const userRoutes = require("./routes/userRoutes");
const chatRoutes = require("./routes/chatRoutes");
const messageRoutes = require("./routes/messageRoutes");

connectDB();
const app = express();

// Configurações para UTF-8
app.use(express.json({ charset: 'utf8' }));
app.use(express.urlencoded({ extended: true, charset: 'utf8' }));

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
  require("child_process").execSync("node certs/generateCert.js", { stdio: "inherit" });
}

const options = {
  key: fs.readFileSync(keyFile),
  cert: fs.readFileSync(certFile),
};

// -------------------- Servidor --------------------
const HTTPS_PORT = process.env.PORT || 5000;

// 🔒 Servidor HTTPS principal
const httpsServer = https.createServer(options, app).listen(HTTPS_PORT, () => {
  console.log(`🚀 Servidor HTTPS rodando em https://localhost:${HTTPS_PORT}`.green.bold);
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
  console.log("Connected to socket.io");
  
  socket.on("setup", (userData) => {
    socket.join(userData._id);
    socket.emit("connected");
    console.log("Usuario conectado:", userData._id);
  });

  socket.on("join chat", (room) => {
    socket.join(room);
    console.log("Usuario entrou na sala:", room);
  });
  
  socket.on("typing", (room) => socket.in(room).emit("typing"));
  socket.on("stop typing", (room) => socket.in(room).emit("stop typing"));

  socket.on("new message", (data) => {
    const room = data.room || data;
    console.log("Nova mensagem recebida para sala:", room);
    
    // Emitir para todos na sala
    io.in(room).emit("refresh messages");
    console.log("Evento refresh messages emitido para sala:", room);
  });

  socket.off("setup", (userData) => {
    console.log("USER DISCONNECTED");
    if (userData && userData._id) {
      socket.leave(userData._id);
    }
  });
});
