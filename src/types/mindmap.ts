import { Note } from '../types';

export interface MindMapNode {
  id: string;
  noteId?: string;
  text: string;
  x: number;
  y: number;
  val: number;
  type: 'domain' | 'note';
  status: string;
  summary: string;
  domain?: string;
  noteType?: string;
  sourceFiles?: string;
  consistencyConflict?: boolean;
  parentId?: string;
  children: string[];
}

export interface MindMapLink {
  source: string;
  target: string;
  type: 'hierarchy' | 'related' | 'domain-link' | 'parent';
  isReferenceLink?: boolean;
}

export interface MindMapDimensions {
  width: number;
  height: number;
  nodeSpacing: number;
}

export type ViewMode = 'TOTAL' | 'DOMAIN';
