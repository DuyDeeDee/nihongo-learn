export type GeneratedQuestion = {
  prompt: string;
  question_type: "multiple_choice" | "particle" | "ordering";
  options: string[];
  accepted_answers: string[];
  explanation: string;
  difficulty: number;
};

export type GenerateOptions = {
  lessonNumber: number;
  volumeNumber: number;
  vocabularies: Array<{ japanese: string; kana?: string | null; meaning: string }>;
  grammars: Array<{ pattern: string; explanation: string; example_japanese?: string | null }>;
  kind: "quiz" | "particle" | "ordering" | "all";
  count?: number;
  apiKey?: string;
};

export async function generateQuestionsWithGemini(options: GenerateOptions): Promise<GeneratedQuestion[]> {
  const apiKey = options.apiKey || process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("Chưa cấu hình GEMINI_API_KEY. Vui lòng thêm GEMINI_API_KEY vào .env.local hoặc nhập API Key.");
  }

  const { lessonNumber, volumeNumber, vocabularies, grammars, kind, count = 5 } = options;

  const vocabSample = vocabularies.slice(0, 40).map(v => `${v.japanese} (${v.kana || ""}): ${v.meaning}`).join("\n");
  const grammarSample = grammars.map(g => `${g.pattern}: ${g.explanation} (Ví dụ: ${g.example_japanese || ""})`).join("\n");

  let requirementPrompt = "";
  if (kind === "quiz") {
    requirementPrompt = `Hãy tạo ${count} câu hỏi trắc nghiệm khách quan (question_type = "multiple_choice") cho Bài ${lessonNumber} (Volume ${volumeNumber}) Minna no Nihongo.
Mỗi câu có đúng 4 phương án lựa chọn trong mảng 'options', 1 đáp án đúng trong mảng 'accepted_answers', giải thích chi tiết bằng tiếng Việt trong 'explanation'.`;
  } else if (kind === "particle") {
    requirementPrompt = `Hãy tạo ${count} câu hỏi luyện tập trợ từ (question_type = "particle") cho Bài ${lessonNumber} (Volume ${volumeNumber}) Minna no Nihongo.
Trong câu 'prompt', hãy để chỗ trống là ký tự '＿' (ví dụ: 'わたし ＿ がくせいです。').
Mảng 'options' gồm 3 hoặc 4 trợ từ tiếng Nhật để người học chọn (ví dụ: ['は', 'を', 'に', 'で']).
Mảng 'accepted_answers' chứa trợ từ đúng. Giải thích vai trò của trợ từ đó trong 'explanation'.`;
  } else if (kind === "ordering") {
    requirementPrompt = `Hãy tạo ${count} câu hỏi sắp xếp mảnh câu (question_type = "ordering") cho Bài ${lessonNumber} (Volume ${volumeNumber}) Minna no Nihongo.
Trong 'prompt', đưa ra câu dịch tiếng Việt (ví dụ: 'Sắp xếp câu: Tôi uống cà phê.').
Mảng 'options' chứa các mảnh ghép tiếng Nhật (3 đến 5 mảnh, ví dụ: ['わたしは', 'コーヒーを', 'のみます']).
Mảng 'accepted_answers' chứa các mảnh ghép theo thứ tự chính xác (giống y hệt các phần tử trong options nhưng đã sắp xếp đúng).
Giải thích trật tự ngữ pháp trong 'explanation'.`;
  } else {
    requirementPrompt = `Hãy tạo tổng cộng ${count} câu hỏi gồm đa dạng 3 thể loại:
1. Trắc nghiệm ('multiple_choice')
2. Điền trợ từ ('particle' với chỗ trống '＿')
3. Sắp xếp mảnh câu ('ordering')
Dựa trên kiến thức của Bài ${lessonNumber} (Volume ${volumeNumber}) Minna no Nihongo.`;
  }

  const systemInstruction = `Bạn là chuyên gia sư phạm tiếng Nhật chuẩn JLPT N5 của giáo trình Minna no Nihongo.
Nhiệm vụ của bạn là tạo các câu hỏi luyện tập chất lượng cao cho người Việt học tiếng Nhật.

QUY TẮC BẮT BUỘC:
1. CHỈ sử dụng từ vựng và mẫu ngữ pháp có trong danh sách Bài ${lessonNumber} được cung cấp dưới đây (và các trợ từ cơ bản). TUYỆT ĐỐI không dùng từ vựng hay ngữ pháp cao cấp của N4, N3.
2. Với mọi chữ Kanji trong câu hỏi, bạn có thể kèm cách đọc hoặc viết kèm chữ Hiragana để học viên N5 dễ hiểu.
3. Toàn bộ giải thích ('explanation') phải viết bằng tiếng Việt rõ ràng, dễ hiểu.
4. Đầu ra BẮT BUỘC là một JSON Array hợp lệ chứa các object theo schema:
[
  {
    "prompt": "Nội dung câu hỏi",
    "question_type": "multiple_choice" | "particle" | "ordering",
    "options": ["phương án 1", "phương án 2", "phương án 3", "phương án 4"],
    "accepted_answers": ["đáp án đúng"],
    "explanation": "Giải thích chi tiết bằng tiếng Việt",
    "difficulty": 1 đến 5
  }
]`;

  const userContent = `DỮ LIỆU TỪ VỰNG BÀI ${lessonNumber}:
${vocabSample || "Từ vựng cơ bản Minna no Nihongo Bài " + lessonNumber}

DỮ LIỆU NGỮ PHÁP BÀI ${lessonNumber}:
${grammarSample || "Ngữ pháp cơ bản Minna no Nihongo Bài " + lessonNumber}

YÊU CẦU:
${requirementPrompt}

Chỉ trả về JSON Array, không bọc trong markdown tick nếu có thể hoặc trả về json hợp lệ.`;

  const candidateModels = [process.env.GEMINI_MODEL, "gemini-3.5-flash-lite", "gemini-2.5-flash"].filter(Boolean) as string[];
  let lastErrorMsg = "";
  let responseData: unknown = null;

  for (const model of candidateModels) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [
            {
              role: "user",
              parts: [{ text: `${systemInstruction}\n\n${userContent}` }],
            },
          ],
          generationConfig: {
            temperature: 0.5,
            responseMimeType: "application/json",
          },
        }),
      });

      if (!response.ok) {
        const errorBody = await response.text();
        try {
          const parsed = JSON.parse(errorBody);
          lastErrorMsg = parsed.error?.message || `Lỗi từ Gemini (${response.status})`;
        } catch {
          lastErrorMsg = `Lỗi từ Gemini (${response.status})`;
        }
        continue; // Try next fallback model
      }

      responseData = await response.json();
      break;
    } catch (err) {
      lastErrorMsg = err instanceof Error ? err.message : "Lỗi mạng khi gọi Gemini";
    }
  }

  if (!responseData) {
    throw new Error(lastErrorMsg || "Không thể kết nối đến các model Gemini.");
  }

  const data = responseData as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };
  const textContent = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!textContent) {
    throw new Error("Gemini không trả về nội dung câu hỏi.");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(textContent);
  } catch {
    const cleaned = textContent.replace(/```json\s*/gi, "").replace(/```/g, "").trim();
    parsed = JSON.parse(cleaned);
  }

  if (!Array.isArray(parsed)) {
    if (parsed && typeof parsed === "object" && "questions" in parsed && Array.isArray((parsed as { questions: unknown[] }).questions)) {
      parsed = (parsed as { questions: unknown[] }).questions;
    } else {
      throw new Error("Định dạng dữ liệu AI trả về không phải là mảng câu hỏi.");
    }
  }

  const validQuestions: GeneratedQuestion[] = [];
  for (const item of parsed as Record<string, unknown>[]) {
    if (
      typeof item.prompt === "string" &&
      Array.isArray(item.options) &&
      Array.isArray(item.accepted_answers) &&
      item.options.length > 0 &&
      item.accepted_answers.length > 0
    ) {
      const qType = (item.question_type as string) || "multiple_choice";
      validQuestions.push({
        prompt: item.prompt.trim(),
        question_type: (qType === "particle" || qType === "ordering" ? qType : "multiple_choice") as "multiple_choice" | "particle" | "ordering",
        options: item.options.map(String).map(s => s.trim()).filter(Boolean),
        accepted_answers: item.accepted_answers.map(String).map(s => s.trim()).filter(Boolean),
        explanation: typeof item.explanation === "string" ? item.explanation.trim() : "",
        difficulty: Number(item.difficulty) || 3,
      });
    }
  }

  return validQuestions;
}
