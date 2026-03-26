import { Note } from "../../types";
import { ai } from "./config";

export const parseMetadata = (yaml: string): Record<string, string> => {
  const result: Record<string, string> = {};
  if (!yaml) return result;
  yaml.split('\n').forEach(line => {
    const [key, ...valueParts] = line.split(':');
    if (key && valueParts.length > 0) {
      result[key.trim()] = valueParts.join(':').trim();
    }
  });
  return result;
};

export const generateContentWithRetry = async (params: any, retries = 5, delay = 1000, signal?: AbortSignal) => {
  // Ensure we have a config object
  if (!params.config) params.config = {};
  // Set a default maxOutputTokens if not provided to prevent "generation exceeded max tokens limit"
  if (!params.config.maxOutputTokens) {
    params.config.maxOutputTokens = 8192; // Reasonable limit for detailed design docs
  }

  for (let i = 0; i < retries; i++) {
    if (signal?.aborted) throw new Error("Operation cancelled");
    
    try {
      return await ai.models.generateContent(params);
    } catch (error: any) {
      if (signal?.aborted || error?.message === "Operation cancelled" || error === "Operation cancelled") {
        throw new Error("Operation cancelled");
      }
      // If the error is specifically about token limit, we might want to reduce the limit or just fail
      if (error?.message?.includes("max tokens limit")) {
        console.error("Gemini API Token Limit Exceeded:", error);
        throw error; 
      }
      console.error(`Gemini API Error (Attempt ${i + 1}/${retries}):`, JSON.stringify(error, null, 2));
      if (i === retries - 1) throw error;
      
      // Wait with exponential backoff, but check signal
      const waitTime = delay * Math.pow(2, i);
      const start = Date.now();
      while (Date.now() - start < waitTime) {
        if (signal?.aborted) throw new Error("Operation cancelled");
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }
  }
};
