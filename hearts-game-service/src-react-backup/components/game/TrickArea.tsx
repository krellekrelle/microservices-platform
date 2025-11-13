import { motion } from 'framer-motion';
import { TrickCard, Player } from '@/types/game';
import { PlayingCard } from './PlayingCard';

interface TrickAreaProps {
  trick: TrickCard[];
  players: Player[];
}

export const TrickArea = ({ trick, players }: TrickAreaProps) => {
  const getPlayerName = (playerId: number) => {
    return players.find(p => p.id === playerId)?.name || 'Unknown';
  };

  return (
    <div className="relative w-96 h-96 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/20 rounded-full blur-xl" />
      
      <div className="relative grid grid-cols-3 grid-rows-3 w-full h-full">
        {/* North position */}
        {trick[0] && (
          <motion.div
            initial={{ y: -100, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            className="col-start-2 row-start-1 flex flex-col items-center justify-start"
          >
            <PlayingCard card={trick[0].card} size="medium" />
            <span className="text-white text-sm mt-1">{getPlayerName(trick[0].playerId)}</span>
          </motion.div>
        )}
        
        {/* West position */}
        {trick[1] && (
          <motion.div
            initial={{ x: -100, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            className="col-start-1 row-start-2 flex flex-col items-center justify-center"
          >
            <PlayingCard card={trick[1].card} size="medium" />
            <span className="text-white text-sm mt-1">{getPlayerName(trick[1].playerId)}</span>
          </motion.div>
        )}
        
        {/* Center - Empty or logo */}
        <div className="col-start-2 row-start-2 flex items-center justify-center">
          <div className="w-32 h-32 rounded-full border-4 border-white/20 flex items-center justify-center">
            <span className="text-white/40 text-4xl">♠</span>
          </div>
        </div>
        
        {/* East position */}
        {trick[2] && (
          <motion.div
            initial={{ x: 100, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            className="col-start-3 row-start-2 flex flex-col items-center justify-center"
          >
            <PlayingCard card={trick[2].card} size="medium" />
            <span className="text-white text-sm mt-1">{getPlayerName(trick[2].playerId)}</span>
          </motion.div>
        )}
        
        {/* South position */}
        {trick[3] && (
          <motion.div
            initial={{ y: 100, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            className="col-start-2 row-start-3 flex flex-col items-center justify-end"
          >
            <PlayingCard card={trick[3].card} size="medium" />
            <span className="text-white text-sm mt-1">{getPlayerName(trick[3].playerId)}</span>
          </motion.div>
        )}
      </div>
    </div>
  );
};
