import { useState, useEffect, useCallback } from 'react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Play, Pause, RotateCcw, ChevronLeft, ChevronRight, Image, Video, Volume2 } from 'lucide-react';

interface PlayerPosition {
  id: string;
  number: number;
  x: number;
  y: number;
  team: 'home' | 'away';
}

interface PlayStep {
  players: PlayerPosition[];
  ballPosition: { x: number; y: number };
  passLine?: { from: { x: number; y: number }; to: { x: number; y: number } };
  shotLine?: { from: { x: number; y: number }; to: { x: number; y: number } };
  label?: string;
}

interface MatchEvent {
  id: string;
  event_type: string;
  minute: number | null;
  description?: string | null;
  position_x?: number | null;
  position_y?: number | null;
}

interface AnimatedTacticalPlayProps {
  event: MatchEvent;
  homeTeam: string;
  awayTeam: string;
  onViewThumbnail?: (eventId: string) => void;
  onPlayVideo?: (eventId: string) => void;
  thumbnail?: string;
  hasVideo?: boolean;
  className?: string;
}

// Generate tactical play based on event type
function generatePlaySteps(event: MatchEvent): PlayStep[] {
  const eventX = event.position_x ?? 85;
  const eventY = event.position_y ?? 50;
  
  switch (event.event_type) {
    case 'goal':
      return [
        {
          label: 'Construção do Ataque',
          players: [
            { id: '1', number: 1, x: 5, y: 50, team: 'home' },
            { id: '2', number: 4, x: 25, y: 25, team: 'home' },
            { id: '3', number: 3, x: 25, y: 75, team: 'home' },
            { id: '4', number: 6, x: 40, y: 50, team: 'home' },
            { id: '5', number: 8, x: 50, y: 35, team: 'home' },
            { id: '6', number: 10, x: 55, y: 65, team: 'home' },
            { id: '7', number: 11, x: 65, y: 20, team: 'home' },
            { id: '8', number: 9, x: 70, y: 50, team: 'home' },
            { id: '9', number: 7, x: 65, y: 80, team: 'home' },
          ],
          ballPosition: { x: 40, y: 50 },
        },
        {
          label: 'Progressão pelo Meio',
          players: [
            { id: '1', number: 1, x: 5, y: 50, team: 'home' },
            { id: '2', number: 4, x: 30, y: 30, team: 'home' },
            { id: '3', number: 3, x: 30, y: 70, team: 'home' },
            { id: '4', number: 6, x: 50, y: 50, team: 'home' },
            { id: '5', number: 8, x: 60, y: 40, team: 'home' },
            { id: '6', number: 10, x: 65, y: 55, team: 'home' },
            { id: '7', number: 11, x: 75, y: 25, team: 'home' },
            { id: '8', number: 9, x: 80, y: 50, team: 'home' },
            { id: '9', number: 7, x: 75, y: 75, team: 'home' },
          ],
          ballPosition: { x: 60, y: 40 },
          passLine: { from: { x: 40, y: 50 }, to: { x: 60, y: 40 } },
        },
        {
          label: 'Passe para Área',
          players: [
            { id: '1', number: 1, x: 5, y: 50, team: 'home' },
            { id: '2', number: 4, x: 35, y: 35, team: 'home' },
            { id: '3', number: 3, x: 35, y: 65, team: 'home' },
            { id: '4', number: 6, x: 55, y: 50, team: 'home' },
            { id: '5', number: 8, x: 70, y: 45, team: 'home' },
            { id: '6', number: 10, x: 75, y: 50, team: 'home' },
            { id: '7', number: 11, x: 85, y: 35, team: 'home' },
            { id: '8', number: 9, x: 88, y: 50, team: 'home' },
            { id: '9', number: 7, x: 82, y: 65, team: 'home' },
          ],
          ballPosition: { x: 75, y: 50 },
          passLine: { from: { x: 60, y: 40 }, to: { x: 75, y: 50 } },
        },
        {
          label: 'GOL!',
          players: [
            { id: '1', number: 1, x: 5, y: 50, team: 'home' },
            { id: '2', number: 4, x: 40, y: 40, team: 'home' },
            { id: '3', number: 3, x: 40, y: 60, team: 'home' },
            { id: '4', number: 6, x: 60, y: 50, team: 'home' },
            { id: '5', number: 8, x: 75, y: 45, team: 'home' },
            { id: '6', number: 10, x: 85, y: 50, team: 'home' },
            { id: '7', number: 11, x: 90, y: 40, team: 'home' },
            { id: '8', number: 9, x: 95, y: 50, team: 'home' },
            { id: '9', number: 7, x: 88, y: 60, team: 'home' },
          ],
          ballPosition: { x: 98, y: 50 },
          shotLine: { from: { x: 75, y: 50 }, to: { x: 98, y: 50 } },
        },
      ];
    
    case 'shot':
    case 'shot_on_target':
      return [
        {
          label: 'Armação da Jogada',
          players: [
            { id: '1', number: 8, x: 45, y: 40, team: 'home' },
            { id: '2', number: 10, x: 55, y: 50, team: 'home' },
            { id: '3', number: 9, x: 70, y: 55, team: 'home' },
            { id: '4', number: 11, x: 65, y: 25, team: 'home' },
            { id: '5', number: 7, x: 60, y: 75, team: 'home' },
            { id: 'd1', number: 4, x: 80, y: 35, team: 'away' },
            { id: 'd2', number: 5, x: 82, y: 55, team: 'away' },
          ],
          ballPosition: { x: 55, y: 50 },
        },
        {
          label: 'Infiltração',
          players: [
            { id: '1', number: 8, x: 55, y: 45, team: 'home' },
            { id: '2', number: 10, x: 70, y: 48, team: 'home' },
            { id: '3', number: 9, x: 82, y: 52, team: 'home' },
            { id: '4', number: 11, x: 78, y: 30, team: 'home' },
            { id: '5', number: 7, x: 72, y: 70, team: 'home' },
            { id: 'd1', number: 4, x: 85, y: 40, team: 'away' },
            { id: 'd2', number: 5, x: 86, y: 58, team: 'away' },
          ],
          ballPosition: { x: 70, y: 48 },
          passLine: { from: { x: 55, y: 50 }, to: { x: 70, y: 48 } },
        },
        {
          label: 'Finalização!',
          players: [
            { id: '1', number: 8, x: 60, y: 45, team: 'home' },
            { id: '2', number: 10, x: 78, y: 50, team: 'home' },
            { id: '3', number: 9, x: 88, y: 52, team: 'home' },
            { id: '4', number: 11, x: 82, y: 35, team: 'home' },
            { id: '5', number: 7, x: 80, y: 65, team: 'home' },
            { id: 'd1', number: 4, x: 88, y: 45, team: 'away' },
            { id: 'd2', number: 5, x: 90, y: 55, team: 'away' },
          ],
          ballPosition: { x: 78, y: 50 },
          shotLine: { from: { x: 78, y: 50 }, to: { x: 98, y: 50 } },
        },
      ];
    
    case 'corner':
      return [
        {
          label: 'Posicionamento para Escanteio',
          players: [
            { id: '1', number: 7, x: 98, y: 2, team: 'home' },
            { id: '2', number: 9, x: 88, y: 40, team: 'home' },
            { id: '3', number: 4, x: 85, y: 55, team: 'home' },
            { id: '4', number: 10, x: 90, y: 60, team: 'home' },
            { id: '5', number: 8, x: 75, y: 45, team: 'home' },
            { id: '6', number: 5, x: 82, y: 65, team: 'home' },
            { id: 'd1', number: 2, x: 92, y: 45, team: 'away' },
            { id: 'd2', number: 4, x: 90, y: 52, team: 'away' },
            { id: 'd3', number: 5, x: 93, y: 58, team: 'away' },
          ],
          ballPosition: { x: 98, y: 2 },
        },
        {
          label: 'Movimentação na Área',
          players: [
            { id: '1', number: 7, x: 96, y: 5, team: 'home' },
            { id: '2', number: 9, x: 90, y: 45, team: 'home' },
            { id: '3', number: 4, x: 88, y: 50, team: 'home' },
            { id: '4', number: 10, x: 92, y: 55, team: 'home' },
            { id: '5', number: 8, x: 78, y: 48, team: 'home' },
            { id: '6', number: 5, x: 85, y: 60, team: 'home' },
            { id: 'd1', number: 2, x: 91, y: 48, team: 'away' },
            { id: 'd2', number: 4, x: 89, y: 53, team: 'away' },
            { id: 'd3', number: 5, x: 91, y: 58, team: 'away' },
          ],
          ballPosition: { x: 96, y: 5 },
        },
        {
          label: 'Cobrança!',
          players: [
            { id: '1', number: 7, x: 94, y: 8, team: 'home' },
            { id: '2', number: 9, x: 93, y: 48, team: 'home' },
            { id: '3', number: 4, x: 90, y: 52, team: 'home' },
            { id: '4', number: 10, x: 94, y: 56, team: 'home' },
            { id: '5', number: 8, x: 82, y: 50, team: 'home' },
            { id: '6', number: 5, x: 88, y: 58, team: 'home' },
            { id: 'd1', number: 2, x: 92, y: 50, team: 'away' },
            { id: 'd2', number: 4, x: 91, y: 54, team: 'away' },
            { id: 'd3', number: 5, x: 92, y: 60, team: 'away' },
          ],
          ballPosition: { x: 93, y: 48 },
          passLine: { from: { x: 98, y: 2 }, to: { x: 93, y: 48 } },
        },
      ];

    case 'penalty':
      return [
        {
          label: 'Preparação do Pênalti',
          players: [
            { id: '1', number: 10, x: 85, y: 50, team: 'home' },
            { id: '2', number: 9, x: 78, y: 55, team: 'home' },
            { id: '3', number: 11, x: 78, y: 45, team: 'home' },
            { id: 'gk', number: 1, x: 98, y: 50, team: 'away' },
          ],
          ballPosition: { x: 88, y: 50 },
        },
        {
          label: 'Cobrança',
          players: [
            { id: '1', number: 10, x: 86, y: 50, team: 'home' },
            { id: '2', number: 9, x: 80, y: 55, team: 'home' },
            { id: '3', number: 11, x: 80, y: 45, team: 'home' },
            { id: 'gk', number: 1, x: 98, y: 48, team: 'away' },
          ],
          ballPosition: { x: 88, y: 50 },
        },
        {
          label: 'GOOOL!',
          players: [
            { id: '1', number: 10, x: 90, y: 50, team: 'home' },
            { id: '2', number: 9, x: 85, y: 55, team: 'home' },
            { id: '3', number: 11, x: 85, y: 45, team: 'home' },
            { id: 'gk', number: 1, x: 98, y: 45, team: 'away' },
          ],
          ballPosition: { x: 99, y: 52 },
          shotLine: { from: { x: 88, y: 50 }, to: { x: 99, y: 52 } },
        },
      ];

    case 'foul':
      return [
        {
          label: 'Disputa de Bola',
          players: [
            { id: '1', number: 10, x: eventX - 5, y: eventY, team: 'home' },
            { id: '2', number: 8, x: eventX - 10, y: eventY - 10, team: 'home' },
            { id: 'd1', number: 6, x: eventX + 2, y: eventY + 2, team: 'away' },
            { id: 'd2', number: 4, x: eventX + 8, y: eventY - 5, team: 'away' },
          ],
          ballPosition: { x: eventX - 3, y: eventY },
        },
        {
          label: 'Falta Cometida!',
          players: [
            { id: '1', number: 10, x: eventX, y: eventY - 3, team: 'home' },
            { id: '2', number: 8, x: eventX - 8, y: eventY - 8, team: 'home' },
            { id: 'd1', number: 6, x: eventX + 5, y: eventY + 5, team: 'away' },
            { id: 'd2', number: 4, x: eventX + 10, y: eventY - 3, team: 'away' },
          ],
          ballPosition: { x: eventX, y: eventY },
        },
      ];

    case 'cross':
      return [
        {
          label: 'Subida pela Lateral',
          players: [
            { id: '1', number: 7, x: 70, y: 15, team: 'home' },
            { id: '2', number: 9, x: 80, y: 45, team: 'home' },
            { id: '3', number: 11, x: 75, y: 55, team: 'home' },
            { id: '4', number: 8, x: 65, y: 35, team: 'home' },
            { id: 'd1', number: 2, x: 82, y: 20, team: 'away' },
            { id: 'd2', number: 4, x: 88, y: 48, team: 'away' },
          ],
          ballPosition: { x: 70, y: 15 },
        },
        {
          label: 'Avanço na Linha de Fundo',
          players: [
            { id: '1', number: 7, x: 92, y: 10, team: 'home' },
            { id: '2', number: 9, x: 88, y: 48, team: 'home' },
            { id: '3', number: 11, x: 85, y: 55, team: 'home' },
            { id: '4', number: 8, x: 75, y: 40, team: 'home' },
            { id: 'd1', number: 2, x: 90, y: 18, team: 'away' },
            { id: 'd2', number: 4, x: 90, y: 50, team: 'away' },
          ],
          ballPosition: { x: 92, y: 10 },
          passLine: { from: { x: 70, y: 15 }, to: { x: 92, y: 10 } },
        },
        {
          label: 'Cruzamento na Área!',
          players: [
            { id: '1', number: 7, x: 95, y: 8, team: 'home' },
            { id: '2', number: 9, x: 92, y: 50, team: 'home' },
            { id: '3', number: 11, x: 90, y: 55, team: 'home' },
            { id: '4', number: 8, x: 82, y: 45, team: 'home' },
            { id: 'd1', number: 2, x: 93, y: 15, team: 'away' },
            { id: 'd2', number: 4, x: 91, y: 52, team: 'away' },
          ],
          ballPosition: { x: 92, y: 50 },
          passLine: { from: { x: 95, y: 8 }, to: { x: 92, y: 50 } },
        },
      ];

    case 'offside':
      return [
        {
          label: 'Linha de Impedimento',
          players: [
            { id: '1', number: 10, x: 65, y: 50, team: 'home' },
            { id: '2', number: 9, x: 88, y: 48, team: 'home' },
            { id: 'd1', number: 4, x: 85, y: 40, team: 'away' },
            { id: 'd2', number: 5, x: 85, y: 60, team: 'away' },
          ],
          ballPosition: { x: 65, y: 50 },
        },
        {
          label: 'Passe em Profundidade',
          players: [
            { id: '1', number: 10, x: 68, y: 50, team: 'home' },
            { id: '2', number: 9, x: 92, y: 48, team: 'home' },
            { id: 'd1', number: 4, x: 87, y: 42, team: 'away' },
            { id: 'd2', number: 5, x: 87, y: 58, team: 'away' },
          ],
          ballPosition: { x: 90, y: 48 },
          passLine: { from: { x: 65, y: 50 }, to: { x: 90, y: 48 } },
        },
        {
          label: 'Impedimento!',
          players: [
            { id: '1', number: 10, x: 70, y: 50, team: 'home' },
            { id: '2', number: 9, x: 94, y: 48, team: 'home' },
            { id: 'd1', number: 4, x: 88, y: 44, team: 'away' },
            { id: 'd2', number: 5, x: 88, y: 56, team: 'away' },
          ],
          ballPosition: { x: 94, y: 48 },
        },
      ];

    case 'save':
      return [
        {
          label: 'Finalização',
          players: [
            { id: '1', number: 9, x: 78, y: 48, team: 'home' },
            { id: 'gk', number: 1, x: 98, y: 50, team: 'away' },
            { id: 'd1', number: 4, x: 85, y: 45, team: 'away' },
          ],
          ballPosition: { x: 78, y: 48 },
          shotLine: { from: { x: 78, y: 48 }, to: { x: 98, y: 50 } },
        },
        {
          label: 'Defesa do Goleiro!',
          players: [
            { id: '1', number: 9, x: 80, y: 48, team: 'home' },
            { id: 'gk', number: 1, x: 97, y: 48, team: 'away' },
            { id: 'd1', number: 4, x: 86, y: 46, team: 'away' },
          ],
          ballPosition: { x: 96, y: 48 },
        },
      ];

    case 'substitution':
      return [
        {
          label: 'Substituição',
          players: [
            { id: '1', number: 10, x: 50, y: 2, team: 'home' },
            { id: '2', number: 20, x: 50, y: 98, team: 'home' },
          ],
          ballPosition: { x: 50, y: 50 },
        },
        {
          label: 'Troca de Jogadores',
          players: [
            { id: '1', number: 10, x: 50, y: 10, team: 'home' },
            { id: '2', number: 20, x: 50, y: 50, team: 'home' },
          ],
          ballPosition: { x: 50, y: 50 },
        },
      ];

    case 'yellow_card':
    case 'red_card':
      return [
        {
          label: 'Infração',
          players: [
            { id: '1', number: 6, x: eventX, y: eventY, team: 'away' },
            { id: '2', number: 10, x: eventX - 5, y: eventY - 3, team: 'home' },
          ],
          ballPosition: { x: eventX, y: eventY },
        },
        {
          label: event.event_type === 'red_card' ? 'Cartão Vermelho!' : 'Cartão Amarelo!',
          players: [
            { id: '1', number: 6, x: eventX, y: eventY, team: 'away' },
            { id: '2', number: 10, x: eventX - 8, y: eventY - 5, team: 'home' },
          ],
          ballPosition: { x: eventX + 5, y: eventY },
        },
      ];

    case 'free_kick':
      return [
        {
          label: 'Posicionamento da Barreira',
          players: [
            { id: '1', number: 10, x: 75, y: 50, team: 'home' },
            { id: '2', number: 7, x: 72, y: 45, team: 'home' },
            { id: 'd1', number: 4, x: 82, y: 48, team: 'away' },
            { id: 'd2', number: 5, x: 82, y: 50, team: 'away' },
            { id: 'd3', number: 6, x: 82, y: 52, team: 'away' },
            { id: 'gk', number: 1, x: 98, y: 50, team: 'away' },
          ],
          ballPosition: { x: 75, y: 50 },
        },
        {
          label: 'Cobrança de Falta',
          players: [
            { id: '1', number: 10, x: 76, y: 50, team: 'home' },
            { id: '2', number: 7, x: 74, y: 46, team: 'home' },
            { id: 'd1', number: 4, x: 82, y: 48, team: 'away' },
            { id: 'd2', number: 5, x: 83, y: 50, team: 'away' },
            { id: 'd3', number: 6, x: 82, y: 52, team: 'away' },
            { id: 'gk', number: 1, x: 97, y: 52, team: 'away' },
          ],
          ballPosition: { x: 92, y: 48 },
          shotLine: { from: { x: 75, y: 50 }, to: { x: 92, y: 48 } },
        },
      ];

    case 'ball_recovery':
    case 'interception':
      return [
        {
          label: 'Pressão na Bola',
          players: [
            { id: '1', number: 6, x: 55, y: 50, team: 'home' },
            { id: '2', number: 8, x: 52, y: 45, team: 'home' },
            { id: 'd1', number: 10, x: 50, y: 52, team: 'away' },
          ],
          ballPosition: { x: 50, y: 52 },
        },
        {
          label: 'Recuperação de Bola!',
          players: [
            { id: '1', number: 6, x: 52, y: 50, team: 'home' },
            { id: '2', number: 8, x: 50, y: 46, team: 'home' },
            { id: 'd1', number: 10, x: 48, y: 55, team: 'away' },
          ],
          ballPosition: { x: 52, y: 50 },
        },
        {
          label: 'Contra-Ataque!',
          players: [
            { id: '1', number: 6, x: 58, y: 50, team: 'home' },
            { id: '2', number: 8, x: 62, y: 45, team: 'home' },
            { id: 'd1', number: 10, x: 45, y: 58, team: 'away' },
          ],
          ballPosition: { x: 62, y: 45 },
          passLine: { from: { x: 52, y: 50 }, to: { x: 62, y: 45 } },
        },
      ];

    case 'high_press':
      return [
        {
          label: 'Pressão Alta Coordenada',
          players: [
            { id: '1', number: 9, x: 75, y: 50, team: 'home' },
            { id: '2', number: 10, x: 72, y: 40, team: 'home' },
            { id: '3', number: 11, x: 72, y: 60, team: 'home' },
            { id: '4', number: 8, x: 65, y: 50, team: 'home' },
            { id: 'd1', number: 4, x: 85, y: 45, team: 'away' },
            { id: 'd2', number: 5, x: 85, y: 55, team: 'away' },
            { id: 'gk', number: 1, x: 95, y: 50, team: 'away' },
          ],
          ballPosition: { x: 85, y: 50 },
        },
        {
          label: 'Fechando os Espaços',
          players: [
            { id: '1', number: 9, x: 80, y: 48, team: 'home' },
            { id: '2', number: 10, x: 78, y: 38, team: 'home' },
            { id: '3', number: 11, x: 78, y: 58, team: 'home' },
            { id: '4', number: 8, x: 72, y: 50, team: 'home' },
            { id: 'd1', number: 4, x: 88, y: 42, team: 'away' },
            { id: 'd2', number: 5, x: 88, y: 58, team: 'away' },
            { id: 'gk', number: 1, x: 96, y: 50, team: 'away' },
          ],
          ballPosition: { x: 88, y: 50 },
        },
        {
          label: 'Roubo de Bola!',
          players: [
            { id: '1', number: 9, x: 85, y: 50, team: 'home' },
            { id: '2', number: 10, x: 82, y: 40, team: 'home' },
            { id: '3', number: 11, x: 82, y: 60, team: 'home' },
            { id: '4', number: 8, x: 78, y: 50, team: 'home' },
            { id: 'd1', number: 4, x: 90, y: 40, team: 'away' },
            { id: 'd2', number: 5, x: 90, y: 60, team: 'away' },
            { id: 'gk', number: 1, x: 97, y: 50, team: 'away' },
          ],
          ballPosition: { x: 85, y: 50 },
        },
      ];

    case 'transition':
      return [
        {
          label: 'Recuperação no Meio',
          players: [
            { id: '1', number: 6, x: 45, y: 50, team: 'home' },
            { id: '2', number: 9, x: 55, y: 45, team: 'home' },
            { id: '3', number: 11, x: 50, y: 65, team: 'home' },
            { id: 'd1', number: 8, x: 40, y: 52, team: 'away' },
          ],
          ballPosition: { x: 45, y: 50 },
        },
        {
          label: 'Transição Rápida',
          players: [
            { id: '1', number: 6, x: 55, y: 50, team: 'home' },
            { id: '2', number: 9, x: 70, y: 48, team: 'home' },
            { id: '3', number: 11, x: 65, y: 60, team: 'home' },
            { id: 'd1', number: 8, x: 42, y: 55, team: 'away' },
          ],
          ballPosition: { x: 70, y: 48 },
          passLine: { from: { x: 45, y: 50 }, to: { x: 70, y: 48 } },
        },
        {
          label: 'Ataque em Velocidade!',
          players: [
            { id: '1', number: 6, x: 65, y: 50, team: 'home' },
            { id: '2', number: 9, x: 85, y: 50, team: 'home' },
            { id: '3', number: 11, x: 80, y: 55, team: 'home' },
            { id: 'd1', number: 8, x: 50, y: 58, team: 'away' },
          ],
          ballPosition: { x: 85, y: 50 },
          passLine: { from: { x: 70, y: 48 }, to: { x: 85, y: 50 } },
        },
      ];
    
    default:
      return [
        {
          label: event.event_type.toUpperCase().replace('_', ' '),
          players: [
            { id: '1', number: 10, x: eventX, y: eventY, team: 'home' },
            { id: '2', number: 8, x: eventX - 10, y: eventY - 8, team: 'home' },
            { id: '3', number: 9, x: eventX + 5, y: eventY + 8, team: 'home' },
          ],
          ballPosition: { x: eventX, y: eventY },
        },
      ];
  }
}

export function AnimatedTacticalPlay({
  event,
  homeTeam,
  awayTeam,
  onViewThumbnail,
  onPlayVideo,
  thumbnail,
  hasVideo,
  className,
}: AnimatedTacticalPlayProps) {
  const [currentStep, setCurrentStep] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playSteps, setPlaySteps] = useState(() => generatePlaySteps(event));

  // Regenerate steps when event changes
  useEffect(() => {
    setPlaySteps(generatePlaySteps(event));
    setCurrentStep(0);
    setIsPlaying(false);
  }, [event.id, event.event_type]);

  const currentPlay = playSteps[currentStep];

  // Auto-advance steps
  useEffect(() => {
    if (!isPlaying) return;

    const timer = setInterval(() => {
      setCurrentStep((prev) => {
        if (prev >= playSteps.length - 1) {
          setIsPlaying(false);
          return prev;
        }
        return prev + 1;
      });
    }, 1500);

    return () => clearInterval(timer);
  }, [isPlaying, playSteps.length]);

  const handlePlayPause = () => {
    if (currentStep >= playSteps.length - 1) {
      setCurrentStep(0);
    }
    setIsPlaying(!isPlaying);
  };

  const handleReset = () => {
    setCurrentStep(0);
    setIsPlaying(false);
  };

  const handlePrev = () => {
    setCurrentStep((prev) => Math.max(0, prev - 1));
    setIsPlaying(false);
  };

  const handleNext = () => {
    setCurrentStep((prev) => Math.min(playSteps.length - 1, prev + 1));
    setIsPlaying(false);
  };

  const eventLabels: Record<string, string> = {
    goal: 'GOL',
    shot: 'FINALIZAÇÃO',
    shot_on_target: 'CHUTE NO GOL',
    corner: 'ESCANTEIO',
    penalty: 'PÊNALTI',
    foul: 'FALTA',
  };

  return (
    <div className={cn("space-y-4", className)}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Badge variant="arena" className="text-sm">
            {event.minute}'
          </Badge>
          <span className="font-semibold">
            {eventLabels[event.event_type] || event.event_type.toUpperCase()}
          </span>
          {event.description && (
            <span className="text-sm text-muted-foreground">
              {event.description}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {thumbnail && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => onViewThumbnail?.(event.id)}
            >
              <Image className="h-4 w-4 mr-1" />
              Thumbnail
            </Button>
          )}
          {/* Always show video button - 5s before/after */}
          <Button
            variant="arena"
            size="sm"
            onClick={() => onPlayVideo?.(event.id)}
            className="gap-2"
          >
            <Video className="h-4 w-4" />
            Ver Vídeo
            <Badge variant="outline" className="ml-1 text-[10px] py-0 px-1">
              5s±
            </Badge>
          </Button>
        </div>
      </div>

      {/* Tactical Field with Animation */}
      <div className="relative aspect-[3/2] w-full overflow-hidden rounded-xl bg-primary/10 border border-primary/20">
        <svg
          viewBox="0 0 120 80"
          className="absolute inset-0 h-full w-full"
          preserveAspectRatio="xMidYMid meet"
        >
          {/* Field Background */}
          <defs>
            <pattern id="field-stripes-animated" patternUnits="userSpaceOnUse" width="20" height="80">
              <rect width="10" height="80" fill="hsl(var(--primary) / 0.05)" />
              <rect x="10" width="10" height="80" fill="hsl(var(--primary) / 0.08)" />
            </pattern>
            <filter id="glow">
              <feGaussianBlur stdDeviation="1.5" result="coloredBlur" />
              <feMerge>
                <feMergeNode in="coloredBlur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
            <marker
              id="arrow"
              viewBox="0 0 10 10"
              refX="5"
              refY="5"
              markerWidth="4"
              markerHeight="4"
              orient="auto-start-reverse"
            >
              <path d="M 0 0 L 10 5 L 0 10 z" fill="hsl(var(--primary))" />
            </marker>
            <marker
              id="arrow-shot"
              viewBox="0 0 10 10"
              refX="5"
              refY="5"
              markerWidth="4"
              markerHeight="4"
              orient="auto-start-reverse"
            >
              <path d="M 0 0 L 10 5 L 0 10 z" fill="#ef4444" />
            </marker>
          </defs>

          {/* Field Base */}
          <rect width="120" height="80" fill="url(#field-stripes-animated)" />

          {/* Field Lines */}
          <g stroke="hsl(var(--primary) / 0.4)" strokeWidth="0.3" fill="none">
            <rect x="2" y="2" width="116" height="76" rx="1" />
            <line x1="60" y1="2" x2="60" y2="78" />
            <circle cx="60" cy="40" r="9.15" />
            <circle cx="60" cy="40" r="0.5" fill="hsl(var(--primary) / 0.4)" />
            <rect x="2" y="18" width="16.5" height="44" />
            <rect x="2" y="28" width="5.5" height="24" />
            <circle cx="11" cy="40" r="0.5" fill="hsl(var(--primary) / 0.4)" />
            <path d="M 16.5 32 A 9.15 9.15 0 0 1 16.5 48" />
            <rect x="101.5" y="18" width="16.5" height="44" />
            <rect x="112.5" y="28" width="5.5" height="24" />
            <circle cx="109" cy="40" r="0.5" fill="hsl(var(--primary) / 0.4)" />
            <path d="M 101.5 32 A 9.15 9.15 0 0 0 101.5 48" />
          </g>

          {/* Pass Line */}
          {currentPlay.passLine && (
            <line
              x1={(currentPlay.passLine.from.x / 100) * 116 + 2}
              y1={(currentPlay.passLine.from.y / 100) * 76 + 2}
              x2={(currentPlay.passLine.to.x / 100) * 116 + 2}
              y2={(currentPlay.passLine.to.y / 100) * 76 + 2}
              stroke="hsl(var(--primary))"
              strokeWidth="0.8"
              strokeDasharray="2,1"
              markerEnd="url(#arrow)"
              className="animate-[fade-in_0.5s_ease-out]"
            />
          )}

          {/* Shot Line */}
          {currentPlay.shotLine && (
            <line
              x1={(currentPlay.shotLine.from.x / 100) * 116 + 2}
              y1={(currentPlay.shotLine.from.y / 100) * 76 + 2}
              x2={(currentPlay.shotLine.to.x / 100) * 116 + 2}
              y2={(currentPlay.shotLine.to.y / 100) * 76 + 2}
              stroke="#ef4444"
              strokeWidth="1.2"
              markerEnd="url(#arrow-shot)"
              filter="url(#glow)"
              className="animate-[fade-in_0.3s_ease-out]"
            />
          )}

          {/* Players */}
          {currentPlay.players.map((player) => {
            const cx = (player.x / 100) * 116 + 2;
            const cy = (player.y / 100) * 76 + 2;
            return (
              <g key={player.id}>
                <circle
                  cx={cx}
                  cy={cy}
                  r="3.5"
                  fill={player.team === 'home' ? '#A50044' : '#FFFFFF'}
                  stroke="hsl(var(--background))"
                  strokeWidth="0.5"
                  style={{ transition: 'cx 0.7s ease-out, cy 0.7s ease-out' }}
                />
                <text
                  x={cx}
                  y={cy + 1}
                  textAnchor="middle"
                  fontSize="3"
                  fontWeight="bold"
                  fill={player.team === 'home' ? '#FFFFFF' : '#000000'}
                  style={{ transition: 'x 0.7s ease-out, y 0.7s ease-out' }}
                >
                  {player.number}
                </text>
              </g>
            );
          })}

          {/* Ball */}
          <g className="transition-all duration-500 ease-out">
            <circle
              cx={(currentPlay.ballPosition.x / 100) * 116 + 2}
              cy={(currentPlay.ballPosition.y / 100) * 76 + 2}
              r="2"
              fill="#FFFFFF"
              stroke="#000000"
              strokeWidth="0.3"
              filter="url(#glow)"
              className="transition-all duration-500 ease-out"
            />
            {/* Ball pulse effect for final step */}
            {currentStep === playSteps.length - 1 && event.event_type === 'goal' && (
              <circle
                cx={(currentPlay.ballPosition.x / 100) * 116 + 2}
                cy={(currentPlay.ballPosition.y / 100) * 76 + 2}
                r="4"
                fill="none"
                stroke="#22c55e"
                strokeWidth="1"
                className="animate-ping"
              />
            )}
          </g>

          {/* Step Label */}
          <text
            x="60"
            y="8"
            textAnchor="middle"
            fontSize="4"
            fontWeight="bold"
            fill="hsl(var(--primary))"
            className="transition-all duration-300"
          >
            {currentPlay.label}
          </text>
        </svg>

        {/* Thumbnail Preview Overlay */}
        {thumbnail && currentStep === playSteps.length - 1 && (
          <div className="absolute bottom-2 right-2 w-24 h-16 rounded-lg overflow-hidden border-2 border-primary shadow-lg animate-scale-in">
            <img src={thumbnail} alt="Event thumbnail" className="w-full h-full object-cover" />
          </div>
        )}
      </div>

      {/* Controls */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={handleReset}>
            <RotateCcw className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="icon" onClick={handlePrev} disabled={currentStep === 0}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button variant="arena" size="icon" onClick={handlePlayPause}>
            {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
          </Button>
          <Button variant="outline" size="icon" onClick={handleNext} disabled={currentStep === playSteps.length - 1}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>

        {/* Step Indicators */}
        <div className="flex items-center gap-2">
          {playSteps.map((_, index) => (
            <button
              key={index}
              onClick={() => {
                setCurrentStep(index);
                setIsPlaying(false);
              }}
              className={cn(
                "w-2 h-2 rounded-full transition-all duration-300",
                index === currentStep
                  ? "bg-primary w-6"
                  : index < currentStep
                  ? "bg-primary/60"
                  : "bg-muted"
              )}
            />
          ))}
        </div>

        <div className="text-sm text-muted-foreground">
          Passo {currentStep + 1} de {playSteps.length}
        </div>
      </div>
    </div>
  );
}