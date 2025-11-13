import { create } from 'zustand';
import { Card, GameState, User } from '@/types/game';

interface GameStore {
  user: User | null;
  gameState: GameState | null;
  hand: Card[];
  selectedCards: Card[];
  chatMessages: Array<{ playerId: number; playerName: string; message: string; timestamp: Date }>;
  
  setUser: (user: User | null) => void;
  setGameState: (state: GameState | null) => void;
  setHand: (hand: Card[]) => void;
  toggleCardSelection: (card: Card) => void;
  clearSelectedCards: () => void;
  addChatMessage: (message: { playerId: number; playerName: string; message: string }) => void;
  resetGame: () => void;
}

export const useGameStore = create<GameStore>((set) => ({
  user: null,
  gameState: null,
  hand: [],
  selectedCards: [],
  chatMessages: [],

  setUser: (user) => set({ user }),
  setGameState: (state) => set({ gameState: state }),
  setHand: (hand) => set({ hand }),
  
  toggleCardSelection: (card) => set((state) => {
    const isSelected = state.selectedCards.some(
      c => c.suit === card.suit && c.rank === card.rank
    );
    
    if (isSelected) {
      return {
        selectedCards: state.selectedCards.filter(
          c => !(c.suit === card.suit && c.rank === card.rank)
        )
      };
    } else {
      if (state.selectedCards.length < 3) {
        return { selectedCards: [...state.selectedCards, card] };
      }
      return state;
    }
  }),

  clearSelectedCards: () => set({ selectedCards: [] }),
  
  addChatMessage: (message) => set((state) => ({
    chatMessages: [...state.chatMessages, { ...message, timestamp: new Date() }]
  })),

  resetGame: () => set({
    gameState: null,
    hand: [],
    selectedCards: [],
    chatMessages: []
  })
}));
