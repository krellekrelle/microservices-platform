import { useGameStore } from '@/store/gameStore';
import { PlayerHand } from './PlayerHand';
import { TrickArea } from './TrickArea';
import { OpponentHand } from './OpponentHand';
import { ScorePanel } from './ScorePanel';
import { GameInfo } from './GameInfo';
import { Card } from '@/types/game';
import { useToast } from '@/hooks/use-toast';

interface GameTableProps {
  socket: any;
}

export const GameTable = ({ socket }: GameTableProps) => {
  const { gameState, hand, selectedCards, toggleCardSelection, clearSelectedCards } = useGameStore();
  const { toast } = useToast();

  if (!gameState || !socket) return null;

  const currentPlayer = gameState.players.find(p => p.id === useGameStore.getState().user?.id);
  const isMyTurn = gameState.currentPlayer === currentPlayer?.id;

  const handleCardClick = (card: Card) => {
    if (gameState.phase === 'passing') {
      toggleCardSelection(card);
    } else if (gameState.phase === 'playing' && isMyTurn) {
      socket.emit('playCard', { card });
    }
  };

  const handleConfirmPass = () => {
    if (selectedCards.length === 3) {
      socket.emit('passCards', { cards: selectedCards });
      clearSelectedCards();
    } else {
      toast({
        title: 'Invalid Selection',
        description: 'You must select exactly 3 cards to pass',
        variant: 'destructive'
      });
    }
  };

  const opponents = gameState.players.filter(p => p.id !== currentPlayer?.id);

  return (
    <div className="h-screen bg-gradient-to-br from-green-900 via-green-800 to-green-900 relative overflow-hidden">
      {/* Felt texture overlay */}
      <div className="absolute inset-0 opacity-10 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjAwIiBoZWlnaHQ9IjIwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZGVmcz48cGF0dGVybiBpZD0iYSIgcGF0dGVyblVuaXRzPSJ1c2VyU3BhY2VPblVzZSIgd2lkdGg9IjQwIiBoZWlnaHQ9IjQwIj48cGF0aCBkPSJNMCAwaDE0MHYxNDBIMHoiIGZpbGw9IiMwMDAiLz48L3BhdHRlcm4+PC9kZWZzPjxyZWN0IHdpZHRoPSIxMDAlIiBoZWlnaHQ9IjEwMCUiIGZpbGw9InVybCgjYSkiLz48L3N2Zz4=')]" />
      
      <div className="relative h-full flex flex-col">
        {/* Top Area - Opponent */}
        <div className="flex justify-between items-start p-4">
          <ScorePanel players={gameState.players} />
          {opponents[0] && (
            <OpponentHand 
              player={opponents[0]} 
              position="north"
              isCurrentPlayer={gameState.currentPlayer === opponents[0].id}
            />
          )}
          <GameInfo gameState={gameState} />
        </div>

        {/* Middle Area - Side opponents and trick */}
        <div className="flex-1 flex items-center justify-center px-4">
          {opponents[1] && (
            <OpponentHand 
              player={opponents[1]} 
              position="west"
              isCurrentPlayer={gameState.currentPlayer === opponents[1].id}
            />
          )}
          
          <TrickArea 
            trick={gameState.currentTrick} 
            players={gameState.players}
          />
          
          {opponents[2] && (
            <OpponentHand 
              player={opponents[2]} 
              position="east"
              isCurrentPlayer={gameState.currentPlayer === opponents[2].id}
            />
          )}
        </div>

        {/* Bottom Area - Your hand */}
        <div className="pb-4">
          {gameState.phase === 'passing' && (
            <div className="text-center mb-4">
              <h2 className="text-2xl font-bold text-white mb-2">
                Pass 3 cards {gameState.passingDirection.toUpperCase()}
              </h2>
              <button
                onClick={handleConfirmPass}
                disabled={selectedCards.length !== 3}
                className="px-6 py-2 bg-primary text-primary-foreground rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-primary/90 transition-colors"
              >
                Confirm Pass ({selectedCards.length}/3)
              </button>
            </div>
          )}
          
          {gameState.phase === 'playing' && (
            <div className="text-center mb-2">
              <p className="text-xl font-semibold text-white">
                {isMyTurn ? '🎯 Your Turn!' : 'Waiting for other players...'}
              </p>
            </div>
          )}
          
          <PlayerHand
            cards={hand}
            selectedCards={selectedCards}
            onCardClick={handleCardClick}
          />
        </div>
      </div>
    </div>
  );
};
