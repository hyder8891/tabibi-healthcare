import { GoogleAuth } from "google-auth-library";

const PROJECT_NUMBER = "897097421776";
const LOCATION = "europe-west4";
const MODEL_ID = "medgemma-1.5-4b-it";

const PREDICT_URL = `https://${LOCATION}-aiplatform.googleapis.com/v1/projects/${PROJECT_NUMBER}/locations/${LOCATION}/publishers/google/models/${MODEL_ID}:predict`;

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

function flattenMessages(messages: MedGemmaMessage[]): string {
  const parts: string[] = [];
  for (const msg of messages) {
    const label = msg.role === "system" ? "SYSTEM" : msg.role === "user" ? "USER" : "ASSISTANT";
    let text: string;
    if (typeof msg.content === "string") {
      text = msg.content;
    } else {
      text = msg.content
        .filter(p => p.type === "text" && p.text)
        .map(p => p.text!)
        .join("\n");
    }
    parts.push(`${label}: ${text}`);
  }
  return parts.join("\n");
}

export async function callMedGemma(
  messages: MedGemmaMessage[],
  options?: {
    temperature?: number;
    maxTokens?: number;
  }
): Promise<string> {
  const token = await getAccessToken();
  const prompt = flattenMessages(messages);

  const body = {
    instances: [{ content: prompt }],
    parameters: {
      maxOutputTokens: options?.maxTokens ?? 1024,
      temperature: options?.temperature ?? 0.4,
      topP: 0.8,
    },
  };

  console.log("[MedGemma] Request URL:", PREDICT_URL);
  console.log("[MedGemma] Prompt length:", prompt.length);
  console.log("[MedGemma] Prompt tail (last 300 chars):", prompt.substring(prompt.length - 300));

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
    if (typeof prediction === "string") {
      text = prediction;
    } else if (prediction.content) {
      text = prediction.content;
    } else if (prediction.candidates?.[0]?.content?.parts?.[0]?.text) {
      text = prediction.candidates[0].content.parts[0].text;
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
