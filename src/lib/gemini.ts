import { getActiveOrgId } from './store';

export async function generateGeminiContent(contents: any, config?: any): Promise<{text: string, functionCalls: any[]}> {
  const apiKey = getGeminiApiKey();

  // Map contents to Google API format if needed
  let finalContents;
  if (Array.isArray(contents)) {
    finalContents = contents.map((c: any) => ({
      role: c.role === 'model' || c.role === 'ai' ? 'model' : 'user',
      parts: Array.isArray(c.parts) ? c.parts : [{ text: String(c.parts || c.text || c) }]
    }));
  } else if (contents && Array.isArray(contents.parts)) {
    finalContents = [{ role: 'user', parts: contents.parts }];
  } else {
    finalContents = [{ role: 'user', parts: [{ text: String(contents) }] }];
  }

  // First try the local proxy (works in AI Studio and properly hosted environments)
  try {
    const maxRetries = 3;
    let delay = 1000;
    let proxyRes: Response | null = null;
    let text = "";

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      proxyRes = await fetch("/api/gemini/generate", {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          ...(apiKey ? { "x-api-key": apiKey } : {})
        },
        body: JSON.stringify({ contents, config })
      });

      text = await proxyRes.text();
      
      // If it's a 429 rate limit error, wait and retry
      if (proxyRes.status === 429 && attempt < maxRetries) {
        console.warn(`Client: Gemini rate limit (429) hit. Retrying in ${delay}ms... (Attempt ${attempt}/${maxRetries})`);
        await new Promise(resolve => setTimeout(resolve, delay));
        delay *= 2;
        continue;
      }
      break;
    }

    if (proxyRes && !text.trim().toLowerCase().startsWith("<!doctype") && !text.trim().toLowerCase().startsWith("<html")) {
       if (!proxyRes.ok) {
           let errData: any = {};
           try { errData = JSON.parse(text); } catch (e) {}
           
           if (proxyRes.status === 429 || (errData.error && (errData.error.includes("429") || errData.error.toLowerCase().includes("quota")))) {
               throw new Error(
                 "පොදු AI සේවාවේ සීමාව ඉක්මවා ඇත (Rate Limit Exceeded). කරුණාකර තත්පර කිහිපයකින් නැවත උත්සාහ කරන්න, නැතහොත් Settings වෙත ගොස් ඔබගේම Gemini API Key එකක් ඇතුලත් කරන්න. / Shared AI rate limit reached. Please wait a moment and try again, or add your own Gemini API Key in Settings to bypass this limit."
               );
           }
           throw new Error(errData.error || `Proxy failed: ${proxyRes.status}`);
       }
       return JSON.parse(text);
    }
  } catch (err: any) {
    if (err.message && (err.message.includes("Proxy failed") || err.message.includes("සීමාව ඉක්මවා ඇත"))) {
      throw err;
    }
    // Network error or HTML response, fallback to direct API below
  }

  // Fallback to direct client-side API call (for static hosts like Netlify)
  if (!apiKey) {
     throw new Error("Gemini API Key missing. Please set your own API key in the app settings to use AI on this site.");
  }

  const { GoogleGenAI } = await import('@google/genai');
  const client = new GoogleGenAI({ apiKey });
  
  const modelsToTry = ["gemini-3.5-flash", "gemini-3.1-flash-lite", "gemini-flash-latest"];

  let finalConfig: any = {};
  if (config) {
     if (config.system_instruction || config.systemInstruction) {
         finalConfig.systemInstruction = String(config.system_instruction || config.systemInstruction);
     }
     if (config.tools) finalConfig.tools = config.tools;
     if (config.temperature !== undefined) finalConfig.temperature = config.temperature;
     if (config.maxOutputTokens !== undefined) finalConfig.maxOutputTokens = config.maxOutputTokens;
  }

  let response;
  const maxAttempts = 3;
  let backoffDelay = 1000;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const currentModel = modelsToTry[attempt - 1] || "gemini-3.1-flash-lite";
    try {
      console.log(`Client: Requesting Gemini API with model ${currentModel} (Attempt ${attempt}/${maxAttempts})`);
      response = await client.models.generateContent({
          model: currentModel,
          contents: finalContents,
          config: finalConfig
      });
      break;
    } catch (error: any) {
      const errorMessage = error?.message || error?.toString() || "";
      const isRetryable = 
        errorMessage.includes("429") || 
        errorMessage.includes("Quota") || 
        errorMessage.includes("503") || 
        errorMessage.includes("demand") || 
        errorMessage.includes("temporary") || 
        errorMessage.includes("UNAVAILABLE") || 
        error?.status === 429 ||
        error?.status === 503;

      if (isRetryable && attempt < maxAttempts) {
        console.log(`Client: Request with model ${currentModel} temporary busy. Retrying in ${backoffDelay}ms... (Attempt ${attempt}/${maxAttempts})`);
        await new Promise(resolve => setTimeout(resolve, backoffDelay));
        backoffDelay *= 2;
        continue;
      }
      throw error;
    }
  }

  return { 
      text: response ? response.text || "" : "", 
      functionCalls: response ? response.functionCalls || [] : [] 
  };
}

export function getGeminiApiKey(): string | null {
  const orgId = getActiveOrgId();
  
  // 0. Check custom key
  const customKey = localStorage.getItem('gemini_api_key_custom');
  if (customKey) return customKey;

  // 1. Check organization specific key in localStorage
  const orgKey = localStorage.getItem(`bizflow_${orgId}_GEMINI_API_KEY`);
  if (orgKey) return orgKey;

  // 2. Check legacy/global key in localStorage
  const localKey = localStorage.getItem('MYM_GEMINI_API_KEY');
  if (localKey) return localKey;

  // 3. Fallback to built-in environment variables
  const envKey = typeof import.meta !== 'undefined' && import.meta.env ? import.meta.env.VITE_GEMINI_API_KEY : undefined;
  const procKey = typeof process !== 'undefined' ? process.env.GEMINI_API_KEY : undefined;
  
  if (envKey) return envKey;
  if (procKey) return procKey;
  
  return null;
}
