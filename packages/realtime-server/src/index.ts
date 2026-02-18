require('dotenv').config();

import express from 'express';
import { createServer } from "http";
import { Server } from "socket.io";
import morgan from "morgan";
import { createAdapter } from "@socket.io/mongo-adapter";
import { MongoClient } from 'mongodb';
import { getDb } from './core/db';

const MONGO_URI = process.env.MONGO_URI;
const CAN_USE_ADAPTER = Boolean(MONGO_URI);

;(async () => {
    const app = express();

    app.use(morgan("dev"));
    app.use(express.json());
    
    const server = createServer(app);
    
    const io = new Server(server, {
        // options
        cors: {
            origin: "*",
            methods: "*"
        }
    });
    
    if (CAN_USE_ADAPTER === true) {
        console.log('Using MongoDB adapter');
        const mongoClient = new MongoClient(MONGO_URI);
        await mongoClient.connect();
        const COLLECTION_NAME = 'socket.io-events';

        try {
            await mongoClient.db().createCollection(COLLECTION_NAME, {
                capped: true,
                size: 1e6
            });
        } catch (e) {
            // collection already exists
        }

        const mongoCollection = mongoClient.db().collection(COLLECTION_NAME);
        const adapter = createAdapter(mongoCollection);
        io.adapter(adapter);
        console.log('MongoDB adapter connected');
    }

    let connectedClients = 0;
    
    // Map to track socket connections with user information
    // Key: socket.id, Value: { userId, email, connectedAt }
    const socketUserMap = new Map<string, { userId?: string; email?: string; connectedAt: Date }>();
    
    io.on("connection", (socket) => {
        connectedClients++;

        console.log('A user connected', socket.id);
        
        // Initialize socket entry
        socketUserMap.set(socket.id, {
            connectedAt: new Date()
        });
    
        // Handle user registration after connection
        socket.on('register-user', (data: { userId?: string; email?: string }) => {
            const existing = socketUserMap.get(socket.id);
            if (existing) {
                socketUserMap.set(socket.id, {
                    ...existing,
                    userId: data.userId,
                    email: data.email
                });
            }
        });
    
        socket.on('join-room', (room) => {
            socket.join(room);
        });
    
        socket.on('leave-room', (room) => {
            socket.leave(room);
        });
    
        socket.on('disconnect', () => {
            console.log('A user disconnected', socket.id);
            connectedClients--;
            socketUserMap.delete(socket.id);
        });
    });
    
    app.post('/ping', (req, res) => {
        const { message, event, room } = req.body;
    
        if (room) {
            io.to(room).emit(event, message);
        } else {
            io.emit(event, message);
        }
    
        res.json({
            ack: true
        });
    });
    
    app.post('/api/v1/test', async (req, res) => {
        res.json({ ack: 'done' });
    });
    
    app.get('/count', async (req, res) => {
        const count = io.engine.clientsCount;
        const db = await getDb();
        const automationsCreated = await db.collection('automations').countDocuments();
        const executionsCreated = await db.collection('execution_history').countDocuments();
        const usersCreated = await db.collection('users').countDocuments();

        // Get all connected sockets
        // Note: With MongoDB adapter, this only returns sockets from current server instance
        const sockets = await io.fetchSockets();
        
        // Group sockets by user
        const userSocketMap = new Map<string, Array<{ socketId: string; connectedAt: Date }>>();
        const anonymousSockets: Array<{ socketId: string; connectedAt: Date }> = [];
        
        sockets.forEach(socket => {
            const socketInfo = socketUserMap.get(socket.id);
            // Handle case where socket exists but wasn't tracked (shouldn't happen, but safe guard)
            if (socketInfo?.email) {
                if (!userSocketMap.has(socketInfo.email)) {
                    userSocketMap.set(socketInfo.email, []);
                }
                userSocketMap.get(socketInfo.email)!.push({
                    socketId: socket.id,
                    connectedAt: socketInfo.connectedAt
                });
            } else {
                // Socket without user info (anonymous or not yet registered)
                anonymousSockets.push({
                    socketId: socket.id,
                    connectedAt: socketInfo?.connectedAt || new Date()
                });
            }
        });
        
        // Build detailed client information
        const clientDetails = Array.from(userSocketMap.entries()).map(([email, sockets]) => ({
            email,
            socketCount: sockets.length,
            sockets: sockets.map(s => ({
                socketId: s.socketId,
                connectedAt: s.connectedAt.toISOString(),
                connectedDuration: Math.floor((Date.now() - s.connectedAt.getTime()) / 1000) // seconds
            }))
        }));
        
        // Add anonymous clients
        if (anonymousSockets.length > 0) {
            clientDetails.push({
                email: 'Anonymous',
                socketCount: anonymousSockets.length,
                sockets: anonymousSockets.map(s => ({
                    socketId: s.socketId,
                    connectedAt: s.connectedAt.toISOString(),
                    connectedDuration: Math.floor((Date.now() - s.connectedAt.getTime()) / 1000)
                }))
            });
        }

        res.json({ 
            liveSockets: count, 
            liveConnectedClients: connectedClients,
            automationsCreated,
            executionsCreated,
            usersCreated,
            clientDetails,
            uniqueUsers: userSocketMap.size
        });
    });

    app.get('/', async (req, res) => {
        res.json({ ack: 'done' });
    });
    
    server.listen(isNaN(Number(process.env?.NODE_PORT)) ? 3001 : Number(process.env.NODE_PORT), () => {
        console.log('Realtime Server is running on port', process.env.NODE_PORT || 3001);
    });
    
})().catch((err) => {
    console.error(err);
    process.exit(1);
});