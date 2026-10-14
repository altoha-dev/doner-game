export const CHARACTERS = [
  { id: 'altoha', displayName: 'Altoha', description: 'Стартовый персонаж. Готов к первому приключению.', unlockCost: 0, starter: true, order: 0 },
  { id: 'aigerim', displayName: 'Aigerim', description: 'Новый персонаж для твоей истории.', unlockCost: 1, starter: false, order: 1 },
  { id: 'temik', displayName: 'Temik', description: 'Ещё один выбор для нового приключения.', unlockCost: 1, starter: false, order: 2 },
] as const;

export type CharacterId = typeof CHARACTERS[number]['id'];
export interface CharacterDefinition {
  readonly id: CharacterId;
  readonly displayName: string;
  readonly description: string;
  readonly unlockCost: number;
  readonly starter: boolean;
  readonly order: number;
}

export function getCharacter(id: string | null | undefined): CharacterDefinition | undefined {
  return CHARACTERS.find(character => character.id === id);
}

export const STARTER_CHARACTER = CHARACTERS.find(character => character.starter)!;
