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
// const req = []
//   socket.on("friend-request", ({ senderId, receiverId }) => {
//     req.push({ senderId, receiverId })
//     const receiverSocket = connectedUsers.get(receiverId)
//     if(receiverSocket){
//       io.to(receiverSocket.id).emit("request", req)
//     } else {
//       console.log('nah')
//     }
//   })

  socket.on("register", async(userId) => {
    socket.userId = userId;
    
    if(userId !== ''){
      connectedUsers.set(userId, socket);

      // saving and updating each user socket in the database for efficent handling
      await prisma.conversation.upsert({
        where: {
          userId,
        },
        update: {
          socket: socket.id
        },
        create: {
          userId,
          socket: socket.id
        }
      })

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
    const receive = await prisma.conversation.findFirst({
      where: {
        userId: receiver
      }
    })
    const message = {
      sender,
      receiver,
      content,
      photo,
      createdAt: new Date().toISOString(),
    };
    
        if (receive) {
          io.to(receive.socket).emit("chat", data);
          io.to(socket.id).emit("chat", data);
    
      await redis.lpush(`messages:${receiver}:${sender}`, JSON.stringify(message));
      await redis.lpush(`messages:${sender}:${receiver}`, JSON.stringify(message));

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