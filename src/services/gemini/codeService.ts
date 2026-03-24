import { Type } from "@google/genai";
import { Note } from "../../types";
import { MODEL_NAME, systemInstruction, noteSchema } from "./config";
import { generateContentWithRetry } from "./core";
import { safeJsonParse, sanitizeNotes } from "./utils";
import { extractLogicUnits } from "../../utils/codeParser";

export const analyzeLogicUnitDeeply = async (
  unitTitle: string,
  codeSnippet: string,
  taskContext: { title: string; content: string; summary: string },
  signal?: AbortSignal
): Promise<{
  content: string;
  summary: string;
  importance: number;
  tags: string[];
}> => {
  const prompt = `
당신은 '기술 명세 및 구현 증빙 전문가'입니다. 
특정 코드 조각이 설계상의 요구사항을 어떻게 기술적으로 충족하고 있는지 심층 분석하여 **'Technical Specification'**을 작성하십시오.

[대상 로직]
제목: ${unitTitle}
코드:
${codeSnippet}

[관련 설계(Task) 정보]
제목: ${taskContext.title}
설계 내용: ${taskContext.content}
설계 요약: ${taskContext.summary}

[작업 지침]
1. **기술적 증빙 중심 (Deep-Dive)**: 
   - 코드를 단순히 설명하지 말고, "이 로직이 왜 이 Task를 해결하는가?"에 집중하십시오.
   - 상세 알고리즘, 데이터 흐름, 설계적 근거, 예외 처리 전략 등을 풍성하게 서술하십시오.
   - 'Technical Specification' 섹션에 모든 분석 역량을 집중하십시오.
2. **구조**: 시스템 지침의 4개 섹션 구조(Context, Specification, Constraints, Impact)를 따르되, Specification 섹션을 가장 상세히 작성하십시오.
3. 모든 텍스트는 한국어로 작성하십시오.

Return JSON:
{
  "content": "심층 분석된 상세 내용 (Markdown)",
  "summary": "구현 핵심 요약 (한국어)",
  "importance": 1~5,
  "tags": ["tag1", "tag2"]
}
`;

  const response = await generateContentWithRetry({
    model: MODEL_NAME,
    contents: prompt,
    config: {
      systemInstruction,
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          content: { type: Type.STRING },
          summary: { type: Type.STRING },
          importance: { type: Type.NUMBER },
          tags: { type: Type.ARRAY, items: { type: Type.STRING } }
        },
        required: ["content", "summary", "importance", "tags"],
      }
    },
  });

  if (signal?.aborted) throw new Error("Operation cancelled");

  const result = safeJsonParse(response.text || "{}", { content: "", summary: "", importance: 3, tags: [] });
  return {
    content: result?.content || "분석 실패",
    summary: result?.summary || "분석 실패",
    importance: result?.importance || 3,
    tags: result?.tags || []
  };
};

export const syncFileAtomically = async (
  fileName: string,
  fileContent: string,
  existingNotes: Note[],
  signal?: AbortSignal
): Promise<Omit<Note, 'id' | 'status'>[]> => {
  // 1. 물리적 로직 단위 추출
  const physicalUnits = extractLogicUnits(fileContent, fileName);
  
  const results: Omit<Note, 'id' | 'status'>[] = [];
  
  // 2. 파일 자체를 나타내는 부모 Reference 노드 생성
  const fileNote: Omit<Note, 'id' | 'status'> = {
    title: fileName,
    folder: `시스템/${fileName}`,
    content: `# ${fileName}\n\n이 파일은 다음 원자적 로직 단위들로 구성되어 있습니다.`,
    summary: `${fileName} 파일의 전체 구조 및 로직 요약`,
    version: '1.0.0',
    lastUpdated: new Date().toISOString(),
    importance: 3,
    priority: 'B',
    tags: ['github-sync', 'file-reference'],
    noteType: 'Reference',
    parentNoteIds: [],
    relatedNoteIds: [],
    childNoteIds: []
  };
  results.push(fileNote);

  // 3. 각 단위별 심층 분석 및 노드화
  for (const unit of physicalUnits) {
    if (signal?.aborted) throw new Error("Operation cancelled");

    // 파일 전체의 맥락을 일부 제공하여 분석 품질 향상
    const analysis = await analyzeLogicUnitDeeply(
      unit.title,
      unit.codeSnippet,
      { 
        title: fileName, 
        content: fileContent.slice(0, 2000), // 파일 상단 컨텍스트
        summary: "GitHub 동기화 파이프라인에서 추출된 원자적 로직 단위입니다." 
      },
      signal
    );

    const unitNote: Omit<Note, 'id' | 'status'> = {
      title: unit.title,
      folder: `시스템/${fileName}`,
      content: analysis.content,
      summary: analysis.summary,
      version: '1.0.0',
      lastUpdated: new Date().toISOString(),
      importance: analysis.importance,
      priority: analysis.importance >= 4 ? 'A' : 'B',
      tags: [...analysis.tags, 'atomic-unit', 'github-sync'],
      noteType: 'Task', // 원자적 단위는 구현 단위인 Task로 취급
      parentNoteIds: [], // 나중에 hook에서 연결
      relatedNoteIds: [],
      childNoteIds: []
    };
    results.push(unitNote);
  }

  return results;
};

export const generateNoteFromCode = async (
  fileName: string,
  fileContent: string,
  existingNotes: Note[],
  signal?: AbortSignal
): Promise<Omit<Note, 'id' | 'status'>> => {
  const prompt = `
당신은 시스템 역공학 전문가입니다. 제공된 소스 코드를 분석하여 해당 코드의 역할을 설명하는 설계도(노트)를 작성하십시오.
마인드맵 구조를 고려하여, 기존 노트들과의 연관 관계(relatedNoteIds)를 찾아 연결하십시오.
언어 설정: 모든 텍스트는 반드시 한국어로 작성하십시오. 가독성을 위해 줄바꿈을 충분히 사용하십시오.

[중요] 지시사항:
1. 'content'는 반드시 시스템 지침의 4개 섹션 구조를 따라야 합니다.
2. 'summary'는 파일 경로가 아닌, 기능의 역할을 설명하는 1-2문장의 한국어 요약이어야 합니다.

파일 이름: ${fileName}
소스 코드:
${fileContent.slice(0, 15000)}

기존 노트 목록 (연결용):
${JSON.stringify(existingNotes.map(n => ({ id: n.id, title: n.title, summary: n.summary })))}

작업:
1. 코드의 핵심 로직과 역할을 분석하여 제목(title)과 요약(summary)을 작성합니다. (불필요한 접두어 제거)
2. 상세 기술 명세(content)를 Markdown 형식으로 작성합니다. (한국어 필수, 줄바꿈 필수)
3. 적절한 폴더(folder)를 지정합니다. (반드시 "상위범주/하위범주" 형태 사용. 'Imported' 또는 기술 계층 명칭 사용 금지.)
4. 기존 노트 중 이 코드와 논리적으로 연결된 것이 있다면 relatedNoteIds에 포함시킵니다. AI가 스스로 판단하여 자동으로 연결하십시오. (반드시 ID 사용)
5. 메타데이터를 작성합니다:
   - version: 1.0.0
   - tags: [discovered-from-github, ...]
   - importance: 1~5

Return JSON matching the Note schema (title, folder, content, summary, importance, tags, relatedNoteIds).
`;

  try {
    const response = await generateContentWithRetry({
      model: MODEL_NAME,
      contents: prompt,
      config: {
        systemInstruction,
        responseMimeType: "application/json",
        responseSchema: noteSchema,
      },
    });

    if (signal?.aborted) throw new Error("Operation cancelled");

    const result = safeJsonParse(response.text || "{}", {});
    if (!result || Object.keys(result).length === 0) {
      throw new Error("Empty AI response");
    }
    const sanitized = sanitizeNotes([result], existingNotes);
    return sanitized[0];
  } catch (err) {
    if (err?.message === "Operation cancelled" || err === "Operation cancelled") throw err;
    console.error('Generate note from code failed:', err);
    return {
      title: `${fileName}`,
      folder: "시스템/미분류 소스",
      content: "분석 중 오류가 발생했습니다.",
      summary: "분석 중 오류가 발생했습니다.",
      version: '1.0.0',
      lastUpdated: new Date().toISOString(),
      importance: 1,
      priority: 'C',
      tags: ['error'],
      noteType: 'Reference',
      parentNoteIds: [],
      relatedNoteIds: [],
      childNoteIds: []
    };
  }
};
