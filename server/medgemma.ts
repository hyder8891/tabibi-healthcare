import { GoogleAuth } from "google-auth-library";

const PROJECT_NUMBER = "897097421776";
const LOCATION = "europe-west4";
const ENDPOINT_ID = "mg-endpoint-85c58ff5-5aae-4b2e-a011-1b6480ee6a7e";

const PREDICT_URL = `https://${LOCATION}-aiplatform.googleapis.com/v1/projects/${PROJECT_NUMBER}/locations/${LOCATION}/endpoints/${ENDPOINT_ID}:predict`;

let authClient: GoogleAuth | null = null;

function getAuthClient(): GoogleAuth {
  if (authClient) return authClient;

  const serviceAccountJson = process.env.GOOGLE_CLOUD_SERVICE_ACCOUNT;
  if (!serviceAccountJson) {
    throw new Error("GOOGLE_CLOUD_SERVICE_ACCOUNT secret is not set");
  }

  const credentials = JSON.parse(serviceAccountJson);
  authClient = new GoogleAuth({
    credentials,
    scopes: ["https://www.googleapis.com/auth/cloud-platform"],
  });

  return authClient;
}

async function getAccessToken(): Promise<string> {
  const auth = getAuthClient();
  const client = await auth.getClient();
  const tokenResponse = await client.getAccessToken();
  if (!tokenResponse.token) {
    throw new Error("Failed to obtain access token for Vertex AI");
  }
  return tokenResponse.token;
}

export interface MedGemmaMessage {
  role: "system" | "user" | "assistant";
  content: string | Array<{type: string; text?: string; image_url?: {url: string}}>;
}

function formatContentForAPI(content: MedGemmaMessage["content"]): Array<{type: string; text?: string; image_url?: {url: string}}> {
  if (typeof content === "string") {
    return [{ type: "text", text: content }];
  }
  return content;
}

function buildRequestBody(messages: MedGemmaMessage[], maxTokens: number) {
  const formattedMessages = messages.map(m => ({
    role: m.role,
    content: formatContentForAPI(m.content),
  }));

  return {
    instances: [
      {
        "@requestFormat": "chatCompletions",
        messages: formattedMessages,
        max_tokens: maxTokens,
      },
    ],
  };
}

function extractResponseText(result: any): string {
  try {
    if (result.predictions && result.predictions.length > 0) {
      const prediction = result.predictions[0];
      if (prediction.choices && prediction.choices.length > 0) {
        return prediction.choices[0].message?.content || "";
      }
      if (typeof prediction === "string") {
        return prediction;
      }
      if (prediction.content) {
        return prediction.content;
      }
    }
    if (result.choices && result.choices.length > 0) {
      return result.choices[0].message?.content || "";
    }
    console.error("Unexpected MedGemma response structure:", JSON.stringify(result).substring(0, 500));
    return "";
  } catch (e) {
    console.error("Error extracting MedGemma response:", e);
    return "";
  }
}

export async function callMedGemma(
  messages: MedGemmaMessage[],
  options?: {
    temperature?: number;
    maxTokens?: number;
  }
): Promise<string> {
  const token = await getAccessToken();
  const body = buildRequestBody(messages, options?.maxTokens ?? 4096);

  const response = await fetch(PREDICT_URL, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error("MedGemma API error:", response.status, errorText.substring(0, 500));
    throw new Error(`MedGemma API error: ${response.status} - ${errorText.substring(0, 200)}`);
  }

  const result = await response.json();
  return extractResponseText(result);
}

export function buildImageContent(base64Data: string, mimeType: string, textPrompt: string): MedGemmaMessage["content"] {
  return [
    {
      type: "image_url",
      image_url: {
        url: `data:${mimeType};base64,${base64Data}`,
      },
    },
    {
      type: "text",
      text: textPrompt,
    },
  ];
}

export function isMedGemmaConfigured(): boolean {
  return !!process.env.GOOGLE_CLOUD_SERVICE_ACCOUNT;
}
