import { motion } from 'framer-motion';
import { Player } from '@/types/game';
import { PlayingCard } from './PlayingCard';
import { cn } from '@/lib/utils';

interface OpponentHandProps {
  player: Player;
  position: 'north' | 'east' | 'west';
  isCurrentPlayer: boolean;
}

export const OpponentHand = ({ player, position, isCurrentPlayer }: OpponentHandProps) => {
  const cardCount = player.cardsInHand;
  
  return (
    <motion.div
      className={cn(
        'flex flex-col items-center gap-2 p-4 rounded-lg transition-all',
        isCurrentPlayer && 'ring-4 ring-yellow-400 bg-yellow-400/10'
      )}
      animate={isCurrentPlayer ? { scale: [1, 1.05, 1] } : {}}
      transition={{ duration: 0.5, repeat: isCurrentPlayer ? Infinity : 0, repeatDelay: 1 }}
    >
      <div className="flex items-center gap-3 bg-card/80 backdrop-blur-sm rounded-lg p-3 border border-border">
        {player.profilePicture ? (
          <img 
            src={player.profilePicture} 
            alt={player.name}
            className="w-10 h-10 rounded-full border-2 border-primary"
          />
        ) : (
          <div className="w-10 h-10 rounded-full bg-primary flex items-center justify-center text-primary-foreground font-bold">
            {player.name[0]}
          </div>
        )}
        <div className="text-left">
          <p className="font-semibold text-sm">{player.name}</p>
          <p className="text-xs text-muted-foreground">Score: {player.score}</p>
        </div>
      </div>
      
      <div className="flex gap-1">
        {Array.from({ length: Math.min(cardCount, 13) }).map((_, i) => (
          <div 
            key={i}
            style={{ marginLeft: i > 0 ? '-30px' : '0' }}
          >
            <PlayingCard 
              card={{ suit: 'hearts', rank: '2' }} 
              size="small"
              faceDown
            />
          </div>
        ))}
      </div>
      
      <p className="text-xs text-white/60">{cardCount} cards</p>
    </motion.div>
  );
};
