export type Suit = 'hearts' | 'diamonds' | 'clubs' | 'spades';
export type Rank = '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '10' | 'J' | 'Q' | 'K' | 'A';

export interface Card {
  suit: Suit;
  rank: Rank;
}

export interface Player {
  id: number;
  name: string;
  email: string;
  profilePicture?: string;
  score: number;
  roundScore: number;
  cardsInHand: number;
  isReady: boolean;
  isHost?: boolean;
  position?: 'north' | 'south' | 'east' | 'west';
}

export interface TrickCard {
  playerId: number;
  card: Card;
}

export type GamePhase = 'waiting' | 'passing' | 'playing' | 'roundOver' | 'gameOver';
export type PassDirection = 'left' | 'right' | 'across' | 'none';

export interface GameState {
  gameId: string;
  phase: GamePhase;
  players: Player[];
  currentTrick: TrickCard[];
  currentPlayer: number;
  passingDirection: PassDirection;
  heartsBroken: boolean;
  roundNumber: number;
  leadSuit?: Suit;
  trickNumber: number;
}

export interface User {
  id: number;
  name: string;
  email: string;
  profilePicture?: string;
}
