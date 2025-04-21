const mongoose = require('mongoose');

const courseSchema = new mongoose.Schema({
    courseCode: {
        type: String,
        required: true,
        unique: true
    },
    sections: [{
        classNbr: String,
        section: String,
        days: [String],
        times: [String],
        rooms: [String],
        enrlCap: String,
        enrolled: String,
        remarks: String,
        professor: String,
        isOpen: Boolean
    }],
    lastUpdated: { // Add lastUpdated attribute
        type: Date,
        default: Date.now
    }
});

module.exports = mongoose.model('Course', courseSchema);