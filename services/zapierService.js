async function postToZapier(webhookUrl, payload, label) {
  if (!webhookUrl) {
    console.log(`${label} not sent. Zapier webhook URL missing.`);
    return;
  }

  const finalPayload = {
    ...payload,
    secret: process.env.ZAPIER_SECRET || ""
  };

  const response = await fetch(webhookUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(finalPayload)
  });

  if (!response.ok) {
    const text = await response.text();

    throw new Error(
      `${label} failed. Status: ${response.status}. Response: ${text}`
    );
  }

  console.log(`${label} sent to Zapier successfully.`);
}

async function sendAdminLoginAttemptWebhook({
  username,
  email,
  status,
  loginTime,
  loginResult,
  approveLink,
  rejectLink
}) {
  if (process.env.EMAIL_MODE !== "zapier") {
    console.log("Zapier login email skipped. EMAIL_MODE is not zapier.");
    return;
  }

  await postToZapier(
    process.env.ZAPIER_LOGIN_WEBHOOK_URL,
    {
      eventType: "user_login_attempt",
      username,
      email,
      status,
      loginTime,
      loginResult,
      approveLink: approveLink || "",
      rejectLink: rejectLink || ""
    },
    "Admin login attempt webhook"
  );
}

module.exports = {
  sendAdminLoginAttemptWebhook
};