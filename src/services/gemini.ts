import { GoogleGenAI, Type, Schema } from "@google/genai";
import { Note, GCM, FolderName, NoteStatus } from "../types";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

const noteSchema: Schema = {
  type: Type.OBJECT,
  properties: {
    title: { type: Type.STRING, description: "Title of the note" },
    folder: {
      type: Type.STRING,
      description: "Folder category",
      enum: ["01_Common", "02_Data_Logic", "03_Interface", "04_User_Experience"],
    },
    userView: { type: Type.STRING, description: "User-friendly description of the feature" },
    aiSpec: { type: Type.STRING, description: "Technical AI specification (e.g., function signatures, data structures)" },
    yamlMetadata: { type: Type.STRING, description: "YAML formatted string containing metadata like author, version, tags, etc." },
  },
  required: ["title", "folder", "userView", "aiSpec", "yamlMetadata"],
};

const gcmEntitySchema: Schema = {
  type: Type.OBJECT,
  properties: {
    name: { type: Type.STRING },
    type: { type: Type.STRING },
    description: { type: Type.STRING },
    properties: {
      type: Type.OBJECT,
      description: "Key-value pairs of property names and their types",
    },
  },
  required: ["name", "type", "description", "properties"],
};

export const decomposeFeature = async (
  featureRequest: string,
  currentGcm: GCM
): Promise<{ newNotes: Omit<Note, 'id' | 'status'>[]; updatedGcm: GCM }> => {
  const prompt = `
You are Vibe-Architect, an advanced system that recursively decomposes user feature requests into modular components.

User Request: "${featureRequest}"

Current Global Context Map (GCM):
${JSON.stringify(currentGcm, null, 2)}

Task 1: Decompose the feature into child notes. Each note must belong to one of these folders: 01_Common, 02_Data_Logic, 03_Interface, 04_User_Experience.
Task 2: Update the Global Context Map (GCM) with any new entities, data structures, or global variables introduced by this feature. Ensure consistency with the existing GCM.
Task 3: For each note, generate a YAML metadata string containing fields like 'author', 'version', 'tags', 'dependencies', and 'estimated_complexity'.

Use Chain-of-Thought reasoning to ensure no logical gaps exist between the user's request and the technical implementation.

Return a JSON object with two keys:
1. "newNotes": An array of decomposed notes.
2. "updatedGcm": The updated GCM containing "entities" and "variables".
`;

  const response = await ai.models.generateContent({
    model: "gemini-3.1-pro-preview",
    contents: prompt,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          newNotes: {
            type: Type.ARRAY,
            items: noteSchema,
          },
          updatedGcm: {
            type: Type.OBJECT,
            properties: {
              entities: {
                type: Type.OBJECT,
                description: "Dictionary of GCM entities",
              },
              variables: {
                type: Type.OBJECT,
                description: "Dictionary of global variables",
              },
            },
            required: ["entities", "variables"],
          },
        },
        required: ["newNotes", "updatedGcm"],
      },
    },
  });

  const result = JSON.parse(response.text || "{}");
  return {
    newNotes: result.newNotes || [],
    updatedGcm: result.updatedGcm || { entities: {}, variables: {} },
  };
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
${JSON.stringify(githubFiles.slice(0, 100), null, 2)} // Limiting to 100 files to avoid token limits

Task:
1. Compare the designed notes with the implemented files.
2. Determine if any "Planned" or "In-Progress" notes have been implemented based on the file names. If so, mark their status as "Done".
3. Identify which features are designed but not yet implemented (Status: Planned).
4. Suggest a prioritized next step for the user to implement.

Return a JSON object with two keys:
1. "suggestion": A concise, encouraging message guiding the user on what to build next (e.g., "현재 '로그인' 기능의 설계가 완료되었습니다. 이 기능을 구현할까요?").
2. "updatedStatuses": A dictionary mapping note IDs to their new status ('Planned', 'In-Progress', or 'Done').
`;

  const response = await ai.models.generateContent({
    model: "gemini-3.1-pro-preview",
    contents: prompt,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          suggestion: { type: Type.STRING },
          updatedStatuses: {
            type: Type.OBJECT,
            description: "Dictionary mapping note IDs to their new status",
          },
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
