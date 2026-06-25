const nodemailer = require("nodemailer");

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function isEmailConfigured() {
  return (
    process.env.SMTP_HOST &&
    process.env.SMTP_USER &&
    process.env.SMTP_PASS &&
    process.env.FROM_EMAIL
  );
}

function createTransporter() {
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),

    // For Office 365 port 587, secure must be false.
    // STARTTLS will happen after SMTP greeting.
    secure: false,

    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS
    },

    // Force IPv4. Sometimes Node/Nodemailer may try IPv6 and timeout.
    family: 4,

    // Office 365 supports STARTTLS on port 587.
    requireTLS: true,

    connectionTimeout: 60000,
    greetingTimeout: 60000,
    socketTimeout: 90000,

    tls: {
      minVersion: "TLSv1.2",
      servername: process.env.SMTP_HOST
    },

    logger: true,
    debug: true
  });
}
function getBaseUrl() {
  return process.env.APP_BASE_URL || "http://localhost:4000";
}

async function sendAdminSignupApprovalEmail({
  username,
  email,
  signupTime,
  approveLink,
  rejectLink
}) {
  if (!isEmailConfigured() || !process.env.ADMIN_EMAIL) {
    console.log("Admin signup email not sent. SMTP or ADMIN_EMAIL missing.");
    return;
  }

  const transporter = createTransporter();

  const safeUsername = escapeHtml(username);
  const safeEmail = escapeHtml(email);
  const safeSignupTime = escapeHtml(signupTime);

  await transporter.sendMail({
    from: process.env.FROM_EMAIL,
    to: process.env.ADMIN_EMAIL,
    subject: "HIL Farm - New User Signup Approval Required",
    html: `
      <div style="font-family: Arial, sans-serif; line-height: 1.6;">
        <h2>HIL Farm - New User Signup Approval Required</h2>

        <p>A new user has signed up and is waiting for admin approval.</p>

        <table style="border-collapse: collapse; width: 100%; max-width: 650px;">
          <tr>
            <td style="border: 1px solid #ddd; padding: 8px;"><strong>Username</strong></td>
            <td style="border: 1px solid #ddd; padding: 8px;">${safeUsername}</td>
          </tr>
          <tr>
            <td style="border: 1px solid #ddd; padding: 8px;"><strong>Email</strong></td>
            <td style="border: 1px solid #ddd; padding: 8px;">${safeEmail}</td>
          </tr>
          <tr>
            <td style="border: 1px solid #ddd; padding: 8px;"><strong>Signup Time</strong></td>
            <td style="border: 1px solid #ddd; padding: 8px;">${safeSignupTime}</td>
          </tr>
        </table>

        <p style="margin-top: 20px;">
          <a href="${approveLink}"
             style="display:inline-block;background:#16a34a;color:white;padding:10px 16px;text-decoration:none;border-radius:8px;margin-right:10px;">
             Approve User
          </a>

          <a href="${rejectLink}"
             style="display:inline-block;background:#ef4444;color:white;padding:10px 16px;text-decoration:none;border-radius:8px;">
             Reject User
          </a>
        </p>

        <p style="font-size: 13px; color: #666;">
          These links are single-use and expire in 24 hours.
        </p>
      </div>
    `
  });

  console.log(`Admin signup approval email sent to ${process.env.ADMIN_EMAIL}`);
}

async function sendUserApprovalEmail(user) {
  if (!isEmailConfigured()) {
    console.log("User approval email not sent. SMTP configuration missing.");
    return;
  }

  const transporter = createTransporter();
  const loginUrl = `${getBaseUrl()}/login.html`;

  const safeUsername = escapeHtml(user.username);
  const safeEmail = escapeHtml(user.email);

  await transporter.sendMail({
    from: process.env.FROM_EMAIL,
    to: user.email,
    subject: "HIL Farm Access Approved",
    html: `
      <div style="font-family: Arial, sans-serif; line-height: 1.6;">
        <h2>HIL Farm Access Approved</h2>

        <p>Hello <strong>${safeUsername}</strong>,</p>

        <p>Your HIL Farm access request has been approved by the admin.</p>

        <p>You can now login using the link below:</p>

        <p>
          <a href="${loginUrl}"
             style="display:inline-block;background:#1f3c88;color:white;padding:10px 16px;text-decoration:none;border-radius:8px;">
             Login to HIL Farm
          </a>
        </p>

        <p><strong>Username:</strong> ${safeUsername}</p>
        <p><strong>Email:</strong> ${safeEmail}</p>

        <p>Regards,<br/>HIL Farm Team</p>
      </div>
    `
  });

  console.log(`Approval email sent to ${user.email}`);
}

async function sendUserRejectionEmail(user) {
  if (!isEmailConfigured()) {
    console.log("User rejection email not sent. SMTP configuration missing.");
    return;
  }

  const transporter = createTransporter();

  const safeUsername = escapeHtml(user.username);
  const safeEmail = escapeHtml(user.email);

  await transporter.sendMail({
    from: process.env.FROM_EMAIL,
    to: user.email,
    subject: "HIL Farm Access Request Rejected",
    html: `
      <div style="font-family: Arial, sans-serif; line-height: 1.6;">
        <h2>HIL Farm Access Request Rejected</h2>

        <p>Hello <strong>${safeUsername}</strong>,</p>

        <p>Your HIL Farm access request has been rejected by the admin.</p>

        <p>Please contact the HIL Farm admin/team for more details.</p>

        <p><strong>Username:</strong> ${safeUsername}</p>
        <p><strong>Email:</strong> ${safeEmail}</p>

        <p>Regards,<br/>HIL Farm Team</p>
      </div>
    `
  });

  console.log(`Rejection email sent to ${user.email}`);
}

module.exports = {
  sendAdminSignupApprovalEmail,
  sendUserApprovalEmail,
  sendUserRejectionEmail
};