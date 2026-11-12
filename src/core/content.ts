import archetypes from '../data/archetypes.json';
import tasks from '../data/tasks.json';
import pratiche from '../data/pratiche.json';
import team from '../data/team.json';
import type { Archetype, PraticaDef, TaskDef } from './types';

export interface Content {
  archetypes: Archetype[];
  tasks: TaskDef[];
  pratiche: PraticaDef[];
  team: { id: string; name: string; archetypeId: string }[];
}

export const defaultContent: Content = {
  archetypes: archetypes as Archetype[],
  tasks: tasks as TaskDef[],
  pratiche: pratiche as PraticaDef[],
  team,
};
