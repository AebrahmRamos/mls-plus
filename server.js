const express = require('express');
// Remove axios: const axios = require('axios');
const cheerio = require('cheerio');
const path = require('path');
const fs = require('fs').promises;
const mongoose = require('mongoose'); // Import mongoose
const { execSync } = require('child_process'); // Import execSync
const app = express();
const port = process.env.PORT || 3000;

// Load environment variables
require('dotenv').config();

// MongoDB connection string
const mongoURI = process.env.MONGODB_URI; // Replace with your MongoDB URI

// Connect to MongoDB
mongoose.connect(mongoURI, {
    useNewUrlParser: true,
    useUnifiedTopology: true
})
    .then(() => console.log('Connected to MongoDB'))
    .catch(err => console.error('MongoDB connection error:', err));

// Serve static files from the public directory
app.use(express.static(path.join(__dirname, 'public')));

// Parse JSON request bodies
app.use(express.json());

// Import the Course model
const Course = require('./models/course');

// Function to parse HTML using cheerio (remains the same)
function parseHTML(html, courseCode) {
    // ... (parsing logic remains the same) ...
    const $ = cheerio.load(html);
    const sections = [];
    let currentSection = null;

    // Find all table rows
    $('table tr').each((index, row) => {
        const cells = $(row).find('td');

        // Skip header rows or invalid rows
        if (cells.length === 9) {
            // Check if this is a main section row (has a class number)
            const classNbr = $(cells[0]).find('b').text().trim();
            const sectionCode = $(cells[2]).find('b').text().trim();

            // Skip header row with column titles
            if ($(cells[6]).text().trim() === 'Enrl Cap') {
                return;
            }

            // If this row has a class number, it's a new main section
            if (classNbr) {
                // Save previous section if exists
                if (currentSection) {
                    sections.push(currentSection);
                }

                // Create new section
                currentSection = {
                    classNbr: classNbr,
                    course: courseCode,
                    section: sectionCode,
                    days: [$(cells[3]).text().trim()].filter(Boolean),
                    times: [$(cells[4]).text().trim()].filter(Boolean),
                    rooms: [$(cells[5]).text().trim()].filter(Boolean),
                    enrlCap: $(cells[6]).text().trim(),
                    enrolled: $(cells[7]).text().trim(),
                    remarks: $(cells[8]).text().trim(),
                    professor: '',
                    isOpen: $(cells[0]).attr('bgcolor') === '#D2EED3'
                };
            }
            // If this is a continuation row for a multi-day course
            else if (currentSection && !classNbr && !sectionCode) {
                const day = $(cells[3]).text().trim();
                const time = $(cells[4]).text().trim();
                const room = $(cells[5]).text().trim();

                // Only add non-empty values
                if (day && cells.eq(3).attr('bgcolor') === '#D2EED3') {
                    currentSection.days.push(day);
                }
                if (time && cells.eq(4).attr('bgcolor') === '#D2EED3') {
                    currentSection.times.push(time);
                }
                if (room && cells.eq(5).attr('bgcolor') === '#D2EED3') {
                    currentSection.rooms.push(room);
                }
            }
        }
        // Handle professor information row
        else if (cells.length > 0 && $(cells[0]).attr('colspan') === '6' && currentSection) {
            const professorText = $(cells[0]).text().trim();
            if (professorText && !currentSection.professor) {
                currentSection.professor = professorText;
            }
        }
    });

    // Add the last section if it exists
    if (currentSection) {
        sections.push(currentSection);
    }

    // Filter out any invalid entries (like header rows that might have slipped through)
    const validSections = sections.filter(section =>
        section.classNbr && section.section && section.days.length > 0
    );

    return { courseCode, sections: validSections };
}


// API endpoint to fetch course offerings using curl
app.get('/api/search', async (req, res) => {
    try {
        const courseCode = req.query.course?.toUpperCase().trim();

        if (!courseCode) {
            return res.status(400).json({ error: 'Course code is required' });
        }

        const cookie = process.env.COOKIE;
        if (!cookie) {
            console.warn('DLSU Cookie not set in environment variables. Fetching from DLSU might fail.');
        }

        let courseDataFromDLSU = null;
        let fetchError = null;
        let htmlContent = null;

        // Only attempt fetch from DLSU if cookie is present
        if (cookie) {
            // Construct the curl command (ensure proper escaping, especially for the cookie)
            // Using single quotes around the cookie helps prevent shell interpretation issues
            const command = `curl 'https://enroll.dlsu.edu.ph/dlsu/view_course_offerings' --compressed -X POST \
                -H 'User-Agent: Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:137.0) Gecko/20100101 Firefox/137.0' \
                -H 'Accept: text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8' \
                -H 'Accept-Language: en-US,en;q=0.5' \
                -H 'Accept-Encoding: gzip, deflate, br' \
                -H 'Content-Type: application/x-www-form-urlencoded' \
                -H 'Origin: https://enroll.dlsu.edu.ph' \
                -H 'Connection: keep-alive' \
                -H 'Referer: https://enroll.dlsu.edu.ph/dlsu/view_course_offerings' \
                -H 'Cookie: ${cookie.replace(/'/g, "'\\''")}' \
                -H 'Upgrade-Insecure-Requests: 1' \
                -H 'Sec-Fetch-Dest: document' \
                -H 'Sec-Fetch-Mode: navigate' \
                -H 'Sec-Fetch-Site: same-origin' \
                -H 'Sec-Fetch-User: ?1' \
                -H 'Priority: u=0, i' \
                -H 'TE: trailers' \
                --data-raw 'p_course_code=${encodeURIComponent(courseCode)}&p_option=all&p_button=Search&p_id_no=12216496&p_button=Submit' \
                --silent --max-time 10`; // Added --silent to suppress progress meter and --max-time for timeout

            try {
                console.log(`Executing curl for ${courseCode}`);
                // Execute curl and capture stdout (the HTML)
                htmlContent = execSync(command, { encoding: 'utf8', timeout: 10000 }); // Added timeout in execSync options as well

                if (!htmlContent) {
                     throw new Error('Curl command returned empty output.');
                }

                const parsedData = parseHTML(htmlContent, courseCode);

                if (htmlContent.includes('No course sections found')) {
                    console.log(`No sections found for ${courseCode} on DLSU site.`);
                    courseDataFromDLSU = { courseCode, sections: [], noResults: true };
                } else if (parsedData && parsedData.sections && parsedData.sections.length > 0) {
                    courseDataFromDLSU = parsedData;
                } else {
                    console.log(`Potentially empty or invalid response for ${courseCode} from DLSU (curl).`);
                    courseDataFromDLSU = null;
                }

            } catch (curlError) {
                // execSync throws an error on non-zero exit code or timeout
                console.error(`Error executing curl for ${courseCode}:`, curlError.message);
                // Log stderr if available for more details
                if (curlError.stderr) {
                    console.error('Curl stderr:', curlError.stderr.toString());
                }
                fetchError = curlError;
                courseDataFromDLSU = null;
            }
        } else {
            console.log('Skipping DLSU fetch due to missing cookie.');
            courseDataFromDLSU = null;
        }

        // --- Fallback and DB logic remains the same ---
        if (courseDataFromDLSU && !courseDataFromDLSU.noResults) {
            const now = new Date();
            try {
                // Note: There's a slight error in the original updateOne syntax.
                // You should combine $set operations into one object.
                await Course.updateOne(
                    { courseCode: courseCode },
                    { $set: { sections: courseDataFromDLSU.sections, lastUpdated: now } }, // Corrected $set syntax
                    { upsert: true }
                );
                console.log(`Course ${courseCode} data saved/updated in MongoDB`);
                return res.json({
                    courseCode: courseDataFromDLSU.courseCode,
                    sections: courseDataFromDLSU.sections,
                    lastUpdated: now
                });
            } catch (dbError) {
                console.error('Error saving to MongoDB:', dbError);
                 return res.json({
                    courseCode: courseDataFromDLSU.courseCode,
                    sections: courseDataFromDLSU.sections,
                    lastUpdated: now
                });
            }
        }
        else if (courseDataFromDLSU && courseDataFromDLSU.noResults) {
             return res.json({ courseCode: courseCode, noResults: true });
        }
        else {
            console.log(`Attempting fallback to MongoDB for ${courseCode}`);
            try {
                const courseFromDB = await Course.findOne({ courseCode: courseCode });
                if (courseFromDB) {
                    console.log(`Course ${courseCode} data retrieved from MongoDB`);
                    return res.json({
                        courseCode: courseFromDB.courseCode,
                        sections: courseFromDB.sections,
                        lastUpdated: courseFromDB.lastUpdated
                    });
                } else {
                    console.log(`Course ${courseCode} not found in MongoDB either.`);
                    return res.json({ courseCode: courseCode, noResults: true });
                }
            } catch (dbError) {
                console.error('Error fetching from MongoDB:', dbError);
                return res.status(500).json({ error: 'Failed to fetch course data from MongoDB' });
            }
        }

    } catch (error) {
        console.error('Unexpected error in /api/search:', error);
        return res.status(500).json({ error: 'An unexpected error occurred' });
    }
});

// Serve the main HTML page
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Start the server
app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
});