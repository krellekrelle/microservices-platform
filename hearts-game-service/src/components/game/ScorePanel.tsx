import { Player } from '@/types/game';
import { Card } from '@/components/ui/card';

interface ScorePanelProps {
  players: Player[];
}

export const ScorePanel = ({ players }: ScorePanelProps) => {
  const sortedPlayers = [...players].sort((a, b) => a.score - b.score);

  return (
    <Card className="p-4 bg-card/90 backdrop-blur-sm border-border min-w-[200px]">
      <h3 className="font-bold text-lg mb-3 text-center border-b border-border pb-2">
        Scores
      </h3>
      <div className="space-y-2">
        {sortedPlayers.map((player, index) => (
          <div
            key={player.id}
            className="flex items-center justify-between gap-3 p-2 rounded-md bg-muted/50"
          >
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-muted-foreground w-4">
                #{index + 1}
              </span>
              <span className="font-medium text-sm truncate max-w-[100px]">
                {player.name}
              </span>
            </div>
            <div className="flex flex-col items-end">
              <span className="font-bold text-base">{player.score}</span>
              {player.roundScore > 0 && (
                <span className="text-xs text-red-500">+{player.roundScore}</span>
              )}
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
};
