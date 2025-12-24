
import { GoogleGenAI, Content, Part } from "@google/genai";
import { SYSTEM_INSTRUCTION } from '../constants';
import { Message } from '../types';

// Use process.env.API_KEY directly for initializing the Google GenAI client.
const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

// Convert our app's Message format to the API's Content format
const formatHistory = (messages: Message[]): Content[] => {
  return messages.map((msg) => ({
    role: msg.role,
    parts: [{ text: msg.content } as Part],
  }));
};

export const streamResponse = async (
  currentHistory: Message[],
  userMessage: string,
  onChunk: (text: string) => void
): Promise<string> => {
  try {
    // 修正歷史紀錄邏輯：
    // currentHistory 包含了 [過去的對話..., 最新這則使用者訊息]
    // 但 ai.chats.create 的 history 參數只應該包含 [過去的對話]
    // 最新的訊息會透過 sendMessageStream 傳送，否則 AI 會以為使用者重複講了兩次一樣的話。
    
    const historyMessages = currentHistory.slice(0, -1); // 排除最後一則（即當前的 userMessage）

    // Use gemini-3-flash-preview for the task of administrative assistance.
    const model = 'gemini-3-flash-preview';

    const chat = ai.chats.create({
      model: model,
      config: {
        tools: [{ googleSearch: {} }],
        systemInstruction: SYSTEM_INSTRUCTION,
        temperature: 0.0, // Set to 0.0 for maximum precision as requested
        maxOutputTokens: 2048,
      },
      history: formatHistory(historyMessages),
    });

    const result = await chat.sendMessageStream({ message: userMessage });

    let fullText = "";
    for await (const chunk of result) {
      // Access the .text property directly from the chunk as per latest SDK guidelines.
      const text = chunk.text;
      if (text) {
        fullText += text;
        onChunk(fullText);
      }
    }
    return fullText;

  } catch (error) {
    console.error("Gemini API Error:", error);
    throw error;
  }
};
