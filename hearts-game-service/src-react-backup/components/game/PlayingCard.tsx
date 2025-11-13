import { motion } from 'framer-motion';
import { Card as CardType } from '@/types/game';
import { cn } from '@/lib/utils';

interface PlayingCardProps {
  card: CardType;
  isPlayable?: boolean;
  isSelected?: boolean;
  onClick?: () => void;
  size?: 'small' | 'medium' | 'large';
  faceDown?: boolean;
}

const suitSymbols = {
  hearts: '♥',
  diamonds: '♦',
  clubs: '♣',
  spades: '♠'
};

const suitColors = {
  hearts: 'text-red-600',
  diamonds: 'text-red-600',
  clubs: 'text-foreground',
  spades: 'text-foreground'
};

const sizeClasses = {
  small: 'w-12 h-16 text-xs',
  medium: 'w-20 h-28 text-sm',
  large: 'w-24 h-36 text-base'
};

export const PlayingCard = ({ 
  card, 
  isPlayable = true, 
  isSelected = false, 
  onClick, 
  size = 'medium',
  faceDown = false 
}: PlayingCardProps) => {
  return (
    <motion.div
      className={cn(
        'relative rounded-lg cursor-pointer select-none',
        sizeClasses[size],
        !isPlayable && !faceDown && 'opacity-40 cursor-not-allowed',
        isSelected && 'ring-2 ring-primary',
        faceDown && 'bg-gradient-to-br from-blue-900 to-blue-950'
      )}
      onClick={isPlayable && !faceDown ? onClick : undefined}
      whileHover={isPlayable && !faceDown ? { y: -8, scale: 1.05 } : {}}
      whileTap={isPlayable && !faceDown ? { scale: 0.98 } : {}}
      animate={isSelected ? { y: -12 } : { y: 0 }}
      transition={{ type: 'spring', stiffness: 300, damping: 20 }}
    >
      {faceDown ? (
        <div className="w-full h-full rounded-lg border-2 border-blue-800 flex items-center justify-center">
          <div className="text-blue-400 text-2xl">🂠</div>
        </div>
      ) : (
        <div className="w-full h-full bg-card rounded-lg border-2 border-border shadow-lg p-1 flex flex-col justify-between">
          <div className={cn('font-bold', suitColors[card.suit])}>
            {card.rank}
            <div className="text-xl leading-none">{suitSymbols[card.suit]}</div>
          </div>
          <div className="flex items-center justify-center text-3xl">
            <span className={suitColors[card.suit]}>{suitSymbols[card.suit]}</span>
          </div>
          <div className={cn('font-bold text-right', suitColors[card.suit])}>
            <div className="text-xl leading-none">{suitSymbols[card.suit]}</div>
            {card.rank}
          </div>
        </div>
      )}
    </motion.div>
  );
};
