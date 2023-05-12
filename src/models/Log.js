const mongoose = require("mongoose");

const LogSchema = new mongoose.Schema({
  status: {
    type: String,
    trim: true,
    required: true,
  },
  process: {
    type: String,
    trim: true,
    required: true,
  },
  message: {
    type: String,
    trim: true,
    required: true,
  },
  timestamp: {
    type: Date,
    trim: true,
    required: true,
  },
});

module.exports = mongoose.model("Log", LogSchema);
