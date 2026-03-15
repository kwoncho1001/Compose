import { GoogleGenAI, Type, Schema } from "@google/genai";
import { Note, GCM, NoteStatus } from "../types";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

const noteSchema: Schema = {
  type: Type.OBJECT,
  properties: {
    title: { type: Type.STRING, description: "Title of the note" },
    folder: { type: Type.STRING, description: "Folder category. Parent and child notes MUST be in the same folder." },
    content: { type: Type.STRING, description: "Comprehensive description and technical specification (Markdown)" },
    summary: { type: Type.STRING, description: "A brief 1-2 sentence summary of what this feature/module does" },
    parentNoteId: { type: Type.STRING, description: "ID of the parent feature/module if applicable" },
    yamlMetadata: { 
      type: Type.STRING, 
      description: "Standardized YAML: version: 1.0.0, lastUpdated: YYYY-MM-DD, tags: [tag1, tag2]" 
    },
  },
  required: ["title", "folder", "content", "summary", "yamlMetadata"],
};

const safeJsonParse = (text: string) => {
  try {
    // Remove potential markdown code blocks
    const cleaned = text.replace(/^```json\n?/, '').replace(/\n?```$/, '').trim();
    return JSON.parse(cleaned);
  } catch (e) {
    console.error("Failed to parse JSON response from AI:", text);
    throw new Error(`AI returned invalid JSON: ${e instanceof Error ? e.message : String(e)}`);
  }
};

export const decomposeFeature = async (
  featureRequest: string,
  currentGcm: GCM,
  existingNotes: Note[]
): Promise<{ 
  newNotes: Omit<Note, 'id' | 'status'>[]; 
  updatedNotes: Note[];
  updatedGcm: GCM 
}> => {
  
  // Step 1: Main Feature Design & Reuse Analysis
  const step1Prompt = `
용도: 메인 기능 설계 및 기존 아키텍처 연동
목표: 신규 기능을 설계하되, 기존에 정의된 노트들과의 중복을 피하고 유사 기능은 기존 노트를 업데이트합니다.
폴더 분류 원칙: 부모 기능과 그 하위 모듈(자식)은 반드시 동일한 폴더에 위치해야 합니다.
언어 설정: 노트 제목(title)은 반드시 한국어로 작성하십시오.

기존 노트 목록 (요약):
${JSON.stringify(existingNotes.map(n => ({ id: n.id, title: n.title, folder: n.folder, summary: n.summary })))}

User Request: "${featureRequest}"

Task:
1. 기존 노트 중 이번 요청과 유사한 맥락이 있는지 판단합니다.
2. 유사한 노드가 있다면 해당 노드의 ID를 사용하여 업데이트 명세를 작성합니다.
3. 완전히 새로운 구성 요소만 신규 노트로 생성합니다.
4. 모든 노트(신규/기존)는 논리적인 기능 그룹(Folder)으로 분류되어야 하며, 부모-자식 관계는 같은 폴더에 있어야 합니다.
5. Metadata는 다음 형식을 따릅니다: version, lastUpdated(YYYY-MM-DD), tags. (author, complexity 등은 포함하지 마십시오)

Return JSON:
{
  "title": "한국어 제목",
  "folder": "Folder_Name",
  "content": "핵심 목표, UX 시나리오, 데이터 흐름, 기술 명세 등을 포함한 통합 문서 (Markdown)",
  "summary": "이 기능이 수행하는 역할에 대한 1-2문장 요약",
  "yamlMetadata": "version: 1.0.0\\nlastUpdated: 2026-03-15\\ntags: [tag1]",
  "reusedNoteIds": ["id1", "id2"],
  "newComponents": ["New Component 1"]
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
          content: { type: Type.STRING },
          summary: { type: Type.STRING },
          yamlMetadata: { type: Type.STRING },
          reusedNoteIds: { type: Type.ARRAY, items: { type: Type.STRING } },
          newComponents: { type: Type.ARRAY, items: { type: Type.STRING } },
        },
        required: ["title", "folder", "content", "summary", "yamlMetadata", "reusedNoteIds", "newComponents"],
      },
    },
  });

  const mainFeature = safeJsonParse(step1Response.text || "{}");

  // Step 2: Module Detailed Specs (New & Reused)
  // To avoid huge payloads, we only send the content of notes that are actually being reused
  const reusedNotesContent = existingNotes.filter(n => mainFeature.reusedNoteIds.includes(n.id));

  const step2Prompt = `
용도: 메인 기능의 특정 모듈에 대해 기능 설명과 기술 명세를 통합하여 작성합니다.
목표: [[메인 기능 노트]]의 하위 모듈에 대한 '핵심 기능', '역할', '구현 로직', '데이터 규약'을 하나의 통합 문서(content)에 상세히 정의합니다.
폴더 분류 원칙: 하위 모듈은 반드시 상위 기능인 "${mainFeature.title}"과 동일한 폴더("${mainFeature.folder}")에 위치해야 합니다.
언어 설정: 모든 노트 제목(title)은 반드시 한국어로 작성하십시오.

Main Feature: ${mainFeature.title}
Main Feature Summary: ${mainFeature.summary}
New Components to detail: ${mainFeature.newComponents.join(', ')}
Existing Notes to update: ${JSON.stringify(reusedNotesContent.map(n => ({ id: n.id, title: n.title, content: n.content })))}
Current GCM: ${JSON.stringify(currentGcm)}

지시사항:
1. 신규 컴포넌트에 대해서는 새로운 상세 노트를 작성합니다. parentNoteId를 적절히 설정하십시오.
2. 기존 노트(Reused)에 대해서는 기존 내용을 보강하여 업데이트된 노트를 작성합니다.
3. 모든 노트의 folder는 "${mainFeature.folder}"로 통일하십시오.
4. GCM을 업데이트합니다.
5. Metadata는 다음 형식을 따릅니다: version, lastUpdated(2026-03-15), tags. (author, complexity 등은 포함하지 마십시오)

Return JSON:
{
  "newDetailNotes": [ array of notes matching the schema ],
  "updatedDetailNotes": [ array of notes matching the schema but including the 'id' field ],
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
          newDetailNotes: { type: Type.ARRAY, items: noteSchema },
          updatedDetailNotes: { 
            type: Type.ARRAY, 
            items: {
              ...noteSchema,
              properties: {
                ...noteSchema.properties,
                id: { type: Type.STRING }
              },
              required: [...(noteSchema.required || []), "id"]
            } 
          },
          updatedGcm: {
            type: Type.OBJECT,
            properties: {
              entities: { type: Type.OBJECT },
              variables: { type: Type.OBJECT },
            },
            required: ["entities", "variables"],
          },
        },
        required: ["newDetailNotes", "updatedDetailNotes", "updatedGcm"],
      },
    },
  });

  const step2Result = safeJsonParse(step2Response.text || "{}");
  
  const mainNote: Omit<Note, 'id' | 'status'> = {
    title: mainFeature.title,
    folder: mainFeature.folder,
    content: mainFeature.content,
    summary: mainFeature.summary,
    yamlMetadata: mainFeature.yamlMetadata,
  };

  return {
    newNotes: [mainNote, ...(step2Result.newDetailNotes || [])],
    updatedNotes: step2Result.updatedDetailNotes || [],
    updatedGcm: step2Result.updatedGcm || currentGcm,
  };
};

export const consolidateNotes = async (notes: Note[], gcm: GCM): Promise<{
  mergedNotes: Note[];
  removedNoteIds: string[];
  updatedGcm: GCM;
}> => {
  // Limit notes content to avoid huge prompt
  const simplifiedNotes = notes.map(n => ({
    id: n.id,
    title: n.title,
    folder: n.folder,
    content: n.content.slice(0, 2000), // Truncate very long content for analysis
  }));

  const prompt = `
당신은 시스템 최적화 전문가입니다. 현재 프로젝트의 모든 노트를 분석하여 기능이 겹치거나, 지나치게 파편화된 모듈을 논리적으로 통폐합하십시오.
특히 비슷한 맥락(예: '실력 설정'과 '실력 업데이트')은 하나의 핵심 모듈로 합치는 것이 효율적입니다.

Notes Summary: ${JSON.stringify(simplifiedNotes)}
GCM: ${JSON.stringify(gcm)}

결과물:
1. 병합되어 내용이 보강된 노트 목록 (mergedNotes)
2. 삭제될 중복 노트 ID 목록 (removedNoteIds)
3. 변경된 GCM (updatedGcm)

Return JSON:
{
  "mergedNotes": [ array of notes ],
  "removedNoteIds": ["id1", "id2"],
  "updatedGcm": { ... }
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
          mergedNotes: { type: Type.ARRAY, items: { type: Type.OBJECT } },
          removedNoteIds: { type: Type.ARRAY, items: { type: Type.STRING } },
          updatedGcm: { type: Type.OBJECT },
        },
        required: ["mergedNotes", "removedNoteIds", "updatedGcm"],
      },
    },
  });
  return safeJsonParse(response.text || "{}");
};

export const refactorFolders = async (notes: Note[]): Promise<Record<string, string>> => {
  const prompt = `
Analyze the following notes and reorganize them into a highly efficient, logical folder tree structure.
Create dynamic folder names that best represent the architecture of the project.

CRITICAL RULE: 
- Parent notes and their child modules MUST be placed in the EXACT SAME folder.
- If a note has a parentNoteId, it must inherit the folder of its parent.

Notes:
${JSON.stringify(notes.map(n => ({ id: n.id, title: n.title, currentFolder: n.folder, parentNoteId: n.parentNoteId })), null, 2)}

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
  return safeJsonParse(response.text || "{}");
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
  "updatedNote": { ...note with updated content, summary, yamlMetadata, parentNoteId },
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
  
  const result = safeJsonParse(response.text || "{}");
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

Notes Summary:
${JSON.stringify(notes.map(n => ({ id: n.id, title: n.title, content: n.content.slice(0, 1000) })), null, 2)}

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
  return safeJsonParse(response.text || "{}");
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

  const result = safeJsonParse(response.text || "{}");
  return {
    suggestion: result.suggestion || "No suggestions available.",
    updatedStatuses: result.updatedStatuses || {},
  };
};

export const checkConflict = async (content: string, fileContent: string): Promise<{ isMatch: boolean; reason: string }> => {
  const prompt = `
You are a Conflict Manager. Compare the Design Content (Specification) with the actual GitHub source code.
Determine if the source code logically implements the design.

Design Content:
${content}

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
  return safeJsonParse(response.text || '{"isMatch": false, "reason": "Failed to parse"}');
};

export const updateSpecFromCode = async (content: string, fileContent: string): Promise<string> => {
  const prompt = `
Update the following Design Content to match the provided source code.
Keep the same format but adjust the logic and details to reflect the code.

Current Design Content:
${content}

Source Code:
${fileContent.slice(0, 15000)}
`;
  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: prompt,
  });
  return response.text || content;
};

export const generateFixGuide = async (content: string, fileContent: string): Promise<string> => {
  const prompt = `
The source code does not match the Design Content.
Provide a concise guide on how to modify the source code to match the Design Content.

Design Content:
${content}

Source Code:
${fileContent.slice(0, 15000)}
`;
  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: prompt,
  });
  return response.text || "No guide available.";
};

export const generateSubModules = async (
  mainNote: Note,
  currentGcm: GCM,
  existingNotes: Note[]
): Promise<{ 
  newNotes: Omit<Note, 'id' | 'status'>[]; 
  updatedGcm: GCM 
}> => {
  const prompt = `
용도: 메인 기능의 하위 모듈 상세 설계
목표: 주어진 메인 기능 노트를 분석하여 필요한 하위 구성 요소(Sub-modules)를 상세 설계합니다.
폴더 분류 원칙: 하위 모듈은 반드시 상위 기능인 "${mainNote.title}"과 동일한 폴더("${mainNote.folder}")에 위치해야 합니다.
언어 설정: 모든 노트 제목(title)은 반드시 한국어로 작성하십시오.

메인 기능:
제목: ${mainNote.title}
내용: ${mainNote.content}
요약: ${mainNote.summary}

기존 노트 목록 (중복 방지용):
${JSON.stringify(existingNotes.map(n => ({ id: n.id, title: n.title, folder: n.folder })))}

Task:
1. 메인 기능을 구현하기 위해 필요한 하위 모듈(UI 컴포넌트, API, 데이터 모델 등)을 식별합니다.
2. 기존 노트와 중복되지 않는 새로운 하위 모듈만 생성합니다.
3. 각 하위 모듈은 메인 기능과 동일한 폴더("${mainNote.folder}")에 배치합니다.
4. parentNoteId를 "${mainNote.id}"로 설정하십시오.
5. Metadata는 다음 형식을 따릅니다: version, lastUpdated(2026-03-15), tags.

Return JSON:
{
  "newNotes": [
    {
      "title": "한국어 하위 모듈 제목",
      "folder": "${mainNote.folder}",
      "content": "Markdown description and technical specification",
      "summary": "Brief summary",
      "yamlMetadata": "version: 1.0.0\\nlastUpdated: 2026-03-15\\ntags: [tag1]",
      "parentNoteId": "${mainNote.id}"
    }
  ],
  "updatedGcm": { ... }
}
`;

  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: prompt,
    config: { responseMimeType: "application/json" }
  });

  const result = safeJsonParse(response.text);
  return {
    newNotes: result.newNotes || [],
    updatedGcm: result.updatedGcm || currentGcm
  };
};
