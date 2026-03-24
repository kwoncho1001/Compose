import { Type } from "@google/genai";
import { Note } from "../../types";
import { MODEL_NAME, systemInstruction } from "./config";
import { generateContentWithRetry } from "./core";
import { safeJsonParse } from "./utils";

export const updateCodeSnapshot = async (
  fileName: string,
  fileContent: string,
  allNotes: Note[],
  fileSha: string,
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

  const prompt = `
당신은 '아키텍처 역공학 및 설계-구현 동기화 전문가'입니다. 
제공된 소스 코드를 분석하여, 파일의 물리적 구조가 아닌 **'원자적 로직 단위(Atomic Logic Unit)'**를 추출하십시오.

[분석 대상 코드]
파일 경로: ${fileName}
파일 SHA: ${fileSha}
소스 코드:
${fileContent.slice(0, 15000)}

[기존 설계도 (Task/Feature) 목록]
${JSON.stringify(designNotes.map(n => ({ id: n.id, title: n.title, noteType: n.noteType, summary: n.summary, folder: n.folder })))}

[기존 Reference 목록 (업데이트 매칭용)]
${JSON.stringify(referenceNotes.map(n => ({ id: n.id, title: n.title, summary: n.summary, githubLink: n.githubLink, logicHash: n.logicHash })))}

[작업 지침]
1. **원자적 로직 추출 (Step 1)**: 
   - 파일의 물리적 구조를 무시하고, 5~10줄 내외의 **원자적 로직 단위(Atomic Logic Unit)**를 추출하십시오. (최대 10개의 가장 핵심적인 로직 유닛만 추출하여 응답 크기를 제한하십시오.)
   - 단순한 함수 나열이 아니라, 정규표현식, 조건부 분기, 에러 처리 등 독립적인 의도를 가진 블록을 모두 별도의 단위로 분해하십시오.
   - 각 유닛에 대해 해당 로직을 포함하는 **정확한 코드 조각(codeSnippet)**을 추출하십시오.
   - **CRITICAL**: \`codeSnippet\`은 [분석 대상 코드]에 있는 그대로 **정확히 일치하게** 추출해야 합니다. 템플릿 리터럴을 평가하거나, [기존 설계도 목록] 등의 외부 데이터를 주입하거나, 코드를 임의로 수정해서는 절대 안 됩니다.
   - **IMPORTANT**: 응답이 잘리지 않도록 \`codeSnippet\`은 로직의 핵심 부분만 포함하고, 너무 길 경우 생략(...)을 사용하지 말고 로직의 시작과 끝이 명확한 최소 단위로 유지하십시오.
   - 각 로직 유닛에 대해 고유한 **logicHash**를 생성하십시오. 이는 코드 내용이 변하지 않으면 유지되어야 하는 지문입니다.

2. **설계도 매핑 및 자동 부모(Task/Feature) 생성 (Step 2 & 2-1)**:
   - 각 유닛은 반드시 대응하는 부모(Task 또는 Feature) 노드를 가져야 합니다.
   - 만약 매핑할 적절한 노드가 없다면, 도메인을 분석하여 새로운 부모 노드를 제안하십시오 (\`suggestedTask\`).
   - **부모 생성 규칙**:
     - **noteType 결정**: 해당 로직이 구체적인 '행위'나 '절차'라면 **'Task'**로, 로직 자체가 하나의 독립적인 '기능 단위'나 '명세'를 대표한다면 **'Feature'**로 설정하십시오.
     - **상태(Status)**: 이미 구현된 코드이므로 무조건 'Done'으로 설정합니다.
     - **요약(Summary)**: 로직을 바탕으로 한 문장 형태의 '초핵심 기술 요약'을 작성합니다.
   - **전략적 계층**: 오직 이 로직을 직접 담을 직계 부모(말단 Task 혹은 핵심 Feature)만 제안하십시오.
   - 제안된 노드의 폴더는 도메인 맥락에 맞게 설정하십시오.

3. **기존 구현체 업데이트 매칭**:
   - 만약 기존 Reference 목록에 이 파일과 관련된 동일한 목적의 구현 노트가 있다면 \`matchedReferenceId\`를 지정하십시오. 

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
  });

  if (signal?.aborted) throw new Error("Operation cancelled");

  const result = safeJsonParse(response.text || "{}", { logicUnits: [] });
  return {
    logicUnits: result?.logicUnits || []
  };
};
