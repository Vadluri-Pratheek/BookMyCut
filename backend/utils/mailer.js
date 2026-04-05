const nodemailer = require('nodemailer');

let transporter = null;

const hasMailConfig = () =>
  Boolean(process.env.MAIL_HOST && process.env.MAIL_PORT && process.env.MAIL_USER && process.env.MAIL_PASS);

const getMailFrom = () => process.env.MAIL_FROM || process.env.MAIL_USER || 'BookMyCut <no-reply@bookmycut.local>';

const getTransporter = () => {
  if (!hasMailConfig()) {
    return null;
  }

  if (!transporter) {
    const port = Number(process.env.MAIL_PORT || 587);
    const secure =
      process.env.MAIL_SECURE === 'true'
      || (process.env.MAIL_SECURE == null && port === 465);

    transporter = nodemailer.createTransport({
      host: process.env.MAIL_HOST,
      port,
      secure,
      auth: {
        user: process.env.MAIL_USER,
        pass: process.env.MAIL_PASS,
      },
    });
  }

  return transporter;
};

const logPreview = ({ to, subject, text }) => {
  console.info(
    [
      '[mail-preview] MAIL_* variables are not configured, so the email was not sent.',
      `To: ${to}`,
      `Subject: ${subject}`,
      '',
      text,
    ].join('\n')
  );
};

const sendEmail = async ({ to, subject, text, html }) => {
  if (!to) {
    return { skipped: true, reason: 'missing-recipient' };
  }

  const activeTransporter = getTransporter();

  if (!activeTransporter) {
    logPreview({ to, subject, text: text || '' });
    return { preview: true };
  }

  return activeTransporter.sendMail({
    from: getMailFrom(),
    to,
    subject,
    text,
    html,
  });
};

module.exports = {
  hasMailConfig,
  getMailFrom,
  sendEmail,
};
