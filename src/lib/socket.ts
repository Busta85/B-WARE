import { io, Socket } from 'socket.io-client';
import { ServerToClientEvents, ClientToServerEvents } from '../types';

// In development, the socket server is on the same port as the client
const socket: Socket<ServerToClientEvents, ClientToServerEvents> = io();

export default socket;
