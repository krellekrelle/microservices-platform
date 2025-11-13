import { useState } from 'react';
import { useGameStore } from '@/store/gameStore';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { motion } from 'framer-motion';

interface LobbyScreenProps {
  socket: any;
}

export const LobbyScreen = ({ socket }: LobbyScreenProps) => {
  const [gameId, setGameId] = useState('');
  const { gameState, user } = useGameStore();

  if (!socket) return null;

  const handleCreateGame = () => {
    socket.emit('createGame');
  };

  const handleJoinGame = () => {
    if (gameId.trim()) {
      socket.emit('joinGame', { gameId: gameId.trim() });
    }
  };

  const handleStartGame = () => {
    socket.emit('startGame');
  };

  const handleLeaveGame = () => {
    socket.emit('leaveGame');
  };

  const isHost = gameState?.players.find(p => p.id === user?.id)?.isHost;
  const allPlayersReady = gameState?.players.length === 4 && gameState?.players.every(p => p.isReady);

  if (!gameState) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-green-900 via-green-800 to-green-900 flex items-center justify-center p-4">
        <motion.div
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.3 }}
        >
          <Card className="w-full max-w-md p-8 bg-card/95 backdrop-blur-sm">
            <div className="text-center mb-8">
              <h1 className="text-4xl font-bold mb-2 bg-gradient-to-r from-red-500 to-pink-500 bg-clip-text text-transparent">
                ♥ Hearts ♥
              </h1>
              <p className="text-muted-foreground">
                Classic 4-player card game
              </p>
            </div>

            <div className="space-y-4">
              <Button 
                onClick={handleCreateGame}
                className="w-full h-12 text-lg"
                size="lg"
              >
                Create New Game
              </Button>

              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-border"></div>
                </div>
                <div className="relative flex justify-center text-xs uppercase">
                  <span className="bg-card px-2 text-muted-foreground">Or join existing</span>
                </div>
              </div>

              <div className="flex gap-2">
                <Input
                  placeholder="Enter game code"
                  value={gameId}
                  onChange={(e) => setGameId(e.target.value)}
                  className="flex-1"
                />
                <Button onClick={handleJoinGame} disabled={!gameId.trim()}>
                  Join
                </Button>
              </div>
            </div>

            {user && (
              <div className="mt-6 pt-6 border-t border-border">
                <p className="text-sm text-center text-muted-foreground">
                  Signed in as <span className="font-semibold text-foreground">{user.name}</span>
                </p>
              </div>
            )}
          </Card>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-900 via-green-800 to-green-900 flex items-center justify-center p-4">
      <motion.div
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: 0.3 }}
        className="w-full max-w-2xl"
      >
        <Card className="p-8 bg-card/95 backdrop-blur-sm">
          <div className="text-center mb-6">
            <h2 className="text-3xl font-bold mb-2">Game Lobby</h2>
            <p className="text-muted-foreground">
              Game Code: <span className="font-mono font-bold text-foreground">{gameState.gameId}</span>
            </p>
          </div>

          <div className="grid grid-cols-2 gap-4 mb-6">
            {Array.from({ length: 4 }).map((_, index) => {
              const player = gameState.players[index];
              return (
                <motion.div
                  key={index}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.1 }}
                >
                  <Card className={`p-4 ${player ? 'bg-primary/10 border-primary' : 'bg-muted/50 border-dashed'}`}>
                    {player ? (
                      <div className="flex items-center gap-3">
                        {player.profilePicture ? (
                          <img 
                            src={player.profilePicture} 
                            alt={player.name}
                            className="w-12 h-12 rounded-full border-2 border-primary"
                          />
                        ) : (
                          <div className="w-12 h-12 rounded-full bg-primary flex items-center justify-center text-primary-foreground font-bold text-xl">
                            {player.name[0]}
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold truncate">{player.name}</p>
                          <p className="text-xs text-muted-foreground">
                            {player.isHost && '👑 Host · '}
                            {player.isReady ? '✅ Ready' : '⏳ Waiting'}
                          </p>
                        </div>
                      </div>
                    ) : (
                      <div className="text-center py-4">
                        <p className="text-muted-foreground">Waiting for player...</p>
                      </div>
                    )}
                  </Card>
                </motion.div>
              );
            })}
          </div>

          <div className="flex gap-3">
            <Button 
              onClick={handleLeaveGame}
              variant="outline"
              className="flex-1"
            >
              Leave Game
            </Button>
            
            {isHost && (
              <Button 
                onClick={handleStartGame}
                disabled={!allPlayersReady}
                className="flex-1"
                size="lg"
              >
                {allPlayersReady ? 'Start Game' : `Waiting for players (${gameState.players.length}/4)`}
              </Button>
            )}
          </div>

          {!allPlayersReady && (
            <p className="text-center text-sm text-muted-foreground mt-4">
              Need 4 players to start the game
            </p>
          )}
        </Card>
      </motion.div>
    </div>
  );
};
