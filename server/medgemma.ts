import { GoogleAuth } from "google-auth-library";

const PROJECT_NUMBER = "897097421776";
const LOCATION = "europe-west4";
const MODEL_ID = "medgemma-1.5-4b-it";

const PREDICT_URL = `https://europe-west4-aiplatform.googleapis.com/v1/projects/897097421776/locations/europe-west4/endpoints/mg-endpoint-4663c30d-2d44-4f75-910e-8e92fbc02145:predict`;

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

export async function callMedGemma(
  messages: MedGemmaMessage[],
  options?: {
    temperature?: number;
    maxTokens?: number;
  }
): Promise<string> {
  const token = await getAccessToken();

  const body = {
    instances: [{
      "@requestFormat": "chatCompletions",
      messages: messages.map(m => ({
        role: m.role,
        content: typeof m.content === "string"
          ? [{ type: "text", text: m.content }]
          : m.content,
      })),
      max_tokens: options?.maxTokens ?? 1024,
      temperature: options?.temperature ?? 0.4,
      top_p: 0.8,
    }],
  };

  console.log("[MedGemma] Request URL:", PREDICT_URL);
  console.log("[MedGemma] Messages count:", messages.length);
  console.log("[MedGemma] Roles:", messages.map(m => m.role).join(", "));

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
    console.error("[MedGemma] API error:", response.status, errorText.substring(0, 500));
    throw new Error(`MedGemma API error: ${response.status} - ${errorText.substring(0, 200)}`);
  }

  const result = await response.json();
  console.log("[MedGemma] Raw response:", JSON.stringify(result).substring(0, 500));

  let text = "";
  if (result.predictions && result.predictions.length > 0) {
    const prediction = result.predictions[0];
    if (Array.isArray(prediction) && prediction[0]?.message?.content) {
      text = prediction[0].message.content;
    } else if (typeof prediction === "string") {
      text = prediction;
    } else {
      text = JSON.stringify(prediction);
      console.error("[MedGemma] Unexpected prediction structure, returning raw");
    }
  }

  console.log("[MedGemma] Extracted response preview:", text.substring(0, 300));
  return text;
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
