import { GameState } from '@/types/game';
import { Card } from '@/components/ui/card';

interface GameInfoProps {
  gameState: GameState;
}

export const GameInfo = ({ gameState }: GameInfoProps) => {
  return (
    <Card className="p-4 bg-card/90 backdrop-blur-sm border-border min-w-[180px]">
      <h3 className="font-bold text-lg mb-3 text-center border-b border-border pb-2">
        Game Info
      </h3>
      <div className="space-y-2 text-sm">
        <div className="flex justify-between">
          <span className="text-muted-foreground">Round:</span>
          <span className="font-semibold">{gameState.roundNumber}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">Trick:</span>
          <span className="font-semibold">{gameState.trickNumber}/13</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">Phase:</span>
          <span className="font-semibold capitalize">{gameState.phase}</span>
        </div>
        {gameState.leadSuit && (
          <div className="flex justify-between">
            <span className="text-muted-foreground">Lead Suit:</span>
            <span className="font-semibold capitalize">{gameState.leadSuit}</span>
          </div>
        )}
        <div className="flex items-center justify-between pt-2 border-t border-border">
          <span className="text-muted-foreground">Hearts Broken:</span>
          <span className={gameState.heartsBroken ? 'text-red-500' : 'text-muted-foreground'}>
            {gameState.heartsBroken ? '💔 Yes' : '❤️ No'}
          </span>
        </div>
      </div>
    </Card>
  );
};
