import { io, Socket } from 'socket.io-client';

let socket: Socket | null = null;

export const initSocket = (serverUrl: string = 'http://localhost:3004') => {
  if (socket?.connected) return socket;

  socket = io(serverUrl, {
    path: '/hearts/socket.io/',
    withCredentials: true,
    autoConnect: false
  });

  return socket;
};

export const getSocket = () => {
  if (!socket) {
    throw new Error('Socket not initialized. Call initSocket first.');
  }
  return socket;
};

export const disconnectSocket = () => {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
};
