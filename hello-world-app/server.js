const express = require('express');
const path = require('path');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3002;

app.use(express.static(path.join(__dirname, 'public')));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/api/message', (req, res) => {
  const messages = [
    "Hello, World!",
    "Welcome to the Hello World application!",
    "This is running in its own container!",
    "Greetings from the microservice architecture!",
    "Hello from your Raspberry Pi project!"
  ];
  
  const randomMessage = messages[Math.floor(Math.random() * messages.length)];
  res.json({ 
    message: randomMessage,
    timestamp: new Date().toISOString(),
    service: 'hello-world-app'
  });
});

app.listen(PORT, () => {
  console.log(`Hello World app running on port ${PORT}`);
});
