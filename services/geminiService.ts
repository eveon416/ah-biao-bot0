import { GoogleGenAI, Content, Part } from "@google/genai";
import { SYSTEM_INSTRUCTION } from '../constants';
import { Message } from '../types';

const apiKey = process.env.API_KEY;

if (!apiKey) {
  console.error("API_KEY is not defined in the environment variables.");
}

const ai = new GoogleGenAI({ apiKey: apiKey || 'DUMMY_KEY_FOR_BUILD' });

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
    // We create a "fresh" chat session logically for each turn in this simple architecture,
    // or we could maintain a chat object. To ensure the system instruction is always strict,
    // we re-initialize the config here.
    
    // Using the 'gemini-2.5-flash' model for speed and accuracy in reasoning.
    const model = 'gemini-2.5-flash';

    const chat = ai.chats.create({
      model: model,
      config: {
        systemInstruction: SYSTEM_INSTRUCTION,
        temperature: 0.3, // Lower temperature for more deterministic/professional answers
        maxOutputTokens: 2048,
      },
      history: formatHistory(currentHistory),
    });

    const result = await chat.sendMessageStream({ message: userMessage });

    let fullText = "";
    for await (const chunk of result) {
      const text = chunk.text; // Access .text directly property
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
