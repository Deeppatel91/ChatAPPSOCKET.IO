const mongoose = require('mongoose');

const RoomSchema = new mongoose.Schema({
  name: { 
    type: String, 
    required: true, 
    unique: true 
  },
  description: String,
  users: [{ type: String }],
  messages: [{
    from_user: String,
    message: String,
    timestamp: { type: Date, default: Date.now }
  }]
});

module.exports = mongoose.model('Room', RoomSchema);