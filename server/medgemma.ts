import { GoogleAuth } from "google-auth-library";

const PROJECT_ID = "agents-487805";
const LOCATION = "europe-west4";
const ENDPOINT_ID = "mg-endpoint-85c58ff5-5aae-4b2e-a011-1b6480ee6a7e";

const VERTEX_AI_BASE = `https://${LOCATION}-aiplatform.googleapis.com/v1beta1/projects/${PROJECT_ID}/locations/${LOCATION}/endpoints/${ENDPOINT_ID}`;

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
  content: string;
}

export interface MedGemmaStreamChunk {
  content: string;
  done: boolean;
}

export async function streamMedGemmaChat(
  messages: MedGemmaMessage[],
  options?: {
    temperature?: number;
    maxTokens?: number;
  }
): Promise<ReadableStream<MedGemmaStreamChunk>> {
  const token = await getAccessToken();

  const body = {
    model: "google/medgemma-27b-text-it",
    messages,
    stream: true,
    temperature: options?.temperature ?? 0.7,
    max_tokens: options?.maxTokens ?? 4096,
    top_p: 0.95,
  };

  const response = await fetch(`${VERTEX_AI_BASE}:rawPredict`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error("MedGemma API error:", response.status, errorText);
    throw new Error(`MedGemma API error: ${response.status} - ${errorText.substring(0, 200)}`);
  }

  if (!response.body) {
    throw new Error("MedGemma returned no response body");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  return new ReadableStream<MedGemmaStreamChunk>({
    async pull(controller) {
      while (true) {
        const { done, value } = await reader.read();

        if (done) {
          controller.enqueue({ content: "", done: true });
          controller.close();
          return;
        }

        buffer += decoder.decode(value, { stream: true });

        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || !trimmed.startsWith("data: ")) continue;

          const data = trimmed.slice(6);
          if (data === "[DONE]") {
            controller.enqueue({ content: "", done: true });
            controller.close();
            return;
          }

          try {
            const parsed = JSON.parse(data);
            const delta = parsed.choices?.[0]?.delta?.content;
            if (delta) {
              controller.enqueue({ content: delta, done: false });
            }
          } catch {
          }
        }
      }
    },
    cancel() {
      reader.cancel();
    },
  });
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
    model: "google/medgemma-27b-text-it",
    messages,
    stream: false,
    temperature: options?.temperature ?? 0.7,
    max_tokens: options?.maxTokens ?? 4096,
    top_p: 0.95,
  };

  const response = await fetch(`${VERTEX_AI_BASE}:rawPredict`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error("MedGemma API error:", response.status, errorText);
    throw new Error(`MedGemma API error: ${response.status} - ${errorText.substring(0, 200)}`);
  }

  const result = await response.json();
  return result.choices?.[0]?.message?.content || "";
}

export function isMedGemmaConfigured(): boolean {
  return !!process.env.GOOGLE_CLOUD_SERVICE_ACCOUNT;
}
