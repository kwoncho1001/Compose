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

2. **설계도 매핑 및 자동 Task 생성 (Step 2 & 2-1)**:
   - 각 유닛은 반드시 대응하는 Task 노드를 가져야 합니다. 추출된 각 로직 유닛이 [기존 설계도 목록] 중 어떤 'Task'를 구현하고 있는지 ID를 매핑하십시오 (\`matchedTaskId\`).
   - 만약 매핑할 적절한 Task가 없다면, 도메인을 분석하여 즉시 새로운 **말단 Task**를 제안하십시오 (\`suggestedTask\`).
   - **Task 생성 규칙**: 매핑할 Task가 없을 때 제안하는 suggestedTask는 반드시 다음을 준수합니다.
     - 상태(Status): 이미 구현된 코드에서 추출되었으므로 무조건 'Done'으로 설정합니다.
     - 요약(Summary): Reference 파일의 로직을 바탕으로 한 문장 형태의 **'초핵심 기술 요약'**을 작성합니다.
     - 태그(Tags): 'auto-generated', 'design-leading-code'와 함께 로직의 특성(예: 'Logic', 'API')을 포함합니다.
   - **전략적 생략**: 상위 계층(Epic, Feature)은 여기서 생성하지 마십시오. 오직 이 로직을 담을 '말단 Task'만 제안하십시오. (계층 구조 보정 시스템이 나중에 부모를 찾아줄 것입니다.)
   - 제안된 Task의 폴더는 도메인 맥락에 맞게 설정하십시오.

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
        "title": "새로 제안하는 Task 제목",
        "folder": "도메인/경로",
        "content": "Task의 상세 설계 내용",
        "summary": "코드를 기반으로 한 1문장 초핵심 요약",
        "status": "Done",
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
                    status: { type: Type.STRING, enum: ['Done'], description: "자동 생성된 Task의 상태는 항상 Done" },
                    tags: { type: Type.ARRAY, items: { type: Type.STRING }, description: "auto-generated, design-leading-code 포함" }
                  },
                  required: ["title", "folder", "content", "summary", "status", "tags"]
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
