import twilio from 'twilio';

interface TwilioCredentials {
  accountSid: string;
  apiKey: string;
  apiKeySecret: string;
  authToken?: string;
  phoneNumber: string;
}

async function getCredentials(): Promise<TwilioCredentials> {
  const hostname = process.env.REPLIT_CONNECTORS_HOSTNAME;
  if (!hostname) {
    throw new Error('REPLIT_CONNECTORS_HOSTNAME not set');
  }

  const xReplitToken = process.env.REPL_IDENTITY
    ? 'repl ' + process.env.REPL_IDENTITY
    : process.env.WEB_REPL_RENEWAL
    ? 'depl ' + process.env.WEB_REPL_RENEWAL
    : null;

  if (!xReplitToken) {
    throw new Error('X-Replit-Token not found for repl/depl');
  }

  const response = await fetch(
    'https://' + hostname + '/api/v2/connection?include_secrets=true&connector_names=twilio',
    {
      headers: {
        'Accept': 'application/json',
        'X-Replit-Token': xReplitToken
      }
    }
  );

  if (!response.ok) {
    throw new Error(`Twilio connector fetch failed: ${response.status}`);
  }

  const data = await response.json();
  const conn = data.items?.[0];

  if (!conn?.settings?.account_sid) {
    throw new Error('Twilio not connected');
  }

  const s = conn.settings;
  return {
    accountSid: s.account_sid,
    apiKey: s.api_key,
    apiKeySecret: s.api_key_secret,
    authToken: s.auth_token,
    phoneNumber: s.phone_number
  };
}

export async function sendSMSViaTwilio(to: string, code: string): Promise<boolean> {
  try {
    const creds = await getCredentials();

    if (!creds.phoneNumber) {
      console.error("Twilio phone number not configured");
      return false;
    }

    const isValidApiKey = creds.apiKey && creds.apiKey.startsWith('SK');
    const client = isValidApiKey && creds.apiKeySecret
      ? twilio(creds.apiKey, creds.apiKeySecret, { accountSid: creds.accountSid })
      : twilio(creds.accountSid, creds.authToken || creds.apiKeySecret || creds.apiKey);

    await client.messages.create({
      body: `Your Tabibi verification code is: ${code}. Valid for 5 minutes.`,
      from: creds.phoneNumber,
      to,
    });

    console.log(`Twilio SMS sent to ${to}`);
    return true;
  } catch (err: unknown) {
    console.error("Twilio SMS error:", err instanceof Error ? err.message : "Unknown");
    return false;
  }
}
