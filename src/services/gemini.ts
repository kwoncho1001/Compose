import { GoogleGenAI, Type, Schema } from "@google/genai";
import { Note, GCM, NoteStatus } from "../types";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

const noteSchema: Schema = {
  type: Type.OBJECT,
  properties: {
    title: { type: Type.STRING, description: "Title of the note" },
    folder: { type: Type.STRING, description: "Dynamic folder category (e.g., Auth_Logic, UI_Components)" },
    userView: { type: Type.STRING, description: "User-friendly description of the feature" },
    aiSpec: { type: Type.STRING, description: "Technical AI specification (e.g., function signatures, data structures)" },
    yamlMetadata: { type: Type.STRING, description: "YAML formatted string containing metadata like author, version, tags, etc." },
  },
  required: ["title", "folder", "userView", "aiSpec", "yamlMetadata"],
};

export const decomposeFeature = async (
  featureRequest: string,
  currentGcm: GCM
): Promise<{ newNotes: Omit<Note, 'id' | 'status'>[]; updatedGcm: GCM }> => {
  
  // Step 1: Main Feature Design
  const step1Prompt = `
용도: 메인 기능 설계
페르소나: 노련한 시스템 아키텍트이자 프로덕트 매니저
목표: 기능의 핵심 가치를 정의하고 3~7개의 전략적 구성 요소를 도출합니다.

User Request: "${featureRequest}"

Task:
1. 핵심 목표 및 가치 정의
2. 전략적 구성 요소 분할 (Component Breakdown) - 3~7개
3. 상위 수준의 데이터 흐름
4. 사용자 경험(UX) 시나리오
5. 미래 확장성 및 실험적 제안

Return JSON:
{
  "title": "Main Feature Title",
  "folder": "00_Core_Features",
  "userView": "핵심 목표 및 가치, UX 시나리오 등 (Markdown)",
  "aiSpec": "상위 수준의 데이터 흐름, 미래 확장성 등 (Markdown)",
  "yamlMetadata": "YAML metadata string",
  "components": ["Component 1", "Component 2", "Component 3"]
}
`;

  const step1Response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: step1Prompt,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          title: { type: Type.STRING },
          folder: { type: Type.STRING },
          userView: { type: Type.STRING },
          aiSpec: { type: Type.STRING },
          yamlMetadata: { type: Type.STRING },
          components: { type: Type.ARRAY, items: { type: Type.STRING } },
        },
        required: ["title", "folder", "userView", "aiSpec", "yamlMetadata", "components"],
      },
    },
  });

  const mainFeature = JSON.parse(step1Response.text || "{}");

  // Step 2: Module Detailed Specs
  const step2Prompt = `
용도: 모듈별 상세 노트 작성
페르소나: 친절한 기술 커뮤니케이터 & 수석 시스템 아키텍트

Main Feature: ${mainFeature.title}
Components to detail: ${mainFeature.components.join(', ')}
Current GCM: ${JSON.stringify(currentGcm)}

Task:
1. 각 구성 요소에 대해 상세 노트를 작성합니다.
2. userView에는 [사람을 위한 기능 설명] (핵심 역할, 무엇을 하는가, 어떻게 작동하는가 등)을 작성합니다.
3. aiSpec에는 [AI를 위한 기술 명세] (데이터 인터페이스, 단계별 알고리즘, 예외 처리 등)를 작성합니다.
4. GCM을 업데이트합니다 (새로운 엔티티, 변수 추가).
5. 각 노트의 성격에 맞는 동적 폴더명(예: Auth_Logic, UI_Components, Data_Models 등)을 생성하여 지정합니다.

Return JSON:
{
  "detailNotes": [ array of notes matching the schema ],
  "updatedGcm": { "entities": {...}, "variables": {...} }
}
`;

  const step2Response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: step2Prompt,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          detailNotes: { type: Type.ARRAY, items: noteSchema },
          updatedGcm: {
            type: Type.OBJECT,
            properties: {
              entities: { type: Type.OBJECT },
              variables: { type: Type.OBJECT },
            },
            required: ["entities", "variables"],
          },
        },
        required: ["detailNotes", "updatedGcm"],
      },
    },
  });

  const step2Result = JSON.parse(step2Response.text || "{}");
  
  const mainNote: Omit<Note, 'id' | 'status'> = {
    title: mainFeature.title,
    folder: mainFeature.folder,
    userView: mainFeature.userView,
    aiSpec: mainFeature.aiSpec,
    yamlMetadata: mainFeature.yamlMetadata,
    isMainFeature: true,
  };

  return {
    newNotes: [mainNote, ...(step2Result.detailNotes || [])],
    updatedGcm: step2Result.updatedGcm || currentGcm,
  };
};

export const refactorFolders = async (notes: Note[]): Promise<Record<string, string>> => {
  const prompt = `
Analyze the following notes and reorganize them into a highly efficient, logical folder tree structure.
Create dynamic folder names that best represent the architecture of the project.

Notes:
${JSON.stringify(notes.map(n => ({ id: n.id, title: n.title, currentFolder: n.folder })), null, 2)}

Return a JSON object mapping each note ID to its new folder name.
`;
  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: prompt,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        description: "Dictionary mapping note IDs to their new folder name",
      },
    },
  });
  return JSON.parse(response.text || "{}");
};

export const updateSingleNote = async (
  note: Note,
  command: string,
  gcm: GCM,
  allNotes: Note[]
): Promise<{ updatedNote: Note; updatedGcm: GCM; affectedNoteIds: string[] }> => {
  const prompt = `
You are a Targeted Command Executor. Update the specific note based on the user's command.
Also determine if this change affects the Global Context Map (GCM) and identify any other notes that might conflict or need updates due to this change.

Target Note:
${JSON.stringify(note, null, 2)}

Command: "${command}"

Current GCM:
${JSON.stringify(gcm, null, 2)}

All Other Notes (for impact analysis):
${JSON.stringify(allNotes.filter(n => n.id !== note.id).map(n => ({ id: n.id, title: n.title })), null, 2)}

Return JSON:
{
  "updatedNote": { ...note with updated userView, aiSpec, yamlMetadata },
  "updatedGcm": { ...updated GCM if affected, else current GCM },
  "affectedNoteIds": ["id1", "id2"] // IDs of other notes potentially affected
}
`;
  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: prompt,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          updatedNote: noteSchema,
          updatedGcm: {
            type: Type.OBJECT,
            properties: {
              entities: { type: Type.OBJECT },
              variables: { type: Type.OBJECT },
            },
          },
          affectedNoteIds: { type: Type.ARRAY, items: { type: Type.STRING } },
        },
        required: ["updatedNote", "updatedGcm", "affectedNoteIds"],
      },
    },
  });
  
  const result = JSON.parse(response.text || "{}");
  return {
    updatedNote: { ...note, ...result.updatedNote },
    updatedGcm: result.updatedGcm || gcm,
    affectedNoteIds: result.affectedNoteIds || [],
  };
};

export const checkConsistency = async (
  notes: Note[],
  gcm: GCM
): Promise<Record<string, { description: string; suggestion: string }>> => {
  const prompt = `
You are an On-Demand Consistency Checker. Scan all notes and the GCM for contradictions, variable type mismatches, or logical gaps.

GCM:
${JSON.stringify(gcm, null, 2)}

Notes:
${JSON.stringify(notes.map(n => ({ id: n.id, title: n.title, aiSpec: n.aiSpec })), null, 2)}

Identify any conflicts. Return a JSON object mapping the conflicting note ID to the conflict details.
If no conflicts, return an empty object {}.

Return JSON format:
{
  "noteId1": {
    "description": "Conflict description",
    "suggestion": "How to fix it"
  }
}
`;
  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: prompt,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        description: "Dictionary mapping note IDs to conflict details",
      },
    },
  });
  return JSON.parse(response.text || "{}");
};

export const suggestNextSteps = async (
  notes: Note[],
  githubFiles: string[]
): Promise<{ suggestion: string; updatedStatuses: Record<string, NoteStatus> }> => {
  const prompt = `
You are Vibe-Architect. Analyze the current project state and suggest the next steps for the user.

Current Notes (Design):
${JSON.stringify(notes.map(n => ({ id: n.id, title: n.title, status: n.status })), null, 2)}

Current GitHub Files (Implementation):
${JSON.stringify(githubFiles.slice(0, 100), null, 2)}

Task:
1. Compare the designed notes with the implemented files.
2. Determine if any "Planned" or "In-Progress" notes have been implemented based on the file names. If so, mark their status as "Done".
3. Identify which features are designed but not yet implemented (Status: Planned).
4. Suggest a prioritized next step for the user to implement.

Return a JSON object with two keys:
1. "suggestion": A concise, encouraging message guiding the user on what to build next.
2. "updatedStatuses": A dictionary mapping note IDs to their new status ('Planned', 'In-Progress', or 'Done').
`;

  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: prompt,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          suggestion: { type: Type.STRING },
          updatedStatuses: { type: Type.OBJECT },
        },
        required: ["suggestion", "updatedStatuses"],
      },
    },
  });

  const result = JSON.parse(response.text || "{}");
  return {
    suggestion: result.suggestion || "No suggestions available.",
    updatedStatuses: result.updatedStatuses || {},
  };
};

export const checkConflict = async (aiSpec: string, fileContent: string): Promise<{ isMatch: boolean; reason: string }> => {
  const prompt = `
You are a Conflict Manager. Compare the AI Specification with the actual GitHub source code.
Determine if the source code logically implements the AI Specification.

AI Specification:
${aiSpec}

GitHub Source Code:
${fileContent.slice(0, 15000)}

Task:
1. Check if the code matches the design logically.
2. If it matches, set isMatch to true.
3. If it does not match (e.g., missing features, different logic), set isMatch to false and provide a brief reason.

Return JSON: { "isMatch": boolean, "reason": "string" }
`;
  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: prompt,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          isMatch: { type: Type.BOOLEAN },
          reason: { type: Type.STRING },
        },
        required: ["isMatch", "reason"],
      },
    },
  });
  return JSON.parse(response.text || '{"isMatch": false, "reason": "Failed to parse"}');
};

export const updateSpecFromCode = async (aiSpec: string, fileContent: string): Promise<string> => {
  const prompt = `
Update the following AI Specification to match the provided source code.
Keep the same format but adjust the logic and details to reflect the code.

Current AI Spec:
${aiSpec}

Source Code:
${fileContent.slice(0, 15000)}
`;
  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: prompt,
  });
  return response.text || aiSpec;
};

export const generateFixGuide = async (aiSpec: string, fileContent: string): Promise<string> => {
  const prompt = `
The source code does not match the AI Specification.
Provide a concise guide on how to modify the source code to match the AI Specification.

AI Spec:
${aiSpec}

Source Code:
${fileContent.slice(0, 15000)}
`;
  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: prompt,
  });
  return response.text || "No guide available.";
};
