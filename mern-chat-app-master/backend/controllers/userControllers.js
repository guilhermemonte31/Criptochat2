const asyncHandler = require("express-async-handler");
const User = require("../models/userModel");
const generateToken = require("../config/generateToken");
const forge = require("node-forge");
const Chat = require("../models/chatModel");
const { Message, encryptedMessage } = require("../models/messageModel");
const nodemailer = require('nodemailer');
const crypto = require("crypto");

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
      isAdmin: user.isAdmin,
      pic: user.pic,
      token: generateToken(user._id),
    });
  } else {
    res.status(400);
    throw new Error("User not found");
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

const updateEncryptedPrivateKey = asyncHandler(async (req, res) => {
  const userId = req.user._id;
  const {
    encryptedPrivateKey,
    encryptedPrivateKeyIV,
    encryptedPrivateKeySalt,
  } = req.body;

  const user = await User.findById(userId);

  if (!user) {
    res.status(404);
    throw new Error("User not found");
  }

  user.encryptedPrivateKey = encryptedPrivateKey;
  user.encryptedPrivateKeyIV = encryptedPrivateKeyIV;
  user.encryptedPrivateKeySalt = encryptedPrivateKeySalt;

  await user.save();

  res.json({ message: "Private key updated successfully" });
});

/**
 * @desc Gera token de reset e envia e-mail
 * @route POST /api/user/request-password-reset
 * @access Public
 */
const requestPasswordReset = asyncHandler(async (req, res) => {
  const { email } = req.body;
  if (!email) {
    return res.status(400).json({ message: "E-mail é obrigatório." });
  }

  const user = await User.findOne({ email });
  if (!user) {
    // Não revela que o e-mail não existe
    return res
      .status(200)
      .json({ message: "Se o email existir, enviaremos as instruções." });
  }

  // Gera token de 32 bytes
  const resetToken = crypto.randomBytes(32).toString("hex");

  // Salva hash do token e data de expiração (1h)
  user.resetPasswordToken = crypto
    .createHash("sha256")
    .update(resetToken)
    .digest("hex");

  user.resetPasswordExpires = Date.now() + 3600000; // 1 hora

  await user.save();

  const resetURL = `${process.env.FRONTEND_URL}/reset-password/${resetToken}`;

  console.log("RESET URL:", resetURL);

  const mailOptions = {
    from: process.env.EMAIL_TRANSPORTER,
    to: email,
    subject: "CriptoChat 2.0 — Recuperação de senha",
    html: `
      <h2>Redefinição de Senha</h2>
      <p>Clique no link abaixo para redefinir sua senha:</p>
      <p><a href="${resetURL}" target="_blank">${resetURL}</a></p>
      <p>Este link expira em 1 hora.</p>
    `,
  };

  try {
    await transporter.sendMail(mailOptions);
    res.json({ message: "E-mail enviado." });
  } catch (error) {
    user.resetPasswordToken = undefined;
    user.resetPasswordExpires = undefined;
    await user.save();

    console.error(error);
    res.status(500).json({ message: "Erro ao enviar e-mail." });
  }
});

/**
 * @desc Redefine senha, gera par RSA, recriptografa chave privada
 * @route POST /api/user/reset-password/:token
 * @access Public
 */
const resetPassword = asyncHandler(async (req, res) => {
  const { password } = req.body;
  const { token } = req.params;

  if (!password) {
    return res.status(400).json({ message: "Nova senha obrigatória." });
  }

  // Hash do token recebido
  const hashedToken = crypto.createHash("sha256").update(token).digest("hex");

  // Procura usuário por token válido
  const user = await User.findOne({
    resetPasswordToken: hashedToken,
    resetPasswordExpires: { $gt: Date.now() },
  });

  if (!user) {
    return res.status(400).json({ message: "Token inválido ou expirado." });
  }

  // 1️⃣ Atualiza senha
  user.password = password;

  // 2️⃣ Gera novo par RSA-OAEP compatível com WebCrypto (SPKI + PKCS8)
  const { publicKey, privateKey } = crypto.generateKeyPairSync("rsa", {
    modulusLength: 2048,
    publicExponent: 0x10001,
    publicKeyEncoding: {
      type: "spki",
      format: "pem"
    },
    privateKeyEncoding: {
      type: "pkcs8",
      format: "der"
    }
  });

  const privateKeyDer = Buffer.from(privateKey); // PKCS8 DER (binary)
  const publicKeyPem = publicKey;

  // 3) Criptografar exatamente como signup (AES-GCM sobre bytes)
  const salt = crypto.randomBytes(16);
  const iv = crypto.randomBytes(12);

  const keyMaterial = crypto.pbkdf2Sync(password, salt, 100000, 32, "sha256");

  const cipher = crypto.createCipheriv("aes-256-gcm", keyMaterial, iv);
  const encryptedData = Buffer.concat([
    cipher.update(privateKeyDer),
    cipher.final()
  ]);

  const authTag = cipher.getAuthTag(); // 16 bytes

  // WebCrypto output = ciphertext || authTag
  const ciphertextWithTag = Buffer.concat([encryptedData, authTag]);

  // Base64 igual ao arrayBufferToBase64()
  const cipherB64 = ciphertextWithTag.toString("base64");
  const ivB64 = iv.toString("base64");
  const saltB64 = salt.toString("base64");

  // 4️⃣ Atualizar no banco
  user.publicKey = publicKeyPem;
  user.encryptedPrivateKey = cipherB64;
  user.encryptedPrivateKeyIV = ivB64;
  user.encryptedPrivateKeySalt = saltB64;

  // 5️⃣ Limpar token
  user.resetPasswordToken = undefined;
  user.resetPasswordExpires = undefined;

  await user.save();

  res.json({
    message: "Senha redefinida com sucesso. Gere login novamente.",
  });
});

module.exports = {
  allUsers,
  registerUser,
  authUser,
  getUserProfile,
  updateUserProfile,
  deleteUserProfile,
  sendVerificationOtp,
  updateEncryptedPrivateKey,
  requestPasswordReset,
  resetPassword,
};