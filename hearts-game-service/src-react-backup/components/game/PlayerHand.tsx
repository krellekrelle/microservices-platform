import { Card } from '@/types/game';
import { PlayingCard } from './PlayingCard';
import { motion } from 'framer-motion';

interface PlayerHandProps {
  cards: Card[];
  selectedCards: Card[];
  onCardClick: (card: Card) => void;
  playableCards?: Card[];
}

export const PlayerHand = ({ cards, selectedCards, onCardClick, playableCards }: PlayerHandProps) => {
  const isCardSelected = (card: Card) => {
    return selectedCards.some(c => c.suit === card.suit && c.rank === card.rank);
  };

  const isCardPlayable = (card: Card) => {
    if (!playableCards) return true;
    return playableCards.some(c => c.suit === card.suit && c.rank === card.rank);
  };

  const sortedCards = [...cards].sort((a, b) => {
    const suitOrder = { clubs: 0, diamonds: 1, spades: 2, hearts: 3 };
    const rankOrder = { '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9, '10': 10, J: 11, Q: 12, K: 13, A: 14 };
    
    if (suitOrder[a.suit] !== suitOrder[b.suit]) {
      return suitOrder[a.suit] - suitOrder[b.suit];
    }
    return rankOrder[a.rank] - rankOrder[b.rank];
  });

  return (
    <div className="flex justify-center items-end gap-1 px-4 py-6">
      {sortedCards.map((card, index) => (
        <motion.div
          key={`${card.suit}-${card.rank}`}
          initial={{ opacity: 0, y: 50 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: index * 0.05 }}
          style={{ marginLeft: index > 0 ? '-40px' : '0' }}
        >
          <PlayingCard
            card={card}
            isSelected={isCardSelected(card)}
            isPlayable={isCardPlayable(card)}
            onClick={() => onCardClick(card)}
            size="large"
          />
        </motion.div>
      ))}
    </div>
  );
};
