// Dicionário centralizado de tradução de tipos de eventos para português
export const EVENT_TYPE_LABELS_PT: Record<string, string> = {
  'goal': 'Gol',
  'goal_home': 'Gol Casa',
  'goal_away': 'Gol Fora',
  'shot': 'Finalização',
  'shot_on_target': 'Finalização no Gol',
  'foul': 'Falta',
  'corner': 'Escanteio',
  'offside': 'Impedimento',
  'yellow_card': 'Cartão Amarelo',
  'red_card': 'Cartão Vermelho',
  'substitution': 'Substituição',
  'penalty': 'Pênalti',
  'free_kick': 'Tiro Livre',
  'save': 'Defesa',
  'clearance': 'Corte',
  'assist': 'Assistência',
  'high_press': 'Pressão Alta',
  'transition': 'Transição',
  'ball_recovery': 'Recuperação',
  'cross': 'Cruzamento',
  'tackle': 'Desarme',
  'interception': 'Interceptação',
  'dribble': 'Drible',
  'pass': 'Passe',
  'header': 'Cabeceio',
  'block': 'Bloqueio',
  'halftime': 'Intervalo',
  'kickoff': 'Início',
  'fulltime': 'Fim de Jogo',
};

// Versão em maiúsculas para badges e vinhetas
export const EVENT_TYPE_LABELS_PT_UPPER: Record<string, string> = Object.fromEntries(
  Object.entries(EVENT_TYPE_LABELS_PT).map(([key, value]) => [key, value.toUpperCase()])
);

// Função helper para obter o label traduzido
export function getEventLabel(eventType: string, uppercase = false): string {
  const labels = uppercase ? EVENT_TYPE_LABELS_PT_UPPER : EVENT_TYPE_LABELS_PT;
  return labels[eventType] || eventType.replace(/_/g, ' ');
}

// Função helper para obter o label traduzido em maiúsculas
export function getEventLabelUpper(eventType: string): string {
  return getEventLabel(eventType, true);
}
