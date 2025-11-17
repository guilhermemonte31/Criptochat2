const asyncHandler = require("express-async-handler");
const User = require("../models/userModel");
const generateToken = require("../config/generateToken");
const forge = require("node-forge");
const Chat = require("../models/chatModel");
const { Message, encryptedMessage } = require("../models/messageModel");
const crypto = require("crypto");
const VerificationToken = require("../models/verificationModel");
const { sendVerificationEmail } = require("../services/mailService");

const TOKEN_EXPIRE_HOURS = Number(process.env.EMAIL_TOKEN_EXPIRE_HOURS) || 24;
const RESEND_COOLDOWN_MINUTES = Number(process.env.RESEND_COOLDOWN_MINUTES) || 5;

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

//@description     Register new user (creates account but requires email verification)
//@route           POST /api/user/
//@access          Public
const registerUser = asyncHandler(async (req, res) => {
  const { name, email, password, pic, publicKey } = req.body;

  if (!publicKey) {
    res.status(400);
    throw new Error("Chave pública RSA não enviada.");
  }

  if (!name || !email || !password) {
    res.status(400);
    throw new Error("Preencha todos os campos obrigatórios");
  }

  const normalizedEmail = email.toLowerCase().trim();

  const userExists = await User.findOne({ email: normalizedEmail });

  if (userExists) {
    // For privacy, you can respond with generic message — but since this is registration,
    // we return specific error as before.
    res.status(400);
    throw new Error("Usuário já existe");
  }

  // Create user with verified: false
  const user = await User.create({
    name,
    email: normalizedEmail,
    password,
    pic,
    publicKey,
    verified: false,
  });

  if (!user) {
    res.status(400);
    throw new Error("Usuário inválido");
  }

  // Generate verification token (plain) and store only hash
  const token = crypto.randomBytes(32).toString("hex"); // plain token to send via email
  const tokenHash = crypto.createHash("sha256").update(token).digest("hex");

  const expiresAt = new Date(Date.now() + TOKEN_EXPIRE_HOURS * 3600 * 1000);

  await VerificationToken.create({
    userId: user._id,
    tokenHash,
    type: "email",
    expiresAt,
  });

  // Send verification email (async); don't fail registration if email fails, but log
  try {
    await sendVerificationEmail(user, token);
  } catch (err) {
    // Consider retrying or alerting; for now log and continue
    console.error("Erro ao enviar e-mail de verificação: ", err);
  }

  // Respond with generic message (do not return JWT until user verifies)
  res.status(201).json({
    message: "Usuário registrado. Por favor, verifique seu e-mail para ativar a conta.",
    user: {
      _id: user._id,
      name: user.name,
      email: user.email,
      pic: user.pic,
    },
  });
});

//@description Verify email token
//@route       GET /api/user/verify-email?token=...&id=...
//@access      Public
const verifyEmail = asyncHandler(async (req, res) => {
  const { token, id } = req.query;
  if (!token || !id) {
    res.status(400);
    throw new Error("Link de verificação inválido");
  }

  const tokenHash = crypto.createHash("sha256").update(token).digest("hex");

  const record = await VerificationToken.findOne({ userId: id, tokenHash, type: "email", used: false });

  if (!record) {
    res.status(400);
    throw new Error("Token de verificação inválido ou já utilizado");
  }

  if (record.expiresAt < new Date()) {
    res.status(400);
    throw new Error("Token de verificação expirado");
  }

  // Mark user as verified
  const user = await User.findById(id);
  if (!user) {
    res.status(404);
    throw new Error("Usuário não encontrado");
  }

  user.verified = true;
  user.emailVerifiedAt = new Date();
  await user.save();

  // mark token as used (or delete)
  record.used = true;
  await record.save();

  // Optionally delete other tokens for this user
  await VerificationToken.deleteMany({ userId: id, type: "email", used: false });

  // Here you can redirect to frontend success page or return JSON
  // We'll return JSON
  res.json({ message: "E-mail verificado com sucesso. Agora você pode efetuar o login." });
});

//@description Resend verification email
//@route       POST /api/user/resend-verification
//@access      Public
const resendVerification = asyncHandler(async (req, res) => {
  const { email } = req.body;
  if (!email) {
    res.status(400);
    throw new Error("E-mail é obrigatório");
  }

  const normalizedEmail = email.toLowerCase().trim();
  const user = await User.findOne({ email: normalizedEmail });

  // For privacy, respond with generic message even if user not found
  if (!user) {
    return res.json({ message: "Se o e-mail existe, um link de verificação foi enviado." });
  }

  if (user.verified) {
    return res.status(400).json({ message: "Usuário já verificado." });
  }

  // Check cooldown: find last token created for this user
  const lastToken = await VerificationToken.findOne({ userId: user._id, type: "email" }).sort({ createdAt: -1 });

  if (lastToken) {
    const minutesSince = (Date.now() - new Date(lastToken.createdAt).getTime()) / (60 * 1000);
    if (minutesSince < RESEND_COOLDOWN_MINUTES) {
      return res.status(429).json({
        message: `Por favor, aguarde ${Math.ceil(RESEND_COOLDOWN_MINUTES - minutesSince)} minutos antes de solicitar um novo e-mail de verificação.`,
      });
    }
  }

  // Create new token and send
  const token = crypto.randomBytes(32).toString("hex");
  const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
  const expiresAt = new Date(Date.now() + TOKEN_EXPIRE_HOURS * 3600 * 1000);

  await VerificationToken.create({
    userId: user._id,
    tokenHash,
    type: "email",
    expiresAt,
  });

  try {
    await sendVerificationEmail(user, token);
  } catch (err) {
    console.error("Erro ao enviar e-mail de verificação: ", err);
  }

  return res.json({ message: "Se o e-mail existe, um link de verificação foi enviado." });
});

//@description     Auth the user
//@route           POST /api/user/login
//@access          Public
const authUser = asyncHandler(async (req, res) => {
  const { email, password } = req.body;

  const user = await User.findOne({ email });

  if (user && (await user.matchPassword(password))) {
    if (!user.verified) {
      res.status(403);
      throw new Error("E-mail não verificado. Verifique seu e-mail antes de efetuar o login.");
    }
    
    res.json({
      user: {
        _id: user._id,
        name: user.name,
        email: user.email,
        isAdmin: user.isAdmin,
        pic: user.pic,
        publicKey: user.publicKey,
      },
      token: generateToken(user._id),
    });

  } else {
    res.status(401);
    throw new Error("E-mail ou senha inválidos");
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
    throw new Error("Usuário não encontrado");
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
      user: {
        _id: user._id,
        name: user.name,
        email: user.email,
        pic: user.pic,
        isAdmin: user.isAdmin,
        publicKey: user.publicKey,
      },
      token: generateToken(user._id),
    });

  } else {
    res.status(404);
    throw new Error("Usuário não encontrado");
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

    res.json({ message: "Usuário removido com sucesso." });
  } else {
    res.status(404);
    throw new Error("Usuário não encontrado");
  }
});

module.exports = {
  allUsers,
  registerUser,
  authUser,
  getUserProfile,
  updateUserProfile,
  deleteUserProfile,
  verifyEmail,
  resendVerification,
};