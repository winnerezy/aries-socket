import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import { redis } from "./redis.js";
import { prisma } from "./constants.js";

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: ["http://localhost:3000", "https://aries-three.vercel.app"],
    methods: ["GET", "POST"],
  },
});

const connectedUsers = new Map(); // Using a map to store the connected user sockets

io.on("connection", (socket) => {
  socket.on("register", (userId) => {
    socket.userId = userId;
    connectedUsers.set(userId, socket);
    io.emit("status", "Online");
  });

  socket.on("chat", async (data) => {
    const { sender, receiver, content } = data;
    const receiverSocket = connectedUsers.get(receiver);

    const message = {
      sender,
      receiver,
      content,
      createdAt: new Date().toISOString(),
    };

    if (receiverSocket) {
      io.to(receiverSocket.id).emit("chat", data);
      io.to(socket.id).emit("chat", data);

      await redis.lpush(`messages:${sender}:${receiver}`, JSON.stringify(message));
      await redis.lpush(`messages:${receiver}:${sender}`, JSON.stringify(message));

      const existingConversation = await prisma.conversation.findFirst({
        where: {
          AND: [{ senderId: sender }, { receiverId: receiver }],
        },
      });

      if (!existingConversation) {
        await prisma.conversation.create({
          data: {
            senderId: sender,
            receiverId: receiver,
          },
        });
      }
    } else {
      io.emit("status", "Offline");
    }
  });

  socket.on("disconnect", () => {
    if (socket.userId) {
      connectedUsers.delete(socket.userId);
      io.emit("status", "Offline");
    }
  });
});

const port = process.env.PORT || 3001;
httpServer.listen(port, () => {
  console.log(`Server listening on port ${port}`);
});
