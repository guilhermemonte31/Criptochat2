require('dotenv').config();

const asyncHandler = require("express-async-handler");
const User = require("../models/userModel");
const generateToken = require("../config/generateToken");
const forge = require("node-forge");
const Chat = require("../models/chatModel");
const { Message, encryptedMessage } = require("../models/messageModel");
const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.EMAIL_TRANSPORTER,
        pass: process.env.PASS_TRANSPORTER
    },
    tls: {
        rejectUnauthorized: false
    }
});

//@description     Get or Search all users
//@route           GET /api/user?search=
//@access          Public
const allUsers = asyncHandler(async (req, res) => {
  const keyword = req.query.search
    ? {
        $or: [
          { name: { $regex: req.query.search, $options: "i" } },
          { email: { $regex: req.query.search, $options: "i" } },
        ],
      }
    : {};

  const users = await User.find(keyword).find({ _id: { $ne: req.user._id } });
  res.send(users);
});

//@description     Register new user
//@route           POST /api/user/
//@access          Public
const registerUser = asyncHandler(async (req, res) => {
  const { name, email, password, pic, publicKey } = req.body;

  if (!name || !email || !password) {
    res.status(400);
    throw new Error("Please Enter all the Feilds");
  }

  const userExists = await User.findOne({ email });

  if (userExists) {
    res.status(400);
    throw new Error("User already exists");
  }

  const user = await User.create({
    name,
    email,
    password,
    pic,
    publicKey,
  });

  if (user) {
    res.status(201).json({
      _id: user._id,
      name: user.name,
      email: user.email,
      password: user.password,
      publicKey: user.publicKey,
      isAdmin: user.isAdmin,
      pic: user.pic,
      token: generateToken(user._id),
    });
  } else {
    res.status(400);
    throw new Error("User not found");
  }
});

const updatePublicKey = asyncHandler(async (req, res) => {
  const userId = req.user._id;
  const { newPublicKey } = req.body;

  console.log("[DEBUG] Rota de rotação de chaves acessada ", userId, newPublicKey);

  const user = await User.findById(userId);
  if (user) {
    user.publicKey = newPublicKey;
    await user.save();
    res.json({ message: "Chave pública atualizada com sucesso" });
  } else {
    res.status(404);
    throw new Error("Usuário não encontrado");
  }
});

//@description     Auth the user
//@route           POST /api/users/login
//@access          Public
const authUser = asyncHandler(async (req, res) => {
  const { email, password } = req.body;

  const user = await User.findOne({ email });

  if (user && (await user.matchPassword(password))) {
    res.json({
      _id: user._id,
      name: user.name,
      email: user.email,
      password: user.password,
      publicKey: user.publicKey,
      isAdmin: user.isAdmin,
      pic: user.pic,
      token: generateToken(user._id),
    });
  } else {
    res.status(401);
    throw new Error("Invalid Email or Password");
  }
});

//@description     Get user profile
//@route           GET /api/user/profile
//@access          Protected
const getUserProfile = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user._id);

  if (user) {
    res.json({
      _id: user._id,
      name: user.name,
      email: user.email,
      password: user.password,
      publicKey: user.publicKey,
      pic: user.pic,
      isAdmin: user.isAdmin,
    });
  } else {
    res.status(404);
    throw new Error("User Not Found");
  }
});

//@description     Update user profile
//@route           PUT /api/user/profile
//@access          Protected
const updateUserProfile = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user._id);

  if (user) {
    user.name = req.body.name || user.name;
    user.email = req.body.email || user.email;
    user.pic = req.body.pic || user.pic;

    // IMPORTANTE: Só atualizar a senha se ela foi realmente enviada
    if (req.body.password && req.body.password.trim() !== "") {
      user.password = req.body.password;
    }

    const updatedUser = await user.save();

    res.json({
      _id: updatedUser._id,
      name: updatedUser.name,
      email: updatedUser.email,
      pic: updatedUser.pic,
      isAdmin: updatedUser.isAdmin,
      token: generateToken(updatedUser._id),
    });
  } else {
    res.status(404);
    throw new Error("User Not Found");
  }
});

//@description     Delete user profile
//@route           DELETE /api/user/profile
//@access          Protected
const deleteUserProfile = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user._id);

  if (user) {
    // Remover usuário de todos os chats
    await Chat.updateMany({ users: user._id }, { $pull: { users: user._id } });

    // Deletar chats onde o usuário é o único membro ou é admin de grupo
    await Chat.deleteMany({
      $or: [{ users: { $size: 0 } }, { groupAdmin: user._id }],
    });

    // Deletar todas as mensagens do usuário
    await Message.deleteMany({ sender: user._id });
    await encryptedMessage.deleteMany({ sender: user._id });
    await encryptedMessage.deleteMany({ destinatario: user._id });

    // Deletar o usuário
    await user.deleteOne();

    res.json({ message: "User removed successfully" });
  } else {
    res.status(404);
    throw new Error("User Not Found");
  }
});

/**
 * @desc Gera OTP, salva no BD e envia para o email do usuário
 * @route POST /api/user/checkemail
 * @access Public
 */
const sendVerificationOtp = async (req, res) => {
    const { email, otpcode } = req.body;
    console.log("Otp code: ", otpcode);

    if (!email) {
        return res.status(400).json({ message: "Email is required." });
    }

    try {
        const user = await User.findOne({ email });
        
        if (user) {
            return res.status(409).json({ message: "User with this email already exists." });
        }
        
        const mailOptions = {
            from: process.env.EMAIL_TRANSPORTER,
            to: email,
            subject: 'Código de verificação de email: CriptoChat 2.0',
            html: `
                <h2>Código de Verificação</h2>
                <p>Use o código abaixo para confirmar seu login:</p>
                <h1 style="color: #4CAF50;">${otpcode}</h1>
                <p></p>
                <p>São Paulo Futebol Clube</p>
            `,
        };

        await transporter.sendMail(mailOptions);
        
        res.status(200).json({ 
            message: 'Verification code sent to email.', 
            //otpcode: otpcode 
        });

    } catch (error) {
        console.error("Error sending OTP:", error);
        res.status(500).json({ message: 'Failed to send verification code.' });
    }
};

module.exports = {
  allUsers,
  registerUser,
  authUser,
  updatePublicKey,
  getUserProfile,
  updateUserProfile,
  deleteUserProfile,
  sendVerificationOtp,
};