const express = require("express");
const connectDB = require("./config/db");
const userRoutes = require("./routes/userRoutes");
const chatRoutes = require("./routes/chatRoutes");
const messageRoutes = require("./routes/messageRoutes");
const { notFound, errorHandler } = require("./middleware/errorMiddleware");
const path = require("path");
const text = "production";

connectDB();
const app = express();

// Configurações para UTF-8
app.use(express.json({ charset: 'utf8' }));
app.use(express.urlencoded({ extended: true, charset: 'utf8' }));

// Definir charset nas respostas
app.use((req, res, next) => {
  res.charset = 'utf-8';
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  next();
});

//app.use(express.json()); // to accept json data

// app.get("/", (req, res) => {
//   res.send("API Running!");
// });

app.use("/api/user", userRoutes);
app.use("/api/chat", chatRoutes);
app.use("/api/message", messageRoutes);

// --------------------------deployment------------------------------

const __dirname1 = path.resolve();

if (text === "production") {
  app.use(express.static(path.join(__dirname1, "/frontend/build")));

  app.get("*", (req, res) =>
    res.sendFile(path.resolve(__dirname1, "frontend", "build", "index.html"))
  );
} else {
  app.get("/", (req, res) => {
    res.send("API is running..");
  });
}

// --------------------------deployment------------------------------

// Error Handling middlewares
app.use(notFound);
app.use(errorHandler);

const PORT = 5000;

const server = app.listen(
  PORT,
  console.log(`Server running on PORT ${PORT}...`.yellow.bold)
);

const io = require("socket.io")(server, {
  pingTimeout: 60000,
  cors: {
    origin: "http://localhost:3000",
    // credentials: true,
  },
});

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
