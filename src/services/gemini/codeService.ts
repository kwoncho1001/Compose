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
1. **기술적 증빙 중심 (IPO Deep-Dive)**: 
   - 코드를 단순히 요약하지 말고, **함수 단위로 어떤 입력을 받아 어떤 처리를 거쳐 무엇을 내뱉는지(Input-Process-Output)**를 상세히 설명하십시오.
   - **Input**: 매개변수, 전역 상태, Props, API 응답 등
   - **Process**: 구체적인 계산 방식, 조건문(if/switch), 반복문, 알고리즘의 흐름, 비즈니스 로직의 핵심 단계
   - **Output**: 반환 값, 상태 업데이트, 부수 효과(Side Effects), UI 렌더링 결과
   - 구체적인 설계적 근거와 예외 처리 전략 등을 풍성하게 서술하십시오.
   - 'Technical Specification' 섹션에 모든 분석 역량을 집중하십시오.
2. **분량 및 깊이**: 분석 내용은 최소 500자 이상의 풍부한 내용을 담아야 합니다. 단순히 코드를 설명하는 것이 아니라, 설계 의도와 구현 세부 사항을 깊이 있게 다루십시오.
3. **구조**: 시스템 지침의 4개 섹션 구조(Context, Specification, Constraints, Impact)를 따르되, Specification 섹션을 가장 상세히 작성하십시오.
4. 모든 텍스트는 한국어로 작성하십시오.

Return JSON:
{
  "content": "심층 분석된 상세 내용 (Markdown, 최소 500자 이상)",
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
      },
      maxOutputTokens: 2048 // Limit output for individual logic analysis
    },
  }, 3, 1000, signal);

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
1. **심층 분석**: 단순히 파일을 요약하지 말고, **함수 단위로 어떤 입력을 받아 어떤 처리를 거쳐 무엇을 내뱉는지(Input-Process-Output)**를 상세히 설명하십시오.
2. 'content'는 반드시 시스템 지침의 4개 섹션 구조를 따라야 합니다.
3. 'summary'는 파일 경로가 아닌, 기능의 역할을 설명하는 1-2문장의 한국어 요약이어야 합니다.

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
    }, 3, 1000, signal);

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

export const suggestLogicBoundaries = async (
  fileName: string,
  fileContent: string,
  signal?: AbortSignal
): Promise<{
  units: { title: string; startLine: number; endLine: number; reason: string }[];
}> => {
  const prompt = `
당신은 '코드 구조 분석 전문가'입니다. 제공된 소스 코드를 읽고, 의미론적으로 독립적인 '로직 단위'들의 경계를 제안하십시오.
단순히 함수 단위가 아니라, 특정 기능을 수행하는 코드 블록(Hook, Handler, Complex Logic)을 찾아내야 합니다.

[분석 대상]
파일 이름: ${fileName}
소스 코드:
${fileContent.slice(0, 15000)}

[작업 지침]
1. 코드의 시작부터 끝까지 훑으며, 논리적으로 하나의 단위로 묶일 수 있는 구간을 정의하십시오.
2. 각 단위에 대해 적절한 제목(title), 시작 라인(startLine), 끝 라인(endLine), 그리고 왜 이 구간을 단위로 설정했는지에 대한 이유(reason)를 작성하십시오.
3. 라인 번호는 0부터 시작하는 인덱스 기준입니다.
4. 모든 텍스트는 한국어로 작성하십시오.

Return JSON:
{
  "units": [
    { "title": "단위 제목", "startLine": 0, "endLine": 10, "reason": "이 구간은 ...를 처리하는 핵심 로직입니다." },
    ...
  ]
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
          units: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                title: { type: Type.STRING },
                startLine: { type: Type.NUMBER },
                endLine: { type: Type.NUMBER },
                reason: { type: Type.STRING }
              },
              required: ["title", "startLine", "endLine", "reason"]
            }
          }
        },
        required: ["units"]
      },
      maxOutputTokens: 2048
    },
  }, 3, 1000, signal);

  if (signal?.aborted) throw new Error("Operation cancelled");

  const result = safeJsonParse(response.text || "{}", { units: [] });
  return {
    units: result?.units || []
  };
};

export const designTaskFromReferences = async (
  taskTitle: string,
  references: { title: string; summary: string; content: string }[],
  existingTask?: Note,
  signal?: AbortSignal
): Promise<{
  content: string;
  summary: string;
  folder: string;
  importance: number;
  tags: string[];
}> => {
  // Use a more compact representation for references to save input tokens and focus the AI
  const referenceDetails = references.map(r => `[부품: ${r.title}]\n요약: ${r.summary}\n핵심내용: ${r.content.slice(0, 300)}...`).join('\n\n');
  
  const prompt = `
 당신은 '시스템 아키텍처 및 상세 설계 전문가'입니다. 
 제공된 '구현 부품(Reference)'들을 분석하여, 이들을 포괄하는 상위 설계 노드(Task/Feature)의 **핵심 설계서**를 작성하십시오.

 [대상 노드]
 제목: ${taskTitle}
 기존 내용: ${existingTask?.content || '없음'}

 [포함된 부품 명세]
 ${referenceDetails}

 [작업 지침]
 1. **역공학 설계 및 관계 추출**: 부품들의 기능을 종합하여, 이 노드가 담당하는 '추상적 역할'과 '구체적 명세'를 도출하십시오.
 2. **상세 분석 지침 (IPO Deep-Dive)**: 
    - 단순히 부품들을 나열하지 말고, 이들이 결합되어 시스템 전체에서 어떤 가치를 만들어내는지 심층 분석하십시오.
    - **Input/Output**: 이 Task/Feature가 외부와 주고받는 데이터의 흐름을 명확히 정의하십시오.
    - **Process**: 여러 부품들이 협력하여 비즈니스 로직을 완수하는 전체적인 시퀀스와 알고리즘을 상세히 설명하십시오.
 3. **관계 기반 자동 생성 (핵심)**: 
    - 분석 중 "이 부분은 추가 구현이 필요함", "다른 모듈과의 연동이 필요함", "TODO", "FIXME" 등의 단서를 발견하면, 이를 'Specification' 섹션에 명시하십시오.
    - 해당 단서들을 바탕으로 새로운 Task 또는 Feature가 필요하다고 판단되면, 관련 태그(예: #needs-implementation, #related-to-X)를 추가하고 내용에 구체적인 제안을 포함하십시오.
 4. **분량 및 깊이**: 각 설계 내용은 최소 800자 이상의 풍부한 내용을 담아야 합니다. 상위 설계 노드로서 하위 부품들을 충분히 설명하고 가이드할 수 있어야 합니다.
 5. **구조**: Context(배경), Specification(핵심 로직/데이터 흐름), Constraints(제약/예외), Impact(영향도) 순으로 작성하십시오.
 6. **가독성**: Markdown 문법을 적극 활용하여 구조화하십시오. (표, 리스트, 코드 블록 등)
 7. 모든 텍스트는 한국어로 작성하십시오.

 Return JSON:
 {
   "content": "종합 설계 명세 (Markdown, 최소 800자 이상)",
   "summary": "핵심 역할 요약 (1-2문장)",
   "folder": "도메인/경로",
   "importance": 1~5,
   "tags": ["auto-generated", "design-leading-code", ...]
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
          folder: { type: Type.STRING },
          importance: { type: Type.NUMBER },
          tags: { type: Type.ARRAY, items: { type: Type.STRING } }
        },
        required: ["content", "summary", "folder", "importance", "tags"],
      },
      maxOutputTokens: 4096 // Limit output for design docs to prevent token limit errors
    },
  }, 3, 1000, signal);

  if (signal?.aborted) throw new Error("Operation cancelled");

  const result = safeJsonParse(response.text || "{}", { content: "", summary: "", folder: "시스템/미분류", importance: 3, tags: [] });
  return {
    content: result?.content || "설계 실패",
    summary: result?.summary || "설계 실패",
    folder: result?.folder || "시스템/미분류",
    importance: result?.importance || 3,
    tags: result?.tags || []
  };
};
