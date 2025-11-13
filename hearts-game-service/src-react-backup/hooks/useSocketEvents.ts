import { useEffect } from 'react';
import { Socket } from 'socket.io-client';
import { useGameStore } from '@/store/gameStore';
import { useToast } from '@/hooks/use-toast';

export const useSocketEvents = (socket: Socket | null) => {
  const { setGameState, setHand, addChatMessage } = useGameStore();
  const { toast } = useToast();

  useEffect(() => {
    if (!socket) return;

    // Lobby events
    socket.on('gameCreated', ({ gameId, players }) => {
      setGameState({ 
        gameId, 
        players, 
        phase: 'waiting',
        currentTrick: [],
        currentPlayer: 0,
        passingDirection: 'left',
        heartsBroken: false,
        roundNumber: 1,
        trickNumber: 0
      });
      toast({
        title: 'Game Created',
        description: `Game code: ${gameId}`,
      });
    });

    socket.on('playerJoined', ({ player }) => {
      toast({
        title: 'Player Joined',
        description: `${player.name} joined the game`,
      });
    });

    socket.on('playerLeft', ({ playerId }) => {
      toast({
        title: 'Player Left',
        description: 'A player has left the game',
        variant: 'destructive'
      });
    });

    socket.on('gameStarted', ({ gameState }) => {
      setGameState(gameState);
      toast({
        title: 'Game Started!',
        description: 'Let the cards be dealt',
      });
    });

    // Game flow events
    socket.on('cardsDealt', ({ hand }) => {
      setHand(hand);
    });

    socket.on('passingPhase', ({ direction }) => {
      toast({
        title: 'Passing Phase',
        description: `Pass 3 cards ${direction.toUpperCase()}`,
      });
    });

    socket.on('cardsReceived', ({ cards }) => {
      toast({
        title: 'Cards Received',
        description: `You received ${cards.length} cards`,
      });
    });

    socket.on('turnChanged', ({ playerId }) => {
      // Update game state to reflect new current player
    });

    socket.on('cardPlayed', ({ playerId, card }) => {
      // Card played animation
    });

    socket.on('trickComplete', ({ winner, points }) => {
      toast({
        title: 'Trick Complete',
        description: `Winner earned ${points} points`,
      });
    });

    socket.on('roundComplete', ({ scores }) => {
      toast({
        title: 'Round Complete',
        description: 'Scores have been updated',
      });
    });

    socket.on('gameOver', ({ finalScores, winner }) => {
      toast({
        title: '🎉 Game Over!',
        description: `${winner.name} wins with ${winner.score} points!`,
      });
    });

    // Utility events
    socket.on('error', ({ message }) => {
      toast({
        title: 'Error',
        description: message,
        variant: 'destructive'
      });
    });

    socket.on('chatMessage', ({ playerId, playerName, message }) => {
      addChatMessage({ playerId, playerName, message });
    });

    return () => {
      socket.off('gameCreated');
      socket.off('playerJoined');
      socket.off('playerLeft');
      socket.off('gameStarted');
      socket.off('cardsDealt');
      socket.off('passingPhase');
      socket.off('cardsReceived');
      socket.off('turnChanged');
      socket.off('cardPlayed');
      socket.off('trickComplete');
      socket.off('roundComplete');
      socket.off('gameOver');
      socket.off('error');
      socket.off('chatMessage');
    };
  }, [socket, setGameState, setHand, addChatMessage, toast]);
};
