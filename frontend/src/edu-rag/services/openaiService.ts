/**
 * OpenAI Chat API Service
 * 負責處理串流回覆與設定邏輯 (Precision & CoT)
 */

interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface StreamOptions {
  onlyFromDocs: boolean;
  showReasoning: boolean;
  onUpdate: (fullText: string) => void;
  onError: (error: any) => void;
  onComplete: () => void;
}

export async function streamChatCompletion(
  messages: ChatMessage[],
  options: StreamOptions
) {
  const { onlyFromDocs, showReasoning, onUpdate, onError, onComplete } = options;
  const apiKey = import.meta.env.VITE_OPENAI_API_KEY;

  console.log("[OpenAI Service] Starting completion...", { onlyFromDocs, showReasoning });

  if (!apiKey) {
    console.error("[OpenAI Service] API Key is missing!");
    onError("⚠️ 系統設定錯誤：找不到 OpenAI API Key，請檢查 .env 設定。");
    return;
  }

  let systemPrompt = "你是『新北教育 RAG 助手』，一個專業且親切的 AI 助理。";
  if (onlyFromDocs) {
    systemPrompt += "\n⚠️ 嚴格模式：請僅根據已提供的文件內容進行回答。如果問題與文件無關，請禮貌地告知您無法回答。";
  } else {
    systemPrompt += "\n靈活模式：如果文件中找不到答案，您可以結合您的通用知識提供專業建議。";
  }
  if (showReasoning) {
    systemPrompt += "\n🧠 思維鏈模式：在回答之前，請先在 <thought> 標籤內輸出您的思考歷程、檢索步驟與邏輯判斷。";
  }

  const finalMessages: ChatMessage[] = [
    { role: 'system', content: systemPrompt },
    ...messages
  ];

  try {
    console.log("[OpenAI Service] Sending fetch request...");
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o',
        messages: finalMessages,
        stream: true,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      console.error("[OpenAI Service] API Error:", errorData);
      throw new Error(errorData.error?.message || 'Failed to fetch from OpenAI');
    }

    const reader = response.body?.getReader();
    if (!reader) throw new Error("Failed to get stream reader");

    const decoder = new TextDecoder("utf-8");
    let fullText = "";
    let partialLine = "";

    console.log("[OpenAI Service] Streaming started...");

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value, { stream: true });
      const lines = (partialLine + chunk).split('\n');
      partialLine = lines.pop() || "";

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed === 'data: [DONE]') continue;
        
        try {
          const jsonStr = trimmed.startsWith('data: ') ? trimmed.slice(6) : trimmed;
          const json = JSON.parse(jsonStr);
          const content = json.choices[0]?.delta?.content || "";
          if (content) {
            fullText += content;
            onUpdate(fullText);
          }
        } catch (e) {
          // Ignore partial JSON
        }
      }
    }

    console.log("[OpenAI Service] Streaming completed.");
    onComplete();
  } catch (error) {
    console.error("[OpenAI Service] Runtime Error:", error);
    onError(error);
  }
}
