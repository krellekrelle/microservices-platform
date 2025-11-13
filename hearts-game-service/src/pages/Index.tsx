import { useEffect, useState } from 'react';
import { initSocket } from '@/lib/socket';
import { useGameStore } from '@/store/gameStore';
import { useSocketEvents } from '@/hooks/useSocketEvents';
import { LobbyScreen } from '@/components/lobby/LobbyScreen';
import { GameTable } from '@/components/game/GameTable';

const Index = () => {
  const [isConnected, setIsConnected] = useState(false);
  const [socket, setSocket] = useState<ReturnType<typeof initSocket> | null>(null);
  const { gameState } = useGameStore();

  useSocketEvents(socket);

  useEffect(() => {
    const newSocket = initSocket();
    setSocket(newSocket);
    
    newSocket.on('connect', () => {
      console.log('Connected to server');
      setIsConnected(true);
    });

    newSocket.on('disconnect', () => {
      console.log('Disconnected from server');
      setIsConnected(false);
    });

    newSocket.connect();

    return () => {
      newSocket.disconnect();
    };
  }, []);

  if (!isConnected) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-green-900 via-green-800 to-green-900 flex items-center justify-center">
        <div className="text-center">
          <div className="text-6xl mb-4">🃏</div>
          <h1 className="text-2xl font-bold text-white mb-2">Connecting to server...</h1>
          <p className="text-white/60">Please wait</p>
        </div>
      </div>
    );
  }

  if (gameState?.phase === 'playing' || gameState?.phase === 'passing') {
    return <GameTable socket={socket} />;
  }

  return <LobbyScreen socket={socket} />;
};

export default Index;
