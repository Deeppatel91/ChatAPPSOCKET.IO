const express = require('express');
const mongoose = require('mongoose');
const http = require('http');
const socketIo = require('socket.io');
const bcrypt = require('bcrypt');
const path = require('path');
const cors = require('cors');

const User = require('./models/User');
const GroupMessage = require('./models/GroupMessage');
const PrivateMessage = require('./models/PrivateMessage');
const Room = require('./models/Room');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

app.use(express.json());
app.use(cors());
app.use(express.static(path.join(__dirname, 'views')));

mongoose.connect('mongodb+srv://deep:deeppatel@cluster0.ztcjj.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0', {
  dbName: 'chatApplication'
});

const predefinedRooms = [
  'devops', 'cloud-computing', 'covid19', 
  'sports', 'nodejs'
];

async function initializeRooms() {
  for (const roomName of predefinedRooms) {
    await Room.findOneAndUpdate(
      { name: roomName },
      { name: roomName, description: `Room for ${roomName} discussions` },
      { upsert: true, new: true }
    );
  }
}

mongoose.connection.on('connected', async () => {
  console.log('Connected to MongoDB');
  await initializeRooms();
});

mongoose.connection.on('error', (err) => {
  console.error('MongoDB connection error:', err);
});

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'views', 'signup.html'));
});

app.get('/login', (req, res) => {
  res.sendFile(path.join(__dirname, 'views', 'login.html'));
});

app.get('/chat', (req, res) => {
  res.sendFile(path.join(__dirname, 'views', 'chat.html'));
});

app.get('/room-history/:roomName', async (req, res) => {
  try {
    const room = await Room.findOne({ name: req.params.roomName });
    res.json(room ? room.messages : []);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching room history' });
  }
});

app.post('/signup', async (req, res) => {
  try {
    const { username, firstname, lastname, password } = req.body;
    
    const existingUser = await User.findOne({ username });
    if (existingUser) {
      return res.status(400).json({ message: 'Username already exists' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    
    const newUser = new User({
      username,
      firstname,
      lastname,
      password: hashedPassword
    });
    
    await newUser.save();
    res.status(201).json({ message: 'User created successfully' });
  } catch (error) {
    console.error('Signup error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

app.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    const user = await User.findOne({ username });
    
    if (!user) {
      return res.status(400).json({ message: 'User not found' });
    }
    
    const isMatch = await bcrypt.compare(password, user.password);
    
    if (!isMatch) {
      return res.status(400).json({ message: 'Invalid credentials' });
    }
    
    res.json({ message: 'Login successful', username });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ message: 'Login error' });
  }
});

io.use((socket, next) => {
  socket.username = socket.handshake.query.username;
  next();
});

io.on('connection', (socket) => {
  socket.on('join_room', async (roomName) => {
    try {
      await Room.findOneAndUpdate(
        { name: roomName },
        { $addToSet: { users: socket.username } }
      );

      socket.join(roomName);
      socket.roomName = roomName;
      
      io.to(roomName).emit('room_notification', {
        message: `${socket.username} has joined the room`
      });
    } catch (error) {
      console.error('Room join error:', error);
    }
  });

  socket.on('leave_room', async (roomName) => {
    try {
      await Room.findOneAndUpdate(
        { name: roomName },
        { $pull: { users: socket.username } }
      );

      socket.leave(roomName);
      
      io.to(roomName).emit('room_notification', {
        message: `${socket.username} has left the room`
      });
    } catch (error) {
      console.error('Room leave error:', error);
    }
  });

  socket.on('group_message', async (data) => {
    try {
      const groupMessage = new GroupMessage(data);
      await groupMessage.save();

      await Room.findOneAndUpdate(
        { name: data.room },
        { 
          $push: { 
            messages: { 
              from_user: data.from_user, 
              message: data.message 
            } 
          }
        }
      );

      io.to(data.room).emit('new_group_message', data);
    } catch (error) {
      console.error('Message send error:', error);
    }
  });

  socket.on('typing', (data) => {
    socket.to(data.room).emit('user_typing', data);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on http://localhost:${PORT}`);
});