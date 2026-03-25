import { Type } from "@google/genai";
import { Note } from "../../types";
import { MODEL_NAME, systemInstruction } from "./config";
import { generateContentWithRetry } from "./core";
import { safeJsonParse } from "./utils";
import { extractLogicUnits, LogicUnit, generateHash } from "../../utils/codeParser";

export const updateCodeSnapshot = async (
  fileName: string,
  fileContent: string,
  allNotes: Note[],
  fileSha: string,
  preExtractedUnits?: LogicUnit[],
  signal?: AbortSignal
): Promise<{
  logicUnits: {
    title: string;
    codeSnippet: string;
    logicHash: string;
    purpose: string;
    matchedTaskId?: string;
    suggestedTask?: {
      title: string;
      folder: string;
      content: string;
      summary: string;
      status: string;
      noteType: 'Task' | 'Feature';
      tags: string[];
    };
    matchedReferenceId?: string;
    tags: string[];
    importance: number;
  }[];
}> => {
  const designNotes = allNotes.filter(n => n.noteType !== 'Reference');
  const referenceNotes = allNotes.filter(n => n.noteType === 'Reference');

  // 물리적 로직 단위 추출 (AI 가이드용)
  const physicalUnits = preExtractedUnits || extractLogicUnits(fileContent, fileName);
  const physicalUnitDetails = physicalUnits.map(u => `- ${u.title}: ${u.codeSnippet.slice(0, 100)}...`).join('\n');

  const prompt = `
당신은 '아키텍처 역공학 및 설계-구현 동기화 전문가'입니다. 
제공된 소스 코드를 분석하여, 파일의 물리적 구조가 아닌 **'원자적 로직 단위(Atomic Logic Unit)'**를 추출하고 설계도와 매핑하십시오.

[분석 대상 코드]
파일 경로: ${fileName}
파일 SHA: ${fileSha}

[물리적 추출 단위 (가이드)]
${physicalUnitDetails}

[소스 코드 전체]
${fileContent.slice(0, 15000)}

[기존 설계도 (Task/Feature) 목록]
${JSON.stringify(designNotes.map(n => ({ id: n.id, title: n.title, noteType: n.noteType, summary: n.summary, folder: n.folder })))}

[기존 Reference 목록 (업데이트 매칭용)]
${JSON.stringify(referenceNotes.map(n => ({ id: n.id, title: n.title, summary: n.summary, githubLink: n.githubLink, logicHash: n.logicHash })))}

[작업 지침]
1. **원자적 로직 추출 (Step 1)**: 
   - [물리적 추출 단위]를 기반으로 하되, 각 단위 내부에서 독립적인 책임을 가진 **더 작은 원자적 로직 단위**를 찾아내십시오.
   - 특히 React 컴포넌트의 경우, 내부의 복잡한 조건부 렌더링 블록, 대규모 데이터 처리 로직, 에러 처리 핸들러, 주요 Hook(useEffect, useMemo 등)을 각각 별도의 유닛으로 분리하십시오.
   - **강력 권고**: 파일 하나에서 최소 3~5개 이상의 로직 유닛이 나오도록 세분화하십시오. 단순히 파일 전체를 하나의 유닛으로 묶는 것은 지양하십시오.
   - 각 유닛에 대해 해당 로직을 포함하는 **정확한 코드 조각(codeSnippet)**을 추출하십시오.
   - **CRITICAL**: \`codeSnippet\`은 [소스 코드 전체]에 있는 그대로 **정확히 일치하게** 추출해야 합니다.
   - 각 로직 유닛에 대해 고유한 **logicHash**를 생성하십시오.

2. **설계도 매핑 및 자동 부모(Task/Feature) 생성 (Step 2)**:
   - 각 유닛은 반드시 대응하는 부모(Task 또는 Feature) 노드를 가져야 합니다.
   - 적절한 노드가 없다면 **반드시 새로운 부모 노드를 제안하십시오** (\`suggestedTask\`). 
   - **사소한 로직이라도 구현 증빙을 위해 개별 Task로 분리하거나 새로운 Task를 제안하십시오.**
   - **계층 규칙**: Epic > Feature > Task > Reference.
   - **Sibling Promotion**: Task가 너무 복잡해지면 Feature로 승격시키고 하위에 새로운 Task를 두는 구조를 제안하십시오.

3. **기존 구현체 업데이트 매칭**:
   - 기존 Reference 목록에 동일한 목적의 구현 노트가 있다면 \`matchedReferenceId\`를 지정하십시오. 

Return JSON:
{
  "logicUnits": [
    {
      "title": "[구현] 로직의 기능적 역할",
      "codeSnippet": "해당 로직의 전체 소스 코드 (문자열)",
      "logicHash": "로직_고유_해시",
      "purpose": "이 로직이 왜 독립적인지, 어떤 설계를 충족하는지 구체적으로 기술",
      "matchedTaskId": "기존_Task_ID",
      "suggestedTask": {
        "title": "새로 제안하는 노드 제목",
        "folder": "도메인/경로",
        "content": "노드의 상세 설계 내용",
        "summary": "코드를 기반으로 한 1문장 초핵심 요약",
        "status": "Done",
        "noteType": "Task",
        "tags": ["auto-generated", "design-leading-code", "Logic"]
      },
      "matchedReferenceId": "기존_Reference_ID",
      "tags": ["tag1"],
      "importance": 4
    }
  ]
}
`;

  const response = await generateContentWithRetry({
    model: MODEL_NAME,
    contents: prompt,
    config: {
      systemInstruction,
      responseMimeType: "application/json",
      maxOutputTokens: 8192,
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          logicUnits: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                title: { type: Type.STRING },
                codeSnippet: { type: Type.STRING },
                logicHash: { type: Type.STRING },
                purpose: { type: Type.STRING },
                matchedTaskId: { type: Type.STRING },
                suggestedTask: {
                  type: Type.OBJECT,
                  properties: {
                    title: { type: Type.STRING },
                    folder: { type: Type.STRING },
                    content: { type: Type.STRING },
                    summary: { type: Type.STRING, description: "코드를 기반으로 한 1문장 초핵심 요약" },
                    status: { type: Type.STRING, enum: ['Done'], description: "자동 생성된 노드의 상태는 항상 Done" },
                    noteType: { type: Type.STRING, enum: ['Task', 'Feature'], description: "로직의 성격에 따라 Task 또는 Feature 선택" },
                    tags: { type: Type.ARRAY, items: { type: Type.STRING }, description: "auto-generated, design-leading-code 포함" }
                  },
                  required: ["title", "folder", "content", "summary", "status", "noteType", "tags"]
                },
                matchedReferenceId: { type: Type.STRING },
                tags: { type: Type.ARRAY, items: { type: Type.STRING } },
                importance: { type: Type.NUMBER }
              },
              required: ["title", "codeSnippet", "logicHash", "purpose", "tags", "importance"],
            },
          }
        },
        required: ["logicUnits"]
      }
    },
  }, 3, 1000, signal);

  if (signal?.aborted) throw new Error("Operation cancelled");

  const result = safeJsonParse(response.text || "{}", { logicUnits: [] });
  
  // Ensure logicHash is content-based by recalculating it from the snippet
  const logicUnits = (result?.logicUnits || []).map((unit: any) => ({
    ...unit,
    logicHash: generateHash(unit.codeSnippet)
  }));

  return { logicUnits };
};
