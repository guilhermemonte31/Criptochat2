const mongoose = require("mongoose");
const colors = require("colors");

const connectDB = async () => {
  try {
    const conn = await mongoose.connect(
      "mongodb+srv://usuario:usuario@cluster0.srjhj8s.mongodb.net/Cluster0",
      {
        useNewUrlParser: true,
        useUnifiedTopology: true,
        // Adicionar estas opções para UTF-8
        bufferCommands: false,
        bufferMaxEntries: 0,
      }
    );

    console.log(`MongoDB Connected: ${conn.connection.host}`.cyan.underline);
  } catch (error) {
    console.error(`Error: ${error.message}`.red.bold);
    process.exit(1);
  }
};

module.exports = connectDB;
