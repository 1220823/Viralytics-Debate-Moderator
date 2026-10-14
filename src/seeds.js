export const SEED_QUESTIONS = [
  'Poderá uma superinteligência tomar decisões mais eficazes do que os seres humanos em problemas extremamente complexos?',
  'Será que os potenciais benefícios da superinteligência justificam os riscos associados ao seu desenvolvimento?',
];
export const questionKey = (text) => text.trim().replace(/\s+/g, ' ').toLocaleLowerCase('pt-PT');
export const sortQuestions = (questions) => [...questions].sort((a, b) => (b.score || 0) - (a.score || 0) || a.createdAt - b.createdAt || a.id.localeCompare(b.id));
export function seedQuestions(sessionId, now = Date.now()) {
  return SEED_QUESTIONS.map((text, i) => ({ id: crypto.randomUUID(), sessionId, token: null, text, status: 'new', origin: 'moderation', createdAt: now + i, reactions: {} }));
}
