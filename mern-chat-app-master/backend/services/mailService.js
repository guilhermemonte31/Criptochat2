// services/mailService.js
const nodemailer = require("nodemailer");

const {
  SMTP_HOST,
  SMTP_PORT,
  SMTP_USER,
  SMTP_PASS,
  FROM_EMAIL,
  FRONTEND_URL,
  EMAIL_TOKEN_EXPIRE_HOURS = 24,
} = process.env;

if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) {
  console.warn(
    "\n⚠️ AVISO: Variáveis SMTP não configuradas (SMTP_HOST, SMTP_USER, SMTP_PASS).\n" +
    "   → Envio de e-mails está DESATIVADO até que sejam definidas.\n"
  );
}

const port = Number(SMTP_PORT) || 587;

const transporter = nodemailer.createTransport({
  host: SMTP_HOST,
  port,
  secure: port === 465, // secure automatically if port === 465
  auth: {
    user: SMTP_USER,
    pass: SMTP_PASS,
  },
  tls: {
    rejectUnauthorized: false, // evita erros de certificado em Mailtrap / dev
  },
  connectionTimeout: 10000, // 10s
});

/**
 * sendVerificationEmail
 */
async function sendVerificationEmail(user, token) {
  if (!SMTP_HOST) {
    console.error("❌ Tentativa de enviar e-mail, mas SMTP não está configurado.");
    return;
  }

  const baseUrl = FRONTEND_URL.replace(/\/$/, "");
  const verificationLink = `${baseUrl}/verify-email?token=${encodeURIComponent(
    token
  )}&id=${user._id}`;

  const html = `
    <p>Olá ${user.name || ""},</p>
    <p>Obrigado por se cadastrar. Para verificar sua conta, clique no link abaixo:</p>
    <p><a href="${verificationLink}">Verificar e-mail</a></p>
    <p>Ou copie e cole este link no navegador:</p>
    <p><code>${verificationLink}</code></p>
    <p>Este link expira em ${EMAIL_TOKEN_EXPIRE_HOURS} horas.</p>
    <p>Se você não solicitou isto, ignore.</p>
  `;

  const text = `
Olá ${user.name || ""},

Obrigado por se cadastrar. Para verificar sua conta, abra o link abaixo:

${verificationLink}

Este link expira em ${EMAIL_TOKEN_EXPIRE_HOURS} horas.

Se você não solicitou isto, ignore.
  `.trim();

  const mailOptions = {
    from: FROM_EMAIL,
    to: user.email,
    subject: "Verifique seu e-mail — Seu App",
    html,
    text,
  };

  const info = await transporter.sendMail(mailOptions);
  return info;
}

module.exports = { sendVerificationEmail };
