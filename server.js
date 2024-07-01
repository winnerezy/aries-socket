import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import { redis } from "./redis.js";
import { prisma } from "./constants.js";

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
  },
});

const connectedUsers = new Map(); // Using a map to store the connected user sockets

io.on("connection", (socket) => {
  socket.on("register", async(userId) => {
    socket.userId = userId;

    if(userId !== ''){
      connectedUsers.set(userId, socket);

      await prisma.user.update({ // updating the status on  the database for a much clear and better approach than using an array
        where: {
          id: userId
        },
        data: {
          status: 'Online'
        }
      });
    }

    const users = await prisma.user.findMany({
      select: {
        id: true,
        status: true
      }
    })

    io.emit("status", users);
  });

  socket.on("chat", async (data) => {
    const { sender, receiver, content, photo } = data;
    const receiverSocket = connectedUsers.get(receiver);

    const message = {
      sender,
      receiver,
      content,
      photo,
      createdAt: new Date().toISOString(),
    };

    if (receiverSocket) {
      io.to(receiverSocket.id).emit("chat", data);
      io.to(socket.id).emit("chat", data);

      await redis.lpush(`messages:${sender}:${receiver}`, JSON.stringify(message));
      await redis.lpush(`messages:${receiver}:${sender}`, JSON.stringify(message));

    }
  });

  socket.on("disconnect", async() => {
    if (socket.userId) {
      const userId = socket.userId
      
      // connectedUsers.delete(socket.userId);

      await prisma.user.update({
        where: {
          id: userId,
        },
        data: {
          status: 'Offline'
        }
      });

      const users = await prisma.user.findMany({
        select: {
          id: true,
          status: true
        }
      })

      io.emit("status", users);
    }
  });
});

const port = process.env.PORT || 3001;
httpServer.listen(port, () => {
  console.log(`Server listening on port ${port}`);
});